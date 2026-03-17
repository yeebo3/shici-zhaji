const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { createPoemsService } = require('./poems-service.cjs')
const { createStudyService } = require('./study-service.cjs')

process.env.SHICI_DESKTOP_RUNTIME = 'static'

const STATIC_SERVER_PORT = Number.parseInt(process.env.SHICI_DESKTOP_PORT || '32147', 10)
if (!Number.isFinite(STATIC_SERVER_PORT) || STATIC_SERVER_PORT <= 0 || STATIC_SERVER_PORT > 65535) {
  throw new Error(`Invalid SHICI_DESKTOP_PORT: ${process.env.SHICI_DESKTOP_PORT || ''}`)
}

let mainWindow = null
let poemsService = null
let studyService = null
let staticServer = null

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

function resolveRuntimeRoot() {
  const candidates = [
    path.join(process.resourcesPath, 'app-runtime'),
    path.join(app.getAppPath(), 'dist-desktop', 'static-runtime'),
    path.join(app.getAppPath(), '.next-static'),
    path.join(app.getAppPath(), 'out'),
  ]

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir
    }
  }

  throw new Error(`Cannot find static runtime directory.\nChecked:\n${candidates.join('\n')}`)
}

function resolveDataDir(runtimeRoot) {
  const candidates = [
    path.join(runtimeRoot, 'data'),
    path.join(app.getAppPath(), 'public', 'data'),
  ]

  for (const dir of candidates) {
    const hasManifest = fs.existsSync(path.join(dir, 'manifest.json'))
    const hasSqlite = fs.existsSync(path.join(dir, 'poems-index.db'))
    const hasJsonIndex = fs.existsSync(path.join(dir, 'index.json'))
    if (hasManifest && (hasSqlite || hasJsonIndex)) {
      return dir
    }
  }

  throw new Error(`Cannot find poem data directory.\nChecked:\n${candidates.join('\n')}`)
}

function safeResolveUnderRoot(root, relativePath) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(root, relativePath)
  if (resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    return resolved
  }
  return null
}

function resolveRequestFile(runtimeRoot, rawUrl) {
  if (!rawUrl) return path.join(runtimeRoot, 'index.html')

  let pathname = '/'
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://127.0.0.1').pathname)
  } catch {
    pathname = '/'
  }

  if (pathname.startsWith('/api/')) return null

  const normalized = pathname.replace(/^\/+/, '')
  if (!normalized) {
    return path.join(runtimeRoot, 'index.html')
  }

  const candidate = safeResolveUnderRoot(runtimeRoot, normalized)
  if (!candidate) return null

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    const indexFile = path.join(candidate, 'index.html')
    if (fs.existsSync(indexFile)) return indexFile
  }

  const routeIndex = safeResolveUnderRoot(runtimeRoot, path.join(normalized, 'index.html'))
  if (routeIndex && fs.existsSync(routeIndex)) {
    return routeIndex
  }

  return path.join(runtimeRoot, 'index.html')
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return CONTENT_TYPES[ext] || 'application/octet-stream'
}

async function startStaticServer(runtimeRoot) {
  const port = STATIC_SERVER_PORT

  staticServer = http.createServer((req, res) => {
    const file = resolveRequestFile(runtimeRoot, req.url || '/')
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }

    const contentType = getContentType(file)
    const isImmutableAsset = file.includes(`${path.sep}_next${path.sep}static${path.sep}`)
    res.setHeader('Content-Type', contentType)
    res.setHeader(
      'Cache-Control',
      isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
    )

    const stream = fs.createReadStream(file)
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      }
      res.end('Internal Server Error')
    })
    stream.pipe(res)
  })

  await new Promise((resolve, reject) => {
    staticServer.once('error', reject)
    staticServer.listen(port, '127.0.0.1', () => resolve())
  })

  return `http://127.0.0.1:${port}`
}

function stopStaticServer() {
  if (!staticServer) return
  staticServer.close()
  staticServer = null
}

