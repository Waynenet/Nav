![Nav](https://socialify.git.ci/Waynenet/Nav/image?description=1&descriptionEditable=%E4%B8%80%E4%B8%AA%E7%BA%AF%E9%9D%99%E6%80%81%E5%AF%BC%E8%88%AA%E7%BD%91%E7%AB%99%EF%BC%8C%E7%B2%BE%E6%8C%91%E7%BB%86%E9%80%89%E4%BC%98%E8%B4%A8%E4%B9%A6%E7%AD%BE%EF%BC%8C%E6%97%A0%E4%BB%BB%E4%BD%95%E5%B9%BF%E5%91%8A%E8%A1%8C%E4%B8%BA%E3%80%82&font=Inter&forks=1&issues=1&language=1&owner=1&pattern=Circuit%20Board&pulls=1&stargazers=1&theme=Auto)

<p>
<strong><h1>WayneのNav</h1></strong>
</p>

[![Version](https://img.shields.io/github/v/release/Waynenet/Nav?color=00aaff&logo=github)](https://github.com/Waynenet/Nav/releases/latest)
[![License](https://img.shields.io/github/license/Waynenet/Nav?color=orange&logo=gnu)](LICENSE)
[![Channel](https://img.shields.io/badge/Telegram-Channel-blue?logo=telegram)](https://t.me/wayne_3301)

一个纯静态导航网站，精挑细选优质书签，无任何广告行为。

## Demo

➡️ [WayneのNav]()             

## 功能特性

✅ 丰富资源     
✅ 随机背景   
✅ 快捷搜索      
✅ 数据管理          
✅ 实时天气          
✅ 动态时间                  
✅ 日月轮转     
✅ 星空背景        

## Cloudflare Pages + D1 部署

项目数据已支持托管在 Cloudflare D1：

- 页面优先请求 `/api/data` 读取 D1 数据，接口不可用或 D1 为空时自动回退 `js/data.json`
- 管理后台：`/admin.html`，使用 `ADMIN_TOKEN` Bearer Token 认证
- D1 表：`categories` / `bookmarks` / `search_groups` / `search_items`

### 一键部署

Cloudflare 官方 “Deploy to Cloudflare” 按钮目前只支持 Workers 应用，不支持带 `functions/` 的 Pages 项目；本项目是 Pages + D1，所以下面的按钮会带你直达 Cloudflare 控制台的 Workers & Pages 页面，再按「方式一」创建 Pages 项目即可：

[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy%20to%20Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/workers-and-pages)

初次部署建议先 Fork 本仓库，再把 Fork 后的仓库连接到 Cloudflare。高德 Key、`ADMIN_TOKEN` 不会写入仓库；方式一需要把 D1 `database_id` 填进 Fork 的 `wrangler.toml`（它不是访问凭据，但若不想公开，请把 Fork 设为 Private，或改用方式二）。

### 方式一：Cloudflare Dashboard Git 集成（推荐，无需 GitHub Actions）

适合不想配置 GitHub Actions 的初次部署者，Secrets 直接配置在 Cloudflare Pages 侧。

1. Fork 本仓库到自己的 GitHub 账号：https://github.com/Waynenet/Nav/fork
2. 点击上面的「Deploy to Cloudflare」按钮登录 Cloudflare，进入 Workers & Pages。
3. 创建 D1 数据库 `nav`：
   - 控制台：Workers & Pages -> D1 -> Create database，名称填 `nav`，创建后复制返回的 `database_id`；
   - 或命令行：`npx wrangler d1 create nav`，复制输出中的 `database_id`。
4. 在 Fork 中填入 `database_id`：
   - 编辑 `wrangler.toml`，把 `database_id = "REPLACE_WITH_D1_DATABASE_ID"` 替换为真实的 `database_id`；
   - 提交并推送到 `main`，再继续下一步。
   - 仓库中存在 `wrangler.toml` 时，它就是 Pages Functions 配置的唯一来源，Dashboard 里的 D1 binding 不能覆盖它，所以这一步不能省略。
5. 创建 Pages 项目：
   - Workers & Pages -> Create application -> Pages -> Connect to Git，授权并选择你 Fork 的仓库；
   - 如果引导你进入 Worker / Workers Builds 流程，请返回并选择 Pages，不要创建成 Worker；
   - Production branch 选择 `main`；
   - Build command 留空，Build output directory 填 `.`；
   - 点击 Save and Deploy，等待首次部署完成。
6. 配置 Pages Secrets：
   - Pages 项目 -> Settings -> Variables and secrets -> Add secret；
   - `AMAP_KEY`：高德 Web 服务 Key，不配置时天气接口返回 503；
   - `ADMIN_TOKEN`：管理后台 Token，不配置时后台写接口返回 503。
7. 初始化 D1 表与数据（首次部署必做）：
   - 在本地克隆并安装依赖：

     ```bash
     git clone https://github.com/你的用户名/Nav.git
     cd Nav
     npm install
     ```

   - 使用数据库名直接初始化（部署所需的真实 `database_id` 已在第 4 步填入 `wrangler.toml`）：

     ```bash
     npm run db:init -- --remote
     npm run db:seed-if-empty -- --remote
     ```

   - `db:seed-if-empty` 只会在四张表都为空时写入 `js/data.json` 的种子数据，不会覆盖已有数据；想强制全量覆盖时改用 `npm run db:sync -- --remote`。
   - 也可以不跑本地命令，直接手动触发 `Sync D1 Data` Action：它会先建表并在空库时播种，再全量同步 `js/data.json`；前提是在 GitHub 仓库配置好 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID` 三个 Secrets。
8. 回到 Pages 项目触发一次重新部署，或直接访问生产 URL。

之后每次 push 到 `main`，Cloudflare Git 集成都会自动重新构建部署。

> 注意：方式一不走 GitHub Actions，GitHub Secrets 不会被读取；`AMAP_KEY`、`ADMIN_TOKEN` 必须配置在 Cloudflare Pages 的 Variables and secrets 中。`wrangler.toml` 已定义 D1 绑定，无需在 Dashboard 重复添加 D1 binding。

### 方式二：GitHub Actions 自动部署

适合希望 push 到 `main` 后由 CI 自动部署、并由 GitHub 统一管理 Secrets 的用户。

1. Fork 本仓库到自己的 GitHub 账号，并在 Cloudflare 创建 D1 数据库 `nav`（同方式一第 3 步），复制 `database_id`。
2. 在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中配置：

| Secret | 用途 | 是否必需 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token，用于部署与 D1 操作 | 是 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID | 是 |
| `CLOUDFLARE_D1_DATABASE_ID` | `wrangler d1 create nav` 返回的 database_id，CI 会替换 `wrangler.toml` 中的占位符 | 是 |
| `AMAP_KEY` | 高德 Web 服务 Key，CI 部署后写入 Pages Secret | 否 |
| `ADMIN_TOKEN` | 管理后台 Token，CI 部署后写入 Pages Secret | 否 |

`CLOUDFLARE_API_TOKEN` 需要同时具有 Cloudflare Pages 与 D1 的编辑权限，否则 CI 的播种或部署步骤会失败。

3. 推送或合并到 `main` 分支，`.github/workflows/deploy.yml` 会自动执行：
   - 检查必需 Secrets；
   - 注入 D1 database_id；
   - 执行 `npm run db:seed-if-empty -- --remote`（建表 + 空库播种，已有数据时跳过）；
   - 部署 Cloudflare Pages；
   - 把 `AMAP_KEY`、`ADMIN_TOKEN` 同步为 Pages Secrets。
4. 也可以手动触发：GitHub Actions -> Deploy to Cloudflare Pages -> Run workflow。

> 注意：GitHub Secrets 只在 GitHub Actions 运行时生效。如果部署走的是方式一（Cloudflare 直接连接 Git），GitHub Secrets 不会被使用，此时请直接在 Cloudflare Pages 里配置 Secret。

### Secrets 配置位置

| 部署方式 | `AMAP_KEY` / `ADMIN_TOKEN` 配置位置 |
| --- | --- |
| 方式一：Dashboard Git 集成 | Cloudflare Pages -> Settings -> Variables and secrets |
| 方式二：GitHub Actions | GitHub Actions Secrets，workflow 自动同步到 Pages |

### 本地开发

```bash
npm run db:init -- --local
npm run db:seed-if-empty -- --local
npm run dev
```

默认访问 http://localhost:8788/。

本地调试管理后台时，在项目根目录创建 `.dev.vars`（已被 gitignore）并写入 `ADMIN_TOKEN=你的本地Token`；需要验证天气时同时写入 `AMAP_KEY=你的高德Key`。

### 管理后台

- 在 Cloudflare Pages 环境变量/Secret 中配置 `ADMIN_TOKEN`
- 访问 `/admin.html`，登录后从左侧选择顶层分类，并在右侧管理子分类、书签、搜索配置及排序
- 可选：用 Cloudflare Access 对 `/admin.html` 和 `/api/admin/*` 增加前置保护

### 数据同步

- `npm run db:seed-if-empty [-- --remote]`：建表，并只在 D1 为空时写入 `js/data.json` 种子数据
- `npm run db:sync [-- --remote]`：用本地 `js/data.json` 全量覆盖 D1（默认本地，远程加 `--remote`）
- `npm run db:export [-- --remote]`：从 D1 导出并覆盖本地 `js/data.json`
- 同步方向明确：`db:sync` 会覆盖 D1 当前在线修改，`db:export` 会覆盖本地文件
- `.github/workflows/sync-d1.yml` 提供手动触发的 CI 同步，会先执行建表迁移并在空库时播种，再全量同步 `js/data.json`；需配置 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`
- D1 命令按数据库名 `nav` 执行；方式二（GitHub Actions）部署时 `wrangler.toml` 保持占位符，由 `CLOUDFLARE_D1_DATABASE_ID` 临时注入；方式一（Dashboard Git 集成）必须把真实 `database_id` 填入 `wrangler.toml`

## 关于天气

天气获取需要 `高德开放平台` 相关 API：

- 前端只请求 `/api/weather`，由 `functions/api/weather.js` 使用 Pages Secret `AMAP_KEY` 代理高德请求，Key 不会暴露给浏览器
- 本地开发：在 `.dev.vars` 中写入 `AMAP_KEY=你的高德Key`
- Cloudflare：在 Pages Secret 中配置 `AMAP_KEY`，或在 GitHub Secret 中配置后由 `deploy.yml` 自动同步
- 直接打开 `index.html` 或使用普通静态服务器时没有 `/api/weather`，天气会显示加载失败；请用 `npm run dev` 本地验证或部署到 Cloudflare Pages
- 请前往 [高德开放平台](https://lbs.amap.com/) 创建一个 Web 服务类型的 Key，每月有 5000 次的免费额度
- 如果旧 Key 已出现在公开 Git 历史中，GitHub Secret 无法抹除历史泄露，请先到高德控制台删除/重置旧 Key，再配置新 Key

## 特别鸣谢

- [WebStackPage](https://github.com/WebStackPage/WebStackPage.github.io)
- [ChatGPT](https://chat.openai.com/)
- [Google AI Studio](https://aistudio.google.com/)
- [DeepSeek](https://www.deepseek.com/)
- [今日诗词 API](https://www.jinrishici.com/)
- [新逸Cary API](https://api.xinac.net/)
- [缙哥哥博客 API](https://www.dujin.org/3618.html)
