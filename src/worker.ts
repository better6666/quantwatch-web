export interface SignalItem {
  ticker: string;
  name: string;
  signal: "long" | "short" | "neutral";
  consensus: number;
  price: number;
  changePct: number;
  atr?: number;
  stopLoss?: number;
  takeProfit?: number;
  updatedAt: string;
}

export interface Snapshot {
  version: 1;
  generatedAt: string;
  source: "cloud-seed" | "cloud-cache" | "cloud-archive" | "local-engine";
  universe: string;
  items: SignalItem[];
  disclaimer: string;
}

interface AssetDescriptor {
  id: string;
  symbol: string;
  name: string;
  assetClass: "crypto" | "stock" | "etf";
  provider: string;
  availability: "public" | "requires_authorized_provider";
}

interface IncomingSnapshot {
  version?: unknown;
  generatedAt?: unknown;
  universe?: unknown;
  items?: unknown;
  disclaimer?: unknown;
}

export interface Env {
  DB: D1Database;
  SNAPSHOT_CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
  ALLOWED_ORIGIN: string;
  APP_NAME: string;
  /** Configure as a Worker secret; never commit its value. */
  SYNC_TOKEN?: string;
}

const CACHE_KEY = "quantwatch:latest-snapshot:v1";
const ONE_DAY_SECONDS = 86_400;
const SUPPORTED_INTERVALS = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]);
const CANDLE_CACHE_TTL_SECONDS = 300;
const MAX_SYNC_BODY_BYTES = 256_000;
const MAX_SYNC_ITEMS = 500;
const SITE_ORIGIN = "https://better6666.github.io";
const SITE_BASE_PATH = "/quantwatch-web";
const CUSTOM_ORIGIN = "https://better789.dpdns.org";
const makeAssets = (entries: ReadonlyArray<readonly [string, string, string]>, assetClass: AssetDescriptor["assetClass"], provider: string, availability: AssetDescriptor["availability"]): AssetDescriptor[] =>
  entries.map(([id, symbol, name]) => ({ id, symbol, name, assetClass, provider, availability }));

