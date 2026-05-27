#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const SEMANTIC_DIR = path.join(DATA_DIR, 'semantic')
const SHARDS_DIR = path.join(DATA_DIR, 'shards')
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json')
const TAXONOMY_PATH = path.join(ROOT, 'scripts', 'config', 'semantic', 'tag-taxonomy.json')
const RULES_PATH = path.join(ROOT, 'scripts', 'config', 'semantic', 'rules.json')

const TAGS_OUT_DIR = path.join(SEMANTIC_DIR, 'poem-tags')
const RECO_OUT_DIR = path.join(SEMANTIC_DIR, 'poem-reco')
const ROUTES_OUT_DIR = path.join(SEMANTIC_DIR, 'routes')
const IMAGERY_OUT_DIR = path.join(SEMANTIC_DIR, 'imagery')
const CLUSTERS_OUT_DIR = path.join(SEMANTIC_DIR, 'poem-clusters')
const VISUALS_OUT_DIR = path.join(SEMANTIC_DIR, 'visuals')

const COMMON_CHARS = new Set('的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处理世车给眼美安切知再查'.split(''))
const PUNCT_PATTERN = /[，。？！、；：,.!?;:"'（）()\[\]{}《》<>·\s]/g

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(value))
}

function parseArgs(argv) {
  const args = argv.slice(2)
  function get(name, fallback = '') {
    const i = args.indexOf(name)
    if (i >= 0 && i + 1 < args.length) return args[i + 1]
    return fallback
  }
  function has(name) {
    return args.includes(name)
  }
  const maxShards = Number.parseInt(get('--max-shards', '0'), 10)
  const startShard = Number.parseInt(get('--start-shard', '0'), 10)
  const endShard = Number.parseInt(get('--end-shard', '0'), 10)
  const clean = has('--clean')
  const enable = has('--enable')
  return {
    maxShards: Number.isInteger(maxShards) && maxShards > 0 ? maxShards : 0,
    startShard: Number.isInteger(startShard) && startShard >= 0 ? startShard : 0,
    endShard: Number.isInteger(endShard) && endShard >= 0 ? endShard : 0,
    clean,
    enable,
  }
}

function normalizeText(input) {
  return (input === null || input === undefined ? '' : String(input)).trim()
}

function compactLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines.map(normalizeText).filter(Boolean)
}

function countKeywordHits(text, words) {
  if (!text || !Array.isArray(words) || words.length === 0) return 0
  let hits = 0
  for (const raw of words) {
    const word = normalizeText(raw)
    if (!word) continue
    if (text.includes(word)) hits++
  }
  return hits
}

function scoreFromHits(base, hits) {
  if (hits <= 0) return 0
  const normalizedBase = Number.isFinite(base) ? base : 0.7
  return Math.min(0.99, normalizedBase + Math.min(0.18, (hits - 1) * 0.03))
}

function isHanChar(ch) {
  const code = ch.codePointAt(0)
  return code >= 0x4e00 && code <= 0x9fff
}

function getUncommonRatio(text) {
  const normalized = normalizeText(text).replace(PUNCT_PATTERN, '')
  if (!normalized) return 0
  let total = 0
  let uncommon = 0
  for (const ch of normalized) {
    if (!isHanChar(ch)) continue
    total++
    if (!COMMON_CHARS.has(ch)) uncommon++
  }
  if (total === 0) return 0
  return uncommon / total
}

