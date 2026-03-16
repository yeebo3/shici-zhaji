#!/usr/bin/env node
/**
 * 从古诗文网 (gushiwen.cn) 爬取诗词的注释、译文、赏析
 *
 * 工作流程：
 *   1. 读取已有诗词数据（public/data/shards），找出缺少赏析的诗
 *   2. 用古诗文网搜索 API 按标题匹配
 *   3. 解析详情页 HTML，提取注释、译文、赏析
 *   4. 结果存入 data/sources/gushiwen/ 目录
 *   5. 运行 npm run generate 即可合并到主数据
 *
 * 用法：
 *   node scripts/fetch-gushiwen.js [选项]
 *
 * 选项：
 *   --limit <数量>     最多爬取多少首，0=不限（默认 50）
 *   --delay <毫秒>     请求间隔（默认 1500ms，请勿过快）
 *   --dry-run          只打印计划，不实际请求
 *   --force            强制重新爬取已有数据
 *   --batch <编号>     分批爬取，每批 50 首（如 --batch 0 爬第 1-50 首）
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

// ============ 配置 ============

const SOURCES_DIR = path.join(__dirname, '..', 'data', 'sources')
const GUSHIWEN_DIR = path.join(SOURCES_DIR, 'gushiwen')
const PUBLIC_DATA = path.join(__dirname, '..', 'public', 'data')

const BASE_URL = 'https://www.gushiwen.cn'
const SEARCH_URL = 'https://so.gushiwen.cn/search.aspx'

const DEFAULT_DELAY = 1500
const DEFAULT_LIMIT = 50
const BATCH_SIZE = 50

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

// ============ HTTP 工具 ============

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: HEADERS }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        if (loc) return fetchHTML(loc.startsWith('http') ? loc : BASE_URL + loc).then(resolve, reject)
        return reject(new Error(`Redirect without location: ${res.statusCode}`))
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${url}`))
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    }).on('error', reject)
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ============ HTML 解析工具（纯正则，无依赖） ============

function stripTags(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .trim()
}

function extractSection(html, sectionName) {
  // 古诗文网的注释/译文/赏析通常在特定的 div 结构中
  // 尝试多种模式匹配
  const patterns = [
    // 模式1: <div class="contyishang"><p>标题</p><p>内容</p></div>
    new RegExp(`<div[^>]*class="contyishang"[^>]*>[\\s\\S]*?<p[^>]*>\\s*${sectionName}[\\s\\S]*?</p>([\\s\\S]*?)</div>`, 'i'),
    // 模式2: 标题后跟内容段落
    new RegExp(`${sectionName}[\\s]*</[^>]+>([\\s\\S]*?)(?=<div[^>]*class="cont|$)`, 'i'),
  ]

  for (const pat of patterns) {
    const m = html.match(pat)
    if (m && m[1]) {
      const text = stripTags(m[1])
      if (text.length > 10) return text
    }
  }
  return ''
}

// ============ 搜索 + 详情解析 ============

async function searchPoem(title, author) {
  // 搜索关键词：标题 + 作者
  const query = encodeURIComponent(`${title} ${author}`)
  const url = `${SEARCH_URL}?value=${query}&valuej=${encodeURIComponent(author)}&type=title`

  try {
    const html = await fetchHTML(url)

    // 从搜索结果中提取诗词详情页链接
    // 古诗文网搜索结果格式: <a ... href="/shiwenv_xxx.aspx" ...>标题</a>
    const linkPattern = /href="(\/shiwenv?_[a-zA-Z0-9]+\.aspx)"/g
    const links = []
    let m
    while ((m = linkPattern.exec(html)) !== null) {
      links.push(m[1])
    }

    if (links.length === 0) return null

    // 取第一个匹配结果
    return BASE_URL + links[0]
  } catch (e) {
    return null
  }
}

async function fetchPoemDetail(detailUrl) {
  try {
    const html = await fetchHTML(detailUrl)

    // 提取注释
    let annotation = []
    const annoText = extractSection(html, '注释') || extractSection(html, '注解')
    if (annoText) {
      annotation = annoText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    }

    // 提取译文
    let translation = []
    const transText = extractSection(html, '译文') || extractSection(html, '白话译文')
    if (transText) {
      translation = transText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    }

    // 提取赏析
    let appreciation = ''
    const appreText = extractSection(html, '赏析') || extractSection(html, '鉴赏') || extractSection(html, '简析')
    if (appreText) {
      appreciation = appreText
    }

    // 如果上面的模式都没匹配到，尝试更宽泛的提取
    if (!annotation.length && !translation.length && !appreciation) {
      // 尝试提取 contyishang 区块中的所有内容
      const blocks = html.match(/<div[^>]*class="contyishang"[^>]*>([\s\S]*?)<\/div>/gi) || []
      for (const block of blocks) {
        const text = stripTags(block)
        if (text.includes('注释') || text.includes('注解')) {
          const lines = text.replace(/^.*?注[释解]\s*/, '').split('\n').map(l => l.trim()).filter(l => l.length > 2)
          if (lines.length > 0 && !annotation.length) annotation = lines
        } else if (text.includes('译文')) {
          const lines = text.replace(/^.*?译文\s*/, '').split('\n').map(l => l.trim()).filter(l => l.length > 2)
          if (lines.length > 0 && !translation.length) translation = lines
        } else if (text.includes('赏析') || text.includes('鉴赏')) {
          const content = text.replace(/^.*?[赏鉴][析赏]\s*/, '').trim()
          if (content.length > 20 && !appreciation) appreciation = content
        }
      }
    }

    return { annotation, translation, appreciation }
  } catch (e) {
    return null
  }
}

