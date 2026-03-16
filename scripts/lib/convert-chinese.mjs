/**
 * 繁简转换工具
 * 使用 opencc-js 将繁体中文转为简体中文
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Converter } from 'opencc-js'

const t2s = Converter({ from: 'tw', to: 'cn' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXES_FILE = path.join(__dirname, '..', 'config', 'post-convert-fixes.json')

function loadPostConvertFixMap() {
  if (!fs.existsSync(FIXES_FILE)) return {}
  try {
    const raw = fs.readFileSync(FIXES_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

function escapeForRegexCharClass(text) {
  return text.replace(/[-\\\]^]/g, '\\$&')
}

const postConvertFixMap = loadPostConvertFixMap()
const postConvertFixChars = Object.keys(postConvertFixMap)
const postConvertFixPattern = postConvertFixChars.length
  ? new RegExp(`[${escapeForRegexCharClass(postConvertFixChars.join(''))}]`, 'g')
  : null

/**
 * 将字符串从繁体转为简体
 */
export function toSimplified(text) {
  if (!text || typeof text !== 'string') return text
  const converted = t2s(text)
  if (!postConvertFixPattern) return converted
  return converted.replace(postConvertFixPattern, ch => postConvertFixMap[ch] || ch)
}

/**
 * 将诗词对象中的所有文本字段转为简体
 */
export function convertPoemToSimplified(poem) {
  return {
    ...poem,
    title: toSimplified(poem.title),
    author: toSimplified(poem.author),
    dynasty: toSimplified(poem.dynasty),
    content: (poem.content || []).map(toSimplified),
    annotation: (poem.annotation || []).map(toSimplified),
    translation: (poem.translation || []).map(toSimplified),
    appreciation: toSimplified(poem.appreciation || ''),
    tags: (poem.tags || []).map(toSimplified),
  }
}
