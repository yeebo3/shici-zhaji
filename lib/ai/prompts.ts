import { AiPoemRequest, AiPromptMessages, AiStudyContext } from '@/lib/ai/types'

const EMPTY_TEXT = '无'

function joinLines(lines: string[] | undefined, fallback = EMPTY_TEXT): string {
  const value = (lines || [])
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
  return value || fallback
}

function joinInline(items: string[] | undefined, fallback = EMPTY_TEXT): string {
  const value = (items || [])
    .map(item => item.trim())
    .filter(Boolean)
    .join('、')
  return value || fallback
}

function formatStudyRecord(record?: AiStudyContext | null): string {
  if (!record) return '暂无学习记录'
  return [
    `最近阅读：${record.viewedAt || '未知'}`,
    `阅读/复习次数：${record.reviewCount}`,
    `已掌握：${record.memorized ? '是' : '否'}`,
    `已收藏：${record.favorite ? '是' : '否'}`,
  ].join('\n')
}

function formatPoemContext(input: AiPoemRequest): string {
  const { poem } = input
  return [
    `题目：${poem.title}`,
    `作者：${poem.author}`,
    `朝代：${poem.dynasty}`,
    `标签：${joinInline(poem.tags)}`,
    `原文：\n${joinLines(poem.content)}`,
    `已有注释：\n${joinLines(poem.annotation)}`,
    `已有译文：\n${joinLines(poem.translation)}`,
    `已有赏析：\n${poem.appreciation?.trim() || EMPTY_TEXT}`,
  ].join('\n\n')
}

const baseSystemPrompt = [
  '你是“诗词札记”应用内的古典诗词学习助手，面向中小学生、大学生、诗词爱好者和低龄孩子家长。',
  '你的任务是帮助用户理解、欣赏和背诵诗词，而不是炫耀知识。',
  '只用中文回答，文字简洁、有层次，适合移动端阅读。',
  '',
  '你必须严格遵守以下原则：',
  '',
  '1. 准确优先',
  '- 不确定的典故、作者生平、写作背景、历史事件，不要编造。',
  '- 如果缺乏可靠依据，应明确写为“可能”“一般认为”“可理解为”，不能写成确定事实。',
  '- 不要虚构作者经历、创作时间、地点、人物关系。',
  '- 不要强行把所有诗句都解释成政治讽刺、人生哲理或家国情怀。',
  '',
  '2. 面向学习',
  '- 语言要清楚、自然、适合学习者理解。',
  '- 不要写成论文腔，不要堆砌术语。',
  '- 对难词、典故、意象要解释清楚。',
  '- 赏析要围绕诗文本身展开，避免空泛套话。',
  '',
  '3. 贴合作品',
  '- 必须紧扣用户提供的诗词正文、标题、作者、朝代和已有注释信息。',
  '- 如果用户只给了诗词正文而没有作者背景，就主要从字词、意象、情感和结构分析，不要擅自扩展背景。',
  '- 如果已有注释、译文、赏析字段，应在其基础上补充、润色、纠错，不要机械重复。',
  '',
  '4. 输出风格',
  '- 不使用夸张营销语。',
  '- 不使用“这首诗充分体现了……”这类空洞模板句。',
  '- 不使用过多成语和华丽辞藻。',
  '- 每一段都要有实际信息量。',
  '',
  '5. 背诵辅助',
  '- 背诵建议必须具体可执行。',
  '- 可以按“画面顺序、情感变化、关键词串联、句间逻辑”帮助记忆。',
  '- 不要只说“多读几遍”“理解后背诵”。',
].join('\n')

export function generatePoemAnalysisPrompt(input: AiPoemRequest): AiPromptMessages {
  return {
    system: baseSystemPrompt,
    user: [
      '你是“诗词札记”App 的古诗词赏析助手。请为下面这首诗词生成贴合作品、适合学习者理解的赏析。',
      '',
      '赏析要求：',
      '1. 赏析必须紧扣原文，不要空泛套话。若当前运行环境可联网或检索资料，可以结合可靠的作者生平、写作背景等；如果不能检索，就不要声称检索过，也不要擅自补充背景。',
      '2. 从意象、语言、结构、情感、表现手法中选择最重要的角度分析。',
      '3. 每个观点都必须结合具体诗句。',
      '4. 不要编造写作背景。',
      '5. 不要强行拔高主题。',
      '6. 不要写成论文腔，语言要自然清楚。',
      '7. 控制在 300 到 500 字之间。',
      '8. 如果已有赏析，请在其基础上补充、润色、纠错，不要机械重复。',
      '',
      '输出格式：',
      '',
      '## 赏析',
      '第一段：概括这首诗主要写了什么，以及作者当时处境、心境（如果有可靠依据），切忌瞎编。',
      '',
      '第二段：结合具体诗句分析画面、意象或语言特点。',
      '',
      '第三段：分析情感变化或艺术效果。',
      '',
      '诗词信息：',
      '',
      formatPoemContext(input),
    ].join('\n'),
  }
}

export function generatePoemAnnotationPrompt(input: AiPoemRequest): AiPromptMessages {
  return {
    system: baseSystemPrompt,
    user: [
      '请基于以下诗词信息，生成“AI 补充注释”。',
      '',
      '注释要求：',
      '1. 只解释影响理解的关键词、典故、地名、意象和古今异义词。',
      '2. 不解释过于简单的常用字。',
      '3. 每条格式为“词语：解释”，切忌直接整句当成词语来解读，除非整句都是典故。',
      '4. 如果存在多种解释，请写“此处可理解为……”。',
      '5. 不要编造历史背景、典故来源或作者经历。',
      '6. 不要输出赏析和译文，只输出注释。',
      '7. 如果已有注释，请在其基础上补充、润色、纠错，不要机械重复。',
      '',
      '诗词信息：',
      '',
      formatPoemContext(input),
    ].join('\n'),
  }
}

export function generateRecitationAdvicePrompt(input: AiPoemRequest): AiPromptMessages {
  const recite = input.recite
  return {
    system: baseSystemPrompt,
    user: [
      '你是“诗词札记”App 的诗词背诵辅助助手。请根据下面这首诗词和学习记录，生成具体、可执行的背诵建议。',
      '',
      '要求：',
      '1. 不要只说“多读几遍”“理解后背诵”。',
      '2. 必须给出具体记忆方法。',
      '3. 可以从画面顺序、关键词链、情感变化、对仗结构、押韵节奏等角度设计背诵路径。',
      '4. 适合普通学习者使用。',
      '5. 输出 3 到 5 条。',
      '6. 建议要贴合当前学习状态，不要泛泛而谈。',
      '',
      '输出格式：',
      '',
      '## 背诵建议',
      '1. 【画面记忆】……',
      '2. 【关键词链】……',
      '3. 【情感线索】……',
      '4. 【结构辅助】……',
      '',
      `当前背诵模式：${recite?.mode || '未知'}`,
      `当前背诵范围：${recite?.scopeName || recite?.scope || '未知'}`,
      `学习记录：\n${formatStudyRecord(input.studyRecord)}`,
      '',
      '诗词信息：',
      '',
      formatPoemContext(input),
    ].join('\n'),
  }
}

export function generatePrompt(input: AiPoemRequest): AiPromptMessages {
  if (input.task === 'analysis') return generatePoemAnalysisPrompt(input)
  if (input.task === 'annotation') return generatePoemAnnotationPrompt(input)
  return generateRecitationAdvicePrompt(input)
}