const FREE_STOCKS = [["AAPL", "AAPL", "Apple"], ["MSFT", "MSFT", "Microsoft"], ["NVDA", "NVDA", "NVIDIA"], ["AMZN", "AMZN", "Amazon"], ["GOOGL", "GOOGL", "Alphabet A"], ["GOOG", "GOOG", "Alphabet C"], ["META", "META", "Meta Platforms"], ["TSLA", "TSLA", "Tesla"], ["AVGO", "AVGO", "Broadcom"], ["BRK-B", "BRK-B", "Berkshire Hathaway B"], ["JPM", "JPM", "JPMorgan Chase"], ["V", "V", "Visa"], ["MA", "MA", "Mastercard"], ["UNH", "UNH", "UnitedHealth"], ["XOM", "XOM", "Exxon Mobil"], ["LLY", "LLY", "Eli Lilly"], ["WMT", "WMT", "Walmart"], ["COST", "COST", "Costco"], ["HD", "HD", "Home Depot"], ["PG", "PG", "Procter & Gamble"], ["JNJ", "JNJ", "Johnson & Johnson"], ["AMD", "AMD", "Advanced Micro Devices"], ["INTC", "INTC", "Intel"], ["QCOM", "QCOM", "Qualcomm"], ["ORCL", "ORCL", "Oracle"], ["CRM", "CRM", "Salesforce"], ["ADBE", "ADBE", "Adobe"], ["CSCO", "CSCO", "Cisco"], ["NFLX", "NFLX", "Netflix"], ["DIS", "DIS", "Walt Disney"], ["BA", "BA", "Boeing"], ["GE", "GE", "GE Aerospace"], ["CAT", "CAT", "Caterpillar"], ["NKE", "NKE", "Nike"], ["MCD", "MCD", "McDonald's"], ["SBUX", "SBUX", "Starbucks"]] as const;
const FREE_ETFS = [["SPY", "SPY", "SPDR S&P 500 ETF"], ["QQQ", "QQQ", "Invesco QQQ ETF"], ["IWM", "IWM", "iShares Russell 2000 ETF"], ["DIA", "DIA", "SPDR Dow Jones ETF"], ["VTI", "VTI", "Vanguard Total Stock Market ETF"], ["VOO", "VOO", "Vanguard S&P 500 ETF"], ["XLK", "XLK", "Technology Select Sector ETF"], ["XLF", "XLF", "Financial Select Sector ETF"], ["XLE", "XLE", "Energy Select Sector ETF"], ["XLV", "XLV", "Health Care Select Sector ETF"], ["XLY", "XLY", "Consumer Discretionary ETF"], ["XLP", "XLP", "Consumer Staples ETF"], ["XLI", "XLI", "Industrial Select Sector ETF"], ["XLB", "XLB", "Materials Select Sector ETF"], ["XLU", "XLU", "Utilities Select Sector ETF"], ["GLD", "GLD", "SPDR Gold Shares"], ["SLV", "SLV", "iShares Silver Trust"], ["TLT", "TLT", "iShares 20+ Year Treasury Bond ETF"], ["HYG", "HYG", "iShares High Yield Bond ETF"], ["LQD", "LQD", "iShares Investment Grade Bond ETF"], ["USO", "USO", "United States Oil Fund"], ["UNG", "UNG", "United States Natural Gas Fund"], ["EEM", "EEM", "iShares MSCI Emerging Markets ETF"], ["FXI", "FXI", "iShares China Large-Cap ETF"], ["ARKK", "ARKK", "ARK Innovation ETF"]] as const;
const ASSETS: AssetDescriptor[] = [
  ...makeAssets([["BTCUSDT", "BTC/USD", "Bitcoin"], ["ETHUSDT", "ETH/USD", "Ethereum"], ["SOLUSDT", "SOL/USD", "Solana"], ["BNBUSDT", "BNB/USD", "BNB"], ["XRPUSDT", "XRP/USD", "XRP"], ["ADAUSDT", "ADA/USD", "Cardano"], ["DOGEUSDT", "DOGE/USD", "Dogecoin"], ["AVAXUSDT", "AVAX/USD", "Avalanche"], ["LINKUSDT", "LINK/USD", "Chainlink"], ["DOTUSDT", "DOT/USD", "Polkadot"]], "crypto", "Kraken OHLC（云端缓存）", "public"),
  ...makeAssets(FREE_STOCKS, "stock", "Yahoo Finance 公共日/周/月线", "public"),
  ...makeAssets(FREE_ETFS, "etf", "Yahoo Finance 公共日/周/月线", "public")
];


const demoSnapshot = (): Snapshot => ({
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "cloud-seed",
  universe: "US Large-Cap · Cloud Lite",
  disclaimer: "此为 Cloudflare 免费档的初始化演示快照，不构成投资建议；连接正式数据同步后会自动替换。",
  items: [
    { ticker: "AAPL", name: "Apple", signal: "long", consensus: 0.62, price: 214.33, changePct: 0.48, atr: 4.12, stopLoss: 206.09, takeProfit: 230.81, updatedAt: new Date().toISOString() },
    { ticker: "MSFT", name: "Microsoft", signal: "long", consensus: 0.51, price: 512.13, changePct: 0.31, atr: 6.28, stopLoss: 499.57, takeProfit: 530.97, updatedAt: new Date().toISOString() },
    { ticker: "NVDA", name: "NVIDIA", signal: "neutral", consensus: 0.08, price: 186.42, changePct: -0.21, atr: 5.76, stopLoss: 174.90, takeProfit: 203.70, updatedAt: new Date().toISOString() },
    { ticker: "AMZN", name: "Amazon", signal: "long", consensus: 0.43, price: 233.12, changePct: 0.65, atr: 4.83, stopLoss: 223.46, takeProfit: 247.61, updatedAt: new Date().toISOString() },
    { ticker: "GOOGL", name: "Alphabet", signal: "neutral", consensus: -0.03, price: 205.39, changePct: -0.14, atr: 3.92, stopLoss: 197.55, takeProfit: 217.15, updatedAt: new Date().toISOString() },
    { ticker: "META", name: "Meta", signal: "short", consensus: -0.37, price: 738.31, changePct: -0.72, atr: 12.60, stopLoss: 763.51, takeProfit: 700.51, updatedAt: new Date().toISOString() },
    { ticker: "TSLA", name: "Tesla", signal: "short", consensus: -0.46, price: 328.41, changePct: -1.08, atr: 10.18, stopLoss: 348.77, takeProfit: 297.87, updatedAt: new Date().toISOString() },
    { ticker: "JPM", name: "JPMorgan Chase", signal: "neutral", consensus: 0.11, price: 307.28, changePct: 0.19, atr: 4.01, stopLoss: 299.26, takeProfit: 319.31, updatedAt: new Date().toISOString() },
    { ticker: "XOM", name: "Exxon Mobil", signal: "long", consensus: 0.34, price: 113.26, changePct: 0.22, atr: 2.21, stopLoss: 108.84, takeProfit: 121.00, updatedAt: new Date().toISOString() },
    { ticker: "GLD", name: "SPDR Gold Shares", signal: "long", consensus: 0.29, price: 307.84, changePct: 0.16, atr: 3.54, stopLoss: 300.76, takeProfit: 318.46, updatedAt: new Date().toISOString() }
  ]
});

