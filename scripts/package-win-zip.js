const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const INSTALLERS_DIR = path.join(ROOT, 'dist-desktop', 'installers')
const WIN_UNPACKED_DIR = path.join(INSTALLERS_DIR, 'win-unpacked')
const ICON_PATH = path.join(ROOT, 'build', 'icon.ico')

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${cmd} exited with code ${result.status}`)
  }
}

function commandExists(cmd) {
  const result = spawnSync('which', [cmd], { stdio: 'ignore' })
  return result.status === 0
}

function resolveRceditX64() {
  const cacheRoot = path.join(process.env.HOME || '', '.cache', 'electron-builder', 'winCodeSign')
  if (!fs.existsSync(cacheRoot)) {
    throw new Error(`winCodeSign cache not found: ${cacheRoot}`)
  }

  const candidates = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('winCodeSign-'))
    .map((entry) => path.join(cacheRoot, entry.name, 'rcedit-x64.exe'))
    .filter((p) => fs.existsSync(p))
    .sort()
    .reverse()

  if (candidates.length === 0) {
    throw new Error(`rcedit-x64.exe not found under ${cacheRoot}`)
  }

  return candidates[0]
}

function main() {
  const configArg = String(process.env.SHICI_BUILDER_CONFIG || 'electron-builder.static.json').trim()
  const configPath = path.isAbsolute(configArg) ? configArg : path.join(ROOT, configArg)
  if (!fs.existsSync(configPath)) {
    throw new Error(`builder config not found: ${configPath}`)
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const builderConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const productName = builderConfig.productName || pkg.name
  const version = pkg.version
  const rawSuffix = String(process.env.SHICI_ZIP_SUFFIX || '').trim()
  const normalizedSuffix = rawSuffix
    ? (rawSuffix.startsWith('-') ? rawSuffix : `-${rawSuffix}`)
    : ''

  const exePath = path.join(WIN_UNPACKED_DIR, `${productName}.exe`)
  const zipPath = path.join(INSTALLERS_DIR, `${productName}-${version}${normalizedSuffix}.zip`)

  if (!fs.existsSync(ICON_PATH)) {
    throw new Error(`icon not found: ${ICON_PATH}`)
  }

  run('npx', ['electron-builder', '--config', configPath, '--win', 'dir', '--x64'])

  if (!fs.existsSync(exePath)) {
    throw new Error(`exe not found after dir build: ${exePath}`)
  }

  const wineCmd = commandExists('wine64') ? 'wine64' : 'wine'
  if (!commandExists(wineCmd)) {
    throw new Error('wine64/wine is required to patch exe icon')
  }

  const rcedit = resolveRceditX64()
  const wineEnv = {
    ...process.env,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/tmp',
    WINEDEBUG: process.env.WINEDEBUG || '-all',
  }
  run(wineCmd, [rcedit, exePath, '--set-icon', ICON_PATH], { env: wineEnv })

  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath)
  }

  const bundled7za = path.join(ROOT, 'node_modules', '7zip-bin', 'linux', 'x64', '7za')
  const sevenZip = fs.existsSync(bundled7za) ? bundled7za : '7za'
  run(sevenZip, ['a', '-bd', '-mx=7', '-mtc=off', '-mm=Deflate', zipPath, '.'], { cwd: WIN_UNPACKED_DIR })

  const zipBytes = fs.statSync(zipPath).size
  const zipMb = (zipBytes / 1024 / 1024).toFixed(1)
  console.log(`[package-win-zip] done: ${zipPath} (${zipMb} MB)`)
}

main()