function inferFormTags(poem, addTag) {
  const sourceKind = normalizeText(poem.sourceMeta && poem.sourceMeta.kind)
  const tagsText = (Array.isArray(poem.tags) ? poem.tags : []).map(normalizeText).join(' ')
  const lines = compactLines(poem.content)
  const lineCount = lines.length
  const avgChars = lineCount > 0
    ? lines.reduce((sum, line) => sum + line.replace(PUNCT_PATTERN, '').length, 0) / lineCount
    : 0

  if (sourceKind === '词' || /词/.test(tagsText)) {
    addTag('form', '词', 0.99, 'rule', { rule_id: 'form:kind:ci' })
    return
  }
  if (sourceKind === '曲' || /曲/.test(tagsText)) {
    addTag('form', '曲', 0.99, 'rule', { rule_id: 'form:kind:qu' })
    return
  }
  if (lineCount === 4) {
    if (avgChars <= 6) {
      addTag('form', '五言', 0.95, 'rule', { rule_id: 'form:line4:five' })
      addTag('form', '绝句', 0.95, 'rule', { rule_id: 'form:line4:jueju' })
    } else {
      addTag('form', '七言', 0.95, 'rule', { rule_id: 'form:line4:seven' })
      addTag('form', '绝句', 0.95, 'rule', { rule_id: 'form:line4:jueju' })
    }
    return
  }
  if (lineCount === 8) {
    if (avgChars <= 6) {
      addTag('form', '五言', 0.94, 'rule', { rule_id: 'form:line8:five' })
      addTag('form', '律诗', 0.94, 'rule', { rule_id: 'form:line8:lvshi' })
    } else {
      addTag('form', '七言', 0.94, 'rule', { rule_id: 'form:line8:seven' })
      addTag('form', '律诗', 0.94, 'rule', { rule_id: 'form:line8:lvshi' })
    }
    return
  }

  addTag('form', '古体', 0.78, 'rule', { rule_id: 'form:fallback:guti' })
}

function inferDifficultyTags(poem, imageTagCount, addTag) {
  const lines = compactLines(poem.content)
  const text = lines.join('')
  const lineCount = lines.length
  const avgChars = lineCount > 0
    ? lines.reduce((sum, line) => sum + line.replace(PUNCT_PATTERN, '').length, 0) / lineCount
    : 0
  const uncommonRatio = getUncommonRatio(text)
  const hasAnnotation = Array.isArray(poem.annotation) && poem.annotation.length > 0

  if (lineCount <= 4) addTag('difficulty', '短篇', 0.86, 'rule', { rule_id: 'difficulty:line:short' })
  if (lineCount >= 12) addTag('difficulty', '长篇', 0.86, 'rule', { rule_id: 'difficulty:line:long' })
  if (uncommonRatio >= 0.74) addTag('difficulty', '生僻字多', 0.82, 'rule', { rule_id: 'difficulty:uncommon' })
  if (/典|史|汉|秦|楚|周|魏|晋|吴|蜀|隋|唐|宋|元|明/.test(text) && lineCount >= 6) {
    addTag('difficulty', '典故多', 0.76, 'rule', { rule_id: 'difficulty:allusion' })
  }
  if (lineCount > 0 && imageTagCount / lineCount >= 0.9) {
    addTag('difficulty', '意象密集', 0.74, 'rule', { rule_id: 'difficulty:image-density' })
  }
  if (lineCount === 4 || lineCount === 8) {
    if (avgChars >= 4.5 && avgChars <= 8.5) {
      addTag('difficulty', '句式整齐', 0.8, 'rule', { rule_id: 'difficulty:regular-lines' })
    }
  }
  if (lineCount <= 4 && hasAnnotation) {
    addTag('difficulty', '适合入门', 0.88, 'rule', { rule_id: 'difficulty:beginner' })
  }
  if (lineCount >= 8 || uncommonRatio >= 0.72) {
    addTag('difficulty', '适合进阶', 0.84, 'rule', { rule_id: 'difficulty:advanced' })
  }
}

function toLexicalTokens(poem) {
  const text = [
    normalizeText(poem.title),
    ...compactLines(poem.content),
  ].join('')
    .replace(PUNCT_PATTERN, '')

  if (!text) return []
  const out = new Set()
  for (let i = 0; i < text.length; i++) {
    const one = text.slice(i, i + 1)
    if (one) out.add(one)
    const two = text.slice(i, i + 2)
    if (two.length === 2) out.add(two)
  }
  return [...out]
}

