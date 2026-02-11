const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const net = require('net');

const isDev = !app.isPackaged;
const PORT = parseInt(process.env.PORT || '51230', 10);

let mainWindow = null;
let serverProcess = null;

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'KubeOps',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(isMac ? { trafficLightPosition: { x: 15, y: 15 } } : {}),
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

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
        { role: 'toggleDevTools' },
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
  const { fork } = require('child_process');
  const appRoot = path.join(__dirname, '..');

  serverProcess = fork(path.join(appRoot, 'dist', 'server.cjs'), [], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
    },
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', (d) => process.stdout.write(d));
  serverProcess.stderr?.on('data', (d) => process.stderr.write(d));

  serverProcess.on('error', (err) => {
    console.error('Server process error:', err);
  });

  return waitForServer(PORT);
}

app.whenReady().then(async () => {
  buildMenu();

  try {
    if (isDev) {
      console.log('Waiting for dev server...');
      await waitForServer(PORT);
    } else {
      console.log('Starting production server...');
      await startProductionServer();
    }
    createWindow();
  } catch (err) {
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