function allowedOrigin(request: Request, env: Env): string {
  const origin = request.headers.get("Origin");
  const allowed = new Set([env.ALLOWED_ORIGIN, CUSTOM_ORIGIN, "http://127.0.0.1:8787", "http://localhost:8787"]);
  return origin && allowed.has(origin) ? origin : env.ALLOWED_ORIGIN;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  return { "Access-Control-Allow-Origin": allowedOrigin(request, env), "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}

function json(data: unknown, request: Request, env: Env, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=60, s-maxage=300");
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(JSON.stringify(data), { ...init, headers });
}

function noStoreJson(data: unknown, request: Request, env: Env, status: number): Response {
  return json(data, request, env, { status, headers: { "Cache-Control": "no-store" } });
}

function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try { const value = JSON.parse(raw) as Partial<Snapshot>; return value.version === 1 && Array.isArray(value.items) && typeof value.generatedAt === "string" ? value as Snapshot : null; } catch { return null; }
}

function isFiniteNumber(value: unknown, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function normalizedItem(value: unknown): SignalItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const ticker = typeof raw.ticker === "string" ? raw.ticker.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const signal = raw.signal;
  if (!ticker || ticker.length > 32 || !name || name.length > 120 || !["long", "short", "neutral"].includes(String(signal)) || !isFiniteNumber(raw.consensus, -1, 1) || !isFiniteNumber(raw.price, 0) || !isFiniteNumber(raw.changePct, -10_000, 10_000) || !isIsoDate(raw.updatedAt)) return null;
  const optional = (key: "atr" | "stopLoss" | "takeProfit", minimum = 0): number | undefined => raw[key] == null ? undefined : isFiniteNumber(raw[key], minimum) ? raw[key] : undefined;
  if ((raw.atr != null && optional("atr") == null) || (raw.stopLoss != null && optional("stopLoss") == null) || (raw.takeProfit != null && optional("takeProfit") == null)) return null;
  return { ticker, name, signal: signal as SignalItem["signal"], consensus: raw.consensus, price: raw.price, changePct: raw.changePct, atr: optional("atr"), stopLoss: optional("stopLoss"), takeProfit: optional("takeProfit"), updatedAt: raw.updatedAt };
}

function normalizeIncomingSnapshot(value: unknown): { snapshot: Snapshot } | { error: string } {
  if (!value || typeof value !== "object") return { error: "请求体必须是JSON对象。" };
  const raw = value as IncomingSnapshot;
  const universe = typeof raw.universe === "string" ? raw.universe.trim() : "";
  const disclaimer = typeof raw.disclaimer === "string" ? raw.disclaimer.trim() : "";
  if (raw.version !== 1 || !isIsoDate(raw.generatedAt) || !universe || universe.length > 160 || !disclaimer || disclaimer.length > 1_000 || !Array.isArray(raw.items) || raw.items.length > MAX_SYNC_ITEMS) return { error: "快照字段或容量不符合v1同步协议。" };
  const items = raw.items.map(normalizedItem);
  if (items.some(item => item == null)) return { error: "快照包含无效信号项。" };
  return { snapshot: { version: 1, generatedAt: raw.generatedAt, source: "local-engine", universe, items: items as SignalItem[], disclaimer } };
}

async function saveSnapshot(snapshot: Snapshot, env: Env, source: string): Promise<void> {
  const serialized = JSON.stringify(snapshot);
  await env.SNAPSHOT_CACHE.put(CACHE_KEY, serialized, { expirationTtl: ONE_DAY_SECONDS * 8 });
  await env.DB.prepare("INSERT INTO snapshots (generated_at, source, payload) VALUES (?, ?, ?)").bind(snapshot.generatedAt, source, serialized).run();
  await env.DB.prepare("INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind("last_snapshot_at", snapshot.generatedAt).run();
}

async function latestSnapshot(env: Env): Promise<Snapshot> {
  const cached = parseSnapshot(await env.SNAPSHOT_CACHE.get(CACHE_KEY));
  if (cached) return { ...cached, source: "cloud-cache" };
  const row = await env.DB.prepare("SELECT payload FROM snapshots ORDER BY generated_at DESC LIMIT 1").first<{ payload: string }>();
  const databaseSnapshot = parseSnapshot(row?.payload ?? null);
  if (databaseSnapshot) { await env.SNAPSHOT_CACHE.put(CACHE_KEY, JSON.stringify(databaseSnapshot), { expirationTtl: ONE_DAY_SECONDS * 8 }); return { ...databaseSnapshot, source: "cloud-archive" }; }
  const seeded = demoSnapshot(); await saveSnapshot(seeded, env, "seed"); return seeded;
}

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type SampleMetadata = { dataPolicy: "closed_candles_only"; providerMaxCandles: number; requestedCandles: number; returnedCandles: number; startTime: string; endTime: string; fetchedAt: string; excludedCurrentCandle: true; gapCount: number; continuous: boolean };
type CandlePayload = { instrument: AssetDescriptor; interval: string; source: string; volumeAvailable: true; cachedAt: string; sample: SampleMetadata; candles: Candle[] };
type KrakenPayload = { error?: unknown; result?: Record<string, unknown> };

const KRAKEN_PAIRS: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD", BNBUSDT: "BNBUSD", XRPUSDT: "XRPUSD", ADAUSDT: "ADAUSD", DOGEUSDT: "DOGEUSD", AVAXUSDT: "AVAXUSD", LINKUSDT: "LINKUSD", DOTUSDT: "DOTUSD" };
const KRAKEN_INTERVALS: Record<string, string> = { "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "1440", "1w": "10080", "1M": "21600" };
const INTERVAL_LABELS: Record<string, string> = { "1m": "1 分钟", "5m": "5 分钟", "15m": "15 分钟", "30m": "30 分钟", "1h": "1 小时", "4h": "4 小时", "1d": "日线", "1w": "周线", "1M": "月线" };

function candleCacheKey(symbol: string, interval: string): string {
  return `quantwatch:candles:v3:${symbol}:${interval}`;
}
const ASSET_DIRECTORY_CACHE_KEY = "quantwatch:asset-directory:v1"; const DIRECTORY_CACHE_TTL_SECONDS = ONE_DAY_SECONDS;


const INTERVAL_SECONDS: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "30m": 1_800, "1h": 3_600, "4h": 14_400, "1d": 86_400, "1w": 604_800, "1M": 0 };
function countGaps(candles: Candle[], interval: string): number {
  const expected = INTERVAL_SECONDS[interval];
  if (!expected || candles.length < 2) return 0;
  return candles.slice(1).reduce((count, candle, index) => count + (candle.time - candles[index].time > expected * 1.5 ? 1 : 0), 0);
}

function parseKrakenCandles(payload: unknown): Candle[] {
  if (!payload || typeof payload !== "object") return [];
  const result = (payload as KrakenPayload).result;
  if (!result || typeof result !== "object") return [];
  const rows = Object.entries(result).find(([key, value]) => key !== "last" && Array.isArray(value))?.[1];
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    if (!Array.isArray(row) || row.length < 7) return null;
    const [timestamp, open, high, low, close, _vwap, volume] = row;
    const values = [Number(timestamp), Number(open), Number(high), Number(low), Number(close), Number(volume)];
    if (!values.every(Number.isFinite)) return null;
    return { time: values[0], open: values[1], high: values[2], low: values[3], close: values[4], volume: values[5] };
  }).filter((row): row is Candle => row != null).sort((a, b) => a.time - b.time);
}

