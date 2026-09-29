import { app, BrowserWindow } from 'electron';
import path from 'path';
import net from 'net';

// Security testing flags: ignore certificate validation errors for mitmproxy interception
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');
app.commandLine.appendSwitch('disable-site-isolation-trials');
import { DatabaseManager } from './database/db';
import { BrowserManager } from './browser/browserManager';
import { SeleniumManager } from './browser/seleniumManager';
import { ProxyManager } from './proxy/proxyManager';
import { setupIpcHandlers } from './ipc/ipcHandlers';

let mainWindow: BrowserWindow | null = null;
let browserManager: BrowserManager | null = null;
let seleniumManager: SeleniumManager | null = null;
let proxyManager: ProxyManager | null = null;
let db: DatabaseManager | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(250);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function createWindow() {
  db = new DatabaseManager();
  await db.init();

  const preloadPath = path.resolve(__dirname, '../preload/preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#121316',
    title: 'NetScope Security Browser',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // needed for preload to bridge node electron APIs
    }
  });

  browserManager = new BrowserManager(mainWindow);
  seleniumManager = new SeleniumManager();
  proxyManager = new ProxyManager(db);

  setupIpcHandlers(mainWindow, browserManager, proxyManager, db, seleniumManager);

  // Load UI renderer
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (isDev && (await isPortOpen(5173))) {
    await mainWindow.loadURL('http://localhost:5173');
  } else {
    await mainWindow.loadFile(path.resolve(__dirname, '../renderer/index.html'));
  }

  // Window resize event updates WebContentsView layout
  mainWindow.on('resize', () => {
    mainWindow?.webContents.send('window:resized');
  });

  // Start proxy initially (default port 8080)
  try {
    const scopes = await db.getScopes();
    await proxyManager.setConfig({
      scopeDomains: scopes.filter(s => s.enabled).map(s => s.pattern)
    });
    const started = await proxyManager.start(8080);
    if (started) {
      const activePort = proxyManager.getStatus().port || 8080;
      await browserManager.setProxy(true, activePort);
    }
  } catch (err) {
    console.warn('[Main] Proxy auto-start note:', err);
  }

  // Create initial browser tab
  setTimeout(async () => {
    if (browserManager) {
      await browserManager.createTab('http://127.0.0.1:4000');
    }
  }, 1000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock to prevent multi-instance cache and port collisions
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main] Another NetScope instance is already running. Quitting secondary process.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', async () => {
    if (seleniumManager) {
      await seleniumManager.quit();
    }
    if (proxyManager) {
      await proxyManager.stop();
    }
    if (db) {
      await db.close();
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', async () => {
    if (seleniumManager) {
      await seleniumManager.quit();
    }
    if (proxyManager) {
      await proxyManager.stop();
    }
  });
}
