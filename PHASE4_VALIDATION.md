# 第四阶段验证记录：本地量化快照同步

## 已验证链路

使用 `fixtures/local-engine-snapshot.example.json` 的两条示例信号，通过 `scripts/push_local_snapshot.py` 向本地 Worker 开发实例提交。上传器先完成 v1 结构校验，再以环境变量中的测试令牌发送认证请求。

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| 上传器本地校验 | 通过 | `--dry-run` 返回 `validated`，识别 2 条信号项。 |
| Worker 类型检查 | 通过 | TypeScript 无诊断输出。 |
| 认证同步写入 | 通过 | `POST /api/snapshot` 返回 `202 accepted`、时间戳、2 条项目和 `local-engine` 来源。 |
| 公共快照读取 | 通过 | `GET /api/snapshot` 返回刚接受的标准化快照。 |
| 健康状态 | 通过 | `GET /api/health` 显示 `sync.configured: true`（本地测试环境）及 `lastAccepted`。 |
| 无认证写入保护 | 通过 | 未携带 Bearer token 的 `POST /api/snapshot` 被拒绝并返回 HTTP 401。 |

## 本地测试前置条件

本地 D1 实例是空库，因此首次测试需要执行 `wrangler d1 execute quantwatch-snapshots --local --file=schema.sql` 建表。生产 D1 已使用相同的 `schema.sql` 表结构；在获得生产部署授权前，未对任何云端 Worker、D1、KV 或 R2 资源执行写入操作。

## 生产启用前仍需完成的事项

1. 将本次 Worker 源码发布到生产环境；
2. 在 Worker 服务端设置高熵 `SYNC_TOKEN` 密钥，且只在本地 Mac 的环境变量中保存匹配值；
3. 先以手动推送验证真实本地量化快照，再由用户选择是否启用固定频率的本地定时同步。
