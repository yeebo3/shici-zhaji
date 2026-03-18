# 诗词札记（shici-zhaji）

离线古诗词学习应用，支持检索、阅读、背诵、收藏、学习统计与分组管理。  
项目同时提供 Web 运行方式和 Windows 桌面端打包能力。
该项目主要面向诗词爱好者、学生、教师等需要离线学习古诗词、古文的人群。
mini版本内置8500首诗词，均有注释、赏析、译文(少部分缺少译文)，并内置“高中必背诗词分组”
full版本内置68万首诗词，绝大部分没有注释等信息，且占用磁盘空间较大
## to使用者

### 功能概览

- 今日诗词、随机诗词、继续学习入口
- 按朝代/作者/主题分类浏览，支持关键词搜索
- 诗词详情页支持注释、译文、赏析切换
- 背诵练习 4 种模式：阅读、遮挡、逐句、自测
- 学习记录：收藏、记忆状态、复习次数、最近学习
- 分组管理：新建分组、重命名、删除、将诗词加入或移出分组

### 如何使用（Windows）

1. 获取安装包或便携版，请使用网盘链接，也可直接联系开发者。若拉取仓库使用指令下载，安装包位于 `dist-desktop/installers/` 或 Release 页面）。
2. 双击运行 `诗词札记-Setup-<version>.exe`（安装版）或 `诗词札记-<version>.exe`（便携版）。
3. 首次打开后即可离线使用，无需联网查询诗词内容。

### 数据保存位置

- 桌面端学习数据默认保存在系统用户目录下（`userData/study.db`）。
- 若 SQLite 不可用，会回退到 `userData/study-fallback.json`。
- Web 模式下学习数据保存在浏览器 `localStorage`。

### 常见问题

- 打开后提示“加载失败”：通常是运行时数据缺失或损坏，建议重新生成或重新安装打包产物。
- 背诵范围里看不到自定义分组：请先在诗词详情页将诗词加入分组，再进入背诵页选择范围。

## 若拉取该仓库

### 技术栈

- Next.js 14
- React 18 + TypeScript
- Tailwind CSS
- Electron（桌面端）
- Node `node:sqlite`（用于索引库与桌面学习数据）

### 环境要求

- Node.js 22+（推荐 24+）
- npm
- 打包链路在 Linux 下额外依赖 `wine`/`wine64`（用于图标写入）

### 快速开始（Web）

```bash
npm install
npm run generate
npm run dev
```

说明：

- `npm run generate` 默认等同 `generate:full`，会生成 `public/data` 下索引、分片和 SQLite 索引库。
- 开发启动后访问 `http://localhost:3000`。

### 快速开始（桌面端本地运行）

```bash
npm run desktop:run
```

该命令会自动执行：

1. 构建诗词 SQLite 索引
2. 构建桌面静态前端
3. 准备 Electron 静态运行时
4. 启动 Electron 主进程

### 数据构建档位

- `full`：全量数据
- `mini`：仅保留有注释（`annotation` 非空）的诗词

### 扩展默认诗词本

默认诗词本配置位于 `lib/poem-notebooks.json`。  
新增诗词本只需追加一个条目（无需修改核心查询/背诵/分组逻辑），例如：

```json
{
  "id": "tang-song",
  "name": "唐宋诗词本",
  "description": "仅保留唐宋诗词",
  "rule": {
    "dynasties": ["唐", "宋"]
  }
}
```

可选规则字段：

- `requireAnnotation`: `true/false`
- `dynasties`: 朝代白名单
- `authors`: 作者白名单
- `tagsAny`: 标签任一命中
- `sources`: 数据来源白名单

删除某个条目即可下线该诗词本（例如删除 `plain` 后，前端不再显示“纯原文诗词本”）。

常用命令：

```bash
npm run generate:full
npm run generate:mini
npm run build:index:sqlite
```

### 数据抓取与导入（可选）

```bash
npm run fetch
npm run fetch:gushiwen
npm run convert:vmijunv
npm run import -- <json-file>
```

### Windows 打包

```bash
npm run package:win           # NSIS 安装包
npm run package:win:portable  # 便携版 exe
npm run package:win:zip       # ZIP
npm run package:win:zip:mini  # mini 数据 + ZIP
npm run package:win:dir       # 仅输出 win-unpacked
```

打包产物目录：`dist-desktop/installers/`

### 目录结构

```text
app/                 Next.js 页面与 API 路由
components/          UI 组件
hooks/               业务 hooks（学习状态、分组、背诵范围等）
lib/                 数据访问、类型、存储抽象
electron/            Electron 主进程、preload、桌面存储服务
scripts/             数据生成与打包脚本
data/                源数据与抓取数据
public/data/         运行时诗词数据（manifest/index/shards/sqlite）
dist-desktop/        桌面端构建与打包输出
```

### 校验建议

```bash
npx tsc --noEmit
node --check electron/study-service.cjs
```

注意：

- 当前仓库若未初始化 ESLint，`npm run lint` 会进入 Next.js 交互式配置，不适合无交互 CI 直接使用。
