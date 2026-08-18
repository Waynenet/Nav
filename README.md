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

- 页面优先请求 `/api/data` 读取 D1 数据，接口不可用时自动回退 `js/data.json`
- 管理后台：`/admin.html`，使用 `ADMIN_TOKEN` Bearer Token 认证
- D1 表：`categories` / `bookmarks` / `search_groups` / `search_items`

### 首次部署

```bash
npm install
npx wrangler d1 create nav
```

把创建后返回的 `database_id` 填入 `wrangler.toml`（也可以不提交真实 ID，改由 GitHub Secret 注入，见下文“GitHub Secrets”），然后执行：

```bash
npm run db:init -- --remote
npm run db:sync -- --remote
npm run deploy
```

### 本地开发

```bash
npm run db:init -- --local
npm run db:sync -- --local
npm run dev
```

默认访问 http://localhost:8788/。

本地调试管理后台时，在项目根目录创建 .dev.vars（已被 gitignore）并写入 ADMIN_TOKEN=你的本地Token；需要验证天气时同时写入 AMAP_KEY=你的高德Key。

### GitHub Secrets

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中配置：

| Secret | 用途 | 是否必需 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token，用于部署与 D1 操作 | 是 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID | 是 |
| `CLOUDFLARE_D1_DATABASE_ID` | `wrangler d1 create nav` 返回的 database_id，CI 会替换 `wrangler.toml` 中的占位符 | 是 |
| `AMAP_KEY` | 高德 Web 服务 Key，CI 部署后写入 Pages Secret | 否 |
| `ADMIN_TOKEN` | 管理后台 Token，CI 部署后写入 Pages Secret | 否 |

`.github/workflows/deploy.yml` 在 main 分支推送或手动触发时，会注入 D1 database_id、部署 Cloudflare Pages，并把 `AMAP_KEY`、`ADMIN_TOKEN` 同步为 Pages Secret。真实 Key 与 D1 ID 不会提交到仓库。

### 管理后台

- 在 Cloudflare Pages 环境变量/Secret 中配置 `ADMIN_TOKEN`
- 访问 `/admin.html`，登录后从左侧选择顶层分类，并在右侧管理子分类、书签、搜索配置及排序
- 可选：用 Cloudflare Access 对 `/admin.html` 和 `/api/admin/*` 增加前置保护

### 数据同步

- `npm run db:sync [-- --remote]`：用本地 `js/data.json` 覆盖 D1（默认本地，远程加 `--remote`）
- `npm run db:export [-- --remote]`：从 D1 导出并覆盖本地 `js/data.json`
- 同步方向明确：`db:sync` 会覆盖 D1 当前在线修改，`db:export` 会覆盖本地文件
- `.github/workflows/sync-d1.yml` 提供手动触发的 CI 同步，需配置 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`

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
