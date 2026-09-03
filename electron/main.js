const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
const PORT = parseInt(process.env.PORT || '51230', 10);
const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');
// Sent by the server on startup so we can tell our own server apart from an
// unrelated process that happens to be sitting on the same port.
const HEALTH_PATH = '/api/session';

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
    'while kill -0 "$PID" 2>/dev/null; do sleep 0.2; done',
    // Move the old bundle aside instead of deleting it up front: if the
    // replacement move fails, the user still has a working app to restore.
    'BACKUP="$1.old-$$"',
    'mv "$1" "$BACKUP" || exit 1',
    'if ! mv "$2" "$1"; then mv "$BACKUP" "$1"; rm -rf "$3"; open "$1"; exit 1; fi',
    'rm -rf "$BACKUP"',
    'rm -rf "$3"',
    'xattr -cr "$1" 2>/dev/null',
    'open "$1"',
  ].join('\n');
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

  // Run the install script detached with paths as arguments (not interpolated)
  const child = require('child_process').spawn(
    scriptPath,
    [appBundlePath, newAppPath, tempDir],
    { detached: true, stdio: 'ignore' }
  );
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

  ipcMain.handle('updater:install', async () => {
    sendUpdateStatus({ status: 'installing', stage: 'preparing' });
    if (process.platform === 'darwin') {
      try {
        await macOSManualInstall();
      } catch (err) {
        writeErrorLog('updater:install:manual', err);
        // Don't fallback to quitAndInstall — it will also fail on unsigned builds.
        // Throw so the renderer can show the "Manual Update" UI.
        sendUpdateStatus({ status: 'error', message: `Install failed: ${err.message}` });
        throw err;
      }
    } else {
      sendUpdateStatus({ status: 'installing', stage: 'restarting' });
      autoUpdater.quitAndInstall(false, true);
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
    const req = http.request(
      { host: 'localhost', port, path: HEALTH_PATH, method: 'GET', timeout: 2000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(Boolean(JSON.parse(body).nonce));
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
          reject(new Error(`Port ${port} is in use by another application`));
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
    },
    stdio: 'pipe',
  });

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

  return waitForServer(PORT);
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

app.on('before-quit', () => {
  isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
