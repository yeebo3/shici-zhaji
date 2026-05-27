# shici-zhaji 语义升级实施报告（2026-05-27）

## 1. 本轮目标与边界

本轮按“最小侵入 + 可关闭 + 先 MVP”的原则完成三件事：

1. AI 模型默认切到 `glm-4.7-flash`，预留 `cogview-3-flash` 生图接口，且不把密钥写入仓库。
2. 落地 `docs/semantic-upgrade-design.md` 的可执行 MVP：规则标签、可解释推荐、路线和意象图谱离线产物。
3. 前端仅消费预生成语义索引，不改原有诗词主数据结构，不破坏离线背诵链路。

未做项（刻意留白）：

- 未接入全量 embedding/FAISS/HDBSCAN（避免一次性引入重依赖）。
- 未把 68 万首全部生图（仅预留接口）。

---

## 2. 已完成内容

## 2.1 AI 与密钥安全（已完成）

- 默认模型与接口预设已切换：
  - `AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4`
  - `AI_MODEL=glm-4.7-flash`
  - `AI_IMAGE_MODEL=cogview-3-flash`
- 应用内 AI 设置入口为小按钮（不占主 UI）。
- API Key 存储策略：
  - 桌面端走 `electron.safeStorage` 加密存储。
  - 服务端/内置模式支持环境变量注入（`SHICI_BIGMODEL_API_KEY` / `AI_API_KEY`），不写死在代码或静态资源。
- DeepSeek 兼容写法保留：请求参数按模型名自动做 `temperature/top_p` 兼容调参。

## 2.2 生图接口预留（已完成）

- 增加了基于智谱异步生图流程的通用接口：
  - 创建任务：`POST /api/ai/image/task`
  - 查询结果：`GET /api/ai/image/task/[id]`
- 桌面端 IPC 与 bridge 同步支持：
  - `createImageTask`
  - `getAsyncResult`
- 客户端类型和兼容层已补齐（任务状态、结果 URL 提取、错误映射）。

## 2.3 语义 MVP Pipeline（已完成）

- 新增配置与脚本：
  - `scripts/config/semantic/tag-taxonomy.json`
  - `scripts/config/semantic/rules.json`
  - `scripts/semantic/build-semantic-mvp.js`
  - `scripts/semantic/README.md`
- Pipeline 输出（sidecar）：
  - `poem-tags/st-*.json`
  - `poem-reco/rs-*.json`
  - `routes/routes.json`
  - `imagery/graph.json`
  - `manifest.json`
  - `features.json`
- 标签字段满足要求：
  - `tag_name / tag_type / score / source / created_at`
  - 并增加 `rule_id`（规则可追溯）。
- 功能开关可控：
  - `semanticEnabled/tagPanelEnabled/recommendationEnabled/routesEnabled/imageryGraphEnabled/visualGenerationEnabled`

## 2.4 前端最小消费接入（已完成）

- 新增语义类型与读取层：
  - `lib/semantic-types.ts`
  - `lib/semantic.ts`
- 详情页最小展示（受 feature flag 控制）：
  - 语义标签分组展示（题材/情绪/意象/风格/难度/体式）。
  - 续学推荐（含推荐理由，点击直达下一首）。
- 不改原 `Poem` 结构，不替换原标签，不影响原背诵流程。

---

## 3. 改动文件清单（本轮）

- AI 与生图接口相关（已在上一个提交阶段完成）：
  - `/Users/yibo/Desktop/shici-zhaji/.env.example`
  - `/Users/yibo/Desktop/shici-zhaji/electron/ai-settings-service.cjs`
  - `/Users/yibo/Desktop/shici-zhaji/electron/main-static.cjs`
  - `/Users/yibo/Desktop/shici-zhaji/electron/preload.cjs`
  - `/Users/yibo/Desktop/shici-zhaji/lib/ai/*`（settings/client/compatible/types/presets/desktop-bridge）
  - `/Users/yibo/Desktop/shici-zhaji/app/api/ai/image/task/route.ts`
  - `/Users/yibo/Desktop/shici-zhaji/app/api/ai/image/task/[id]/route.ts`
  - `/Users/yibo/Desktop/shici-zhaji/components/AiSettingsPanel.tsx`
- 语义升级相关（本提交阶段）：
  - `/Users/yibo/Desktop/shici-zhaji/scripts/config/semantic/tag-taxonomy.json`
  - `/Users/yibo/Desktop/shici-zhaji/scripts/config/semantic/rules.json`
  - `/Users/yibo/Desktop/shici-zhaji/scripts/semantic/build-semantic-mvp.js`
  - `/Users/yibo/Desktop/shici-zhaji/scripts/semantic/README.md`
  - `/Users/yibo/Desktop/shici-zhaji/lib/semantic-types.ts`
  - `/Users/yibo/Desktop/shici-zhaji/lib/semantic.ts`
  - `/Users/yibo/Desktop/shici-zhaji/app/poem/page.tsx`
  - `/Users/yibo/Desktop/shici-zhaji/package.json`
  - `/Users/yibo/Desktop/shici-zhaji/docs/semantic-upgrade-design.md`

---

## 4. 验证结果

已执行：

1. `npm run typecheck`（通过）。
2. `node scripts/semantic/build-semantic-mvp.js --clean --max-shards 2 --enable`（通过）。
3. 密钥泄漏扫描（代码与文档中未发现你提供的 key 明文）。

说明：

- 语义构建脚本已可运行并产出结构化 sidecar 数据；
- 默认 `.gitignore` 不提交 `public/data/**/*.json`，符合“运行产物不进仓库”的策略。

---

## 5. 与“简洁风格”一致性评估

本轮有意识避免过度设计：

- 未引入新的数据库/服务进程。
- 未强行改造现有 `/api/poems/*` 链路。
- 未把 embedding/LLM 调用塞进在线查询路径。
- UI 仅在详情页加两个轻量区块，且可通过 feature flag 全部关闭。

可能的简化点（后续可选）：

- 若你希望更克制，可把“续学推荐”先隐藏，只保留语义标签面板。
- 规则词典可继续收敛，优先高置信标签，减少噪声标签数量。

---

## 6. 下一步建议（按收益优先）

1. 先对 5~10 个分片做人工抽检，调规则词典，确保标签质量稳定。
2. 在 `scripts/semantic/` 增加 embedding 预处理脚本（先离线单机，不入运行时）。
3. 按簇抽样做 LLM 精标与人工确认，再进行簇内扩散。
4. 对“续学推荐”加用户学习弱项权重（基于本地学习记录）并继续保持可解释输出。

---

## 7. 密钥与打包注意事项（必须遵守）

- 不在仓库提交任何真实 API Key。
- 打包机通过环境变量注入 `SHICI_BIGMODEL_API_KEY` 或 `AI_API_KEY`。
- 产物发布前执行一次密钥扫描（建议 CI 内置）。
- 桌面端密钥只保存在系统安全存储，不写入公开静态目录。
