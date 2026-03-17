const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const LEAN_APP_DIR = path.join(ROOT, 'dist-desktop', 'lean-app')
const ELECTRON_SRC_DIR = path.join(ROOT, 'electron')
const ELECTRON_OUT_DIR = path.join(LEAN_APP_DIR, 'electron')
const ROOT_PACKAGE_PATH = path.join(ROOT, 'package.json')
const LEAN_PACKAGE_PATH = path.join(LEAN_APP_DIR, 'package.json')

function main() {
  if (!fs.existsSync(ELECTRON_SRC_DIR)) {
    throw new Error(`electron source dir not found: ${ELECTRON_SRC_DIR}`)
  }
  if (!fs.existsSync(ROOT_PACKAGE_PATH)) {
    throw new Error(`package.json not found: ${ROOT_PACKAGE_PATH}`)
  }

  const rootPkg = JSON.parse(fs.readFileSync(ROOT_PACKAGE_PATH, 'utf8'))
  const leanPkg = {
    name: rootPkg.name,
    version: rootPkg.version,
    description: rootPkg.description || '',
    author: rootPkg.author || '',
    private: true,
    main: 'electron/main-static.cjs',
  }

  fs.rmSync(LEAN_APP_DIR, { recursive: true, force: true })
  fs.mkdirSync(LEAN_APP_DIR, { recursive: true })
  fs.cpSync(ELECTRON_SRC_DIR, ELECTRON_OUT_DIR, { recursive: true, force: true })
  fs.writeFileSync(LEAN_PACKAGE_PATH, `${JSON.stringify(leanPkg, null, 2)}\n`, 'utf8')

  const copied = fs.readdirSync(ELECTRON_OUT_DIR).length
  console.log(`[prepare-lean-app] ready: ${LEAN_APP_DIR}`)
  console.log(`[prepare-lean-app] copied electron files: ${copied}`)
}

main()
