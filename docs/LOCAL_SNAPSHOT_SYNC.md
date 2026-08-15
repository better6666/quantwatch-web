# 本地量化快照同步协议

QuantWatch 的云端快照用于在网页和原生盯盘界面间共享**本地量化引擎已经计算完成的研究结果**。它不在 Cloudflare Worker 中运行 pandas、yfinance 或批量回测，也不会绕过任何市场数据授权。行情抓取和重型计算仍在用户的本地量化环境内完成；Worker 只接收、校验、缓存、归档和提供最新快照。

> 该同步机制仅用于研究与教育用途，**不构成投资建议，也不执行自动交易**。

## 安全模型

| 项目 | 设计 |
| --- | --- |
| 写入入口 | `POST https://quantwatch-api.2333333434.workers.dev/api/snapshot` |
| 认证 | `Authorization: Bearer <同步密钥>`；密钥仅作为 Worker Secret 和本地环境变量存在 |
| 仓库策略 | 不提交同步密钥、不创建 `.env` / `.dev.vars` 提交文件、不在命令行中传递密钥 |
| 输入限制 | 单次正文最多 256 KB，最多 500 个信号项，严格校验 v1 字段、数值范围和时间格式 |
| 顺序保护 | Worker 拒绝早于已接受本地快照的 `generatedAt`，防止旧运行覆盖新结果 |
| 存储 | 最新快照写入 KV 与 D1；现有工作日归档任务写入 R2 |
| 公开读取 | 继续使用既有 `GET /api/snapshot`、`GET /api/quotes` 和 `GET /api/health` |

## v1 数据格式

本地引擎输出一个 JSON 文件。最小示例见 [`../fixtures/local-engine-snapshot.example.json`](../fixtures/local-engine-snapshot.example.json)。顶层字段如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `1` | 当前协议版本，固定为 `1` |
| `generatedAt` | ISO 8601 字符串 | 本次量化计算完成时间 |
| `universe` | 字符串 | 标的池或计算范围名称 |
| `items` | 数组 | 最多 500 条规范化研究信号 |
| `disclaimer` | 字符串 | 对数据权限与研究用途的说明 |

每个信号项必须具有 `ticker`、`name`、`signal`（`long` / `short` / `neutral`）、`consensus`（-1 至 1）、`price`、`changePct`、`updatedAt`。`atr`、`stopLoss` 与 `takeProfit` 为可选非负数值。

## 本地执行步骤

将仓库中的 `scripts/push_local_snapshot.py` 放在本地量化项目中，或在该仓库直接调用。上传器只使用 Python 标准库，不增加本地依赖。

```bash
export QUANTWATCH_SYNC_TOKEN='在本地终端安全设置的同步密钥'
python3 scripts/push_local_snapshot.py --input /绝对路径/本地快照.json
```

上线前，可先执行不联网的结构校验：

```bash
python3 scripts/push_local_snapshot.py --input fixtures/local-engine-snapshot.example.json --dry-run
```

本地量化引擎应该在生成快照文件成功后再调用上传器；若上传返回错误，保留本地文件并记录错误，但**不要阻塞本地盯盘服务**。建议先保持“手动或每日一次”同步，待数据质量和数据供应商许可明确后，再由用户决定是否启用固定频率自动同步。

## 云端启用步骤

发布前需要在 Cloudflare Worker 的**服务端密钥**中设置一个高熵随机值，名称为 `SYNC_TOKEN`。该值必须与本地的 `QUANTWATCH_SYNC_TOKEN` 相同；它不能写入 `wrangler.toml`、GitHub Pages 前端、Git 提交信息、截图或日志。部署 Worker 更新后，可用如下健康检查确认配置状态：

```text
GET /api/health → sync.configured: true
```

在密钥尚未配置时，写入接口会返回 `503 sync_unconfigured`，不会接受数据。这是预期的安全默认行为。

## 运行方式选择

| 方式 | 适用情况 | 代价与边界 |
| --- | --- | --- |
| 手动推送 | 首次上线、数据源尚在验证、每天偶尔更新 | 零常驻成本；需用户或本地脚本主动运行 |
| 本地定时推送 | Mac 保持开机，已有本地 Python 量化环境 | 零额外云主机成本；Mac 离线时不会同步 |
| 托管定时计算 | 需要不依赖 Mac 的定时运行，且可使用受授权数据源 | 需要另行部署计算环境与管理数据供应商凭据；不属于当前无密钥 Cloudflare 前端范围 |

当前项目的推荐起点是**手动推送**：先验证数据字段、时间顺序与快照展示，再决定是否在本地启用定时任务。
