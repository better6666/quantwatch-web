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
  source: "cloud-seed" | "cloud-cache" | "cloud-archive";
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

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Env {
  DB: D1Database;
  SNAPSHOT_CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
  ALLOWED_ORIGIN: string;
  APP_NAME: string;
}

const CACHE_KEY = "quantwatch:latest-snapshot:v1";
const ONE_DAY_SECONDS = 86_400;
const CANDLE_CACHE_SECONDS = 60;
const SUPPORTED_INTERVALS = new Set(["1h", "4h", "1d"]);
const makeAssets = (entries: ReadonlyArray<readonly [string, string, string]>, assetClass: AssetDescriptor["assetClass"], provider: string, availability: AssetDescriptor["availability"]): AssetDescriptor[] =>
  entries.map(([id, symbol, name]) => ({ id, symbol, name, assetClass, provider, availability }));

const ASSETS: AssetDescriptor[] = [
  ...makeAssets([["BTCUSDT", "BTC/USDT", "Bitcoin"], ["ETHUSDT", "ETH/USDT", "Ethereum"], ["SOLUSDT", "SOL/USDT", "Solana"], ["BNBUSDT", "BNB/USDT", "BNB"], ["XRPUSDT", "XRP/USDT", "XRP"], ["ADAUSDT", "ADA/USDT", "Cardano"], ["DOGEUSDT", "DOGE/USDT", "Dogecoin"], ["AVAXUSDT", "AVAX/USDT", "Avalanche"], ["LINKUSDT", "LINK/USDT", "Chainlink"], ["DOTUSDT", "DOT/USDT", "Polkadot"]], "crypto", "Binance Spot", "public"),
  ...makeAssets([["AAPL", "AAPL", "Apple"], ["MSFT", "MSFT", "Microsoft"], ["NVDA", "NVDA", "NVIDIA"]], "stock", "授权数据源待配置", "requires_authorized_provider"),
  ...makeAssets([["SPY", "SPY", "SPDR S&P 500 ETF"], ["QQQ", "QQQ", "Invesco QQQ ETF"], ["GLD", "GLD", "SPDR Gold Shares"]], "etf", "授权数据源待配置", "requires_authorized_provider")
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
  const allowed = new Set([env.ALLOWED_ORIGIN, "http://127.0.0.1:8787", "http://localhost:8787"]);
  return origin && allowed.has(origin) ? origin : env.ALLOWED_ORIGIN;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  return { "Access-Control-Allow-Origin": allowedOrigin(request, env), "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}

function json(data: unknown, request: Request, env: Env, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=60, s-maxage=300");
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(JSON.stringify(data), { ...init, headers });
}

function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try { const value = JSON.parse(raw) as Partial<Snapshot>; return value.version === 1 && Array.isArray(value.items) && typeof value.generatedAt === "string" ? value as Snapshot : null; } catch { return null; }
}

async function saveSnapshot(snapshot: Snapshot, env: Env, source: string): Promise<void> {
  const serialized = JSON.stringify(snapshot);
  await env.SNAPSHOT_CACHE.put(CACHE_KEY, serialized, { expirationTtl: ONE_DAY_SECONDS * 8 });
  await env.DB.prepare("INSERT INTO snapshots (generated_at, source, payload) VALUES (?, ?, ?)").bind(snapshot.generatedAt, source, serialized).run();
  await env.DB.prepare("INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind("last_snapshot_at", snapshot.generatedAt).run();
}

async function latestSnapshot(env: Env): Promise<Snapshot> {
  const cached = parseSnapshot(await env.SNAPSHOT_CACHE.get(CACHE_KEY));
  if (cached) return { ...cached, source: "cloud-cache" };
  const row = await env.DB.prepare("SELECT payload FROM snapshots ORDER BY generated_at DESC LIMIT 1").first<{ payload: string }>();
  const databaseSnapshot = parseSnapshot(row?.payload ?? null);
  if (databaseSnapshot) { await env.SNAPSHOT_CACHE.put(CACHE_KEY, JSON.stringify(databaseSnapshot), { expirationTtl: ONE_DAY_SECONDS * 8 }); return { ...databaseSnapshot, source: "cloud-archive" }; }
  const seeded = demoSnapshot(); await saveSnapshot(seeded, env, "seed"); return seeded;
}

function normalizeBinanceKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) throw new Error("upstream_payload_invalid");
  return raw.map((row) => {
    if (!Array.isArray(row) || row.length < 6) throw new Error("upstream_candle_invalid");
    return { time: Math.floor(Number(row[0]) / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) };
  });
}