function aggregateMonthly(candles: Candle[]): Candle[] {
  const buckets = new Map<number, Candle[]>();
  for (const candle of candles) {
    const date = new Date(candle.time * 1000);
    const time = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
    const values = buckets.get(time) ?? [];
    values.push(candle);
    buckets.set(time, values);
  }
  return [...buckets.entries()].sort(([left], [right]) => left - right).map(([time, values]) => ({ time, open: values[0].open, high: Math.max(...values.map(value => value.high)), low: Math.min(...values.map(value => value.low)), close: values.at(-1)?.close ?? values[0].close, volume: values.reduce((sum, value) => sum + value.volume, 0) }));
}

async function cryptoCandles(request: Request, env: Env, symbol: string, interval: string, limit: number): Promise<Response> {
  const staticAsset = ASSETS.find(candidate => candidate.id === symbol && candidate.assetClass === "crypto");
  const dynamicPair = symbol.startsWith("KRAKEN:") ? symbol.slice("KRAKEN:".length) : "";
  const asset = staticAsset ?? (dynamicPair && /^[A-Z0-9]+$/.test(dynamicPair) ? { id: symbol, symbol: dynamicPair, name: `${dynamicPair} · Kraken`, assetClass: "crypto" as const, provider: "Kraken OHLC（云端缓存）", availability: "public" as const } : null);
  if (!asset) return noStoreJson({ error: "asset_not_available", message: "该标的当前没有可用的公开加密数据。" }, request, env, 400);
  if (!SUPPORTED_INTERVALS.has(interval)) return noStoreJson({ error: "interval_not_supported", supported: [...SUPPORTED_INTERVALS], message: "当前公开数据源提供分钟、小时、日、周与月线；秒K需接入逐笔成交数据源。" }, request, env, 400);
  const key = candleCacheKey(symbol, interval);
  const cached = await env.SNAPSHOT_CACHE.get(key);
  if (cached) {
    try { return noStoreJson(JSON.parse(cached), request, env, 200); } catch { await env.SNAPSHOT_CACHE.delete(key); }
  }
  try {
    const count = Math.min(Math.max(limit, 60), 719);
    const pair = dynamicPair || KRAKEN_PAIRS[symbol];
    const krakenInterval = KRAKEN_INTERVALS[interval];
    if (!pair || !krakenInterval) return noStoreJson({ error: "asset_not_available", message: "该标的没有可用的 Kraken 数据映射。" }, request, env, 400);
    const endpoint = new URL("https://api.kraken.com/0/public/OHLC");
    endpoint.searchParams.set("pair", pair);
    endpoint.searchParams.set("interval", krakenInterval);
    const upstream = await fetch(endpoint.toString(), { headers: { Accept: "application/json" }, cf: { cacheTtl: CANDLE_CACHE_TTL_SECONDS, cacheEverything: true } });
    if (!upstream.ok) return noStoreJson({ error: "upstream_unavailable", message: `公开数据源返回 HTTP ${upstream.status}，请稍后重试。` }, request, env, 502);
    const parsed = parseKrakenCandles(await upstream.json());
    /* Kraken documents its final OHLC row as the active, not-yet-committed period. It is excluded from every research response. */
    const committed = parsed.slice(0, -1);
    const candles = committed.slice(-count);
    const minimumCandles = interval === "1M" ? 12 : interval === "1w" ? 20 : 60;
    if (candles.length < minimumCandles) return noStoreJson({ error: "insufficient_candles", message: `公开数据源返回 ${candles.length} 根已收盘 K 线，少于 ${INTERVAL_LABELS[interval]} 所需的最低样本量 ${minimumCandles}。` }, request, env, 502);
    const fetchedAt = new Date().toISOString(); const gapCount = countGaps(candles, interval);
    const sample: SampleMetadata = { dataPolicy: "closed_candles_only", providerMaxCandles: 720, requestedCandles: count, returnedCandles: candles.length, startTime: new Date(candles[0].time * 1000).toISOString(), endTime: new Date(candles.at(-1)!.time * 1000).toISOString(), fetchedAt, excludedCurrentCandle: true, gapCount, continuous: gapCount === 0 };
    const response: CandlePayload = { instrument: asset, interval, source: `Kraken OHLC · ${INTERVAL_LABELS[interval]} · 仅已收盘K线（5 分钟 Cloudflare 缓存）`, volumeAvailable: true, cachedAt: fetchedAt, sample, candles };
    await env.SNAPSHOT_CACHE.put(key, JSON.stringify(response), { expirationTtl: CANDLE_CACHE_TTL_SECONDS });
    return noStoreJson(response, request, env, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_upstream_error";
    return noStoreJson({ error: "upstream_unavailable", message: `公开数据源暂不可用：${message}` }, request, env, 502);
  }
}

async function publicAssetDirectory(request: Request, env: Env): Promise<Response> {
  const cached = await env.SNAPSHOT_CACHE.get(ASSET_DIRECTORY_CACHE_KEY);
  if (cached) { try { return json(JSON.parse(cached), request, env); } catch { await env.SNAPSHOT_CACHE.delete(ASSET_DIRECTORY_CACHE_KEY); } }
  try {
    const upstream = await fetch("https://api.kraken.com/0/public/AssetPairs?assetVersion=1", { headers: { Accept: "application/json" }, cf: { cacheTtl: DIRECTORY_CACHE_TTL_SECONDS, cacheEverything: true } });
    const payload = await upstream.json() as { result?: Record<string, { altname?: string; wsname?: string; base?: string; quote?: string; status?: string }> };
    const crypto = Object.values(payload.result ?? {}).filter(pair => pair.status === "online" && pair.quote === "USD" && pair.altname && pair.wsname).map(pair => ({ id: `KRAKEN:${pair.altname}`, symbol: pair.wsname!, name: `${pair.base} / USD`, assetClass: "crypto" as const, provider: "Kraken 公开 OHLC · 分钟至月线", availability: "public" as const })).sort((a, b) => a.symbol.localeCompare(b.symbol)).slice(0, 400);
    const directory = { generatedAt: new Date().toISOString(), assets: [...crypto, ...ASSETS.filter(asset => asset.assetClass !== "crypto")] };
    await env.SNAPSHOT_CACHE.put(ASSET_DIRECTORY_CACHE_KEY, JSON.stringify(directory), { expirationTtl: DIRECTORY_CACHE_TTL_SECONDS });
    return json(directory, request, env);
  } catch { return json({ generatedAt: new Date().toISOString(), assets: ASSETS }, request, env); }
}

type YahooPayload = { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> } }> } };
function parseYahooCandles(payload: YahooPayload): Candle[] { const result = payload.chart?.result?.[0]; const quote = result?.indicators?.quote?.[0]; if (!result?.timestamp || !quote?.open || !quote.high || !quote.low || !quote.close) return []; return result.timestamp.map((time, i) => ({ time, open: Number(quote.open?.[i]), high: Number(quote.high?.[i]), low: Number(quote.low?.[i]), close: Number(quote.close?.[i]), volume: Number(quote.volume?.[i] ?? 0) })).filter(candle => [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)); }
async function yahooCandles(request: Request, env: Env, asset: AssetDescriptor, interval: string, limit: number): Promise<Response> { if (!new Set(["1d", "1w", "1M"]).has(interval)) return noStoreJson({ error: "interval_not_supported", supported: ["1d", "1w", "1M"], message: "免费股票与 ETF 研究数据当前提供日线、周线和月线；分钟线需使用专业数据源。" }, request, env, 400); const key = candleCacheKey(asset.id, interval); const cached = await env.SNAPSHOT_CACHE.get(key); if (cached) { try { return noStoreJson(JSON.parse(cached), request, env, 200); } catch { await env.SNAPSHOT_CACHE.delete(key); } } const yahooInterval = interval === "1w" ? "1wk" : interval === "1M" ? "1mo" : "1d"; const endpoint = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.symbol)}`); endpoint.searchParams.set("range", interval === "1d" ? "10y" : "max"); endpoint.searchParams.set("interval", yahooInterval); endpoint.searchParams.set("events", "history"); const upstream = await fetch(endpoint.toString(), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 QuantWatchResearch/1.0" }, cf: { cacheTtl: CANDLE_CACHE_TTL_SECONDS, cacheEverything: true } }); if (!upstream.ok) return noStoreJson({ error: "upstream_unavailable", message: `免费日线数据源返回 HTTP ${upstream.status}。` }, request, env, 502); const candles = parseYahooCandles(await upstream.json() as YahooPayload).slice(0, -1).slice(-Math.min(Math.max(limit, 60), 2000)); if (candles.length < 60) return noStoreJson({ error: "insufficient_candles", message: "免费日线数据样本不足 60 根。" }, request, env, 502); const fetchedAt = new Date().toISOString(); const gapCount = countGaps(candles, interval); const sample: SampleMetadata = { dataPolicy: "closed_candles_only", providerMaxCandles: 0, requestedCandles: limit, returnedCandles: candles.length, startTime: new Date(candles[0].time * 1000).toISOString(), endTime: new Date(candles.at(-1)!.time * 1000).toISOString(), fetchedAt, excludedCurrentCandle: true, gapCount, continuous: gapCount === 0 }; const response: CandlePayload = { instrument: asset, interval, source: `Yahoo Finance 公开${INTERVAL_LABELS[interval]}研究数据 · 仅已收盘K线（5 分钟 Cloudflare 缓存）`, volumeAvailable: true, cachedAt: fetchedAt, sample, candles }; await env.SNAPSHOT_CACHE.put(key, JSON.stringify(response), { expirationTtl: CANDLE_CACHE_TTL_SECONDS }); return noStoreJson(response, request, env, 200); }
async function publicCandles(request: Request, env: Env, symbol: string, interval: string, limit: number): Promise<Response> { const asset = ASSETS.find(candidate => candidate.id === symbol); return asset && asset.assetClass !== "crypto" ? yahooCandles(request, env, asset, interval, limit) : cryptoCandles(request, env, symbol, interval, limit); }

async function proxyWebsite(request: Request, url: URL): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const upstream = new URL(`${SITE_BASE_PATH}${url.pathname === "/" ? "/" : url.pathname}`, SITE_ORIGIN);
  upstream.search = url.search;
  const response = await fetch(upstream.toString(), { method: request.method, headers: { Accept: request.headers.get("Accept") ?? "*/*", "Accept-Language": request.headers.get("Accept-Language") ?? "zh-CN" } });
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

async function syncSnapshot(request: Request, env: Env): Promise<Response> {
  if (!env.SYNC_TOKEN) return noStoreJson({ error: "sync_unconfigured", message: "云端尚未配置同步密钥。" }, request, env, 503);
  if (request.headers.get("Authorization") !== `Bearer ${env.SYNC_TOKEN}`) return noStoreJson({ error: "unauthorized" }, request, env, 401);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_BODY_BYTES) return noStoreJson({ error: "payload_too_large", maxBytes: MAX_SYNC_BODY_BYTES }, request, env, 413);
  const body = await request.text();
  if (body.length > MAX_SYNC_BODY_BYTES) return noStoreJson({ error: "payload_too_large", maxBytes: MAX_SYNC_BODY_BYTES }, request, env, 413);
  let incoming: unknown;
  try { incoming = JSON.parse(body); } catch { return noStoreJson({ error: "invalid_json" }, request, env, 400); }
  const normalized = normalizeIncomingSnapshot(incoming);
  if ("error" in normalized) return noStoreJson({ error: "invalid_snapshot", message: normalized.error }, request, env, 400);
  const prior = await env.DB.prepare("SELECT value FROM runtime_state WHERE key = ?").bind("last_local_sync_generated_at").first<{ value: string }>();
  if (prior?.value && Date.parse(normalized.snapshot.generatedAt) < Date.parse(prior.value)) return noStoreJson({ error: "stale_snapshot", lastAcceptedAt: prior.value }, request, env, 409);
  await saveSnapshot(normalized.snapshot, env, "local-engine");
  await env.DB.prepare("INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind("last_local_sync_generated_at", normalized.snapshot.generatedAt).run();
  return noStoreJson({ status: "accepted", generatedAt: normalized.snapshot.generatedAt, itemCount: normalized.snapshot.items.length, source: "local-engine" }, request, env, 202);
}

async function scheduledRefresh(env: Env): Promise<void> {
  const existing = parseSnapshot(await env.SNAPSHOT_CACHE.get(CACHE_KEY)); const snapshot = existing ?? demoSnapshot();
  if (!existing) await saveSnapshot(snapshot, env, "seed");
  await env.ARCHIVE.put(`snapshots/${snapshot.generatedAt.slice(0, 10)}/latest.json`, JSON.stringify(snapshot), { httpMetadata: { contentType: "application/json; charset=utf-8" }, customMetadata: { generatedAt: snapshot.generatedAt, source: snapshot.source } });
  await env.DB.prepare("INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind("last_cron_at", new Date().toISOString()).run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    try {
      if (!url.pathname.startsWith("/api")) return proxyWebsite(request, url);
      if (request.method === "GET") {
        if (url.pathname === "/api") return json({ name: env.APP_NAME, status: "ok", endpoints: ["/api/health", "/api/snapshot", "POST /api/snapshot", "/api/quotes", "/api/assets", "/api/candles?symbol=BTCUSDT&interval=4h&limit=350"], candleIntervals: [...SUPPORTED_INTERVALS], candleIntervalLabels: INTERVAL_LABELS, secondCandles: { available: false, message: "秒K需要逐笔成交数据或持久化实时数据流，当前公开 REST 数据源不提供可靠历史秒K。" } }, request, env);
        if (url.pathname === "/api/snapshot") return json(await latestSnapshot(env), request, env);
        if (url.pathname === "/api/quotes") { const snapshot = await latestSnapshot(env); return json({ generatedAt: snapshot.generatedAt, source: snapshot.source, quotes: snapshot.items.map(({ ticker, name, price, changePct, updatedAt }) => ({ ticker, name, price, changePct, updatedAt })) }, request, env); }
        if (url.pathname === "/api/assets") return publicAssetDirectory(request, env);
        if (url.pathname === "/api/candles") return publicCandles(request, env, url.searchParams.get("symbol")?.toUpperCase() ?? "", url.searchParams.get("interval") ?? "4h", Number(url.searchParams.get("limit") ?? 350));
        if (url.pathname === "/api/health") { const runtime = await env.DB.prepare("SELECT value, updated_at FROM runtime_state WHERE key = ?").bind("last_cron_at").first<{ value: string; updated_at: string }>(); const sync = await env.DB.prepare("SELECT value, updated_at FROM runtime_state WHERE key = ?").bind("last_local_sync_generated_at").first<{ value: string; updated_at: string }>(); const snapshot = await latestSnapshot(env); return json({ status: "ok", app: env.APP_NAME, generatedAt: snapshot.generatedAt, source: snapshot.source, cron: runtime ?? null, sync: { configured: Boolean(env.SYNC_TOKEN), lastAccepted: sync ?? null } }, request, env); }
        return noStoreJson({ error: "not_found" }, request, env, 404);
      }
      if (request.method === "POST" && url.pathname === "/api/snapshot") return syncSnapshot(request, env);
      return noStoreJson({ error: "method_not_allowed" }, request, env, 405);
    } catch (error) { const message = error instanceof Error ? error.message : "unexpected_error"; return noStoreJson({ error: "service_unavailable", message }, request, env, 503); }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> { ctx.waitUntil(scheduledRefresh(env)); }
} satisfies ExportedHandler<Env>;
