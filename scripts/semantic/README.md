# 语义数据构建（MVP）

当前目录用于离线预处理语义数据，不进入运行时主链路。

## 快速命令

```bash
npm run build:semantic:mvp
```

启用语义功能开关（写入 `public/data/semantic/features.json`）：

```bash
npm run build:semantic:mvp:enable
```

只跑部分分片做快速验证：

```bash
node scripts/semantic/build-semantic-mvp.js --clean --max-shards 10 --enable
```

## 输出目录

- `public/data/semantic/poem-tags/st-*.json`
- `public/data/semantic/poem-reco/rs-*.json`
- `public/data/semantic/routes/routes.json`
- `public/data/semantic/imagery/graph.json`
- `public/data/semantic/manifest.json`
- `public/data/semantic/features.json`

## 说明

- 当前是规则 + 轻量相似度 MVP，不依赖 embedding 模型和外部 LLM。
- `poem-clusters/cluster-meta.json` 为占位输出，后续接入 embedding 聚类时替换。
- 运行产物位于 `public/data/**`，默认不进 git（受 `.gitignore` 约束）。
