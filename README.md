# 诗词札记（shici-zhaji）

> 最后更新：2026-03-16

一个基于 Next.js 14 + TypeScript 的古诗词学习应用，支持海量诗词检索、详情阅读、背诵练习和本地学习记录。

## 1. 目前已完成的工作

### 1.1 前端应用主体
- 已完成首页、分类浏览、我的学习、诗词详情、背诵练习等页面。
- 已完成导航、搜索栏、诗词卡片、加载态等核心组件。
- 已实现深浅色主题切换、字号切换、收藏状态展示等交互。

### 1.2 学习闭环功能
- 已支持最近学习记录、收藏、已掌握状态。
- 已支持背诵模式：阅读、遮挡、逐句、自测。
- 已支持“今日诗词”“随机诗词”“继续学习”。
- 学习数据保存在浏览器 `localStorage`（当前为本地设备级别）。

### 1.3 API 与服务端数据访问层
- 已完成诗词 API：
  - `/api/poems`（查询/分页/筛选/搜索）
  - `/api/poems/[id]`（详情）
  - `/api/poems/index/[id]`（单条索引）
  - `/api/poems/by-ids`（批量索引）
  - `/api/poems/random`、`/api/poems/daily`
- 已实现服务端索引缓存、分片缓存与 ID 映射。

### 1.4 数据工程与构建管线
- 已完成多源数据接入与转换：
  - `local`：`data/poems-source.json`
  - `chinese-poetry`：抓取开源仓库数据
  - `vmijunv`：原始数据转换为统一结构
  - `gushiwen`：预留抓取注释/译文/赏析
- 已完成繁简转换与后处理纠错（`opencc-js` + 自定义修正表）。
- 已完成统一去重（按 `title + author`）与字段补全策略。
- 已完成数据分片输出：`public/data/shards/s-*.json`。
- 已完成 `index.json` 与 `manifest.json` 生成。

## 2. 当前数据规模（最新构建结果）

基于 `public/data/manifest.json`（`generatedAt: 2026-03-15T15:39:09.403Z`）：

- 诗词总量：`687,803`
- 分片大小：`500` / 片
- 分片数量：`1,376`
- 朝代数：`18`
- 作者数：`37,357`
- 标签数：`84`
- 数据来源：`local` / `chinese-poetry` / `vmijunv`
- 索引文件体积：约 `174 MB`（`public/data/index.json`）

来源分布：
- `local`: 12
- `chinese-poetry`: 397
- `vmijunv`: 687,394

## 3. 项目结构（核心目录）

```text
app/                 页面与 API 路由
components/          复用 UI 组件
hooks/               学习状态与主题等 hooks
lib/                 类型、客户端数据访问、服务端数据访问、本地存储
scripts/             数据抓取、转换、导入、构建脚本
data/                源数据与中间数据
public/data/         前端运行时使用的索引与分片数据
```

## 4. 命令

```bash
npm run dev               # 本地开发
npm run build             # 生产构建
npm run start             # 启动生产服务

npm run fetch             # 拉取诗词源数据
npm run fetch:gushiwen    # 抓取古诗文网补全数据
npm run convert:vmijunv   # 转换 vmijunv 原始数据
npm run import -- <file>  # 导入本地诗词（json/txt）
npm run generate          # 生成 index/manifest/shards
```


