#!/usr/bin/env node
/**
 * 诗词批量导入脚本
 * 
 * 用法：node scripts/import-poems.js <文件路径>
 * 
 * 支持两种输入格式，脚本自动识别：
 * 
 * ═══════════════════════════════════════════
 * 格式一：简化 JSON（.json）
 * ═══════════════════════════════════════════
 * 
 * [
 *   {
 *     "title": "静夜思",          ← 必填
 *     "author": "李白",           ← 必填
 *     "dynasty": "唐",            ← 必填
 *     "content": "床前明月光，疑是地上霜。举头望明月，低头思故乡。"  ← 必填，可以写成一整段
 *     
 *     // 以下全部选填，不填会给默认值
 *     "id": "jing-ye-si",
 *     "annotation": ["床：指井栏或卧具。"],
 *     "translation": ["明亮的月光洒在窗户纸上..."],
 *     "appreciation": "这首诗写的是...",
 *     "tags": ["思乡", "五言绝句"]
 *   }
 * ]
 * 
 * content 也可以写成数组：["床前明月光，", "疑是地上霜。", ...]
 * 
 * ═══════════════════════════════════════════
 * 格式二：纯文本（.txt）
 * ═══════════════════════════════════════════
 * 
 * ---
 * 标题：静夜思
 * 作者：李白
 * 朝代：唐
 * 标签：思乡, 五言绝句
 * 
 * 床前明月光，
 * 疑是地上霜。
 * 举头望明月，
 * 低头思故乡。
 * ---
 * 标题：春晓
 * 作者：孟浩然
 * 朝代：唐
 * 
 * 春眠不觉晓，
 * 处处闻啼鸟。
 * 夜来风雨声，
 * 花落知多少。
 * ---
 * 
 * 规则：
 * - 用 --- 分隔每首诗
 * - 标题/作者/朝代 必填，标签选填（逗号分隔）
 * - 元信息之后空一行，然后写诗词正文
 * - 正文每行一句
 * 
 * ═══════════════════════════════════════════
 * 
 * 导入后自动：
 * - 生成 id（标题拼音）
 * - 按标题去重（已存在的跳过）
 * - 合并到 data/poems-source.json
 * - 运行 generate-data.js 重建索引和分片
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// ============ 拼音映射（常用汉字 → 拼音，用于生成 id） ============

/**
 * 简易汉字转拼音：取每个汉字的首字母或全拼
 * 这里用一个轻量方案：把标题中的汉字转成拼音风格的 slug
 */
function toSlug(title) {
  return title
    .replace(/[·：:，。？！、；""''（）《》\s]/g, '')
    .split('')
    .map(char => {
      // 如果是 ASCII 字符直接保留
      if (/[a-zA-Z0-9-]/.test(char)) return char.toLowerCase()
      // 汉字转 Unicode 编码作为 fallback
      return char
    })
    .join('')
    // 用标题本身作为 id，但做 URI 安全处理
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '')
}

/**
 * 从标题生成一个可读的 id
 * 策略：直接用标题的汉字，中间用短横线连接
 */
function generateId(title) {
  // 去掉标点和特殊字符，保留汉字和字母数字
  const clean = title.replace(/[·：:，。？！、；""''（）《》\s]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .toLowerCase()
  return clean
}

// ============ 解析纯文本格式 ============

function parseTxt(text) {
  const poems = []
  // 按 --- 分割
  const blocks = text.split(/^---$/m).filter(b => b.trim())

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    let title = '', author = '', dynasty = '', tags = []
    let contentLines = []
    let inContent = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        // 空行标记元信息结束，后面是正文
        if (title) inContent = true
        continue
      }

      if (!inContent) {
        // 解析元信息行
        const match = trimmed.match(/^(标题|题目|title)[：:]\s*(.+)$/i)
        if (match) { title = match[2].trim(); continue }

        const matchAuthor = trimmed.match(/^(作者|author)[：:]\s*(.+)$/i)
        if (matchAuthor) { author = matchAuthor[2].trim(); continue }

        const matchDynasty = trimmed.match(/^(朝代|dynasty)[：:]\s*(.+)$/i)
        if (matchDynasty) { dynasty = matchDynasty[2].trim(); continue }

        const matchTags = trimmed.match(/^(标签|tags?)[：:]\s*(.+)$/i)
        if (matchTags) {
          tags = matchTags[2].split(/[,，、]/).map(t => t.trim()).filter(Boolean)
          continue
        }

        // 如果没匹配到元信息但有标题了，当作正文开始
        if (title) {
          inContent = true
          contentLines.push(trimmed)
        }
      } else {
        contentLines.push(trimmed)
      }
    }

    if (title && author && dynasty && contentLines.length > 0) {
      poems.push({
        title,
        author,
        dynasty,
        content: contentLines,
        tags: tags.length > 0 ? tags : [],
      })
    } else if (title || author) {
      console.warn(`  ⚠ 跳过不完整的条目：标题="${title}" 作者="${author}" 朝代="${dynasty}" 正文行数=${contentLines.length}`)
    }
  }

  return poems
}

