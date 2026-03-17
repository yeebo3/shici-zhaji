const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

process.env.SHICI_DESKTOP_RUNTIME = 'legacy'

let mainWindow = null
let serverProcess = null

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(err => (err ? reject(err) : resolve(port)))
    })
  })
}

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(url, res => {
        res.resume()
        resolve()
      })

      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Next server startup timeout (${timeoutMs}ms)`))
          return
        }
        setTimeout(ping, 200)
      })
    }

    ping()
  })
}

function resolveServerEntry() {
  const candidates = [
    path.join(process.resourcesPath, 'app-runtime', 'server.js'),
    path.join(app.getAppPath(), 'dist-desktop', 'runtime', 'server.js'),
    path.join(app.getAppPath(), '.next', 'standalone', 'server.js'),
  ]

  for (const file of candidates) {
    if (fs.existsSync(file)) return file
  }

  throw new Error(`Cannot find Next standalone server.js.\nChecked:\n${candidates.join('\n')}`)
}

async function startNextServer() {
  const port = await pickFreePort()
  const serverEntry = resolveServerEntry()

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  serverProcess.stdout.on('data', chunk => {
    process.stdout.write(`[next] ${chunk}`)
  })
  serverProcess.stderr.on('data', chunk => {
    process.stderr.write(`[next] ${chunk}`)
  })
  serverProcess.once('exit', code => {
    if (!app.isQuitting) {
      dialog.showErrorBox('服务已退出', `本地服务进程异常退出（code=${code ?? 'null'}）`)
      app.quit()
    }
  })

  const serverUrl = `http://127.0.0.1:${port}`
  await waitForServer(serverUrl)
  return serverUrl
}

function stopNextServer() {
  if (!serverProcess || serverProcess.killed) return
  serverProcess.kill()
  serverProcess = null
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL(url)
}

app.on('before-quit', () => {
  app.isQuitting = true
  stopNextServer()
})

app.whenReady().then(async () => {
  try {
    const url = await startNextServer()
    createMainWindow(url)
  } catch (error) {
    dialog.showErrorBox('启动失败', error instanceof Error ? error.message : String(error))
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
    app.quit()
  }
})