function registerIpcHandlers(poems, study) {
  ipcMain.handle('poems:query', async (_event, query) => {
    return poems.queryPoemIndex(query || {})
  })

  ipcMain.handle('poems:fulltext', async (_event, params) => {
    return poems.searchPoemsFullText(params || {})
  })

  ipcMain.handle('poems:getById', async (_event, payload) => {
    const id = typeof payload === 'string' ? payload : String((payload && payload.id) || '')
    const shard = payload && Number.isInteger(payload.shard) ? payload.shard : undefined
    return poems.getPoemById(id, shard)
  })

  ipcMain.handle('poems:getIndexById', async (_event, id) => {
    return poems.getPoemIndexById(String(id || ''))
  })

  ipcMain.handle('poems:getIndexByIds', async (_event, ids) => {
    return poems.getPoemIndexByIds(Array.isArray(ids) ? ids : [])
  })

  ipcMain.handle('poems:getRandom', async (_event, notebook) => {
    return poems.getRandomPoemIndex(notebook)
  })

  ipcMain.handle('poems:getDaily', async (_event, notebook) => {
    return poems.getDailyPoemIndex(notebook)
  })

  ipcMain.handle('poems:getNotebooks', async () => {
    return poems.listPoemNotebooks()
  })

  ipcMain.handle('poems:getManifest', async () => {
    return poems.loadManifest()
  })

  ipcMain.handle('study:bootstrap', async (_event, payload) => {
    return study.bootstrap(payload || {})
  })

  ipcMain.handle('study:getRecords', async () => {
    return study.getStudyRecords()
  })

  ipcMain.handle('study:getRecord', async (_event, poemId) => {
    return study.getStudyRecord(String(poemId || ''))
  })

  ipcMain.handle('study:saveRecord', async (_event, record) => {
    study.saveStudyRecord(record || {})
    return true
  })

  ipcMain.handle('study:markViewed', async (_event, payload) => {
    const poemId = typeof payload === 'string' ? payload : String((payload && payload.poemId) || '')
    const shard = payload && Number.isInteger(payload.shard) ? payload.shard : undefined
    study.markViewed(poemId, shard)
    return true
  })

  ipcMain.handle('study:toggleFavorite', async (_event, poemId) => {
    return study.toggleFavorite(String(poemId || ''))
  })

  ipcMain.handle('study:markMemorized', async (_event, payload) => {
    const poemId = typeof payload === 'string' ? payload : String((payload && payload.poemId) || '')
    const memorized = Boolean(payload && payload.memorized)
    study.markMemorized(poemId, memorized)
    return true
  })

  ipcMain.handle('study:getFavorites', async () => {
    return study.getFavorites()
  })

  ipcMain.handle('study:getMemorized', async () => {
    return study.getMemorized()
  })

  ipcMain.handle('study:getRecentlyViewed', async (_event, limit) => {
    return study.getRecentlyViewed(limit)
  })

  ipcMain.handle('study:getStats', async () => {
    return study.getStats()
  })

  ipcMain.handle('study:getReciteNotebook', async () => {
    return study.getReciteNotebook()
  })

  ipcMain.handle('study:setReciteNotebook', async (_event, notebook) => {
    return study.setReciteNotebook(notebook)
  })

  ipcMain.handle('study:getPoemGroups', async () => {
    return study.getPoemGroups()
  })

  ipcMain.handle('study:createPoemGroup', async (_event, name) => {
    return study.createPoemGroup(name)
  })

  ipcMain.handle('study:renamePoemGroup', async (_event, payload) => {
    const groupId = String((payload && payload.groupId) || '')
    const name = String((payload && payload.name) || '')
    return study.renamePoemGroup(groupId, name)
  })

  ipcMain.handle('study:deletePoemGroup', async (_event, groupId) => {
    study.deletePoemGroup(String(groupId || ''))
    return true
  })

  ipcMain.handle('study:addPoemToGroup', async (_event, payload) => {
    const groupId = String((payload && payload.groupId) || '')
    const poemId = String((payload && payload.poemId) || '')
    return study.addPoemToGroup(groupId, poemId)
  })

  ipcMain.handle('study:removePoemFromGroup', async (_event, payload) => {
    const groupId = String((payload && payload.groupId) || '')
    const poemId = String((payload && payload.poemId) || '')
    return study.removePoemFromGroup(groupId, poemId)
  })

  ipcMain.handle('study:togglePoemInGroup', async (_event, payload) => {
    const groupId = String((payload && payload.groupId) || '')
    const poemId = String((payload && payload.poemId) || '')
    return study.togglePoemInGroup(groupId, poemId)
  })

  ipcMain.handle('study:getPoemGroupById', async (_event, groupId) => {
    return study.getPoemGroupById(String(groupId || ''))
  })

  ipcMain.handle('study:getGroupsForPoem', async (_event, poemId) => {
    return study.getGroupsForPoem(String(poemId || ''))
  })
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#f5f1e8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL(url)
}

app.on('before-quit', () => {
  stopStaticServer()
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return

  try {
    const runtimeRoot = resolveRuntimeRoot()
    const dataDir = resolveDataDir(runtimeRoot)
    poemsService = createPoemsService({ dataDir })
    studyService = createStudyService({ userDataDir: app.getPath('userData') })
    registerIpcHandlers(poemsService, studyService)

    const url = await startStaticServer(runtimeRoot)
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