// ============ 解析简化 JSON 格式 ============

function parseJson(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    console.error('JSON 解析失败：', e.message)
    process.exit(1)
  }

  // 支持单个对象或数组
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr
}

// ============ 标准化一首诗的数据 ============

function normalizePoem(input) {
  const { title, author, dynasty } = input
  if (!title || !author || !dynasty) {
    console.warn(`  ⚠ 跳过缺少必填字段的条目：${JSON.stringify({ title, author, dynasty })}`)
    return null
  }

  // 处理 content
  let content
  if (Array.isArray(input.content)) {
    content = input.content.map(l => l.trim()).filter(Boolean)
  } else if (typeof input.content === 'string') {
    // 按标点断句
    content = input.content
      .split(/(?<=[。？！；\n])/)
      .map(l => l.trim())
      .filter(Boolean)
  } else {
    console.warn(`  ⚠ 跳过没有正文的条目："${title}"`)
    return null
  }

  // 确保每句末尾有标点
  content = content.map(line => {
    if (!/[，。？！、；：]$/.test(line)) return line + '，'
    return line
  })

  const id = input.id || generateId(title)

  return {
    id,
    title,
    author,
    dynasty,
    content,
    annotation: input.annotation || [],
    translation: input.translation || [],
    appreciation: input.appreciation || '',
    tags: input.tags || [],
    source: 'local',
  }
}

// ============ 主流程 ============

function main() {
  const inputFile = process.argv[2]

  if (!inputFile) {
    console.log('用法：node scripts/import-poems.js <文件路径>')
    console.log('')
    console.log('支持 .json 和 .txt 两种格式，详见脚本顶部注释。')
    console.log('')
    console.log('示例：')
    console.log('  node scripts/import-poems.js my-poems.txt')
    console.log('  node scripts/import-poems.js my-poems.json')
    console.log('  npm run import -- my-poems.txt')
    process.exit(0)
  }

  const filePath = path.resolve(inputFile)
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在：${filePath}`)
    process.exit(1)
  }

  const text = fs.readFileSync(filePath, 'utf-8')
  const ext = path.extname(filePath).toLowerCase()

  // 自动识别格式
  let rawPoems
  if (ext === '.json') {
    console.log('检测到 JSON 格式')
    rawPoems = parseJson(text)
  } else if (ext === '.txt') {
    console.log('检测到纯文本格式')
    rawPoems = parseTxt(text)
  } else {
    // 尝试自动判断：以 [ 或 { 开头的当 JSON
    const trimmed = text.trim()
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      console.log('自动识别为 JSON 格式')
      rawPoems = parseJson(text)
    } else {
      console.log('自动识别为纯文本格式')
      rawPoems = parseTxt(text)
    }
  }

  console.log(`解析到 ${rawPoems.length} 首诗词`)

  // 标准化
  const newPoems = rawPoems.map(normalizePoem).filter(Boolean)
  console.log(`有效条目 ${newPoems.length} 首`)

  if (newPoems.length === 0) {
    console.log('没有可导入的诗词，退出。')
    process.exit(0)
  }

  // 读取现有数据
  const sourcePath = path.join(__dirname, '..', 'data', 'poems-source.json')
  let existing = []
  if (fs.existsSync(sourcePath)) {
    existing = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'))
  }

  const existingIds = new Set(existing.map(p => p.id))
  const existingTitles = new Set(existing.map(p => `${p.title}-${p.author}`))

  // 去重合并
  let added = 0
  let skipped = 0
  for (const poem of newPoems) {
    const key = `${poem.title}-${poem.author}`
    if (existingIds.has(poem.id) || existingTitles.has(key)) {
      console.log(`  跳过（已存在）："${poem.title}" - ${poem.author}`)
      skipped++
    } else {
      // 检查 id 冲突，加后缀
      let finalId = poem.id
      let suffix = 2
      while (existingIds.has(finalId)) {
        finalId = `${poem.id}-${suffix}`
        suffix++
      }
      poem.id = finalId
      existing.push(poem)
      existingIds.add(poem.id)
      existingTitles.add(key)
      console.log(`  导入："${poem.title}" - ${poem.author}  (id: ${poem.id})`)
      added++
    }
  }

  console.log('')
  console.log(`导入完成：新增 ${added} 首，跳过 ${skipped} 首（已存在），总计 ${existing.length} 首`)

  if (added === 0) {
    console.log('没有新增内容，无需更新。')
    process.exit(0)
  }

  // 写回 poems-source.json
  fs.writeFileSync(sourcePath, JSON.stringify(existing, null, 2), 'utf-8')
  console.log(`已更新 ${sourcePath}`)

  // 自动运行 generate-data.js 重建索引
  console.log('')
  console.log('正在重建索引和分片...')
  try {
    execSync('node scripts/generate-data.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    })
  } catch (e) {
    console.error('重建索引失败，请手动运行：npm run generate')
  }

  console.log('')
  console.log('全部完成！')
}

main()