// ============ 主流程 ============

async function main() {
  const args = process.argv.slice(2)
  const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && i+1 < args.length ? args[i+1] : d }
  const hasFlag = n => args.includes(n)

  const limit = parseInt(getArg('--limit', String(DEFAULT_LIMIT)), 10)
  const delay = parseInt(getArg('--delay', String(DEFAULT_DELAY)), 10)
  const dryRun = hasFlag('--dry-run')
  const force = hasFlag('--force')
  const batch = hasFlag('--batch') ? parseInt(getArg('--batch', '0'), 10) : -1

  console.log('=== 古诗文网赏析数据爬取 ===')
  console.log(`limit=${limit || '无'} delay=${delay}ms dry-run=${dryRun} force=${force}`)

  // 1. 读取现有诗词，找出缺赏析的
  const shardsDir = path.join(PUBLIC_DATA, 'shards')
  if (!fs.existsSync(shardsDir)) {
    console.error('请先运行 npm run generate 生成基础数据')
    process.exit(1)
  }

  const allPoems = []
  const shardFiles = fs.readdirSync(shardsDir).filter(f => f.endsWith('.json')).sort()
  for (const sf of shardFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(shardsDir, sf), 'utf-8'))
    allPoems.push(...data.poems)
  }

  // 已有的古诗文网数据
  fs.mkdirSync(GUSHIWEN_DIR, { recursive: true })
  const existingFiles = new Set(
    fs.readdirSync(GUSHIWEN_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  )

  // 筛选需要爬取的诗词
  let needFetch = allPoems.filter(p => {
    const hasData = p.appreciation && p.appreciation.trim()
    const alreadyFetched = existingFiles.has(p.id)
    if (force) return !hasData || force
    return !hasData && !alreadyFetched
  })

  // 分批
  if (batch >= 0) {
    const start = batch * BATCH_SIZE
    needFetch = needFetch.slice(start, start + BATCH_SIZE)
    console.log(`批次 ${batch}: 第 ${start + 1} - ${start + needFetch.length} 首`)
  }

  // 限制数量
  if (limit > 0) needFetch = needFetch.slice(0, limit)

  console.log(`\n总诗词: ${allPoems.length}`)
  console.log(`需要爬取: ${needFetch.length}`)
  console.log(`已有古诗文网数据: ${existingFiles.size}`)

  if (dryRun) {
    console.log('\n--- 计划爬取 ---')
    needFetch.forEach((p, i) => console.log(`  ${i + 1}. ${p.title} - ${p.author} (${p.dynasty})`))
    return
  }

  if (needFetch.length === 0) {
    console.log('\n没有需要爬取的诗词。')
    return
  }

  // 2. 逐首爬取
  console.log('\n--- 开始爬取 ---')
  let success = 0, fail = 0, empty = 0

  for (let i = 0; i < needFetch.length; i++) {
    const poem = needFetch[i]
    process.stdout.write(`[${i + 1}/${needFetch.length}] ${poem.title} - ${poem.author} ... `)

    try {
      // 搜索
      const detailUrl = await searchPoem(poem.title, poem.author)
      if (!detailUrl) {
        console.log('未找到')
        fail++
        await sleep(delay)
        continue
      }

      await sleep(Math.floor(delay / 2)) // 搜索和详情之间也间隔一下

      // 获取详情
      const detail = await fetchPoemDetail(detailUrl)
      if (!detail) {
        console.log('解析失败')
        fail++
        await sleep(delay)
        continue
      }

      const hasContent = (detail.annotation.length > 0) || (detail.translation.length > 0) || (detail.appreciation.trim() !== '')

      if (!hasContent) {
        console.log('无赏析内容')
        empty++
        await sleep(delay)
        continue
      }

      // 保存为独立文件，generate-data.js 会扫描合并
      const enrichedPoem = {
        id: poem.id,
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty,
        content: poem.content,
        annotation: detail.annotation,
        translation: detail.translation,
        appreciation: detail.appreciation,
        tags: poem.tags || [],
        source: 'gushiwen',
      }

      fs.writeFileSync(
        path.join(GUSHIWEN_DIR, `${poem.id}.json`),
        JSON.stringify(enrichedPoem, null, 2)
      )

      const parts = []
      if (detail.annotation.length) parts.push(`注释${detail.annotation.length}条`)
      if (detail.translation.length) parts.push(`译文${detail.translation.length}段`)
      if (detail.appreciation) parts.push(`赏析${detail.appreciation.length}字`)
      console.log(`OK (${parts.join(', ')})`)
      success++
    } catch (e) {
      console.log(`错误: ${e.message}`)
      fail++
    }

    await sleep(delay)
  }

  console.log(`\n=== 完成 ===`)
  console.log(`成功: ${success}  失败: ${fail}  无内容: ${empty}`)
  console.log(`\n数据已存入 data/sources/gushiwen/`)
  console.log('运行 npm run generate 重建索引以合并赏析数据。')
}

main().catch(e => { console.error('致命错误:', e); process.exit(1) })
