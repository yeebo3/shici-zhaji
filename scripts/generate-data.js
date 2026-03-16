/**
 * 数据构建脚本（多源版）
 *
 * 用法：node scripts/generate-data.js
 * 选项：
 *   --exclude-vm-catalog   不将 vmijunv 转换数据并入主库（仅用于补全）
 *
 * 数据来源（按优先级扫描，后者不覆盖前者）：
 *   1. data/poems-source.json          ← 手工编辑（local 来源，最高优先）
 *   2. data/sources/chinese-poetry/**  ← fetch 拉取的 chinese-poetry 数据
 *   3. data/sources/vmijunv/**         ← fetch 拉取的 VMIJUNV 数据
 *   4. data/sources/gushiwen/**        ← 古诗文网爬取的赏析/注释数据
 *
 * 输出：
 *   public/data/index.json             ← 轻量索引（首屏加载）
 *   public/data/manifest.json          ← 清单（分片映射、朝代/作者/标签列表）
 *   public/data/shards/s-0.json        ← 按固定大小分片的完整诗词数据
 *   public/data/shards/s-1.json
 *   ...
 *
 * 分片策略：
 *   - 每个分片最多 SHARD_SIZE 首（默认 500），控制单文件体积
 *   - manifest 中记录每首诗的 id → 分片文件映射
 *   - 前端通过 manifest 查找分片，按需加载
 *
 * 繁简转换：
 *   - 合并后自动将所有诗词文本字段转为简体中文（opencc-js）
 *   - local 来源的诗词默认已是简体，也会过一遍确保一致
 */

const fs = require('fs')
const path = require('path')

const SHARD_SIZE = 500 // 每个分片最多多少首

const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const SOURCES_DIR = path.join(DATA_DIR, 'sources')
const PUBLIC_DATA = path.join(ROOT, 'public', 'data')
const SHARDS_DIR = path.join(PUBLIC_DATA, 'shards')
const POST_CONVERT_FIXES_FILE = path.join(ROOT, 'scripts', 'config', 'post-convert-fixes.json')

// ============ 1. 收集所有源文件中的诗词 ============

function loadLocalSource() {
  const p = path.join(DATA_DIR, 'poems-source.json')
  if (!fs.existsSync(p)) return []
  const poems = JSON.parse(fs.readFileSync(p, 'utf-8'))
  return poems.map(poem => ({ ...poem, source: poem.source || 'local' }))
}

function scanSourceDir(dir) {
  const poems = []
  if (!fs.existsSync(dir)) return poems

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // 避免在超大数据量下使用 spread 触发调用栈溢出
      const nested = scanSourceDir(full)
      for (const item of nested) poems.push(item)
    } else if (entry.name.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(full, 'utf-8'))
        const arr = Array.isArray(data) ? data : [data]
        for (const p of arr) {
          if (p && p.title && p.author && p.content && p.content.length > 0) {
            poems.push(p)
          }
        }
      } catch (e) {
        console.warn(`  跳过无法解析的文件: ${full} (${e.message})`)
      }
    }
  }
  return poems
}

function appendAll(target, source) {
  for (const item of source) target.push(item)
}

// ============ 繁简转换 ============

async function loadConverter() {
  const { Converter } = await import('opencc-js')
  const t2s = Converter({ from: 'tw', to: 'cn' })
  return t2s
}

