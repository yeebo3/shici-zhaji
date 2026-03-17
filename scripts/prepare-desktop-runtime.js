const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'dist-desktop', 'runtime')
const STANDALONE_DIR = path.join(ROOT, '.next', 'standalone')
const STATIC_DIR = path.join(ROOT, '.next', 'static')
const PUBLIC_DIR = path.join(ROOT, 'public')

function ensureExists(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`${label} not found: ${p}`)
  }
}

function copyDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true, force: true })
}

function main() {
  ensureExists(STANDALONE_DIR, 'Next standalone output')
  ensureExists(STATIC_DIR, 'Next static output')
  ensureExists(PUBLIC_DIR, 'Public assets')

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  copyDir(STANDALONE_DIR, OUT_DIR)
  copyDir(STATIC_DIR, path.join(OUT_DIR, '.next', 'static'))
  copyDir(PUBLIC_DIR, path.join(OUT_DIR, 'public'))

  console.log(`Desktop runtime prepared: ${OUT_DIR}`)
}

main()
