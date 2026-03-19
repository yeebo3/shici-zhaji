const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const STATIC_DIR = path.join(ROOT, '.next-static')
const DATA_DIR = path.join(STATIC_DIR, 'data')
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json')
const SQLITE_PATH = path.join(DATA_DIR, 'poems-index.db')
const EXAMPLES_DIR = path.join(DATA_DIR, 'examples')

function ensureExists(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`${label} not found: ${p}`)
  }
}

function fileSizeMb(p) {
  const size = fs.statSync(p).size
  return (size / 1024 / 1024).toFixed(1)
}

function main() {
  ensureExists(path.join(STATIC_DIR, 'index.html'), 'static web output')
  ensureExists(MANIFEST_PATH, 'manifest')

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  if (manifest.profile !== 'mini') {
    throw new Error(`mobile build only supports mini profile, got: ${String(manifest.profile || '')}`)
  }

  if (fs.existsSync(SQLITE_PATH)) {
    const before = fileSizeMb(SQLITE_PATH)
    fs.rmSync(SQLITE_PATH, { force: true })
    console.log(`[mobile] removed data/poems-index.db (${before} MB)`)
  }

  if (fs.existsSync(EXAMPLES_DIR)) {
    fs.rmSync(EXAMPLES_DIR, { recursive: true, force: true })
    console.log('[mobile] removed data/examples')
  }

  console.log(`[mobile] static runtime prepared (mini profile): ${STATIC_DIR}`)
}

main()