async function cryptoCandles(request: Request, env: Env, symbol: string, interval: string, limit: number): Promise<Response> {
  const asset = ASSETS.find((candidate) => candidate.id === symbol && candidate.availability === "public");
  if (!asset) return json({ error: "asset_not_available", message: "该标的当前未配置公开数据源。" }, request, env, { status: 400 });
  if (!SUPPORTED_INTERVALS.has(interval)) return json({ error: "interval_not_supported", supported: [...SUPPORTED_INTERVALS] }, request, env, { status: 400 });
  const boundedLimit = Math.max(60, Math.min(limit || 350, 500));
  const cacheUrl = new URL(request.url); cacheUrl.searchParams.set("limit", String(boundedLimit));
  const cache = await caches.open("quantwatch-market-cache");
  const cached = await cache.match(cacheUrl);
  if (cached) return cached;
  const upstream = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${boundedLimit}`, { cf: { cacheTtl: CANDLE_CACHE_SECONDS, cacheEverything: true } });
  if (!upstream.ok) return json({ error: "upstream_unavailable", status: upstream.status }, request, env, { status: 502, headers: { "Cache-Control": "no-store" } });
  const candles = normalizeBinanceKlines(await upstream.json());
  const response = json({ instrument: asset, interval, dataMode: "public-realtime", source: "Binance Spot", generatedAt: new Date().toISOString(), candles }, request, env, { headers: { "Cache-Control": `public, max-age=${CANDLE_CACHE_SECONDS}, s-maxage=${CANDLE_CACHE_SECONDS}` } });
  await cache.put(cacheUrl, response.clone());
  return response;
}

async function scheduledRefresh(env: Env): Promise<void> {
  const existing = parseSnapshot(await env.SNAPSHOT_CACHE.get(CACHE_KEY)); const snapshot = existing ?? demoSnapshot();
  if (!existing) await saveSnapshot(snapshot, env, "seed");
  await env.ARCHIVE.put(`snapshots/${snapshot.generatedAt.slice(0, 10)}/latest.json`, JSON.stringify(snapshot), { httpMetadata: { contentType: "application/json; charset=utf-8" }, customMetadata: { generatedAt: snapshot.generatedAt, source: snapshot.source } });
  await env.DB.prepare("INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind("last_cron_at", new Date().toISOString()).run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, request, env, { status: 405 });
    try {
      if (url.pathname === "/" || url.pathname === "/api") return json({ name: env.APP_NAME, status: "ok", endpoints: ["/api/health", "/api/snapshot", "/api/quotes", "/api/assets", "/api/candles?symbol=BTCUSDT&interval=4h&limit=350"] }, request, env);
      if (url.pathname === "/api/snapshot") return json(await latestSnapshot(env), request, env);
      if (url.pathname === "/api/quotes") { const snapshot = await latestSnapshot(env); return json({ generatedAt: snapshot.generatedAt, source: snapshot.source, quotes: snapshot.items.map(({ ticker, name, price, changePct, updatedAt }) => ({ ticker, name, price, changePct, updatedAt })) }, request, env); }
      if (url.pathname === "/api/assets") return json({ generatedAt: new Date().toISOString(), assets: ASSETS }, request, env);
      if (url.pathname === "/api/candles") return cryptoCandles(request, env, url.searchParams.get("symbol")?.toUpperCase() ?? "", url.searchParams.get("interval") ?? "4h", Number(url.searchParams.get("limit") ?? 350));
      if (url.pathname === "/api/health") { const runtime = await env.DB.prepare("SELECT value, updated_at FROM runtime_state WHERE key = ?").bind("last_cron_at").first<{ value: string; updated_at: string }>(); const snapshot = await latestSnapshot(env); return json({ status: "ok", app: env.APP_NAME, generatedAt: snapshot.generatedAt, source: snapshot.source, cron: runtime ?? null }, request, env); }
      return json({ error: "not_found" }, request, env, { status: 404 });
    } catch (error) { const message = error instanceof Error ? error.message : "unexpected_error"; return json({ error: "service_unavailable", message }, request, env, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> { ctx.waitUntil(scheduledRefresh(env)); }
} satisfies ExportedHandler<Env>;
