const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
const PORT = parseInt(process.env.PORT || '51230', 10);
const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');
// Sent by the server on startup so we can tell our own server apart from an
// unrelated process that happens to be sitting on the same port.
const HEALTH_PATH = '/api/session';
// Production only: the server answers 200 here only when the request carries
// the token we handed it at spawn time. Any nonce-bearing response used to be
// accepted, so an orphaned server from a previous run got silently adopted.
const LAUNCH_PATH = '/__kubeops/launch';
const LAUNCH_TOKEN = crypto.randomBytes(32).toString('hex');
// Must match EXIT_ADDRESS_IN_USE in server.ts.
const EXIT_ADDRESS_IN_USE = 98;
const SERVER_SHUTDOWN_GRACE_MS = 3000;

let mainWindow = null;
let serverProcess = null;

// A second instance would fight the first one for port 51230 and lose in a way
// that is invisible to the user. Focus the existing window instead.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// === Error Log ===
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'error.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      const old = LOG_FILE + '.old';
      if (fs.existsSync(old)) fs.unlinkSync(old);
      fs.renameSync(LOG_FILE, old);
    }
  } catch { /* ignore rotation errors */ }
}

function writeErrorLog(source, err) {
  try {
    ensureLogDir();
    rotateLogIfNeeded();
    const ts = new Date().toISOString();
    const msg = err instanceof Error
      ? `${err.message}\n${err.stack || ''}`
      : String(err);
    const entry = `[${ts}] [${source}]\n${msg}\n\n`;
    fs.appendFileSync(LOG_FILE, entry, 'utf-8');
  } catch { /* never throw from logger */ }
}

// Capture main process errors
process.on('uncaughtException', (err) => {
  writeErrorLog('main:uncaughtException', err);
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  writeErrorLog('main:unhandledRejection', reason);
  console.error('Unhandled rejection:', reason);
});

// === Auto-Updater ===
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false; // We handle install manually on macOS
autoUpdater.logger = null;

// Skip code signing verification for unsigned builds
if (process.platform === 'darwin') {
  autoUpdater.forceCodeSigning = false;
}

// Track the downloaded update file path for manual install on macOS
let downloadedUpdateFile = null;
let isQuitting = false;

/**
 * Manually install update on macOS — bypasses ShipIt/Squirrel code signature validation.
 * Uses execFile with argument arrays (not shell interpolation) to prevent injection.
 */
