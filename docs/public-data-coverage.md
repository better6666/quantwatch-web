# 公开数据覆盖审计

Kraken 的公开 `AssetPairs` 市场数据端点可返回可交易对及其显示标识、状态与交易属性；使用 `assetVersion=1` 可获得标准显示格式。该端点无需私有账户认证，适合作为网页的动态加密资产目录来源。[1]

| 资产类别 | 可用公开来源 | 本次接入方式 | 研究限制 |
|---|---|---|---|
| 加密现货 | Kraken AssetPairs + OHLC | 动态载入在线 USD 交易对，并通过现有 OHLC 接口研究 | 公开 OHLC 最多最近 720 根且须排除未收盘K线 |
| 美股 / ETF | Stooq 日线 CSV | 提供常用股票与 ETF 的免费日线数据入口 | 免费历史数据为日线研究数据，收盘价可能为复权口径；不用于实时或分钟线研究 |
| 外汇 / 指数 / 商品 | Stooq 下载数据与用户导入 CSV | 保留 CSV 导入的通用入口 | 免费站点下载口径和频率须由用户导入前核验 |

Stooq 提供多市场的历史 OHLCV 数据，并使用如 `AAPL.US` 的符号命名规则。其数据说明指出可取得股票、ETF、外汇、指数、商品和加密等历史数据，但并未提供完整的受支持实时 API；因此网页将免费日线作为研究数据而非实时行情，并在界面中明确此边界。[2]

## 参考资料

[1] [Kraken: Get Tradable Asset Pairs](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs)

[2] [QuantStart: An Introduction to Stooq Pricing Data](https://www.quantstart.com/articles/an-introduction-to-stooq-pricing-data/)
