const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const TEMP_ROOT = path.join(ROOT, '.desktop-build-temp')
const SQLITE_DB = path.join(ROOT, 'public', 'data', 'poems-index.db')
const SQLITE_DB_TEMP = path.join(TEMP_ROOT, 'poems-index.db.mobile.tmp')

function moveSqliteOut() {
  if (!fs.existsSync(SQLITE_DB)) return false
  fs.mkdirSync(TEMP_ROOT, { recursive: true })
  fs.rmSync(SQLITE_DB_TEMP, { force: true })
  fs.renameSync(SQLITE_DB, SQLITE_DB_TEMP)
  return true
}

function restoreSqliteIfNeeded(moved) {
  if (!moved) return
  if (fs.existsSync(SQLITE_DB)) {
    fs.rmSync(SQLITE_DB, { force: true })
  }
  if (fs.existsSync(SQLITE_DB_TEMP)) {
    fs.renameSync(SQLITE_DB_TEMP, SQLITE_DB)
  }
}

function main() {
  let exitCode = 0
  const moved = moveSqliteOut()

  try {
    const result = spawnSync(NPM_BIN, ['run', 'build:web:desktop-static'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        NEXT_PUBLIC_SHICI_LOCAL_DATA: '1',
      },
    })

    if (result.status !== 0) {
      exitCode = result.status || 1
    }
  } finally {
    restoreSqliteIfNeeded(moved)
  }

  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

main()
