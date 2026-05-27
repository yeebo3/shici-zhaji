# shici-zhaji 语义标签与意象图谱升级设计（渐进落地）

## 0. 现状审查结论（基于当前仓库）

### 0.1 关键结构与读写链路
- 数据构建主链路：`scripts/generate-data.js`  
  输出 `public/data/manifest.json`、`public/data/index.json`、`public/data/shards/s-*.json`
- 桌面端检索主链路：`electron/poems-service.cjs`  
  优先读 `public/data/poems-index.db`（由 `scripts/build-sqlite-index.js` 生成），失败回退 JSON 分片
- Web API 主链路：`lib/server-poems.ts` + `app/api/poems/*`
- 前端消费主链路：`lib/poems.ts`（Web API / Desktop bridge / static bridge）
- 学习行为数据：`lib/storage.ts`（本地）与 `electron/study-service.cjs`（桌面 JSON 存储）

### 0.2 当前数据规模与约束
- `manifest.total`: **687,803** 首，`shardSize=500`，`shards=1376`
- `poems-index.db`: 约 **714MB**
- 当前 `tags` 覆盖率高，但语义价值低：绝大多数为“诗/词/文/曲/赋”这类体裁标识
- 现有 UI/检索高度依赖 `Poem.tags`，不能直接覆写为新语义标签

### 0.3 已识别风险
- `public/data/shards` 存在一批非规范命名文件（如 `s-163 2.json`），虽不在 manifest 内，但会干扰脚本扫描；建议后续清理
- 桌面静态构建会裁剪 `index.json` 和 `shards`（当 sqlite 存在）。新增能力不能依赖这两者始终可用
- 移动静态构建会移除 sqlite。新增能力需支持 JSON 索引模式

---

## 1. 最小侵入式改造原则

1. 不改 `Poem`/`PoemIndex` 既有字段语义，不破坏现有背诵与检索流程。  
2. 新能力全部采用 **sidecar（旁路）数据层**：`public/data/semantic/*`。  
3. 大规模计算仅放在 `scripts/` 或 `tools/`，运行时只读预生成索引。  
4. 所有新功能均可关闭（feature flags）。  
5. MVP 先做“可解释推荐 + 标签 + 路线 + 意象图谱”，embedding/LLM 逐步接入。

---

## 2. 新增数据结构设计（离线端与预处理分层）

## 2.1 运行时（离线端）建议目录

```text
public/data/semantic/
  manifest.json
  features.json
  poem-tags/
    st-0.json
    st-1.json
    ...
  poem-clusters/
    assignments-0.json
    ...
    cluster-meta.json
  poem-reco/
    rs-0.json
    ...
  routes/
    routes.json
  imagery/
    graph.json
  visuals/
    index.json
```

说明：沿用 poem shard 编号分片（`st-{shard}.json` / `rs-{shard}.json`），复用现有 `PoemIndex.shard`，减少查询侵入。

## 2.2 预处理（服务端/脚本）建议存储

```text
data/semantic-build/
  semantic-index.db
  embeddings/
    poem-embeddings.f16
    poem-ids.txt
  ann/
    faiss.index
  clustering/
    cluster-assignments.parquet
    cluster-samples.jsonl
  llm-labeling/
    cluster-label-drafts.jsonl
    cluster-label-approved.jsonl
```

---

## 3. SQL 结构建议（满足 poem_tags / poem_embeddings / poem_clusters / poem_routes / poem_visuals）

