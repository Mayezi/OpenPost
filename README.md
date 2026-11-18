<p align="left">
  <img src="public/icons/openpost_icon_pack/png/transparent/openpost-128-transparent.png" width="76" height="76" alt="OpenPost Logo" />
</p>

# OpenPost

> **100% 纯本地运行 · 免登录 · 零后门 · 支持自定义磁盘目录的跨平台 API 调试与自动化测试工作台**  
> A 100% Local-First, Zero-Login, Zero-Telemetry Postman Alternative for **Windows**, **macOS**, and **Linux**.

---

## 为什么选择 OpenPost？

传统 API 调试客户端（如新版 Postman）逐渐演变为强制登录、强制云端同步、后台静默常驻服务并强行占用系统盘（`C:\Users\AppData`）的重型云软件，对于企业内网接口、私有密钥与本地大模型联调存在严重的隐私与合规隐患。

**OpenPost** 专为追求纯净、极速与数据主权的开发者设计：

| 核心维度 | 传统云端 API 客户端 | **OpenPost (`OP`)** |
| :--- | :--- | :--- |
| **账号与登录** | 强制注册登录，不登录限制核心集合功能 | **100% 免登录**，下载即用，无任何账户体系 |
| **数据主权与后门** | 环境变量、API 密钥与历史自动同步云端服务器 | **零遥测、零云端同步、零后台驻留进程** |
| **磁盘空间占用** | 强制写入系统默认盘（如 C 盘），长期膨胀难以清理 | **支持自定义任意非系统盘存储目录**（如 `D:\OpenPost_Data\Vault`），支持一键迁移与清理旧目录 |
| **跨域 (CORS) 联调** | 依赖安装浏览器插件或登录云端代理 | **内置本地 Node 无跨域代理引擎**，支持任意自定义受限 Header |
| **多端支持** | 体积臃肿（数百 MB Electron 壳） | 原生支持 **Windows / macOS / Linux**，内置 GitHub Actions 三端自动打包矩阵 |

---

## 核心功能特性

### 1. 全功能 HTTP / REST / GraphQL 调试引擎
- **全方法覆盖**：支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`。
- **多形态请求体 (Body)**：
  - `JSON`（内置语法实时校验、一键格式化与压缩）
  - `GraphQL`（Query 与 Variables 双栏独立编辑）
  - `Form-Data` 与 `x-www-form-urlencoded`（支持表格化编辑与 `Key: Value` 批量文本模式切换）
  - `Raw Text / XML`
- **认证鉴权 (Auth)**：原生支持 `Bearer Token`、`Basic Auth`、`API Key`（支持注入 Header 或 Query 参数）。

### 2. 双核请求引擎（彻底解决 CORS 跨域限制）
- **本地无跨域代理引擎 (`Local Proxy`)**：由本地进程直接发起底层网络请求，无视浏览器 CORS 限制，支持自定义 `User-Agent`、`Origin`、`Referer`、`Cookie` 等受限请求头，并精确统计 **TTFB（首字节耗时）** 与 **Content Download（下载耗时）**。
- **浏览器直连模式 (`Browser Fetch`)**：支持一键切换至原生浏览器 Fetch 模式验证服务端 CORS 配置。

### 3. 一体化环境变量与动态占位符系统
- **右上角三合一环境面板**：在一个下拉浮层内融合**环境切换**、**底部直接输入名称秒建新环境**与**变量表编辑**。
- **动态变量插值**：在 URL、Params、Headers、Auth、Body 任意位置支持 `{{variable}}` 实时解析，并内置兼容 Postman 的动态生成变量：
  - `{{$timestamp}}`：当前 Unix 秒级时间戳
  - `{{$isoTimestamp}}`：ISO-8601 标准时间字符串
  - `{{$guid}}` / `{{$uuid}}`：随机 UUID v4
  - `{{$randomInt}}`：随机四位整数

### 4. 可视化断言与响应提取 (Assertions & Auto-Extractor)
- 无需编写繁琐脚本即可配置可视化测试断言：
  - `HTTP 状态码等于`（如 `200`）
  - `响应耗时小于 (ms)`（如 `< 500ms`）
  - `响应头包含`（如 `content-type` 包含 `application/json`）
  - `JSONPath 字段存在 / 等于`（如 `data.0.active == true`）
  - **JSONPath 提取并自动写入环境变量**：例如登录接口返回后，自动提取 `access_token` 写入当前环境的 `{{auth_token}}`，供后续接口直接调用。
- **响应控制台 (Response Inspector)**：支持 **格式化 JSON 视图**、**JSONPath 实时过滤提取**、**对象数组自动转表格视图 (Data Table)**、原始报文、响应头、Cookies 及耗时瀑布图。

### 5. 10 款主流 AI 工具深浅配色 & 全局字号缩放
- **5 款深色主题 (Dark)**：
  - **Claude Code**（Anthropic 暖陶赤褐深色）
  - **GitHub Dark Default**（经典岩石蓝黑）
  - **DeepSeek Whale**（深海鲸蓝）
  - **OpenAI Codex**（翡翠绿黑客终端）
  - **Cursor Abyss**（现代 AI 代码编辑器紫青）
- **5 款高对比浅色主题 (Light)**：
  - **Claude Daylight**（温暖羊皮纸日间色）
  - **GitHub Daylight**（清爽极客白）
  - **ChatGPT Porcelain**（翡翠白瓷浅色）
  - **DeepSeek Glacier**（冰川冷白）
  - **Linear Swiss Daylight**（瑞士极简浅灰）
- **全局字体大小调节**：支持 `紧凑 (13px)`、`标准 (15px · 默认)`、`舒适 (16px)`、`大字号 (17.5px)` 四档实时无感缩放。

### 6. 自定义数据存储目录 & Postman v2.1 无损迁移
- **自定义非系统盘存储**：可在「偏好设置 (`⚙`) -> 数据存储目录」中指定任意磁盘路径（如 `D:\OpenPost_Data\Vault`、`/Volumes/ExternalSSD/OpenPost_Vault` 或 `/mnt/data/openpost_vault`），支持自动迁移现有集合并清理原默认目录。
- **零成本迁移**：
  - 支持直接粘贴终端或浏览器 DevTools 复制的 **cURL 命令** 一键解析为可视化请求；
  - 支持导入与导出 **Postman Collection v2.1** 标准 JSON 文件；
  - 支持一键生成 **cURL、JavaScript Fetch、Axios、Python Requests、Go Native、Rust Reqwest** 生产级调用代码。

---

## 快速开始 (Local Development)

### 环境要求
- **Node.js**: `>= 22.0.0`（推荐与项目及 GitHub Actions 保持一致的 `Node 22` LTS）
- **NPM**: `>= 10.0.0`

### 1. 安装依赖
```bash
npm install
```

### 2. 启动本地开发与无跨域代理服务
```bash
npm run dev
```
启动后访问 `http://localhost:3000` 即可使用（内置离线沙箱测试接口 `/api/mock/users`、`/api/mock/auth/token`、`/api/mock/echo`、`/api/mock/ai/completions` 无需外网即可体验完整链路）。

