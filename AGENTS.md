# AGENTS.md

## 项目概览

WayneのNav（仓库 `Waynenet/Nav`）是一个纯静态的个人导航网站，精选优质书签并提供快捷搜索，无任何广告行为。

- 技术栈：原生 HTML / CSS / JavaScript；页面运行时无构建，Cloudflare 部署与数据同步使用 `wrangler` 开发依赖
- 数据驱动：页面菜单、搜索配置、书签内容由 `js/data.json` 或 Cloudflare D1 提供，`js/core.js` 在浏览器端动态渲染；Cloudflare 部署下优先读取 D1，接口失败或 D1 为空时回退 `js/data.json`
- 运行方式：直接打开 `index.html` 或使用任意静态文件服务器即可
- 许可证：GPL-3.0（见 `LICENSE`）
- 当前版本：v1.0.4（更新日期 2026-08-18，记录于 `js/core.js` 控制台输出）

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `index.html` | 主页面骨架，包含侧边栏、搜索区、动态内容容器、悬浮按钮、页脚 |
| `404.html` | 自定义 404 页面 |
| `admin.html` | 数据管理后台，可管理分类、书签和搜索配置 |
| `css/core.css` | 全部样式：主题变量、玻璃拟态、日/夜间模式、响应式布局、搜索框与悬浮面板 |
| `css/admin.css` | 管理后台样式 |
| `js/core.js` | 全部前端逻辑：内容渲染、搜索、菜单动画、主题、星幕、天气、时间、外观设置 |
| `js/admin.js` | 管理后台逻辑：登录、分类/书签/搜索配置增删改排序 |
| `js/data.json` | 本地/回退数据源：搜索站点、导航菜单、书签分类与条目；Cloudflare 部署时可被 D1 数据覆盖 |
| `functions/` | Cloudflare Pages Functions：`/api/data` 读取接口、`/api/weather` 天气代理与 `/api/admin/*` 管理接口 |
| `migrations/` | D1 建表 SQL |
| `scripts/` | D1 数据同步、导出与空库播种脚本 |
| `wrangler.toml` | Cloudflare 部署与 D1 binding 配置 |
| `package.json` | 仅用于 Cloudflare 相关 npm scripts 与 `wrangler` 开发依赖 |
| `images/` | 本地静态资源：logo、favicon、默认 favicon、微信/支付宝打赏二维码 |
| `.github/workflows/release.yml` | 发布工作流：匹配发布提交后自动打 Tag 并生成 GitHub Release |
| `.github/workflows/deploy.yml` | 部署工作流：注入 D1 database_id、部署 Pages、同步 Pages Secrets |
| `.github/workflows/sync-d1.yml` | 可选手动触发的 D1 数据同步工作流 |
| `README.md` | 面向用户的项目说明 |

## 数据模型

`js/data.json` 的根节点是 `pageData` 数组，每个顶层节点表示一个导航分类，支持以下几种结构：

```json
{
  "id": "search",
  "title": "实用搜索",
  "icon": "ti ti-search",
  "searchConfig": [
    {
      "groupName": "搜索",
      "items": [
        {
          "id": "type-baidu",
          "name": "<span style='color:#2100E0'>百度</span>",
          "url": "https://www.baidu.com/s?wd=",
          "placeholder": "百度一下，你就知道"
        }
      ]
    }
  ]
}
```

关键约定：

- `id` 为 `search` 的节点用于渲染多引擎搜索，`searchConfig` 中的 `items` 每项定义一种搜索引擎
- 普通节点通过 `items` 直接存放书签；每个书签字段为 `title`、`url`、`description`
- 带 `children` 的节点会渲染为子菜单，子节点同样使用 `items` 结构
- `id` 为 `about` 的节点只作为“关于本站”的锚点，不渲染书签
- 书签 favicon 由 `js/core.js` 通过 `https://api.xinac.net/icon/?url=<域名>` 自动获取，失败时回退到 `images/browser.svg`
- 新增书签通常只需要在 `js/data.json` 对应分类的 `items` 中追加 `{ "title": "...", "url": "...", "description": "..." }`
- 部署到 Cloudflare 后，数据可存储在 D1 的四张表（`categories`、`bookmarks`、`search_groups`、`search_items`）中，`/api/data` 负责重组为与原 `pageData` 等价的格式

## 核心功能

- 多引擎快捷搜索：百度、Bing、谷歌、B站、GitHub、站长工具等 29 个搜索站点，按“搜索 / 工具 / 社区 / 生活 / 求职”分组
- 动态侧边栏：菜单和子菜单由 `data.json` 渲染，折叠态使用 GSAP 动画展开
- 日/夜间模式：根据系统偏好、时间段和 `localStorage` 中的 `night` 值切换
- 星空背景：夜间模式在 Canvas 上绘制普通星、巨星和彗星
- 随机背景：桌面端使用 Bing 图片背景，移动端使用独立 Bing 图片接口，加载失败时回退为纯色
- 实时天气：通过 `/api/weather` 代理高德 IP 定位与天气 API 显示城市、天气、温度和风力，Key 只存于服务端 Secret
- Cloudflare 数据托管：页面优先从 `/api/data` 读取 D1 数据，接口失败时自动回退 `js/data.json`
- 数据管理后台：`/admin.html` 使用 `ADMIN_TOKEN` 登录，侧边栏只展示顶层分类，子分类的增删改与排序在右侧选中大类后操作
- 动态时间：侧边栏与页脚显示当前时间、星期
- 外观设置：悬浮面板可调节背景遮罩、模块模糊、模块透明度、主题主色，并通过 CSS 变量与 `localStorage` 持久化
- 其他交互：返回顶部、自定义鼠标指针、lozad 懒加载、Bootstrap Tooltip、iziToast 提示、打赏二维码、今日诗词

