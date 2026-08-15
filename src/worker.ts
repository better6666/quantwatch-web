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

export interface Env {
  DB: D1Database;
  SNAPSHOT_CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
  ALLOWED_ORIGIN: string;
  APP_NAME: string;
}

const CACHE_KEY = "quantwatch:latest-snapshot:v1";
const ONE_DAY_SECONDS = 86_400;

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
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
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
  try {
    const value = JSON.parse(raw) as Partial<Snapshot>;
    if (value.version === 1 && Array.isArray(value.items) && typeof value.generatedAt === "string") return value as Snapshot;
  } catch {
    return null;
  }
  return null;
}

async function saveSnapshot(snapshot: Snapshot, env: Env, source: string): Promise<void> {
  const serialized = JSON.stringify(snapshot);
  await env.SNAPSHOT_CACHE.put(CACHE_KEY, serialized, { expirationTtl: ONE_DAY_SECONDS * 8 });
  await env.DB.prepare("INSERT INTO snapshots (generated_at, source, payload) VALUES (?, ?, ?)")
    .bind(snapshot.generatedAt, source, serialized)
    .run();
  await env.DB.prepare("INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
    .bind("last_snapshot_at", snapshot.generatedAt)
    .run();
}

async function latestSnapshot(env: Env): Promise<Snapshot> {
  const cached = parseSnapshot(await env.SNAPSHOT_CACHE.get(CACHE_KEY));
  if (cached) return { ...cached, source: "cloud-cache" };

  const row = await env.DB.prepare("SELECT payload FROM snapshots ORDER BY generated_at DESC LIMIT 1").first<{ payload: string }>();
  const databaseSnapshot = parseSnapshot(row?.payload ?? null);
  if (databaseSnapshot) {
    await env.SNAPSHOT_CACHE.put(CACHE_KEY, JSON.stringify(databaseSnapshot), { expirationTtl: ONE_DAY_SECONDS * 8 });
    return { ...databaseSnapshot, source: "cloud-archive" };
  }

  return demoSnapshot();
}

async function scheduledRefresh(env: Env): Promise<void> {
  const existing = parseSnapshot(await env.SNAPSHOT_CACHE.get(CACHE_KEY));
  const snapshot = existing ?? demoSnapshot();
  const archiveKey = `snapshots/${snapshot.generatedAt.slice(0, 10)}/latest.json`;

  if (!existing) await saveSnapshot(snapshot, env, "seed");
  await env.ARCHIVE.put(archiveKey, JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { generatedAt: snapshot.generatedAt, source: snapshot.source }
  });
  await env.DB.prepare("INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
    .bind("last_cron_at", new Date().toISOString())
    .run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, request, env, { status: 405 });

    try {
      if (url.pathname === "/" || url.pathname === "/api") {
        return json({ name: env.APP_NAME, status: "ok", endpoints: ["/api/health", "/api/snapshot", "/api/quotes"] }, request, env);
      }

      if (url.pathname === "/api/snapshot") return json(await latestSnapshot(env), request, env);

      if (url.pathname === "/api/quotes") {
        const snapshot = await latestSnapshot(env);
        return json({ generatedAt: snapshot.generatedAt, source: snapshot.source, quotes: snapshot.items.map(({ ticker, name, price, changePct, updatedAt }) => ({ ticker, name, price, changePct, updatedAt })) }, request, env);
      }

      if (url.pathname === "/api/health") {
        const state = await env.DB.prepare("SELECT value, updated_at FROM runtime_state WHERE key = ?").bind("last_cron_at").first<{ value: string; updated_at: string }>();
        const snapshot = await latestSnapshot(env);
        return json({ status: "ok", app: env.APP_NAME, generatedAt: snapshot.generatedAt, source: snapshot.source, cron: state ?? null }, request, env);
      }

      return json({ error: "not_found" }, request, env, { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unexpected_error";
      return json({ error: "service_unavailable", message }, request, env, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(scheduledRefresh(env));
  }
} satisfies ExportedHandler<Env>;