async function macOSManualInstall() {
  const appPath = app.getAppPath();
  const appBundlePath = appPath.replace(/\/Contents\/Resources\/app\/?$/, '');

  // Find the downloaded zip
  let zipPath = downloadedUpdateFile;
  if (!zipPath) {
    const cacheDir = path.join(app.getPath('userData'), '..', `${app.name}-updater`);
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.zip'));
      if (files.length > 0) {
        files.sort((a, b) => {
          return fs.statSync(path.join(cacheDir, b)).mtimeMs - fs.statSync(path.join(cacheDir, a)).mtimeMs;
        });
        zipPath = path.join(cacheDir, files[0]);
      }
    }
  }

  if (!zipPath || !fs.existsSync(zipPath)) {
    throw new Error('Downloaded update zip not found');
  }

  writeErrorLog('updater:manual-install', `Zip: ${zipPath}, App: ${appBundlePath}`);

  const tempDir = path.join(app.getPath('temp'), 'kubeops-update');

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // Extract zip using execFile (safe — no shell interpolation)
  sendUpdateStatus({ status: 'installing', stage: 'extracting' });
  await new Promise((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-xk', zipPath, tempDir], (err) => {
      if (err) reject(new Error(`Unzip failed: ${err.message}`));
      else resolve();
    });
  });

  // Find and validate the extracted .app bundle
  const extracted = fs.readdirSync(tempDir);
  const newApp = extracted.find(f => f.endsWith('.app'));
  if (!newApp) {
    throw new Error('No .app found in update zip');
  }
  const newAppPath = path.join(tempDir, newApp);

  const infoPlist = path.join(newAppPath, 'Contents', 'Info.plist');
  if (!fs.existsSync(infoPlist)) {
    throw new Error('Extracted app is invalid (missing Info.plist)');
  }

  // Remove quarantine attribute
  await new Promise((resolve) => {
    execFile('/usr/bin/xattr', ['-cr', newAppPath], () => resolve());
  });

  // Write a helper script to a temp file instead of inline shell interpolation.
  // This avoids shell injection from path values.
  const scriptPath = path.join(tempDir, 'install.sh');
  const scriptContent = [
    '#!/bin/bash',
    `PID=${process.pid}`,
    'echo "[$(date)] waiting for KubeOps (pid $PID) to exit"',
    'while kill -0 "$PID" 2>/dev/null; do sleep 0.2; done',
    // Move the old bundle aside instead of deleting it up front: if the
    // replacement move fails, the user still has a working app to restore.
    'BACKUP="$1.old-$$"',
    // If even the backup move fails, reopen the untouched old app rather than
    // leaving the user with nothing running.
    'mv "$1" "$BACKUP" || { echo "[$(date)] could not move old app aside"; rm -rf "$3"; open "$1"; exit 1; }',
    'if ! mv "$2" "$1"; then echo "[$(date)] could not move new app into place; restoring"; mv "$BACKUP" "$1"; rm -rf "$3"; open "$1"; exit 1; fi',
    'rm -rf "$BACKUP"',
    'rm -rf "$3"',
    'xattr -cr "$1" 2>/dev/null',
    'echo "[$(date)] update installed"',
    'open "$1"',
  ].join('\n');
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

  // Run the install script detached with paths as arguments (not interpolated).
  // Output goes to a log file: with stdio ignored, a failed swap left no trace.
  ensureLogDir();
  const installLog = fs.openSync(path.join(LOG_DIR, 'update-install.log'), 'a');
  let child;
  try {
    child = require('child_process').spawn(
      scriptPath,
      [appBundlePath, newAppPath, tempDir],
      { detached: true, stdio: ['ignore', installLog, installLog] }
    );
  } finally {
    fs.closeSync(installLog);
  }
  child.unref();

  sendUpdateStatus({ status: 'installing', stage: 'restarting' });
  app.quit();
}

