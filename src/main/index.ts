import { app, BrowserWindow, session } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc/handlers'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Only one instance of a wallet should ever be signing transactions against
// the same node/data directory at once.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: 'Sasori Wallet',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev
    }
  })

  // CSP differs between dev and production. In production the renderer is
  // loaded from file:// as a pre-built bundle, so a strict policy with no
  // 'unsafe-eval'/'unsafe-inline' and no remote origins is correct. In dev,
  // the renderer is loaded from the Vite dev server: @vitejs/plugin-react
  // injects an INLINE <script> into the page to set up React Fast Refresh
  // (requires 'unsafe-inline'), Vite's own HMR runtime uses eval-based
  // module execution (requires 'unsafe-eval'), and the HMR client opens a
  // WebSocket back to that same dev server (requires the ws:// origin in
  // connect-src). Missing any one of those three silently breaks dev mode --
  // the app builds and "runs" with no fatal error, but nothing ever renders.
  const devServerOrigin = process.env['ELECTRON_RENDERER_URL'] // e.g. http://localhost:5173
  const csp =
    isDev && devServerOrigin
      ? `default-src 'self' ${devServerOrigin}; script-src 'self' 'unsafe-eval' 'unsafe-inline' ${devServerOrigin}; style-src 'self' 'unsafe-inline' ${devServerOrigin}; img-src 'self' data: ${devServerOrigin}; connect-src 'self' ${devServerOrigin} ${devServerOrigin.replace('http', 'ws')}; object-src 'none'; base-uri 'none';`
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';"

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  // Block any attempt to navigate away from the app shell or open new windows --
  // there is never a legitimate reason for this wallet to load remote content.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !(isDev && url.startsWith('http://localhost'))) {
      event.preventDefault()
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
