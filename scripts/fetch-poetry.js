#!/usr/bin/env node
/**
 * 从 GitHub 开源诗词库拉取数据 → 按来源/分类分文件存储
 *
 * 数据源：
 *   1. chinese-poetry/chinese-poetry  — 全唐诗、全宋诗、宋词
 *   2. VMIJUNV/chinese-poetry-and-prose — 84万篇古诗文（带译文、赏析）
 *
 * 存储结构（保留原始文件粒度，不合并为单一大文件）：
 *   data/sources/chinese-poetry/tang-shi/poet.tang.0.json
 *   data/sources/chinese-poetry/song-ci/ci.song.0.json
 *   data/sources/vmijunv/works辽.json
 *   data/sources/local/poems-source.json          ← 手工编辑的保留
 *
 * 用法：
 *   node scripts/fetch-poetry.js [选项]
 *
 * 选项：
 *   --source <1|2|all>     数据源  默认 all
 *   --category <类别>      数据源1: tang-shi|song-shi|song-ci|all
 *                          数据源2: 朝代名如 唐|宋|辽|all
 *   --limit <数量>         每个文件最多取多少首（调试用），0=不限
 *   --max-files <数量>     最多下载多少个文件，0=不限
 *   --dry-run              只打印计划
 *
 * 示例：
 *   npm run fetch -- --source 1 --category song-ci --max-files 2 --limit 100
 *   npm run fetch -- --source 2 --category 辽
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ============ 配置 ============

const API_BASE_1 = 'https://api.github.com/repos/chinese-poetry/chinese-poetry/contents'
const RAW_BASE_2 = 'https://raw.githubusercontent.com/VMIJUNV/chinese-poetry-and-prose/master'

const SOURCES_DIR = path.join(__dirname, '..', 'data', 'sources')

const SOURCE1_CATEGORIES = {
  'tang-shi': { dir: '全唐诗', pattern: /^poet\.tang\.\d+\.json$/, dynasty: '唐' },
  'song-shi': { dir: '全唐诗', pattern: /^poet\.song\.\d+\.json$/, dynasty: '宋' },
  'song-ci':  { dir: '宋词',   pattern: /^ci\.song\.\d+\.json$/,   dynasty: '宋', isCi: true },
}

const SOURCE2_DYNASTIES = ['三国','五代十国','南北朝','周','商','晋','汉','现代','秦','辽','金','隋']

// ============ HTTP ============

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'shici-zhaji' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJSON(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${url}`))
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { reject(e) } })
    }).on('error', reject)
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ============ ID 生成 ============

let idSeq = 0
function makeId(title, author, source) {
  idSeq++
  // 纯数字 ID，避免中文字符导致 URL 编码问题
  const prefix = source === 'cp' ? 'cp' : 'vm'
  return `${prefix}-${idSeq}`
}

// ============ 转换器 ============

function convertS1(raw, dynasty, isCi) {
  const title = isCi
    ? `${raw.rhythmic || ''}${raw.title ? '·' + raw.title : ''}`
    : (raw.title || '')
  if (!title && !raw.rhythmic) return null

  const content = (raw.paragraphs || []).map(p => p.trim()).filter(Boolean)
  if (!content.length) return null

  return {
    id: makeId(title, raw.author, 'cp'),
    title, author: raw.author || '', dynasty,
    content, annotation: [], translation: [],
    appreciation: '', tags: raw.tags || [],
    source: 'chinese-poetry',
  }
}

function convertS2(raw) {
  if (!raw.Title || !raw.Author) return null
  const content = typeof raw.Content === 'string'
    ? raw.Content.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    : []
  if (!content.length) return null

  let annotation = []
  if (raw.Annotation && typeof raw.Annotation === 'string' && raw.Annotation.trim())
    annotation = raw.Annotation.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  let translation = []
  if (raw.Translation && typeof raw.Translation === 'string' && raw.Translation.trim())
    translation = raw.Translation.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  let appreciation = ''
  if (raw.Intro && raw.Intro.trim()) appreciation = raw.Intro.trim()
  if (raw.Comment && raw.Comment.trim())
    appreciation = appreciation ? appreciation + '\n' + raw.Comment.trim() : raw.Comment.trim()

  return {
    id: makeId(raw.Title, raw.Author, 'vm'),
    title: raw.Title, author: raw.Author, dynasty: raw.Dynasty || '',
    content, annotation, translation, appreciation,
    tags: raw.Kind ? [raw.Kind] : [],
    source: 'vmijunv',
  }
}

// ============ 数据源1 ============

async function fetchSource1(category, limit, maxFiles, dryRun) {
  const cats = category === 'all' ? Object.keys(SOURCE1_CATEGORIES) : [category]

  for (const cat of cats) {
    const cfg = SOURCE1_CATEGORIES[cat]
    if (!cfg) { console.warn(`  未知分类: ${cat}`); continue }

    console.log(`  列出 ${cfg.dir}/${cat} ...`)
    const listing = await fetchJSON(`${API_BASE_1}/${encodeURIComponent(cfg.dir)}`)
    const files = listing.filter(f => f.type === 'file' && cfg.pattern.test(f.name))
    const toFetch = maxFiles > 0 ? files.slice(0, maxFiles) : files
    console.log(`    ${files.length} 个文件，将下载 ${toFetch.length} 个`)

    if (dryRun) { toFetch.forEach(f => console.log(`      ${f.name}`)); continue }

    const outDir = path.join(SOURCES_DIR, 'chinese-poetry', cat)
    fs.mkdirSync(outDir, { recursive: true })

    for (let i = 0; i < toFetch.length; i++) {
      const f = toFetch[i]
      const outPath = path.join(outDir, f.name)

      // 增量：已存在则跳过
      if (fs.existsSync(outPath)) {
        process.stdout.write(`  [${i+1}/${toFetch.length}] ${f.name} 已存在，跳过\n`)
        continue
      }

      process.stdout.write(`  [${i+1}/${toFetch.length}] ${f.name} ... `)
      try {
        const raw = await fetchJSON(f.download_url)
        const arr = Array.isArray(raw) ? raw : [raw]
        let converted = arr.map(p => convertS1(p, cfg.dynasty, cfg.isCi)).filter(Boolean)
        if (limit > 0) converted = converted.slice(0, limit)
        fs.writeFileSync(outPath, JSON.stringify(converted))
        console.log(`${converted.length} 首`)
      } catch (e) {
        console.log(`失败: ${e.message}`)
      }
      await sleep(300)
    }
    await sleep(500)
  }
}

// ============ 数据源2 ============

async function fetchSource2(dynastyFilter, limit, maxFiles, dryRun) {
  const dynasties = dynastyFilter === 'all' ? SOURCE2_DYNASTIES : [dynastyFilter]
  const toFetch = maxFiles > 0 ? dynasties.slice(0, maxFiles) : dynasties

  console.log(`  ${toFetch.length} 个朝代文件`)
  if (dryRun) { toFetch.forEach(d => console.log(`    works${d}.json`)); return }

  const outDir = path.join(SOURCES_DIR, 'vmijunv')
  fs.mkdirSync(outDir, { recursive: true })

  for (let i = 0; i < toFetch.length; i++) {
    const d = toFetch[i]
    const fileName = `works${d}.json`
    const outPath = path.join(outDir, fileName)

    if (fs.existsSync(outPath)) {
      process.stdout.write(`  [${i+1}/${toFetch.length}] ${fileName} 已存在，跳过\n`)
      continue
    }

    process.stdout.write(`  [${i+1}/${toFetch.length}] ${fileName} ... `)
    const url = `${RAW_BASE_2}/${encodeURIComponent('部分诗词数据')}/${encodeURIComponent(fileName)}`
    try {
      const raw = await fetchJSON(url)
      const arr = Array.isArray(raw) ? raw : [raw]
      let converted = arr.map(p => convertS2(p)).filter(Boolean)
      if (limit > 0) converted = converted.slice(0, limit)
      fs.writeFileSync(outPath, JSON.stringify(converted))
      console.log(`${converted.length} 首`)
    } catch (e) {
      console.log(`失败: ${e.message}`)
    }
    await sleep(300)
  }
}

// ============ 主流程 ============

async function main() {
  const args = process.argv.slice(2)
  const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && i+1 < args.length ? args[i+1] : d }
  const hasFlag = n => args.includes(n)

  const source = getArg('--source', 'all')
  const category = getArg('--category', 'all')
  const limit = parseInt(getArg('--limit', '0'), 10)
  const maxFiles = parseInt(getArg('--max-files', '0'), 10)
  const dryRun = hasFlag('--dry-run')

  console.log('=== 诗词数据拉取 ===')
  console.log(`source=${source} category=${category} limit=${limit||'无'} max-files=${maxFiles||'无'} dry-run=${dryRun}`)
  console.log(`存储目录: data/sources/\n`)

  if (source === '1' || source === 'all') {
    console.log('--- chinese-poetry/chinese-poetry ---')
    const cat1 = (source === 'all' && SOURCE2_DYNASTIES.includes(category)) ? 'all' : category
    await fetchSource1(cat1, limit, maxFiles, dryRun)
    console.log('')
  }

  if (source === '2' || source === 'all') {
    console.log('--- VMIJUNV/chinese-poetry-and-prose ---')
    const cat2 = (source === 'all' && !SOURCE2_DYNASTIES.includes(category)) ? 'all' : category
    await fetchSource2(cat2, limit, maxFiles, dryRun)
    console.log('')
  }

  if (!dryRun) {
    console.log('下载完成。运行 npm run generate 重建索引。')
  }
}

main().catch(e => { console.error('致命错误:', e); process.exit(1) })