function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status);
  }
}

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    writeErrorLog('updater', 'Checking for updates...');
    sendUpdateStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    writeErrorLog('updater', `Update available: ${info.version}`);
    sendUpdateStatus({
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    writeErrorLog('updater', `Up to date: ${info.version}`);
    sendUpdateStatus({ status: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      status: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    writeErrorLog('updater', `Update downloaded: ${info.version} (keys: ${Object.keys(info).join(', ')})`);
    // Store the downloaded file path for manual install on macOS
    // electron-updater may expose this as downloadedFile or similar
    const filePath = info.downloadedFile || info.downloadedFiles?.[0];
    if (filePath) {
      downloadedUpdateFile = filePath;
    }
    sendUpdateStatus({ status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    writeErrorLog('updater:error', err);
    sendUpdateStatus({ status: 'error', message: err.message });
  });
}

function setupDevUpdaterIPC() {
  ipcMain.handle('updater:check', async () => {
    sendUpdateStatus({ status: 'not-available', version: app.getVersion() });
    return null;
  });

  ipcMain.handle('updater:download', async () => {
    sendUpdateStatus({ status: 'error', message: 'Updates are not available in development mode' });
  });

  ipcMain.handle('updater:install', () => {});

  ipcMain.handle('updater:get-version', () => {
    return app.getVersion();
  });
}

function setupUpdaterIPC() {
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo;
    } catch (err) {
      writeErrorLog('updater:check', err);
      sendUpdateStatus({ status: 'error', message: err.message || 'Update check failed' });
      throw err;
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      writeErrorLog('updater:download', err);
      sendUpdateStatus({ status: 'error', message: err.message || 'Download failed' });
      throw err;
    }
  });

  // A double-click on "Restart & install" used to extract the zip twice into
  // the same temp dir and spawn two install scripts racing each other.
  let installInFlight = false;
  ipcMain.handle('updater:install', async () => {
    if (installInFlight) return;
    installInFlight = true;
    sendUpdateStatus({ status: 'installing', stage: 'preparing' });
    if (process.platform === 'darwin') {
      try {
        await macOSManualInstall();
      } catch (err) {
        installInFlight = false;
        writeErrorLog('updater:install:manual', err);
        // Don't fallback to quitAndInstall — it will also fail on unsigned builds.
        // Throw so the renderer can show the "Manual Update" UI.
        sendUpdateStatus({ status: 'error', message: `Install failed: ${err.message}` });
        throw err;
      }
    } else {
      sendUpdateStatus({ status: 'installing', stage: 'restarting' });
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (err) {
        installInFlight = false;
        writeErrorLog('updater:install', err);
        sendUpdateStatus({ status: 'error', message: `Install failed: ${err.message}` });
        throw err;
      }
    }
  });

  ipcMain.handle('updater:get-version', () => {
    return app.getVersion();
  });
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'KubeOps',
    icon: iconPath,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(isMac ? { trafficLightPosition: { x: 15, y: 20 } } : {}),
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    writeErrorLog('renderer:did-fail-load', `code=${code} ${desc}`);
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url);
      }
    } catch { /* ignore malformed URLs */ }
    return { action: 'deny' };
  });

  // Capture renderer crashes
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    writeErrorLog('renderer:crash', `Renderer gone: ${details.reason} (exitCode: ${details.exitCode})`);
  });

  // Capture renderer console errors
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    // level 3 = error
    if (level >= 3) {
      writeErrorLog('renderer:console.error', `${message}\n  at ${sourceId}:${line}`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => {
            if (isDev) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Updates',
                message: 'Auto-update is not available in development mode.',
              });
              return;
            }
            autoUpdater.checkForUpdates().catch((err) => {
              writeErrorLog('updater:menu-check', err);
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Update Check Failed',
                message: err.message,
              });
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Open Error Log',
          click: () => {
            ensureLogDir();
            if (fs.existsSync(LOG_FILE)) {
              shell.openPath(LOG_FILE);
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Error Log',
                message: 'No error log found.',
                detail: `Log path: ${LOG_FILE}`,
              });
            }
          },
        },
        {
          label: 'Show Log Folder',
          click: () => {
            ensureLogDir();
            shell.openPath(LOG_DIR);
          },
        },
        {
          label: 'Export Error Log…',
          click: async () => {
            if (!fs.existsSync(LOG_FILE)) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Export Error Log',
                message: 'No error log to export.',
              });
              return;
            }
            const { filePath } = await dialog.showSaveDialog(mainWindow, {
              defaultPath: `kubeops-error-${new Date().toISOString().slice(0, 10)}.log`,
              filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
            });
            if (filePath) {
              fs.copyFileSync(LOG_FILE, filePath);
            }
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Confirms that whatever is listening on `port` is a KubeOps server, not some
 * other local service. A bare TCP connect would happily "succeed" against an
 * unrelated app and we would then load its pages into our window.
 */
