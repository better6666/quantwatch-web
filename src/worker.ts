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
const SUPPORTED_INTERVALS = new Set(["1h", "4h", "1d"]);
const MAX_SYNC_BODY_BYTES = 256_000;
const MAX_SYNC_ITEMS = 500;
const makeAssets = (entries: ReadonlyArray<readonly [string, string, string]>, assetClass: AssetDescriptor["assetClass"], provider: string, availability: AssetDescriptor["availability"]): AssetDescriptor[] =>
  entries.map(([id, symbol, name]) => ({ id, symbol, name, assetClass, provider, availability }));

const ASSETS: AssetDescriptor[] = [
  ...makeAssets([["BTCUSDT", "BTC/USDT", "Bitcoin"], ["ETHUSDT", "ETH/USDT", "Ethereum"], ["SOLUSDT", "SOL/USDT", "Solana"], ["BNBUSDT", "BNB/USDT", "BNB"], ["XRPUSDT", "XRP/USDT", "XRP"], ["ADAUSDT", "ADA/USDT", "Cardano"], ["DOGEUSDT", "DOGE/USDT", "Dogecoin"], ["AVAXUSDT", "AVAX/USDT", "Avalanche"], ["LINKUSDT", "LINK/USDT", "Chainlink"], ["DOTUSDT", "DOT/USDT", "Polkadot"]], "crypto", "CoinGecko OHLC", "public"),
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

async function cryptoCandles(request: Request, env: Env, symbol: string, interval: string, _limit: number): Promise<Response> {
  const asset = ASSETS.find(candidate => candidate.id === symbol && candidate.availability === "public");
  if (!asset) return noStoreJson({ error: "asset_not_available", message: "该标的当前未配置公开数据源。" }, request, env, 400);
  if (!SUPPORTED_INTERVALS.has(interval)) return noStoreJson({ error: "interval_not_supported", supported: [...SUPPORTED_INTERVALS] }, request, env, 400);
  return noStoreJson({ error: "keyless_cloud_proxy_unavailable", message: "公开交易所上游拒绝 Cloudflare Worker 出口。请在浏览器端直接读取公开加密K线，或导入已获授权的真实CSV数据。", instrument: asset }, request, env, 503);
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
      if (request.method === "GET") {
        if (url.pathname === "/" || url.pathname === "/api") return json({ name: env.APP_NAME, status: "ok", endpoints: ["/api/health", "/api/snapshot", "POST /api/snapshot", "/api/quotes", "/api/assets", "/api/candles?symbol=BTCUSDT&interval=4h&limit=350"] }, request, env);
        if (url.pathname === "/api/snapshot") return json(await latestSnapshot(env), request, env);
        if (url.pathname === "/api/quotes") { const snapshot = await latestSnapshot(env); return json({ generatedAt: snapshot.generatedAt, source: snapshot.source, quotes: snapshot.items.map(({ ticker, name, price, changePct, updatedAt }) => ({ ticker, name, price, changePct, updatedAt })) }, request, env); }
        if (url.pathname === "/api/assets") return json({ generatedAt: new Date().toISOString(), assets: ASSETS }, request, env);
        if (url.pathname === "/api/candles") return cryptoCandles(request, env, url.searchParams.get("symbol")?.toUpperCase() ?? "", url.searchParams.get("interval") ?? "4h", Number(url.searchParams.get("limit") ?? 350));
        if (url.pathname === "/api/health") { const runtime = await env.DB.prepare("SELECT value, updated_at FROM runtime_state WHERE key = ?").bind("last_cron_at").first<{ value: string; updated_at: string }>(); const sync = await env.DB.prepare("SELECT value, updated_at FROM runtime_state WHERE key = ?").bind("last_local_sync_generated_at").first<{ value: string; updated_at: string }>(); const snapshot = await latestSnapshot(env); return json({ status: "ok", app: env.APP_NAME, generatedAt: snapshot.generatedAt, source: snapshot.source, cron: runtime ?? null, sync: { configured: Boolean(env.SYNC_TOKEN), lastAccepted: sync ?? null } }, request, env); }
        return noStoreJson({ error: "not_found" }, request, env, 404);
      }
      if (request.method === "POST" && url.pathname === "/api/snapshot") return syncSnapshot(request, env);
      return noStoreJson({ error: "method_not_allowed" }, request, env, 405);
    } catch (error) { const message = error instanceof Error ? error.message : "unexpected_error"; return noStoreJson({ error: "service_unavailable", message }, request, env, 503); }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> { ctx.waitUntil(scheduledRefresh(env)); }
} satisfies ExportedHandler<Env>;