```sql
-- 1) poem_tags: 多来源多标签事实表
CREATE TABLE poem_tags_v2 (
  poem_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL,           -- topic/emotion/image/style/difficulty/form
  score REAL NOT NULL,              -- 0~1
  source TEXT NOT NULL,             -- rule/llm/embedding_cluster/human
  created_at TEXT NOT NULL,
  version TEXT NOT NULL,            -- e.g. v2026.05
  rule_id TEXT,                     -- 可追溯规则
  cluster_id TEXT,                  -- 若来自聚类扩散
  PRIMARY KEY (poem_id, tag_type, tag_name, source, version)
);
CREATE INDEX idx_poem_tags_v2_poem ON poem_tags_v2(poem_id);
CREATE INDEX idx_poem_tags_v2_lookup ON poem_tags_v2(tag_type, tag_name, score);

-- 2) poem_embeddings: 预处理向量（运行时可不下发）
CREATE TABLE poem_embeddings (
  poem_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,        -- float16/float32 bytes
  vector_norm REAL NOT NULL,
  created_at TEXT NOT NULL
);

-- 3) poem_clusters: 聚类分配
CREATE TABLE poem_clusters (
  poem_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  distance_to_center REAL NOT NULL,
  membership_score REAL NOT NULL,   -- 0~1
  created_at TEXT NOT NULL,
  PRIMARY KEY (poem_id, cluster_id)
);
CREATE INDEX idx_poem_clusters_cluster ON poem_clusters(cluster_id, distance_to_center);

CREATE TABLE cluster_labels (
  cluster_id TEXT NOT NULL,
  tag_type TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  score REAL NOT NULL,
  source TEXT NOT NULL,             -- llm/human
  created_at TEXT NOT NULL,
  PRIMARY KEY (cluster_id, tag_type, tag_name)
);

-- 4) poem_routes: 记忆路线
CREATE TABLE poem_routes (
  route_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_level TEXT NOT NULL,       -- beginner/intermediate/advanced
  related_images_json TEXT NOT NULL,
  emotion_curve_json TEXT NOT NULL,
  review_plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE poem_route_items (
  route_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  poem_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  difficulty_note TEXT,
  review_hint TEXT,
  PRIMARY KEY (route_id, seq)
);

-- 5) poem_visuals: 配图缓存索引
CREATE TABLE poem_visuals (
  visual_id TEXT PRIMARY KEY,
  poem_id TEXT NOT NULL,
  scene_type TEXT NOT NULL,         -- cover/line_memory/route_map
  prompt_hash TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  style_profile TEXT NOT NULL,
  image_path TEXT NOT NULL,
  status TEXT NOT NULL,             -- queued/ready/failed
  model_name TEXT,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_poem_visuals_unique
ON poem_visuals(poem_id, scene_type, prompt_hash);
```

---

## 4. 运行时 JSON 示例（前端直接消费）

## 4.1 poem_tags 分片（`public/data/semantic/poem-tags/st-12.json`）

```json
{
  "shard": 12,
  "version": "v2026.05",
  "generatedAt": "2026-05-27T10:00:00Z",
  "poems": [
    {
      "poemId": "cp-182737",
      "tags": [
        { "tag_name": "思乡", "tag_type": "topic", "score": 0.93, "source": "rule", "created_at": "2026-05-27T10:00:00Z" },
        { "tag_name": "月", "tag_type": "image", "score": 0.97, "source": "rule", "created_at": "2026-05-27T10:00:00Z" },
        { "tag_name": "清新", "tag_type": "style", "score": 0.71, "source": "embedding_cluster", "created_at": "2026-05-27T10:00:00Z" },
        { "tag_name": "适合入门", "tag_type": "difficulty", "score": 0.88, "source": "rule", "created_at": "2026-05-27T10:00:00Z" },
        { "tag_name": "五言绝句", "tag_type": "form", "score": 0.99, "source": "rule", "created_at": "2026-05-27T10:00:00Z" }
      ]
    }
  ]
}
```

## 4.2 poem_routes（`public/data/semantic/routes/routes.json`）

```json
{
  "version": "v2026.05",
  "routes": [
    {
      "route_id": "route_moon_01",
      "title": "月意象路线",
      "description": "从直观月景到思亲与人生感怀的渐进路线",
      "target_level": "intermediate",
      "related_images": ["月", "夜", "江", "雁"],
      "emotion_curve": ["清新", "思念", "沉郁", "旷达"],
      "review_plan": { "day1": "1-3首", "day3": "回忆测试", "day7": "默写复盘" },
      "poem_sequence": [
        {
          "poem_id": "cp-1001",
          "reason": "月景直观，句式整齐，适合作为路线起点",
          "difficulty_note": "入门",
          "review_hint": "先抓“月+乡”关键词"
        }
      ]
    }
  ]
}
```

---

## 5. 标签体系设计（多标签 + 可追溯）

