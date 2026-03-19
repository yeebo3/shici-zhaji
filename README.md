# 诗词札记（shici-zhaji）

> 一个可离线使用的古诗词学习应用：支持查诗、阅读注释、背诵训练、收藏分组与学习统计。  
> 适用于学生背诵、教师备课、古诗词爱好者日常学习。

## 📖 项目简介

**诗词札记**是一个面向中文古诗词学习场景的多端应用，目标是解决以下问题：

- 诗词资料分散，查找和复习成本高
- 网络不稳定时无法顺畅学习
- 背诵训练缺少系统记录（收藏、掌握状态、复习次数等）

适用人群：

- 需要背诵古诗词的学生
- 需要课堂素材的教师
- 希望系统化阅读与积累的诗词爱好者

平台支持：

- **Windows 桌面端**
- **Web 网页端**
- **Android 移动端**

---

## ✨ 核心功能

- **离线学习**：核心诗词数据可本地使用
- **多入口学习**：今日诗词、随机诗词、继续学习
- **多维检索**：按朝代 / 作者 / 主题筛选
- **全文搜索**：支持搜索诗名、作者、标签、诗句内容
- **分层阅读**：原文 / 注释 / 译文 / 赏析切换查看
- **背诵训练**：阅读、遮挡、逐句、自测 4 种模式
- **学习记录**：收藏、已掌握、最近学习、复习次数统计
- **分组管理**：自建分组、重命名、删组、加诗入组，并可按分组背诵
- **诗词本机制**：支持“全部诗词 / 常用诗词本”等范围学习

---
## 技术栈

- Next.js 14
- React 18 + TypeScript
- Tailwind CSS
- Electron（桌面端）
- Node `node:sqlite`（用于索引库与桌面学习数据）
## 🖥️ 多端支持说明

### Windows 桌面端

适合人群：

- 需要长期离线学习、希望有稳定本地体验的用户

使用方式：

- 普通用户：从发布渠道下载安装包或便携版后直接使用
- 开发者：可从源码构建（见下方开发者指南）

---

### Web 网页端

访问方式：

- 若已有部署地址：直接浏览器访问即可
- 若无部署地址：可按开发者指南本地启动（默认 `http://localhost:3000`）

是否需要部署：

- 普通使用者如果有现成地址，**不需要自己部署**
- 仓库本身**不包含固定公网地址**

---

### Android 移动端

安装方式：

- 使用发布提供的 APK（若发布渠道提供）
- 或由开发者本地构建 APK 安装

使用场景：

- 通勤、碎片时间背诵与复习
- 当前移动端构建链路仅支持 `mini` 数据档位

---

## 🚀 快速开始（面向普通用户）

### Windows（推荐）
1. 下载桌面端安装包或便携版。  
2. 双击安装/运行。  
3. 打开应用后直接开始学习。  

### Web
1. 打开部署好的网页地址。  
2. 进入首页后即可使用检索、阅读和背诵功能。  

### Android
1. 安装 APK。  
2. 打开应用后按“首页 → 分类/背诵”开始使用。  

---

## 🧑‍💻 开发者指南

### 环境要求

- Node.js **22+**（推荐 24+）
- npm
- Android 构建需要 Android SDK / Java（如需打包 Android）
- Linux 下构建 Windows 安装包通常需要 `wine/wine64`

### 本地运行

#### 1) 克隆仓库并安装依赖

```bash
git clone <your-repo-url>
cd shici-zhaji
npm install
```

#### 2) 生成本地数据（推荐先用 mini）

```bash
npm run generate:mini
```

如需全量数据：

```bash
npm run generate:full
```

#### 3) 启动 Web 开发服务

```bash
npm run dev
```

访问：`http://localhost:3000`

#### 4) 启动桌面端（本地联调）

```bash
npm run desktop:run
```

#### 5) Android（可选）

```bash
npm run mobile:android:add
npm run mobile:android:sync:mini
npm run mobile:android:apk:debug
```

---

### 项目结构（简要）

```text
app/                 Next.js 页面与 API 路由（Web 主体）
components/          UI 组件
hooks/               学习状态、背诵范围等业务 hooks
lib/                 数据访问、类型定义、存储逻辑、诗词本规则
electron/            桌面端主进程与本地服务桥接
android/             Android 工程（Capacitor）
scripts/             数据生成、抓取、构建与打包脚本
public/data/         运行时诗词数据（manifest/index/shards/sqlite）
data/                源数据与抓取数据目录
```

---

## ⚙️ 配置说明（如有）

### 1) 诗词本配置

文件：`lib/poem-notebooks.json`  
用途：定义可选学习范围（如“常用诗词本”“唐宋诗词本”）。

### 2) 常用环境变量（按需）

- `SHICI_DATA_PROFILE=mini|full`：数据构建档位
- `NEXT_PUBLIC_SHICI_LOCAL_DATA=1`：启用本地静态数据桥接（部分静态构建流程使用）
- `SHICI_JAVA_HOME`：Android Gradle 使用的 Java 路径
- `SHICI_ANDROID_STORE_FILE` / `SHICI_ANDROID_STORE_PASSWORD` / `SHICI_ANDROID_KEY_ALIAS` / `SHICI_ANDROID_KEY_PASSWORD`：Android 发布签名配置
- `SHICI_KEEP_INDEX_JSON=1`、`SHICI_KEEP_SHARDS=1`：桌面静态运行时裁剪控制（打包场景）

---

## 🤝 参与贡献

欢迎 Issue 和 PR。

建议流程：

1. Fork 仓库并新建分支（如 `feat/xxx`、`fix/xxx`）
2. 完成修改并本地验证
3. 提交 PR，说明变更目的、影响范围、验证方式
4. 如涉及 UI 变更，建议附截图或录屏

基础自检建议：

```bash
npx tsc --noEmit
node --check electron/study-service.cjs
```

---

## ❓ 常见问题（FAQ）

### Q1：启动后提示“加载失败”？
通常是运行时数据未生成或损坏。先执行：

```bash
npm run generate:mini
```

然后重启服务/应用。

### Q2：`build:index:sqlite` 失败，提示 `node:sqlite` 不支持？
请升级 Node.js 至 22+（推荐 24+）。

### Q3：`npm run lint` 为什么会进入交互式配置？
当前仓库的 lint 流程可能触发 Next.js 的 ESLint 初始化向导，不适合直接用于无交互 CI。

### Q4：背诵范围里看不到自定义分组？
先在诗词详情页将诗词加入分组，再进入背诵页选择该分组。

### Q5：Android 构建为什么要求 mini？
移动端静态构建流程当前仅支持 `mini` 档位，非 mini 会直接报错退出。
