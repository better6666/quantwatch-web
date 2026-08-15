# QuantWatch Cloud Lite

QuantWatch Cloud Lite 将静态看板部署到 GitHub Pages，并以 Cloudflare Worker 提供只读快照 API。该版本专为 Cloudflare Workers 免费档设计：前端默认每 5 分钟刷新，Worker 读取 KV 缓存与 D1 快照，日频 Cron 把最新云端快照归档至 R2。

## 地址

- 前端：`https://better6666.github.io/quantwatch-web/`
- API：`https://quantwatch-api.2333333434.workers.dev/api/health`

## 当前数据状态

首次部署会显示 Worker 内置的初始化演示快照，并显式标记为 `cloud-seed`。它用于验证部署、筛选、排序、缓存、D1、KV、R2 归档和跨域连接；不应被视为实时行情或交易建议。将本地量化引擎的 `latest_signals.json` 同步至 D1/KV 后，页面会显示正式快照。

## 免费档设计边界

Workers Free 的单次 CPU 时间有限，因此本项目不在 Worker 内执行 pandas/numpy 回测、walk-forward 优化或高频行情拉取。API 面向缓存快照，页面每 5 分钟刷新。完整研究与参数寻优应在外部计算环境运行，再把压缩后的信号快照发布到此 Worker 的存储层。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `src/worker.ts` | Worker API、CORS、KV 缓存、D1 回退、R2 日频归档与 Cron 处理 |
| `schema.sql` | D1 数据表与索引 |
| `wrangler.toml` | Worker、D1、KV、R2 和 Cron 配置 |
| `docs/index.html` | GitHub Pages 静态看板 |
| `.github/workflows/deploy-pages.yml` | Pages 自动发布工作流 |

## 部署

在安装 Node.js 的环境中，设置 `CLOUDFLARE_API_TOKEN` 后运行：

```bash
pnpm install
pnpm exec wrangler d1 execute quantwatch-snapshots --remote --file=./schema.sql
pnpm exec wrangler deploy
```

将代码推送到 `main` 分支后，GitHub Actions 会自动发布 `docs/` 到 GitHub Pages。