每首诗支持多标签，最小覆盖：
- `topic`：送别、思乡、边塞、怀古、咏物、山水、田园、悼亡、闺怨、哲理、励志…
- `emotion`：孤独、豪迈、悲凉、清新、闲适、沉郁、激昂、哀婉、旷达…
- `image`：月、江、山、风、雪、梅、柳、酒、雁、舟、楼、关塞、黄昏、春草、秋雨…
- `style`：豪放、婉约、清新、雄浑、含蓄、自然、绮丽、沉郁…
- `difficulty`：短篇、长篇、生僻字多、典故多、意象密集、句式整齐、适合入门、适合进阶…
- `form`：五言、七言、绝句、律诗、词、曲、古体…

标签记录字段统一：`tag_name / tag_type / score / source / created_at`。

---

## 6. 三层标签生成 Pipeline（避免 68 万首直接调 LLM）

## 6.1 第一层：规则标签（全量可跑，低成本）

输入字段：标题、正文、作者、朝代、sourceMeta.kind、已有 tags。  
配置文件建议：

```text
scripts/config/semantic/tag-taxonomy.json
scripts/config/semantic/rules/topic.rules.json
scripts/config/semantic/rules/emotion.rules.json
scripts/config/semantic/rules/image.rules.json
scripts/config/semantic/rules/style.rules.json
scripts/config/semantic/rules/difficulty.rules.json
scripts/config/semantic/rules/form.rules.json
```

规则示例：
- 标题含 `送|别|赠|寄` -> `topic:送别` + `topic:怀人`
- 正文含 `月|故乡|乡关|归|客` -> `topic:思乡` + `image:月`
- `sourceMeta.kind=词` -> `form:词`
- 行数=4 且平均句长≈5 -> `form:五言绝句`

产物：`poem_tags_v2(source=rule)` + 规则命中日志（便于迭代）。

## 6.2 第二层：Embedding + 聚类（候选，不直接当最终标签）

建议流程（预处理环境）：
1. 生成文本：`title + author + dynasty + content`（控制长度，保留核心句）
2. 向量模型：先用中文轻量模型（如 `bge-small-zh-v1.5`）做 MVP
3. 建向量索引：FAISS/HNSW（仅预处理环境）
4. 聚类：MiniBatchKMeans（先稳定），后续可并行评估 HDBSCAN
5. 每簇抽样 20-50 首（中心样本 + 边界样本 + 朝代/作者多样样本）

产物：
- `poem_clusters`（poem->cluster + distance）
- `cluster_samples.jsonl`
- `embedding_cluster` 来源的候选标签（低权重）

## 6.3 第三层：LLM 小样本精标 + 扩散

1. 对每个 cluster 的样本调用 LLM 输出结构化标签建议（JSON）
2. 人工审核通过后形成 `cluster_labels`
3. 按样本到簇中心距离与规则重合度扩散到簇内

置信度建议：
- `>=0.75`：自动入库
- `0.55~0.75`：待抽检
- `<0.55`：待审核池，不自动展示

---

## 7. Embedding 与语义相似度方案（渐进）

## 7.1 MVP（轻依赖）
- 不在客户端部署 embedding 模型
- 仅下发预计算结果（cluster + 候选邻居 + 标签）
- 客户端只做打分与解释

## 7.2 进阶
- 在预处理环境维护 `poem_embeddings` + `faiss.index`
- 定期离线导出 `poem-reco` 分片（每首 topK 语义候选）
- 对低活跃诗词可只存 cluster 候选，节省体积

---

## 8. 推荐算法（可解释，非黑箱）

目标打分：

```text
score =
  0.35 * semantic_similarity
+ 0.20 * tag_overlap
+ 0.15 * difficulty_fit
+ 0.15 * weakness_match
+ 0.10 * popularity
- 0.05 * repeat_penalty
```

### 8.1 候选召回
- 语义候选：`poem-reco` 或同 cluster 邻域
- 主题候选：topic 倒排
- 意象候选：image 倒排
- 难度候选：目标难度带内

### 8.2 约束与重排
- 硬约束：避免最近 N 首重复
- 软约束：连续同作者/同题材加惩罚
- 用贪心 + 多样性惩罚做 rerank（保证可解释）

### 8.3 解释生成模板
- 输出“命中标签 + 语义关系 + 难度变化 + 学习目的”
- 示例：  
  推荐《月夜忆舍弟》：与当前诗同属“月夜+思亲”，共享“露、月、故乡”意象；难度略高一级，适合作为下一首进阶。

