const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'dist-desktop', 'static-runtime')
const EXPORT_DIR_CANDIDATES = [
  path.join(ROOT, '.next-static'),
  path.join(ROOT, 'out'),
]

function ensureExists(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`${label} not found: ${p}`)
  }
}

function copyDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true, force: true })
}

function pruneRuntimeFiles(runtimeRoot) {
  const dataDir = path.join(runtimeRoot, 'data')
  const sqlitePath = path.join(dataDir, 'poems-index.db')
  const indexPath = path.join(dataDir, 'index.json')
  const examplesDir = path.join(dataDir, 'examples')
  const shardsDir = path.join(dataDir, 'shards')

  if (fs.existsSync(examplesDir)) {
    fs.rmSync(examplesDir, { recursive: true, force: true })
  }

  const keepIndexJson = process.env.SHICI_KEEP_INDEX_JSON === '1'
  if (!keepIndexJson && fs.existsSync(sqlitePath) && fs.existsSync(indexPath)) {
    const before = fs.statSync(indexPath).size
    fs.rmSync(indexPath, { force: true })
    const mb = (before / 1024 / 1024).toFixed(1)
    console.log(`[prepare-runtime] removed data/index.json (${mb} MB)`)
  }

  const keepShards = process.env.SHICI_KEEP_SHARDS === '1'
  if (!keepShards && fs.existsSync(sqlitePath) && fs.existsSync(shardsDir)) {
    const shardFiles = fs.readdirSync(shardsDir).length
    fs.rmSync(shardsDir, { recursive: true, force: true })
    console.log(`[prepare-runtime] removed data/shards (${shardFiles} files)`)
  }
}

function main() {
  const exportDir = EXPORT_DIR_CANDIDATES.find(dir => fs.existsSync(path.join(dir, 'index.html')))
  if (!exportDir) {
    throw new Error(`Next static export output not found. Checked:\n${EXPORT_DIR_CANDIDATES.join('\n')}`)
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  copyDir(exportDir, OUT_DIR)
  pruneRuntimeFiles(OUT_DIR)

  console.log(`Desktop static runtime prepared: ${OUT_DIR}`)
}

main()
