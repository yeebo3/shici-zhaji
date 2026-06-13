import { Poem, ReciteMode, ReciteScopeId, StudyRecord } from '@/lib/types'

export type AiPoemTask = 'analysis' | 'annotation' | 'recitation'
export type AiImageQuality = 'hd'
export type AiImageTaskStatus = 'PROCESSING' | 'SUCCESS' | 'FAIL' | 'UNKNOWN'

export type AiPoemInput = Pick<
  Poem,
  'id' | 'title' | 'author' | 'dynasty' | 'content' | 'annotation' | 'translation' | 'appreciation' | 'tags'
>

export type AiStudyContext = Pick<
  StudyRecord,
  'viewedAt' | 'memorized' | 'reviewCount' | 'favorite' | 'masteryLevel' | 'nextReviewAt' | 'lastReviewedAt' | 'lapseCount'
>

export type AiReciteContext = {
  mode?: ReciteMode
  scope?: ReciteScopeId
  scopeName?: string
}

export type AiPoemRequest = {
  task: AiPoemTask
  poem: AiPoemInput
  studyRecord?: AiStudyContext | null
  recite?: AiReciteContext
}

export type AiPoemResponse = {
  text: string
  model: string
}

export type AiImageRequest = {
  prompt: string
  size?: string
  quality?: AiImageQuality
  model?: string
  watermarkEnabled?: boolean
  userId?: string
}

export type AiImageTask = {
  id: string
  requestId: string
  taskStatus: AiImageTaskStatus
  model: string
}

export type AiImageTaskResult = AiImageTask & {
  imageUrls: string[]
  raw: unknown
}

export type AiPromptMessages = {
  system: string
  user: string
}

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiSettings = {
  apiKey: string
  baseUrl: string
  model: string
  imageModel?: string
}

export type AiSettingsInput = {
  apiKey?: string
  baseUrl: string
  model: string
  imageModel?: string
}

export type AiSettingsSource = 'server' | 'desktop' | 'native' | 'unsupported'

export type AiSettingsStatus = {
  hasApiKey: boolean
  baseUrl: string
  model: string
  imageModel?: string
  source: AiSettingsSource
  editable: boolean
  secure: boolean
  warning?: string
}

export type AiTestResult = {
  ok: boolean
  message: string
}