function jaccard(aSet, bSet) {
  if (!aSet || !bSet || aSet.size === 0 || bSet.size === 0) return 0
  let inter = 0
  for (const item of aSet) {
    if (bSet.has(item)) inter++
  }
  const union = aSet.size + bSet.size - inter
  if (union <= 0) return 0
  return inter / union
}

function buildReason(current, candidate) {
  const currentTopics = current.tagsByType.topic || []
  const candidateTopics = candidate.tagsByType.topic || []
  const currentImages = current.tagsByType.image || []
  const candidateImages = candidate.tagsByType.image || []

  const topic = currentTopics.find(item => candidateTopics.includes(item)) || candidateTopics[0] || currentTopics[0] || '主题相关'
  const image = currentImages.find(item => candidateImages.includes(item))
  const imageText = image ? `并共享“${image}”意象` : '并保持意象关联'
  const diff = candidate.difficultyScore - current.difficultyScore
  const diffText = diff > 0.15 ? '难度略高，适合进阶'
    : diff < -0.15 ? '难度略低，适合巩固'
    : '难度平稳，适合衔接复习'

  return `同属“${topic}”线索，${imageText}，${diffText}。`
}

function getDifficultyScore(tags) {
  let score = 0.5
  for (const tag of tags) {
    if (tag.tag_type !== 'difficulty') continue
    if (tag.tag_name === '适合入门') score -= 0.12
    if (tag.tag_name === '适合进阶') score += 0.12
    if (tag.tag_name === '长篇') score += 0.15
    if (tag.tag_name === '生僻字多') score += 0.12
    if (tag.tag_name === '典故多') score += 0.1
    if (tag.tag_name === '短篇') score -= 0.08
  }
  return Math.max(0, Math.min(1, score))
}

function tagsToMap(tags) {
  const out = {}
  for (const tag of tags) {
    if (!out[tag.tag_type]) out[tag.tag_type] = []
    out[tag.tag_type].push(tag.tag_name)
  }
  return out
}

function createRouteTemplates() {
  return [
    {
      route_id: 'route_moon_01',
      title: '月意象路线',
      description: '从月景直观到思乡深情，逐步建立“月”意象记忆链。',
      target_level: 'intermediate',
      requiredImages: ['月'],
      related_images: ['月', '江', '雁', '楼'],
      emotion_curve: ['清新', '思念', '沉郁', '旷达'],
      review_plan: { day1: '学习前4首', day3: '闭卷回忆', day7: '整线复诵' },
    },
    {
      route_id: 'route_farewell_01',
      title: '送别路线',
      description: '围绕送别场景、友情线索与离情表达展开。',
      target_level: 'beginner',
      requiredTopics: ['送别'],
      related_images: ['柳', '长亭', '舟'],
      emotion_curve: ['清新', '哀婉', '旷达'],
      review_plan: { day1: '学习前3首', day2: '情绪线回忆', day5: '默写抽查' },
    },
    {
      route_id: 'route_frontier_01',
      title: '边塞路线',
      description: '从边塞风物到家国之思，强调场景与情感的对照。',
      target_level: 'intermediate',
      requiredTopics: ['边塞'],
      related_images: ['关塞', '黄沙', '长风'],
      emotion_curve: ['雄浑', '悲凉', '激昂'],
      review_plan: { day1: '学习前4首', day4: '意象串联', day8: '整线复盘' },
    },
    {
      route_id: 'route_spring_01',
      title: '春日路线',
      description: '聚焦春景意象与生机主题，适合入门用户。',
      target_level: 'beginner',
      requiredTopics: ['春景'],
      related_images: ['春草', '风', '花'],
      emotion_curve: ['清新', '闲适', '旷达'],
      review_plan: { day1: '学习前3首', day3: '看图回忆', day6: '连背' },
    },
    {
      route_id: 'route_autumn_01',
      title: '秋夜路线',
      description: '以秋夜和秋雨意象串联孤寂与沉思。',
      target_level: 'intermediate',
      requiredImages: ['秋雨'],
      related_images: ['秋雨', '月', '雁'],
      emotion_curve: ['孤独', '悲凉', '沉郁'],
      review_plan: { day1: '学习前4首', day4: '关键词回忆', day8: '默诵' },
    },
    {
      route_id: 'route_hometown_01',
      title: '思乡路线',
      description: '从羁旅场景到归乡愿望，强化“乡”主题记忆。',
      target_level: 'beginner',
      requiredTopics: ['思乡'],
      related_images: ['月', '雁', '舟'],
      emotion_curve: ['清新', '思念', '哀婉'],
      review_plan: { day1: '学习前3首', day2: '线索复述', day6: '综合回忆' },
    },
    {
      route_id: 'route_haofang_ci_01',
      title: '豪放词路线',
      description: '围绕豪放词风，建立气势型背诵记忆。',
      target_level: 'advanced',
      requiredStyles: ['豪放'],
      related_images: ['江', '风', '关塞'],
      emotion_curve: ['豪迈', '激昂', '旷达'],
      review_plan: { day1: '学习前3首', day3: '节奏复诵', day7: '整线默写' },
    },
    {
      route_id: 'route_wanyue_ci_01',
      title: '婉约词路线',
      description: '围绕婉约词风，强化细腻情绪与意象识别。',
      target_level: 'advanced',
      requiredStyles: ['婉约'],
      related_images: ['月', '柳', '楼'],
      emotion_curve: ['清新', '哀婉', '沉郁'],
      review_plan: { day1: '学习前3首', day3: '情绪复述', day7: '整线复诵' },
    },
  ]
}

