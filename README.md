# 诗词札记（shici-zhaji）

> 最后更新：2026-03-17

基于 Next.js 14 + TypeScript 的离线古诗词学习应用，支持检索、详情阅读、背诵练习、学习记录与 Windows 桌面端打包。

## 1. 当前状态

- 前端页面：首页、分类、详情、我的学习、背诵页已可用。
- 学习记录：桌面端优先写入 SQLite（`userData/study.db`），网页模式回退 `localStorage`。
- 背诵模式：阅读、遮挡、逐句、自测。
- 背诵范围（mini 版）：`常用诗词本` + `用户自定义分组`。
- 逐句模式：按句子推进（到下一个 `。`），不是按词/字推进。
- 标记状态：点击“记住了 / 没记住”后会持久化，点击“下一首”前会等待写入完成。

## 2. 项目目录

```text
app/                 页面与 API 路由
components/          复用 UI 组件
hooks/               主题、学习状态、分组等 hooks
lib/                 类型、存储、客户端/服务端数据访问
electron/            桌面端主进程与 preload
scripts/             数据生成、静态构建、打包辅助脚本
data/                源数据与中间数据
public/data/         运行时数据（index/shards/sqlite）
dist-desktop/        桌面端构建与打包产物
```

## 3. 数据档位（full / mini）

- `full`：全量数据（用于完整版）。
- `mini`：仅保留 `annotation` 非空数据（用于轻量版）。

常用命令：

```bash
npm run generate:full     # 全量数据 + SQLite 索引库
npm run generate:mini     # mini 数据 + SQLite 索引库
npm run generate          # 等同 generate:full（兼容旧命令）
npm run build:index:sqlite
```

当前 `manifest.json`（你刚刚这轮 mini 构建后）：

- `generatedAt`: `2026-03-17T14:54:42.739Z`
- `total`: `8559`
- `shards`: `18`
- `sources`: `local`, `vmijunv`

## 4. 开发命令

```bash
npm run dev
npm run build
npm run start
```

数据处理相关：

```bash
npm run fetch
npm run fetch:gushiwen
npm run convert:vmijunv
npm run import -- <file>
```

## 5. 桌面端（Windows，lean 默认）

运行：

```bash
npm run desktop:run
```

打包（默认均为 lean 模式）：

```bash
npm run package:win                # NSIS 安装包
npm run package:win:portable       # 便携版 exe
npm run package:win:zip            # ZIP（按当前 public/data 数据档位打包）
npm run package:win:zip:mini       # 先 generate:mini，再打包 ZIP
npm run package:win:zip:mini:lean  # 等同 package:win:zip:mini（兼容别名）
npm run package:win:dir            # 输出 win-unpacked 目录
```

保留的旧链路（legacy）：

```bash
npm run desktop:run:legacy
npm run package:win:legacy
npm run package:win:legacy:nsis
```

## 6. 打包产物位置

目录：`dist-desktop/installers/`

典型文件：

- `诗词札记-<version>.exe`
- `诗词札记-Setup-<version>.exe`
- `诗词札记-<version>.zip`
- `诗词札记-<version>-mini.zip`
- `win-unpacked/`

本次刚生成的 mini ZIP：

- 文件：`dist-desktop/installers/诗词札记-0.1.0-mini.zip`
- 体积：约 `120 MB`
- SHA-256：`cf551c6a9540f5e9b3b7c0910367fc5066dd4ebeb158104956a6fcf202ff4794`

## 7. lean 打包流程（实际执行）

1. `generate:*`（按 full/mini 生成 `manifest`、`index`、`shards`）
2. `build:index:sqlite`（生成 `public/data/poems-index.db`）
3. `build:web:desktop-static`（Next 静态导出）
4. `prepare:desktop-static-runtime`
5. `prepare:desktop-lean-app`
6. `electron-builder --config electron-builder.static.lean.json`
7. `scripts/package-win-zip.js`（ZIP 压缩）

体积控制（lean）：

- 只保留必要 Electron 运行文件与指定语言包。
- 检测到 SQLite 后，自动去除 `data/index.json` 与 `data/shards` 冗余文件。

## 8. 验证命令（建议）

```bash
npx tsc --noEmit
node --check electron/study-service.cjs
npm run package:win:zip:mini:lean
```

说明：

- `npm run lint` 在未初始化 ESLint 时会进入 Next.js 交互配置，不适合作为当前仓库的无交互校验命令。
