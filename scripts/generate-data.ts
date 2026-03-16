/**
 * 数据生成脚本
 * 
 * 用法：npx ts-node --skip-project scripts/generate-data.ts
 * 
 * 功能：
 * 1. 读取 data/poems-source.ts 中的原始诗词数据
 * 2. 生成 public/data/index.json（轻量索引）
 * 3. 按朝代拆分生成 public/data/poems/{dynasty}.json（完整数据分片）
 * 
 * 后续添加诗词时，只需要往 poems-source.ts 追加数据，重新运行此脚本即可。
 */

import * as fs from 'fs'
import * as path from 'path'

// 直接内联类型，避免路径解析问题
type Poem = {
  id: string
  title: string
  author: string
  dynasty: string
  content: string[]
  annotation: string[]
  translation: string[]
  appreciation: string
  tags: string[]
}

type PoemIndex = {
  id: string
  title: string
  author: string
  dynasty: string
  tags: string[]
  preview: string
}

// 读取源数据
const sourcePath = path.join(__dirname, '..', 'data', 'poems-source.json')
const poems: Poem[] = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'))

console.log(`读取到 ${poems.length} 首诗词`)

// 1. 生成索引
const index: PoemIndex[] = poems.map(p => ({
  id: p.id,
  title: p.title,
  author: p.author,
  dynasty: p.dynasty,
  tags: p.tags,
  preview: p.content.slice(0, 2).join(''),
}))

const indexPath = path.join(__dirname, '..', 'public', 'data', 'index.json')
fs.writeFileSync(indexPath, JSON.stringify(index, null, 0)) // 压缩存储
console.log(`索引文件已生成：${indexPath}（${(fs.statSync(indexPath).size / 1024).toFixed(1)}KB）`)

// 2. 按朝代分片
const byDynasty: Record<string, Poem[]> = {}
for (const p of poems) {
  if (!byDynasty[p.dynasty]) byDynasty[p.dynasty] = []
  byDynasty[p.dynasty].push(p)
}

const poemsDir = path.join(__dirname, '..', 'public', 'data', 'poems')
fs.mkdirSync(poemsDir, { recursive: true })

for (const [dynasty, dPoems] of Object.entries(byDynasty)) {
  const shardPath = path.join(poemsDir, `${dynasty}.json`)
  fs.writeFileSync(shardPath, JSON.stringify({ dynasty, poems: dPoems }, null, 0))
  console.log(`分片 ${dynasty}.json：${dPoems.length} 首（${(fs.statSync(shardPath).size / 1024).toFixed(1)}KB）`)
}

// 3. 生成清单文件（记录有哪些分片）
const manifest = {
  total: poems.length,
  shards: Object.entries(byDynasty).map(([dynasty, dPoems]) => ({
    dynasty,
    count: dPoems.length,
    file: `poems/${dynasty}.json`,
  })),
  dynasties: Object.keys(byDynasty),
  authors: [...new Set(poems.map(p => p.author))],
  tags: [...new Set(poems.flatMap(p => p.tags))],
}

const manifestPath = path.join(__dirname, '..', 'public', 'data', 'manifest.json')
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`清单文件已生成：${manifestPath}`)
console.log('完成！')