### 3. 构建生产环境与桌面端运行包
```bash
# 类型检查
npm run lint

# 构建前端静态产物
npm run build

# 打包当前操作系统的独立桌面运行包 (输出至 release-dist/)
npm run build:desktop
```

---

## 跨平台自动打包 (GitHub Actions: Win / macOS / Linux)

项目已内置完整的 GitHub Actions 跨平台打包工作流（位于 [`.github/workflows/release.yml`](.github/workflows/release.yml)），基于 **Node.js 22** 自动构建三大桌面平台运行包：

| 目标平台 | GitHub Runner | 产物归档名称 | 包含启动器 |
| :--- | :--- | :--- | :--- |
| **Windows (x64)** | `windows-latest` | `OpenPost-Windows-x64.zip` | `OpenPost-Windows.bat` + 独立运行引擎 |
| **macOS (Apple Silicon & Intel)** | `macos-latest` | `OpenPost-macOS-Universal.tar.gz` | `OpenPost-macOS.command` + 独立运行引擎 |
| **Linux (x64)** | `ubuntu-latest` | `OpenPost-Linux-x64.tar.gz` | `OpenPost-Linux.sh` + 独立运行引擎 |

### 触发方式
1. **日常构建验证与产物下载**：推送代码至 `main` 或 `master` 分支，或者在 GitHub 仓库的 **Actions** 页面手动点击 `Run workflow`，即可在 Workflow Artifacts 中直接下载 Windows / macOS / Linux 三端压缩包。
2. **正式版本自动发版 (GitHub Releases)**：
   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```
   推送 `v*` 标签后，GitHub Actions 将自动执行类型检查、三端并行打包，并将生成的跨平台安装包自动发布至仓库的 **GitHub Releases** 页面。

---

## 项目目录结构

```text
OpenPost/
├── .github/
│   └── workflows/
│       └── release.yml            # GitHub Actions Win/macOS/Linux 三端矩阵打包工作流
├── scripts/
│   └── package-desktop.mjs        # 跨平台独立桌面运行包打包脚本 (ESBuild + 原生启动器)
├── src/
│   ├── components/
│   │   ├── CustomSelect.tsx       # 统一圆角与丝滑动画的自定义下拉选择器组件
│   │   ├── KeyValueTable.tsx      # 支持表格/批量文本双模式的键值编辑器
│   │   ├── Modals.tsx             # 偏好设置中心、环境变量管理、cURL/Postman 导入导出、批量运行器
│   │   └── ResponseViewer.tsx     # 响应报文查看器（JSONPath 过滤、自动数据表、耗时瀑布图）
│   ├── data/
│   │   └── themesAndDefaults.ts   # 10 款 AI 工具深浅配色定义与内置本地沙箱示例集合
│   ├── types/
│   │   └── api.ts                 # 核心请求、集合、环境变量、断言与主题类型定义
│   ├── utils/
│   │   └── requestEngine.ts       # 变量插值、断言校验、cURL 解析器与多语言代码生成器
│   ├── App.tsx                    # DBX 风格桌面顶栏与主工作台视图
│   ├── index.css                  # Tailwind CSS v4 主题变量与动态字号缩放样式
│   └── main.tsx                   # 前端入口文件
├── server.ts                      # 本地无跨域代理引擎 (/api/proxy)、自定义目录同步与离线沙箱服务
├── package.json                   # 项目依赖与构建脚本配置 (Node >= 22.0.0)
└── vite.config.ts                 # Vite 8 构建配置
```

---

## 开源协议 (License)

Apache-2.0 License