function isOurServer(port) {
  return new Promise((resolve) => {
    // Dev: the server is started separately (`npm run dev`) and has no launch
    // token, so a nonce-bearing /api/session is the best we can check.
    const options = isDev
      ? { host: 'localhost', port, path: HEALTH_PATH, method: 'GET', timeout: 2000 }
      : {
          host: 'localhost', port, path: LAUNCH_PATH, method: 'GET', timeout: 2000,
          headers: { 'x-kubeops-launch-token': LAUNCH_TOKEN },
        };
    const req = http.request(
      options,
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(isDev ? Boolean(parsed.nonce) : res.statusCode === 200 && parsed.ok === true);
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

function waitForServer(port, maxRetries = 60) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', async () => {
        socket.destroy();
        if (await isOurServer(port)) {
          resolve();
          return;
        }
        if (++retries >= maxRetries) {
          reject(new Error(
            `Port ${port} is in use by another application (or by a KubeOps process from an earlier run). `
            + 'Quit it and start KubeOps again.',
          ));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
      socket.once('error', () => {
        socket.destroy();
        if (++retries >= maxRetries) {
          reject(new Error('Server failed to start'));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
      socket.once('timeout', () => {
        socket.destroy();
        if (++retries >= maxRetries) {
          reject(new Error('Server start timeout'));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
      socket.connect(port, 'localhost');
    };
    tryConnect();
  });
}

function startProductionServer() {
  const { spawn } = require('child_process');
  const appRoot = path.join(__dirname, '..');

  serverProcess = spawn(process.execPath, [path.join(appRoot, 'dist', 'server.cjs')], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      ELECTRON_RUN_AS_NODE: '1',
      // Identity proof for isOurServer, and the pid the server watches so it
      // exits instead of lingering as an orphan if we crash.
      KUBEOPS_LAUNCH_TOKEN: LAUNCH_TOKEN,
      KUBEOPS_PARENT_PID: String(process.pid),
    },
    // stdin stays a pipe on purpose: the server treats its closing as "parent
    // died" and reads an explicit "shutdown" line from it on quit.
    stdio: 'pipe',
  });
  serverProcess.stdin?.on('error', () => { /* server already gone */ });

  // Rejects as soon as the server dies during startup, instead of making the
  // user wait out every waitForServer retry with a vague "failed to start".
  let rejectStartup = null;
  const startupFailed = new Promise((_, reject) => { rejectStartup = reject; });
  let ready = false;

  serverProcess.stdout?.on('data', (d) => process.stdout.write(d));
  serverProcess.stderr?.on('data', (d) => {
    process.stderr.write(d);
    writeErrorLog('server:stderr', d.toString());
  });

  serverProcess.on('error', (err) => {
    writeErrorLog('server:error', err);
    console.error('Server process error:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      writeErrorLog('server:exit', `Server exited with code ${code}, signal ${signal}`);
    }
    serverProcess = null;
    if (!ready) {
      rejectStartup(new Error(code === EXIT_ADDRESS_IN_USE
        ? `Port ${PORT} is already in use by another application (or by a KubeOps process from an earlier run). Quit it and start KubeOps again.`
        : `The KubeOps background service exited during startup (code ${code}, signal ${signal}).`));
      return;
    }
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      // The window is still up but every request from now on would fail with a
      // blank page and no explanation.
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'KubeOps backend stopped',
        message: 'The KubeOps background service stopped unexpectedly.',
        detail: 'Restart KubeOps to reconnect. Details are in Help → Open Error Log.',
      }).catch(() => {});
    }
  });

  return Promise.race([waitForServer(PORT), startupFailed]).then(() => { ready = true; });
}

/**
 * Ask the server to shut down cleanly (it kills port-forward and exec
 * children on the way out), then force it after a grace period. On Windows
 * kill() is TerminateProcess: no signal handler runs, so without the stdin
 * request every `kubectl port-forward` child was orphaned on quit.
 */
function stopServerGracefully() {
  const proc = serverProcess;
  if (!proc || proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* already gone */ }
      resolve();
    }, SERVER_SHUTDOWN_GRACE_MS);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try { proc.stdin?.write('shutdown\n'); } catch { /* pipe closed */ }
    if (process.platform !== 'win32') {
      try { proc.kill('SIGTERM'); } catch { /* already gone */ }
    }
  });
}

app.whenReady().then(async () => {
  buildMenu();

  // Set dock icon for macOS dev mode (production uses .icns from bundle)
  if (isDev && process.platform === 'darwin') {
    app.dock.setIcon(iconPath);
  }

  try {
    if (isDev) {
      console.log('Waiting for dev server...');
      await waitForServer(PORT);
    } else {
      console.log('Starting production server...');
      await startProductionServer();
    }
    createWindow();

    // Auto-update setup
    if (!isDev) {
      setupAutoUpdater();
      setupUpdaterIPC();
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          writeErrorLog('updater:auto-check', err);
        });
      }, 5000);
    } else {
      // Dev mode: register IPC handlers that respond with dev-friendly messages
      setupDevUpdaterIPC();
    }
  } catch (err) {
    writeErrorLog('main:startup', err);
    console.error('Failed to start KubeOps:', err);
    // Quitting silently looked like the app simply never opened.
    dialog.showErrorBox('KubeOps could not start', err.message || String(err));
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let serverStopped = false;
let serverStopping = null;
app.on('before-quit', (event) => {
  isQuitting = true;
  if (serverStopped || !serverProcess) return;
  // Hold the quit until the server has cleaned up its children. A repeated
  // quit (or electron-updater's quitAndInstall) re-enters here and waits on
  // the same stop.
  event.preventDefault();
  if (serverStopping) return;
  serverStopping = stopServerGracefully().finally(() => {
    serverStopped = true;
    serverProcess = null;
    app.quit();
  });
});