function matchRoute(template, tagsByType) {
  const topics = tagsByType.topic || []
  const images = tagsByType.image || []
  const styles = tagsByType.style || []

  const topicMatch = !template.requiredTopics || template.requiredTopics.some(item => topics.includes(item))
  const imageMatch = !template.requiredImages || template.requiredImages.some(item => images.includes(item))
  const styleMatch = !template.requiredStyles || template.requiredStyles.some(item => styles.includes(item))
  return topicMatch && imageMatch && styleMatch
}

function ensureCleanOutput(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  ensureDir(dir)
}

function main() {
  const opts = parseArgs(process.argv)
  const manifest = readJson(MANIFEST_PATH)
  const taxonomy = readJson(TAXONOMY_PATH, {})
  const rules = readJson(RULES_PATH, {})
  if (!manifest || !Array.isArray(manifest.shards)) {
    throw new Error(`manifest 不可用: ${MANIFEST_PATH}`)
  }

  ensureDir(SEMANTIC_DIR)
  if (opts.clean) {
    ensureCleanOutput(TAGS_OUT_DIR)
    ensureCleanOutput(RECO_OUT_DIR)
    ensureCleanOutput(ROUTES_OUT_DIR)
    ensureCleanOutput(IMAGERY_OUT_DIR)
    ensureCleanOutput(CLUSTERS_OUT_DIR)
    ensureCleanOutput(VISUALS_OUT_DIR)
  } else {
    ensureDir(TAGS_OUT_DIR)
    ensureDir(RECO_OUT_DIR)
    ensureDir(ROUTES_OUT_DIR)
    ensureDir(IMAGERY_OUT_DIR)
    ensureDir(CLUSTERS_OUT_DIR)
    ensureDir(VISUALS_OUT_DIR)
  }

  const now = new Date().toISOString()
  const semanticVersion = `v${now.slice(0, 10)}`
  const authorCount = new Map()
  const routeTemplates = createRouteTemplates()
  const routeCandidates = new Map(routeTemplates.map(item => [item.route_id, []]))
  const imageFreq = new Map()
  const imagePairs = new Map()
  const processedShardIndexes = []
  let processedPoems = 0

  const shardList = manifest.shards
    .filter(item => Number.isInteger(item.index))
    .filter(item => item.index >= opts.startShard)
    .filter(item => !opts.endShard || item.index <= opts.endShard)
    .sort((a, b) => a.index - b.index)

  const activeShards = opts.maxShards > 0 ? shardList.slice(0, opts.maxShards) : shardList

  console.log(`[semantic] start build: shards=${activeShards.length}, total=${manifest.total}`)

  for (const shardMeta of activeShards) {
    const shardFile = path.join(SHARDS_DIR, `s-${shardMeta.index}.json`)
    if (!fs.existsSync(shardFile)) continue
    const shardData = readJson(shardFile, { shard: shardMeta.index, poems: [] })
    const poems = Array.isArray(shardData.poems) ? shardData.poems : []
    const shardTags = []

    for (const poem of poems) {
      const title = normalizeText(poem.title)
      const contentLines = compactLines(poem.content)
      const contentText = contentLines.join('\n')
      const author = normalizeText(poem.author)
      authorCount.set(author, (authorCount.get(author) || 0) + 1)

      const tagMap = new Map()
      const addTag = (tagType, tagName, score, source = 'rule', extra = {}) => {
        const name = normalizeText(tagName)
        if (!name) return
        const key = `${tagType}__${name}`
        const next = {
          tag_name: name,
          tag_type: tagType,
          score: Math.max(0, Math.min(1, Number(score) || 0.7)),
          source,
          created_at: now,
          ...extra,
        }
        const current = tagMap.get(key)
        if (!current || current.score < next.score) {
          tagMap.set(key, next)
        }
      }

      for (const ruleType of ['topic', 'emotion', 'image', 'style']) {
        const typeRules = Array.isArray(rules[ruleType]) ? rules[ruleType] : []
        for (let ruleIndex = 0; ruleIndex < typeRules.length; ruleIndex++) {
          const rule = typeRules[ruleIndex]
          const hits = (
            countKeywordHits(title, rule.titleAny)
            + countKeywordHits(contentText, rule.contentAny)
          )
          if (hits <= 0) continue
          const ruleId = normalizeText(rule.id) || `${ruleType}:${normalizeText(rule.tag) || 'unknown'}:${ruleIndex + 1}`
          addTag(ruleType, rule.tag, scoreFromHits(rule.score, hits), 'rule', { rule_id: ruleId })
        }
      }

      inferFormTags(poem, addTag)
      const imageTagCount = [...tagMap.values()].filter(item => item.tag_type === 'image').length
      inferDifficultyTags(poem, imageTagCount, addTag)

      const tags = [...tagMap.values()]
      shardTags.push({
        poemId: String(poem.id),
        tags,
      })

      const tagsByType = tagsToMap(tags)
      const imageNames = tagsByType.image || []
      for (const imageTag of imageNames) {
        imageFreq.set(imageTag, (imageFreq.get(imageTag) || 0) + 1)
      }
      for (let i = 0; i < imageNames.length; i++) {
        for (let j = i + 1; j < imageNames.length; j++) {
          const a = imageNames[i]
          const b = imageNames[j]
          const key = a < b ? `${a}__${b}` : `${b}__${a}`
          imagePairs.set(key, (imagePairs.get(key) || 0) + 1)
        }
      }

      const difficultyScore = getDifficultyScore(tags)
      for (const template of routeTemplates) {
        if (!matchRoute(template, tagsByType)) continue
        const pool = routeCandidates.get(template.route_id)
        pool.push({
          poem_id: String(poem.id),
          title,
          author,
          tagsByType,
          difficultyScore,
          reason: buildReason(
            { tagsByType, difficultyScore },
            { tagsByType, difficultyScore }
          ),
        })
      }

      processedPoems++
    }

    writeJson(path.join(TAGS_OUT_DIR, `st-${shardMeta.index}.json`), {
      shard: shardMeta.index,
      version: semanticVersion,
      generatedAt: now,
      poems: shardTags,
    })
    processedShardIndexes.push(shardMeta.index)
    console.log(`[semantic] tags shard=${shardMeta.index} poems=${poems.length}`)
  }

  const popularityByAuthor = new Map()
  const maxAuthorCount = Math.max(1, ...authorCount.values())
  for (const [author, count] of authorCount.entries()) {
    popularityByAuthor.set(author, Math.min(1, count / maxAuthorCount))
  }

  for (const shardIndex of processedShardIndexes) {
    const shardFile = path.join(SHARDS_DIR, `s-${shardIndex}.json`)
    const tagsFile = path.join(TAGS_OUT_DIR, `st-${shardIndex}.json`)
    const shardData = readJson(shardFile, { poems: [] })
    const tagData = readJson(tagsFile, { poems: [] })
    const poems = Array.isArray(shardData.poems) ? shardData.poems : []
    const tagById = new Map(
      (Array.isArray(tagData.poems) ? tagData.poems : [])
        .map(item => [item.poemId, Array.isArray(item.tags) ? item.tags : []])
    )

    const metas = poems.map(poem => {
      const tags = tagById.get(String(poem.id)) || []
      const tagsByType = tagsToMap(tags)
      return {
        id: String(poem.id),
        title: normalizeText(poem.title),
        author: normalizeText(poem.author),
        tokens: new Set(toLexicalTokens(poem)),
        tagsByType,
        difficultyScore: getDifficultyScore(tags),
        popularity: popularityByAuthor.get(normalizeText(poem.author)) || 0,
      }
    })

    const topicMap = new Map()
    const imageMap = new Map()
    metas.forEach((meta, idx) => {
      for (const topic of meta.tagsByType.topic || []) {
        if (!topicMap.has(topic)) topicMap.set(topic, [])
        topicMap.get(topic).push(idx)
      }
      for (const image of meta.tagsByType.image || []) {
        if (!imageMap.has(image)) imageMap.set(image, [])
        imageMap.get(image).push(idx)
      }
    })

    const recoItems = metas.map(current => {
      const candidateIdx = new Set()
      for (const topic of current.tagsByType.topic || []) {
        for (const idx of topicMap.get(topic) || []) candidateIdx.add(idx)
      }
      for (const image of current.tagsByType.image || []) {
        for (const idx of imageMap.get(image) || []) candidateIdx.add(idx)
      }

      const ranked = []
      for (const idx of candidateIdx) {
        const candidate = metas[idx]
        if (!candidate || candidate.id === current.id) continue

        const semanticSimilarity = jaccard(current.tokens, candidate.tokens)
        const currentFlat = new Set([
          ...(current.tagsByType.topic || []),
          ...(current.tagsByType.image || []),
          ...(current.tagsByType.style || []),
          ...(current.tagsByType.form || []),
        ])
        const candidateFlat = new Set([
          ...(candidate.tagsByType.topic || []),
          ...(candidate.tagsByType.image || []),
          ...(candidate.tagsByType.style || []),
          ...(candidate.tagsByType.form || []),
        ])
        const tagOverlap = jaccard(currentFlat, candidateFlat)
        const difficultyFit = 1 - Math.min(1, Math.abs(candidate.difficultyScore - current.difficultyScore))
        const weaknessMatch = 0.5
        const popularity = candidate.popularity
        const repeatPenalty = 0

        const score = (
          0.35 * semanticSimilarity
          + 0.2 * tagOverlap
          + 0.15 * difficultyFit
          + 0.15 * weaknessMatch
          + 0.1 * popularity
          - 0.05 * repeatPenalty
        )

        ranked.push({
          poem_id: candidate.id,
          score: Number(score.toFixed(4)),
          breakdown: {
            semanticSimilarity: Number(semanticSimilarity.toFixed(4)),
            tagOverlap: Number(tagOverlap.toFixed(4)),
            difficultyFit: Number(difficultyFit.toFixed(4)),
            weaknessMatch: Number(weaknessMatch.toFixed(4)),
            popularity: Number(popularity.toFixed(4)),
            repeatPenalty: Number(repeatPenalty.toFixed(4)),
          },
          reason: buildReason(current, candidate),
        })
      }

      ranked.sort((a, b) => b.score - a.score)
      return {
        poemId: current.id,
        recommendations: ranked.slice(0, 12),
      }
    })

    writeJson(path.join(RECO_OUT_DIR, `rs-${shardIndex}.json`), {
      shard: shardIndex,
      version: semanticVersion,
      generatedAt: now,
      items: recoItems,
    })
    console.log(`[semantic] reco shard=${shardIndex} poems=${recoItems.length}`)
  }

  const routes = routeTemplates.map(template => {
    const pool = routeCandidates.get(template.route_id) || []
    const sorted = pool
      .sort((a, b) => a.difficultyScore - b.difficultyScore)
      .slice(0, 20)
    const sequence = sorted.map(item => ({
      poem_id: item.poem_id,
      reason: `命中路线主题，${item.reason}`,
      difficulty_note: item.difficultyScore > 0.62 ? '适合进阶' : '适合衔接',
      review_hint: '先看意象线，再看情绪线',
    }))
    return {
      route_id: template.route_id,
      title: template.title,
      description: template.description,
      target_level: template.target_level,
      related_images: template.related_images,
      emotion_curve: template.emotion_curve,
      review_plan: template.review_plan,
      poem_sequence: sequence,
    }
  })

  writeJson(path.join(ROUTES_OUT_DIR, 'routes.json'), {
    version: semanticVersion,
    generatedAt: now,
    routes,
  })

  const topImages = [...imageFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 120)
  const topImageSet = new Set(topImages.map(item => item[0]))

  const nodes = topImages.map(([name, freq]) => ({
    id: name,
    name,
    frequency: freq,
  }))

  const edges = []
  for (const [pairKey, count] of imagePairs.entries()) {
    const [a, b] = pairKey.split('__')
    if (!topImageSet.has(a) || !topImageSet.has(b)) continue
    const fa = imageFreq.get(a) || 1
    const fb = imageFreq.get(b) || 1
    const score = count / Math.sqrt(fa * fb)
    if (count < 20) continue
    edges.push({
      source: a,
      target: b,
      count,
      score: Number(score.toFixed(4)),
    })
  }
  edges.sort((x, y) => y.score - x.score)

  writeJson(path.join(IMAGERY_OUT_DIR, 'graph.json'), {
    version: semanticVersion,
    generatedAt: now,
    nodes,
    edges: edges.slice(0, 500),
  })

  writeJson(path.join(CLUSTERS_OUT_DIR, 'cluster-meta.json'), {
    version: semanticVersion,
    generatedAt: now,
    status: 'placeholder',
    notes: 'MVP 阶段未启用 embedding 聚类，请后续接入 scripts/semantic/build-embeddings.js 与聚类流程。',
  })

  writeJson(path.join(VISUALS_OUT_DIR, 'index.json'), {
    version: semanticVersion,
    generatedAt: now,
    items: [],
  })

  writeJson(path.join(SEMANTIC_DIR, 'features.json'), {
    semanticEnabled: opts.enable,
    tagPanelEnabled: opts.enable,
    recommendationEnabled: opts.enable,
    routesEnabled: opts.enable,
    imageryGraphEnabled: opts.enable,
    visualGenerationEnabled: false,
  })

  writeJson(path.join(SEMANTIC_DIR, 'manifest.json'), {
    version: semanticVersion,
    generatedAt: now,
    baseProfile: manifest.profile || 'unknown',
    processedShards: processedShardIndexes.length,
    processedPoems,
    dirs: {
      poemTags: 'poem-tags',
      poemReco: 'poem-reco',
      routes: 'routes/routes.json',
      imagery: 'imagery/graph.json',
      clusters: 'poem-clusters/cluster-meta.json',
      visuals: 'visuals/index.json',
      features: 'features.json',
    },
    taxonomy,
  })

  console.log(`[semantic] done: poems=${processedPoems}, shards=${processedShardIndexes.length}`)
}

try {
  main()
} catch (error) {
  console.error('[semantic] failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
}
