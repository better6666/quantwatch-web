# 多数据源路由审计

## 已验证的公开来源

| 数据源 | 适用资产与频率 | 实测 / 官方边界 | 在系统中的角色 |
|---|---|---|---|
| Kraken OHLC | 加密现货，分钟至月线 | 公开端点；最近 720 根；最后一根为未收盘 K 线，须剔除 | 主源：Kraken 已上线交易对 |
| Coinbase Exchange Candles | 加密现货，1/5/15 分钟、1 小时、日线（4 小时由 1 小时聚合） | 公开端点；单次最多 300 根；没有成交的时间段不会有 K 线 | 加密备源：Kraken 标的无数据或上游失败时尝试 |
| Yahoo Finance Chart | 股票、ETF、共同基金、指数、外汇等，日/周/月线 | 公共图表端点实测可返回 OHLCV；作为免费研究数据，不宣称专业实时数据 | 主源：广泛免费日/周/月线 |
| Nasdaq quote historical | 美股 / ETF 日线 | 已实测 AAPL 返回日线 OHLCV；需要浏览器式请求头 | 美股 / ETF 备源：Yahoo 失败时尝试 |

Coinbase 文档说明其蜡烛数据可能不完整、无成交区间不会发布数据且单次最多 300 根，因此必须在响应中保留“备源”和缺口计数，不能将其静默混入无缺口的主源样本。[1]

Nasdaq 的公开 Data Link 产品页说明，Bars 能提供美国上市及 OTCBB 标的历史柱状数据，并支持基于不同区间生成 OHLCV 图表；其专业产品属性与网页公开接口的稳定性不同，因此仅作为公开备源而非无条件数据质量担保。[2]

## 路由原则

1. 每个请求按资产类别和周期选择主源，再按明确的备源顺序重试，绝不以静态演示数据替代失败行情。
2. 响应始终返回 `providerChain`、实际 `providerUsed`、已失败源和失败原因、样本范围、缺口与已收盘政策。
3. 基金标的先尝试 Yahoo 公共日/周/月线；若无有效结果则返回透明的“无公开覆盖”而非要求用户立即授权。
4. 股票与 ETF 日线优先 Yahoo，失败后尝试 Nasdaq；分钟线保持专业数据边界。

## 参考资料

[1] [Coinbase Exchange: Get product candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles)

[2] [Nasdaq Data Link APIs](https://www.nasdaq.com/solutions/data/nasdaq-data-link/api)