## 主要外部依赖

- CDN（jsDelivr）：Bootstrap 5、Tabler Icons、iziToast、GSAP、lozad、LXGW WenKai 字体、UnidreamLED 字体
- 高德开放平台：`restapi.amap.com` 的 IP 定位和天气预报接口，由 `functions/api/weather.js` 代理，Key 来自 Pages Secret/环境变量 `AMAP_KEY`
- 新逸Cary API：`api.xinac.net/icon/` 获取网站 favicon
- Bing 背景图 API：桌面端 `60s.748541.xyz/v2/bing`，移动端 `api.dujin.org/bing/m.php`
- 今日诗词 SDK：`sdk.jinrishici.com` 在“关于本站”区域展示每日诗词
- Cloudflare 特殊路径：`/cdn-cgi/trace` 用于页脚显示节点、访客位置和 IP

## 开发与验证

- 无构建流程，修改 `index.html`、`css/core.css`、`js/core.js`、`js/data.json` 后刷新浏览器即可
- Wrangler 4 要求 Node.js >= 22；本地运行 `dev`/`deploy`/D1 相关 npm scripts 和 GitHub Actions 均使用 Node.js 22+
- 本地预览建议启动静态服务器，例如：`python -m http.server 8000`；直接打开或普通静态服务器下天气模块不可用，需要验证 Cloudflare Functions（含 `/api/weather`）时使用 `npm install` 后执行 `npm run db:init -- --local`、`npm run db:seed-if-empty -- --local`、`npm run dev`
- 项目无自动化测试；改动后建议手动验证菜单渲染、搜索切换、日/夜间模式、响应式布局、天气/时间显示，以及 `/api/data` 与 `js/data.json` 的数据一致性
- 所有源码文件均为 UTF-8 编码；在 Windows PowerShell 中读取中文内容时使用 `Get-Content -Encoding UTF8`，编辑和保存时保持 UTF-8，避免中文乱码

### Cloudflare D1 注意事项

- `wrangler.toml` 中的 `database_id` 默认是占位符；D1 命令按数据库名 `nav` 执行，本地无需填写真实 ID；方式二（GitHub Actions）部署时由 Secret `CLOUDFLARE_D1_DATABASE_ID` 临时注入；方式一（Cloudflare Dashboard Git 集成）必须把真实 ID 填入 `wrangler.toml`，因为该文件是 Pages 配置唯一来源
- `npm run db:seed-if-empty [-- --remote]` 会先执行建表迁移，并只在四张表都为空时写入 `js/data.json` 种子数据，不会覆盖已有数据
- `npm run db:sync -- --remote` 会用本地 `js/data.json` 覆盖 D1 当前数据；`npm run db:export -- --remote` 会用 D1 数据覆盖本地 `js/data.json`，运行前会提示确认
- 管理后台与写接口使用 Bearer Token 认证，`ADMIN_TOKEN` 配置在 Cloudflare Pages 环境变量/Secret 中；未配置时 `/api/data` 仍可读取 D1，但写接口返回 503
- 本地调试管理后台时，在项目根目录创建 .dev.vars 并写入 ADMIN_TOKEN=...，验证天气时同时写入 AMAP_KEY=...，该文件已被 gitignore
- CI 同步工作流默认仅 `workflow_dispatch` 手动触发，不会在 push 时自动覆盖在线数据；它先执行建表迁移并在空库时播种，再全量同步本地数据；需要 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID` 三个 Secrets
- `.github/workflows/deploy.yml` 会在 main 推送时自动部署：注入 D1 database_id、执行 `npm run db:seed-if-empty -- --remote`、先用 GitHub Secrets `AMAP_KEY`、`ADMIN_TOKEN` 同步 Cloudflare Pages Secrets，再部署 Pages，确保新部署能读到 Secret
- `search` 与 `about` 分类不可删除，且其 `slug` 不可修改，以保证主站搜索区和“关于本站”锚点正常

## 发布与版本

`.github/workflows/release.yml` 的行为约定：

- 推送提交时检查最新提交信息，提交消息匹配 `Release vX.Y.Z`（大小写不敏感）才触发发布
- 发布流程：查找上一个 Tag、创建新 Tag、按 Conventional Commits 前缀（`feat`、`fix`、`docs`、`perf` 等）生成更新日志、发布 GitHub Release
- 工作流监听 `main` 分支，发布提交需直接推送到该分支；改动发布相关配置时需确认分支名匹配

### 发版步骤

发版时需同步修改以下四处版本号：

| 文件 | 修改位置 |
| --- | --- |
| `package.json` | 根节点 `version` 改为 `X.Y.Z` |
| `package-lock.json` | 根节点 `version` 与 `packages."".version` 改为 `X.Y.Z` |
| `js/core.js` | 控制台输出的 `版 本 号：vX.Y.Z` |
| `AGENTS.md` | 项目概览中的 `当前版本：vX.Y.Z` |

然后提交并推送：

- 提交信息必须为 `Release vX.Y.Z`（大小写不敏感），如 `Release v1.0.2`
- 将提交推送到 `main` 分支后，`.github/workflows/release.yml` 会自动创建 Tag 和 GitHub Release
- README 顶部版本徽章读取 GitHub Release，无需手动修改

## 注意事项

- 高德 API Key 已从前端移入 `/api/weather` 代理，通过 Pages Secret `AMAP_KEY` 提供；若旧 Key 曾出现在公开提交历史，应到高德控制台删除/重置后重新配置
- `js/data.json` 是 JSON 文件，编辑后必须保持语法有效，否则首页会显示“加载内容失败”
- 不要批量删除文件或目录；需要清理文件时一次只删除一个明确路径的文件
