const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const ANDROID_DIR = path.join(ROOT, 'android')

function resolveJavaHome() {
  if (process.env.SHICI_JAVA_HOME) {
    return process.env.SHICI_JAVA_HOME
  }
  const localJdk17 = path.join(os.homedir(), '.local', 'jdks', 'jdk-17')
  if (fs.existsSync(path.join(localJdk17, 'bin', 'java'))) {
    return localJdk17
  }
  return null
}

function main() {
  const task = process.argv[2] || 'assembleRelease'
  const gradleCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
  const env = { ...process.env }

  const javaHome = resolveJavaHome()
  if (javaHome) {
    env.JAVA_HOME = javaHome
    env.PATH = `${path.join(javaHome, 'bin')}${path.delimiter}${env.PATH || ''}`
  }

  const result = spawnSync(gradleCmd, [task], {
    cwd: ANDROID_DIR,
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

main()
