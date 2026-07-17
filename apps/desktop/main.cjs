const { app, BrowserWindow, dialog, shell } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');

const LOCAL_SERVER_URL = 'http://127.0.0.1:2567';
const DEV_CLIENT_URL = 'http://127.0.0.1:5174';
let gameServer;
let mainWindow;

function serverEntryPath() {
  return app.isPackaged
    ? path.join(app.getAppPath(), 'apps', 'server', 'dist', 'index.js')
    : path.join(app.getAppPath(), 'apps', 'server', 'dist', 'index.js');
}

function startAuthoritativeServer() {
  if (!app.isPackaged) return;

  gameServer = fork(serverEntryPath(), [], {
    env: {
      ...process.env,
      // `fork` uses Electron's executable. This tells that child to run the
      // authoritative server as Node rather than opening a second renderer.
      ELECTRON_RUN_AS_NODE: '1',
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: '2567',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  gameServer.stdout?.on('data', (chunk) => console.log(`[signal-zero server] ${chunk}`));
  gameServer.stderr?.on('data', (chunk) => console.error(`[signal-zero server] ${chunk}`));
  gameServer.on('error', (error) => {
    console.error('The local Signal Zero server could not start.', error);
  });
}

async function waitForServer() {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${LOCAL_SERVER_URL}/health`);
      if (response.ok) return;
    } catch {
      // The child server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('The local game server did not become ready in time.');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#071924',
    title: 'Bayanihan Protocol: Signal Zero',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(
      path.join(app.getAppPath(), 'apps', 'desktop', 'renderer', 'index.html'),
    );
  } else {
    void mainWindow.loadURL(DEV_CLIENT_URL);
  }
}

app.whenReady().then(async () => {
  try {
    startAuthoritativeServer();
    if (app.isPackaged) await waitForServer();
    createWindow();
  } catch (error) {
    console.error(error);
    await dialog.showMessageBox({
      type: 'error',
      title: 'Signal Zero could not start',
      message: error instanceof Error ? error.message : 'The game could not start.',
    });
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (gameServer && !gameServer.killed) gameServer.kill();
});
