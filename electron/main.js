const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
const PORT = parseInt(process.env.PORT || '51230', 10);
const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');

let mainWindow = null;
let serverProcess = null;

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
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = null;

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
    writeErrorLog('updater', `Update downloaded: ${info.version}`);
    sendUpdateStatus({ status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    writeErrorLog('updater:error', err);
    sendUpdateStatus({ status: 'error', message: err.message });
  });
}

function setupUpdaterIPC() {
  ipcMain.handle('updater:check', async () => {
    const result = await autoUpdater.checkForUpdates();
    return result?.updateInfo;
  });

  ipcMain.handle('updater:download', async () => {
    await autoUpdater.downloadUpdate();
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
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
    shell.openExternal(url);
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

function waitForServer(port, maxRetries = 60) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
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

    // Auto-update setup (production only)
    if (!isDev) {
      setupAutoUpdater();
      setupUpdaterIPC();
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          writeErrorLog('updater:auto-check', err);
        });
      }, 5000);
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
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