---

## 9. 记忆路线（poem_routes）设计

预置路线：
- 月意象 / 送别 / 边塞 / 春日 / 秋夜 / 思乡 / 豪放词 / 婉约词

每条路线包含：
- `route_id`
- `title`
- `description`
- `target_level`
- `poem_sequence`（含每首理由）
- `related_images`
- `emotion_curve`
- `review_plan`

生成策略：
1. 先规则路线（稳定可控）
2. 后续叠加聚类标签自动补线
3. 每条路线 8~20 首，控制学习负担

---

## 10. 图像化增强（分阶段控成本）

## 阶段一：只做意象图谱
- 从 `image` 标签构建共现网络（node: 意象，edge: 共现强度/PMI）
- 输出 `imagery/graph.json`
- 用于“意象关系理解”，不做全量生图

## 阶段二：重点诗词配图
- 仅覆盖：经典诗词、用户收藏、当前背诵诗、路线核心诗
- 统一画风（style profile）
- 短诗可做句子级记忆图（可选）

## 阶段三：按需生成 + 缓存
- 用户触发才生成
- 以 `prompt_hash` 去重缓存，避免重复生成
- Prompt 自动拼装字段：标题/作者/正文/意象标签/情绪标签/时代背景/风格约束

---

## 11. 功能开关设计（必须可关闭）

`public/data/semantic/features.json`：

```json
{
  "semanticEnabled": false,
  "tagPanelEnabled": false,
  "recommendationEnabled": false,
  "routesEnabled": false,
  "imageryGraphEnabled": false,
  "visualGenerationEnabled": false
}
```

关闭时行为：UI 不展示、接口返回空、不影响原有背诵与检索。

---

## 12. 任务拆分与验收标准（MVP 优先）

## 阶段 A：基础骨架（1 周）
- 任务：
  - 新建 `public/data/semantic/manifest.json` + `features.json`
  - 新建 `scripts/semantic/*` 空壳与配置目录
- 验收：
  - 原有功能零回归（首页/分类/详情/背诵）
  - 关闭开关时无额外请求错误

## 阶段 B：规则标签（1~2 周）
- 任务：
  - 落地规则词典与规则引擎
  - 生成 `poem-tags/st-*.json`
- 验收：
  - 随机抽样 500 首：topic/image/form 可读性通过率 >= 85%
  - 规则产物可追溯到 rule_id

## 阶段 C：可解释推荐 MVP（1 周）
- 任务：
  - 基于规则标签 + 难度 + 学习记录实现打分
  - 输出推荐解释
- 验收：
  - 接口 p95 < 150ms（本地 sqlite/JSON）
  - 推荐解释命中至少 2 个证据点（标签/难度/学习状态）

## 阶段 D：Embedding + 聚类（2 周）
- 任务：
  - 预处理环境生成向量、聚类、簇样本
  - 导出 cluster assignments
- 验收：
  - 聚类覆盖率 > 99%
  - 人审 100 个簇：主题一致性达标率 >= 75%

## 阶段 E：LLM 精标与扩散（2 周）
- 任务：
  - 簇样本 LLM 标注 + 人工审核
  - 按置信度扩散
- 验收：
  - 自动通过标签人工抽检准确率 >= 85%
  - 低置信度样本全部进入待审核池

## 阶段 F：记忆路线与意象图谱（1 周）
- 任务：
  - 8 条预置路线
  - 意象共现图谱
- 验收：
  - 每条路线有清晰难度与情绪递进
  - 图谱节点/边可回溯到样本诗词

## 阶段 G：重点配图（按需）
- 任务：
  - 路线核心诗 + 收藏诗触发生成
  - 缓存与重复请求去重
- 验收：
  - 重复触发命中缓存率 > 90%
  - 不影响离线主流程

---

## 13. 与当前结构冲突时的适配策略

若与现有架构冲突，优先保持现有结构：
- 不改 `poem.tags` 的旧语义，新增语义标签走 sidecar
- 不改现有 `/api/poems/*` 协议，新增独立 `/api/semantic/*`
- 不把大模型调用放进在线查询路径，只做离线预处理

这保证现有离线背诵工具能力不被破坏，同时支持逐步升级为“语义标签 + 意象图谱 + 个性化推荐”系统。