function loadPostConvertFixMap() {
  if (!fs.existsSync(POST_CONVERT_FIXES_FILE)) return {}
  try {
    const raw = fs.readFileSync(POST_CONVERT_FIXES_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch (e) {
    console.warn(`  警告：纠错配置读取失败，已忽略 (${e.message})`)
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

function normalizeSimplifiedText(text) {
  if (!postConvertFixPattern) return text
  return text.replace(postConvertFixPattern, ch => postConvertFixMap[ch] || ch)
}

function toSimplified(text, t2s) {
  return normalizeSimplifiedText(t2s(text || ''))
}

function toLineArray(val) {
  if (Array.isArray(val)) {
    return val.map(v => (v === null || v === undefined ? '' : String(v))).filter(Boolean)
  }
  if (typeof val === 'string') {
    return val
      .split(/\r?\n+/)
      .map(s => s.trim())
      .filter(Boolean)
  }
  if (typeof val === 'number' || typeof val === 'boolean') return [String(val)]
  return []
}

function toTagArray(val) {
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean)
  if (typeof val === 'string') {
    return val
      .split(/[，,、;；|/]+/)
      .map(s => s.trim())
      .filter(Boolean)
  }
  return []
}

function convertPoem(poem, t2s) {
  const content = toLineArray(poem.content)
  const annotation = toLineArray(poem.annotation)
  const translation = toLineArray(poem.translation)
  const tags = toTagArray(poem.tags)

  return {
    ...poem,
    title: toSimplified(poem.title, t2s),
    author: toSimplified(poem.author, t2s),
    dynasty: toSimplified(poem.dynasty, t2s),
    content: content.map(s => toSimplified(s, t2s)),
    annotation: annotation.map(s => toSimplified(s, t2s)),
    translation: translation.map(s => toSimplified(s, t2s)),
    appreciation: toSimplified(poem.appreciation, t2s),
    tags: tags.map(s => toSimplified(s, t2s)),
  }
}

// ============ 主流程 ============

async function main() {
  const args = process.argv.slice(2)
  const includeVmCatalog = !args.includes('--exclude-vm-catalog')

  console.log('=== 扫描数据源 ===')
  console.log(`  include-vm-catalog: ${includeVmCatalog}`)

  const localPoems = loadLocalSource()
  console.log(`  local (poems-source.json): ${localPoems.length} 首`)

  const chinesePoetryDir = path.join(SOURCES_DIR, 'chinese-poetry')
  const localSourcesDir = path.join(SOURCES_DIR, 'local')
  const gushiwenDir = path.join(SOURCES_DIR, 'gushiwen')
  const vmConvertedDir = path.join(SOURCES_DIR, 'vmijunv', 'converted')

  const chinesePoems = scanSourceDir(chinesePoetryDir)
  const localSourcePoems = scanSourceDir(localSourcesDir)
  const gushiwenPoems = scanSourceDir(gushiwenDir)
  const vmConvertedPoems = scanSourceDir(vmConvertedDir)

  console.log(`  chinese-poetry: ${chinesePoems.length} 首`)
  console.log(`  local sources: ${localSourcePoems.length} 首`)
  console.log(`  gushiwen: ${gushiwenPoems.length} 首`)
  console.log(`  vmijunv converted: ${vmConvertedPoems.length} 首`)

  const fetchedPoems = []
  appendAll(fetchedPoems, chinesePoems)
  appendAll(fetchedPoems, localSourcePoems)
  if (includeVmCatalog) {
    appendAll(fetchedPoems, vmConvertedPoems)
  } else {
    console.log('  vmijunv converted 默认不入主库（仅用于字段补全）')
  }
  console.log(`  sources 入主库总计: ${fetchedPoems.length} 首`)

  // ============ 2. 合并去重 ============
  // local 优先，按 title+author 去重（先转简体再去重，避免繁简同名重复）

  console.log('\n=== 繁简转换 ===')
  const t2s = await loadConverter()
  console.log('  opencc-js 加载完成')

  const seen = new Set()
  const allPoems = []

  // local 来源也过一遍转换，确保一致性
  for (const p of localPoems) {
    const cp = convertPoem(p, t2s)
    const key = `${cp.title}|||${cp.author}`
    if (!seen.has(key)) {
      seen.add(key)
      allPoems.push(cp)
    }
  }

  let dupCount = 0
  for (const p of fetchedPoems) {
    const cp = convertPoem(p, t2s)
    const key = `${cp.title}|||${cp.author}`
    if (!seen.has(key)) {
      seen.add(key)
      allPoems.push(cp)
    } else {
      dupCount++
    }
  }

  console.log(`  已转换 ${localPoems.length + fetchedPoems.length} 首`)
  console.log(`\n合并后: ${allPoems.length} 首（去重跳过 ${dupCount} 首）`)

  if (allPoems.length === 0) {
    console.log('没有诗词数据，退出。')
    process.exit(0)
  }

  // ============ 3. 补充赏析数据 ============
  // 从 gushiwen/vmijunv 数据源中按 title+author 匹配，补充空缺字段
  console.log('\n=== 补充赏析数据 ===')
  const enrichMap = new Map()
  const enrichCandidates = []
  appendAll(enrichCandidates, gushiwenPoems)
  appendAll(enrichCandidates, vmConvertedPoems)

  for (const item of enrichCandidates) {
    const c = convertPoem(item, t2s)
    const key = `${c.title}|||${c.author}`
    if (!enrichMap.has(key)) {
      enrichMap.set(key, c)
    }
  }
  console.log(`  补全候选: ${enrichCandidates.length} 首（去重键后 ${enrichMap.size}）`)

  let enriched = 0
  for (const poem of allPoems) {
    const key = `${poem.title}|||${poem.author}`
    const extra = enrichMap.get(key)
    if (!extra) continue

    let changed = false
    if ((!poem.annotation || poem.annotation.length === 0) && extra.annotation && extra.annotation.length > 0) {
      poem.annotation = extra.annotation
      changed = true
    }
    if ((!poem.translation || poem.translation.length === 0) && extra.translation && extra.translation.length > 0) {
      poem.translation = extra.translation
      changed = true
    }
    if ((!poem.appreciation || poem.appreciation.trim() === '') && extra.appreciation && extra.appreciation.trim() !== '') {
      poem.appreciation = extra.appreciation
      changed = true
    }
    if ((!poem.tags || poem.tags.length === 0) && extra.tags && extra.tags.length > 0) {
      poem.tags = extra.tags
      changed = true
    }
    if (changed) enriched++
  }
  console.log(`  补充了 ${enriched} 首诗的赏析/注释/译文`)

  // ============ 4. 生成索引 ============

  console.log('\n=== 生成输出 ===')

  fs.mkdirSync(PUBLIC_DATA, { recursive: true })
  fs.mkdirSync(SHARDS_DIR, { recursive: true })

  // 清理旧分片
  const oldShards = fs.readdirSync(SHARDS_DIR).filter(f => f.endsWith('.json'))
  for (const f of oldShards) fs.unlinkSync(path.join(SHARDS_DIR, f))
  // 清理旧的按朝代分片目录（兼容旧结构）
  const oldPoemsDir = path.join(PUBLIC_DATA, 'poems')
  if (fs.existsSync(oldPoemsDir)) {
    fs.rmSync(oldPoemsDir, { recursive: true, force: true })
    console.log('  已清理旧 poems/ 目录')
  }

  // 分片 + 索引（索引中嵌入 shard 编号，避免 manifest 膨胀）
  const shardMeta = []
  const index = []

  for (let i = 0; i < allPoems.length; i += SHARD_SIZE) {
    const chunk = allPoems.slice(i, i + SHARD_SIZE)
    const shardIdx = Math.floor(i / SHARD_SIZE)
    const shardFile = `s-${shardIdx}.json`

    fs.writeFileSync(
      path.join(SHARDS_DIR, shardFile),
      JSON.stringify({ shard: shardIdx, poems: chunk })
    )

    // 为这个分片中的每首诗生成索引条目（带 shard 编号）
    for (const p of chunk) {
      index.push({
        id: p.id,
        title: p.title,
        author: p.author,
        dynasty: p.dynasty,
        tags: p.tags || [],
        preview: (p.content || []).slice(0, 2).join(''),
        source: p.source || '',
        shard: shardIdx,
      })
    }

    shardMeta.push({
      file: `shards/${shardFile}`,
      index: shardIdx,
      count: chunk.length,
      size: fs.statSync(path.join(SHARDS_DIR, shardFile)).size,
    })

    console.log(`  ${shardFile}: ${chunk.length} 首 (${(shardMeta[shardMeta.length-1].size / 1024).toFixed(1)}KB)`)
  }

  const indexPath = path.join(PUBLIC_DATA, 'index.json')
  fs.writeFileSync(indexPath, JSON.stringify(index))
  console.log(`  index.json: ${allPoems.length} 条 (${(fs.statSync(indexPath).size / 1024).toFixed(1)}KB)`)

  // 清单
  const dynasties = [...new Set(allPoems.map(p => p.dynasty).filter(Boolean))]
  const authors = [...new Set(allPoems.map(p => p.author).filter(Boolean))]
  const tags = [...new Set(allPoems.flatMap(p => p.tags || []).filter(Boolean))]
  const sources = [...new Set(allPoems.map(p => p.source).filter(Boolean))]

  const manifest = {
    total: allPoems.length,
    shardSize: SHARD_SIZE,
    shards: shardMeta,
    dynasties,
    authors,
    tags,
    sources,
    generatedAt: new Date().toISOString(),
  }

  const manifestPath = path.join(PUBLIC_DATA, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  console.log(`  manifest.json: (${(fs.statSync(manifestPath).size / 1024).toFixed(1)}KB)`)

  console.log('\n完成！')
}

main().catch(e => { console.error('致命错误:', e); process.exit(1) })
