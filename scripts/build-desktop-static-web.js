const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const APP_DIR = path.join(ROOT, 'app')
const API_DIR = path.join(APP_DIR, 'api')
const TEMP_ROOT = path.join(ROOT, '.desktop-build-temp')
const TEMP_API_DIR = path.join(TEMP_ROOT, 'api')
const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
const STATIC_DIST_DIR = path.join(ROOT, '.next-static')
const EXPORT_DIR = path.join(ROOT, 'out')

function moveApiOut() {
  recoverDanglingApiMove()

  if (!fs.existsSync(API_DIR)) return false
  fs.mkdirSync(TEMP_ROOT, { recursive: true })
  fs.rmSync(TEMP_API_DIR, { recursive: true, force: true })
  fs.renameSync(API_DIR, TEMP_API_DIR)
  return true
}

function restoreApiIfNeeded(moved) {
  if (!moved) return
  if (fs.existsSync(API_DIR)) {
    fs.rmSync(API_DIR, { recursive: true, force: true })
  }
  if (fs.existsSync(TEMP_API_DIR)) {
    fs.renameSync(TEMP_API_DIR, API_DIR)
  }
}

function recoverDanglingApiMove() {
  const apiExists = fs.existsSync(API_DIR)
  const tempApiExists = fs.existsSync(TEMP_API_DIR)

  if (!apiExists && tempApiExists) {
    fs.mkdirSync(APP_DIR, { recursive: true })
    fs.renameSync(TEMP_API_DIR, API_DIR)
  }

  if (fs.existsSync(TEMP_API_DIR) && fs.existsSync(API_DIR)) {
    fs.rmSync(TEMP_API_DIR, { recursive: true, force: true })
  }
}

function main() {
  let exitCode = 0
  let moved = false
  try {
    fs.rmSync(STATIC_DIST_DIR, { recursive: true, force: true })
    fs.rmSync(EXPORT_DIR, { recursive: true, force: true })

    moved = moveApiOut()

    const env = {
      ...process.env,
      NEXT_DESKTOP_STATIC: '1',
    }

    const result = spawnSync(process.execPath, [NEXT_BIN, 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
      env,
    })

    if (result.status !== 0) {
      exitCode = result.status || 1
    }
  } finally {
    restoreApiIfNeeded(moved)
  }

  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

main()
