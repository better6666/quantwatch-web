/* QuantWatch Research Terminal v2 — browser-side charting, watchlists and real-data scans. */
const API_BASE = 'https://quantwatch-api.2333333434.workers.dev';
const WATCHLIST_KEY = 'quantwatch:watchlist:v1';
const PUBLIC_SCAN_LIMIT = 240;

const ASSETS = [
  { id: 'BTCUSDT', symbol: 'BTC/USDT', name: 'Bitcoin', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'ETHUSDT', symbol: 'ETH/USDT', name: 'Ethereum', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'SOLUSDT', symbol: 'SOL/USDT', name: 'Solana', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'BNBUSDT', symbol: 'BNB/USDT', name: 'BNB', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'XRPUSDT', symbol: 'XRP/USDT', name: 'XRP', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'ADAUSDT', symbol: 'ADA/USDT', name: 'Cardano', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'DOGEUSDT', symbol: 'DOGE/USDT', name: 'Dogecoin', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'AVAXUSDT', symbol: 'AVAX/USDT', name: 'Avalanche', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'LINKUSDT', symbol: 'LINK/USDT', name: 'Chainlink', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'DOTUSDT', symbol: 'DOT/USDT', name: 'Polkadot', type: '加密资产', source: 'Kraken OHLC · Cloudflare 缓存', mode: 'public-realtime' },
  { id: 'AAPL', symbol: 'AAPL', name: 'Apple', type: '股票', source: '待接入授权数据', mode: 'provider-required' },
  { id: 'MSFT', symbol: 'MSFT', name: 'Microsoft', type: '股票', source: '待接入授权数据', mode: 'provider-required' },
  { id: 'NVDA', symbol: 'NVDA', name: 'NVIDIA', type: '股票', source: '待接入授权数据', mode: 'provider-required' },
  { id: 'SPY', symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'ETF', source: '待接入授权数据', mode: 'provider-required' },
  { id: 'QQQ', symbol: 'QQQ', name: 'Invesco QQQ ETF', type: 'ETF', source: '待接入授权数据', mode: 'provider-required' },
  { id: 'GLD', symbol: 'GLD', name: 'SPDR Gold Shares', type: 'ETF', source: '待接入授权数据', mode: 'provider-required' }
];

const STRATEGIES = {
  trend: { name: '均线趋势', family: '趋势跟随', description: 'SMA20 与 SMA50 的相对位置确认趋势方向，并以价格相对快均线的位置过滤。' },
  rsi: { name: 'RSI 均值回归', family: '均值回归', description: 'RSI 低于阈值时寻找超卖反弹，高于阈值时识别超买回落风险。' },
  macd: { name: 'MACD 动量', family: '动量', description: 'MACD 线与信号线的差值、以及柱状图方向用于捕捉动量变化。' },
  bollinger: { name: '布林带回归', family: '均值回归', description: '价格相对布林上下轨的位置用于识别极端波动与回归机会。' },
  breakout: { name: 'Donchian 突破', family: '突破', description: '突破过去 20 根K线区间高低点时生成趋势延续方向。' },
  stochastic: { name: '随机指标反转', family: '均值回归', description: 'Stochastic %K 位于极端区间时识别潜在的短期反转。' },
  volatility: { name: 'ATR 波动率', family: '风控', description: '以 ATR 衡量波动率，并提供基于 2 ATR 的研究止损距离参考。' },
  volume: { name: '成交量确认', family: '确认', description: '成交量相对 20 期均量的放大情况用作趋势或突破的确认条件。' }
};

const readWatchlist = () => { try { const value = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'); return new Set(Array.isArray(value) ? value.filter(id => ASSETS.some(asset => asset.id === id)) : []); } catch { return new Set(); } };
const state = { assetId: 'BTCUSDT', interval: '4h', strategy: 'trend', candles: [], chart: null, activeIndicators: new Set(['sma', 'ema', 'bb', 'volume']), loading: false, localSeries: new Map(), dataMode: 'public-realtime', dataSource: 'Binance Spot', watchlist: readWatchlist(), scanRunning: false };
const $ = (id) => document.getElementById(id);
const assetFor = (id = state.assetId) => ASSETS.find(asset => asset.id === id);
const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const pct = (value) => `${Number(value) >= 0 ? '+' : ''}${fmt(value, 2)}%`;
const latest = (items) => items[items.length - 1];
const sideLabel = (side) => side === 'long' ? '偏多研究' : side === 'short' ? '偏空研究' : '中性观察';

function populateAssets() {
  const groups = ASSETS.reduce((acc, asset) => { (acc[asset.type] ||= []).push(asset); return acc; }, {});
  $('asset').innerHTML = Object.entries(groups).map(([type, assets]) => `<optgroup label="${type}">${assets.map(asset => `<option value="${asset.id}">${asset.symbol} · ${asset.name}${asset.mode !== 'public-realtime' ? '（需数据授权）' : ''}</option>`).join('')}</optgroup>`).join('');
  $('strategy').innerHTML = Object.entries(STRATEGIES).map(([id, strategy]) => `<option value="${id}">${strategy.name} · ${strategy.family}</option>`).join('');
}

function sma(values, period) { return values.map((_, i) => i + 1 < period ? null : values.slice(i - period + 1, i + 1).reduce((sum, value) => sum + value, 0) / period); }
function ema(values, period) { const k = 2 / (period + 1); let previous = values[0]; return values.map((value, i) => { previous = i === 0 ? value : value * k + previous * (1 - k); return i + 1 < period ? null : previous; }); }
function stddev(values, period, mean) { return values.map((_, i) => { if (i + 1 < period || mean[i] == null) return null; const window = values.slice(i - period + 1, i + 1); return Math.sqrt(window.reduce((sum, value) => sum + (value - mean[i]) ** 2, 0) / period); }); }
function rsi(values, period = 14) {
  const out = Array(values.length).fill(null); let gain = 0; let loss = 0;
  for (let i = 1; i < values.length; i++) { const diff = values[i] - values[i - 1]; if (i <= period) { gain += Math.max(diff, 0); loss += Math.max(-diff, 0); if (i === period) { gain /= period; loss /= period; out[i] = 100 - 100 / (1 + gain / (loss || 1e-12)); } } else { gain = (gain * (period - 1) + Math.max(diff, 0)) / period; loss = (loss * (period - 1) + Math.max(-diff, 0)) / period; out[i] = 100 - 100 / (1 + gain / (loss || 1e-12)); } }
  return out;
}
function atr(candles, period = 14) { const trs = candles.map((candle, i) => i === 0 ? candle.high - candle.low : Math.max(candle.high - candle.low, Math.abs(candle.high - candles[i - 1].close), Math.abs(candle.low - candles[i - 1].close))); return ema(trs, period); }
function stochastic(candles, period = 14) { return candles.map((candle, i) => { if (i + 1 < period) return null; const window = candles.slice(i - period + 1, i + 1); const high = Math.max(...window.map(value => value.high)); const low = Math.min(...window.map(value => value.low)); return (candle.close - low) / ((high - low) || 1e-12) * 100; }); }
function calculate(candles) {
  const close = candles.map(candle => candle.close); const volume = candles.map(candle => candle.volume);
  const sma20 = sma(close, 20); const sma50 = sma(close, 50); const ema20 = ema(close, 20); const basis = sma(close, 20); const sd = stddev(close, 20, basis);
  const upper = basis.map((value, i) => value == null ? null : value + 2 * sd[i]); const lower = basis.map((value, i) => value == null ? null : value - 2 * sd[i]);
  const ema12 = ema(close, 12); const ema26 = ema(close, 26); const macdLine = close.map((_, i) => ema12[i] == null || ema26[i] == null ? null : ema12[i] - ema26[i]);
  const compactMacd = macdLine.map(value => value ?? 0); const signalLine = ema(compactMacd, 9); const histogram = macdLine.map((value, i) => value == null || signalLine[i] == null ? null : value - signalLine[i]);
  return { close, volume, sma20, sma50, ema20, upper, lower, rsi: rsi(close), atr: atr(candles), stoch: stochastic(candles), macdLine, signalLine, histogram, volumeSma: sma(volume, 20) };
}

function indicatorData(candles, values) { return candles.map((candle, i) => values[i] == null ? null : ({ time: candle.time, value: values[i] })).filter(Boolean); }
function resetChart() { if (state.chart) { $('chart').innerHTML = ''; state.chart.remove(); state.chart = null; } }
function renderChart(indicators) {
  resetChart();
  const chart = LightweightCharts.createChart($('chart'), { layout: { background: { type: 'solid', color: '#0b1727' }, textColor: '#a9bdd6' }, grid: { vertLines: { color: 'rgba(61,88,124,.25)' }, horzLines: { color: 'rgba(61,88,124,.25)' } }, rightPriceScale: { borderColor: '#263d5c' }, timeScale: { borderColor: '#263d5c', timeVisible: true }, crosshair: { mode: LightweightCharts.CrosshairMode.Normal }, height: 440 });
  const candle = chart.addSeries(LightweightCharts.CandlestickSeries, { upColor: '#fb7185', downColor: '#34d399', borderVisible: false, wickUpColor: '#fb7185', wickDownColor: '#34d399' });
  candle.setData(state.candles.map(candleData => ({ time: candleData.time, open: candleData.open, high: candleData.high, low: candleData.low, close: candleData.close })));
  const volume = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false });
  volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
  volume.setData(state.candles.map(candleData => ({ time: candleData.time, value: candleData.volume, color: candleData.close >= candleData.open ? 'rgba(251,113,133,.35)' : 'rgba(52,211,153,.35)' })));
  if (state.activeIndicators.has('sma')) { const fast = chart.addSeries(LightweightCharts.LineSeries, { color: '#60a5fa', lineWidth: 2, title: 'SMA20' }); fast.setData(indicatorData(state.candles, indicators.sma20)); const slow = chart.addSeries(LightweightCharts.LineSeries, { color: '#a78bfa', lineWidth: 1, title: 'SMA50' }); slow.setData(indicatorData(state.candles, indicators.sma50)); }
  if (state.activeIndicators.has('ema')) { const line = chart.addSeries(LightweightCharts.LineSeries, { color: '#fbbf24', lineWidth: 2, title: 'EMA20' }); line.setData(indicatorData(state.candles, indicators.ema20)); }
  if (state.activeIndicators.has('bb')) { for (const [color, values, title] of [['#64748b', indicators.upper, 'BB Upper'], ['#64748b', indicators.lower, 'BB Lower']]) { const line = chart.addSeries(LightweightCharts.LineSeries, { color, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title }); line.setData(indicatorData(state.candles, values)); } }
  if (!state.activeIndicators.has('volume')) volume.applyOptions({ visible: false });
  chart.timeScale().fitContent(); state.chart = chart; new ResizeObserver(() => chart.applyOptions({ width: $('chart').clientWidth })).observe($('chart'));
}

function signalFor(strategyId, candles, indicators) {
  const i = candles.length - 1; const close = candles[i].close; const previous = candles[i - 1]?.close ?? close;
  const long = (score, evidence) => ({ side: 'long', score, evidence }); const short = (score, evidence) => ({ side: 'short', score, evidence }); const neutral = (evidence) => ({ side: 'neutral', score: 0, evidence });
  if (strategyId === 'trend') return indicators.sma20[i] > indicators.sma50[i] && close > indicators.sma20[i] ? long(0.62, '价格位于 SMA20 之上，且 SMA20 高于 SMA50。') : indicators.sma20[i] < indicators.sma50[i] && close < indicators.sma20[i] ? short(-0.62, '价格位于 SMA20 之下，且 SMA20 低于 SMA50。') : neutral('均线趋势尚未形成一致方向。');
  if (strategyId === 'rsi') return indicators.rsi[i] < 30 ? long(0.55, `RSI 为 ${fmt(indicators.rsi[i], 1)}，处于超卖研究区间。`) : indicators.rsi[i] > 70 ? short(-0.55, `RSI 为 ${fmt(indicators.rsi[i], 1)}，处于超买研究区间。`) : neutral(`RSI 为 ${fmt(indicators.rsi[i], 1)}，未达到极端阈值。`);
  if (strategyId === 'macd') return indicators.histogram[i] > 0 && indicators.histogram[i] > indicators.histogram[i - 1] ? long(0.48, 'MACD 柱状图为正并扩大。') : indicators.histogram[i] < 0 && indicators.histogram[i] < indicators.histogram[i - 1] ? short(-0.48, 'MACD 柱状图为负并扩大。') : neutral('MACD 动量未出现明确加速。');
  if (strategyId === 'bollinger') return close < indicators.lower[i] ? long(0.46, '收盘价低于布林下轨，记录为均值回归研究条件。') : close > indicators.upper[i] ? short(-0.46, '收盘价高于布林上轨，记录为均值回归研究条件。') : neutral('价格处于布林通道内部。');
  if (strategyId === 'breakout') { const prior = candles.slice(-21, -1); const high = Math.max(...prior.map(candle => candle.high)); const low = Math.min(...prior.map(candle => candle.low)); return close > high ? long(0.66, '收盘价突破前 20 根K线最高价。') : close < low ? short(-0.66, '收盘价跌破前 20 根K线最低价。') : neutral('尚未突破 20 期 Donchian 通道。'); }
  if (strategyId === 'stochastic') return indicators.stoch[i] < 20 ? long(0.42, `随机指标为 ${fmt(indicators.stoch[i], 1)}，处于低位。`) : indicators.stoch[i] > 80 ? short(-0.42, `随机指标为 ${fmt(indicators.stoch[i], 1)}，处于高位。`) : neutral('随机指标未处于极端区间。');
  if (strategyId === 'volatility') return Math.abs((close - previous) / previous) > (indicators.atr[i] / close) ? long(0.24, `当前 ATR 为 ${fmt(indicators.atr[i])}；请用 2 ATR 作为研究止损距离参考。`) : neutral(`当前 ATR 为 ${fmt(indicators.atr[i])}，波动尚未显著放大。`);
  return candles[i].volume > indicators.volumeSma[i] * 1.4 ? long(0.28, '成交量高于 20 期均量的 1.4 倍。') : neutral('成交量未显著放大。');
}
function compactBacktest(candles, indicators, strategyId) {
  const close = candles.map(candle => candle.close); let equity = 1; let peak = 1; let maxDD = 0; let position = 0; let trades = 0; let wins = 0; let entry = 0;
  for (let i = 51; i < close.length; i++) { const bullish = strategyId === 'rsi' ? indicators.rsi[i] < 30 : strategyId === 'macd' ? indicators.histogram[i] > 0 : indicators.sma20[i] > indicators.sma50[i]; const bearish = strategyId === 'rsi' ? indicators.rsi[i] > 70 : strategyId === 'macd' ? indicators.histogram[i] < 0 : indicators.sma20[i] < indicators.sma50[i]; const desired = bullish ? 1 : bearish ? -1 : 0; if (position !== desired) { if (position !== 0) { const ret = position * (close[i] / entry - 1); equity *= 1 + ret; trades++; if (ret > 0) wins++; } if (desired !== 0) entry = close[i]; position = desired; } peak = Math.max(peak, equity); maxDD = Math.min(maxDD, equity / peak - 1); }
  return { total: (equity - 1) * 100, maxDD: maxDD * 100, trades, winRate: trades ? wins / trades * 100 : 0 };
}

function saveWatchlist() { localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...state.watchlist])); }
function renderWatchlist() {
  const watched = [...state.watchlist].map(assetFor).filter(Boolean); $('watch-count').textContent = `${watched.length} 个标的`;
  const toggle = $('watch-toggle'); const isWatched = state.watchlist.has(state.assetId); toggle.classList.toggle('active', isWatched); toggle.setAttribute('aria-pressed', String(isWatched)); toggle.textContent = isWatched ? '★ 已加入观察列表' : '☆ 加入观察列表';
  $('watchlist').innerHTML = watched.length ? watched.map(asset => `<button class="watch-item ${asset.id === state.assetId ? 'active' : ''}" data-watch-asset="${asset.id}" type="button"><span><strong>${asset.symbol}</strong><span>${asset.name} · ${asset.type}</span></span><span class="watch-remove" aria-hidden="true">×</span></button>`).join('') : '<p class="empty-state">尚未添加标的。选择资产后可加入观察列表。</p>';
}
function toggleWatchlist() { state.watchlist.has(state.assetId) ? state.watchlist.delete(state.assetId) : state.watchlist.add(state.assetId); saveWatchlist(); renderWatchlist(); }
function selectAsset(id) { if (!assetFor(id)) return; state.assetId = id; $('asset').value = id; renderWatchlist(); loadCandles(); }

function renderResearch() {
  const indicators = calculate(state.candles); const signal = signalFor(state.strategy, state.candles, indicators); const asset = assetFor(); const last = latest(state.candles); const backtest = compactBacktest(state.candles, indicators, state.strategy);
  renderChart(indicators);
  $('asset-meta').textContent = `${asset.symbol} · ${asset.name} · ${asset.type} · ${asset.source}`; $('strategy-name').textContent = `${STRATEGIES[state.strategy].name} · ${STRATEGIES[state.strategy].family}`; $('research-source').textContent = state.dataSource;
  $('research-mode').textContent = state.dataMode === 'user-csv' ? '数据模式：用户导入真实CSV · 浏览器端指标与策略计算' : '数据模式：公开交易所K线 · 浏览器端指标与策略计算'; $('research-time').textContent = new Date(last.time * 1000).toLocaleString('zh-CN', { hour12: false });
  $('price').textContent = fmt(last.close, last.close < 10 ? 4 : 2); $('signal').className = `badge ${signal.side}`; $('signal').textContent = sideLabel(signal.side); $('signal-score').textContent = `${signal.score >= 0 ? '+' : ''}${fmt(signal.score * 100, 0)}%`; $('strategy-evidence').textContent = signal.evidence; $('strategy-description').textContent = STRATEGIES[state.strategy].description;
  const rows = [['SMA20 / SMA50', `${fmt(indicators.sma20.at(-1))} / ${fmt(indicators.sma50.at(-1))}`], ['EMA20', fmt(indicators.ema20.at(-1))], ['RSI(14)', fmt(indicators.rsi.at(-1), 1)], ['MACD Hist', fmt(indicators.histogram.at(-1), 3)], ['布林带', `${fmt(indicators.lower.at(-1))} — ${fmt(indicators.upper.at(-1))}`], ['ATR(14)', fmt(indicators.atr.at(-1))], ['Stoch %K', fmt(indicators.stoch.at(-1), 1)], ['均量比', `${fmt(last.volume / (indicators.volumeSma.at(-1) || last.volume), 2)}x`]];
  $('indicators').innerHTML = rows.map(([label, value]) => `<div class="indicator"><span>${label}</span><strong>${value}</strong></div>`).join(''); $('backtest').innerHTML = `<div><span>区间收益</span><strong class="${backtest.total >= 0 ? 'positive' : 'negative'}">${pct(backtest.total)}</strong></div><div><span>最大回撤</span><strong class="negative">${fmt(backtest.maxDD, 2)}%</strong></div><div><span>已平仓交易</span><strong>${backtest.trades}</strong></div><div><span>胜率</span><strong>${fmt(backtest.winRate, 1)}%</strong></div>`;
}
function resetResearchForUnavailable(asset) { resetChart(); $('asset-meta').textContent = `${asset.symbol} · ${asset.name} · ${asset.type} · ${asset.source}`; $('research-mode').textContent = '数据模式：等待用户导入真实CSV'; $('price').textContent = '—'; $('research-time').textContent = '—'; $('research-source').textContent = '需用户导入 CSV 或接入授权数据源'; $('signal').className = 'badge neutral'; $('signal').textContent = '等待数据'; $('signal-score').textContent = '—'; $('strategy-evidence').textContent = '当前资产尚无可用真实 OHLCV 数据。'; $('indicators').innerHTML = '<div class="indicator"><span>等待真实数据</span><strong>—</strong></div>'; $('backtest').innerHTML = '<div><span>区间收益</span><strong>—</strong></div>'; }

async function fetchPublicCandles(asset, limit = 350) {
  const response = await fetch(`${API_BASE}/api/candles?symbol=${encodeURIComponent(asset.id)}&interval=${encodeURIComponent(state.interval)}&limit=${limit}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `云端接口 HTTP ${response.status}`);
  const candles = Array.isArray(payload.candles) ? payload.candles.map(candle => ({ time: Number(candle.time), open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume) || 0 })).filter(candle => [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) : [];
  if (candles.length < 60) throw new Error('云端返回的有效 K 线不足 60 根');
  return { candles, source: payload.source || 'Cloudflare 云端缓存 K线' };
}
async function loadCandles() {
  const asset = assetFor(); const imported = state.localSeries.get(asset.id);
  if (imported) { state.candles = imported; state.dataMode = 'user-csv'; state.dataSource = '用户导入 CSV'; $('source-alert').hidden = true; renderResearch(); $('load-status').textContent = `已载入用户导入的 ${state.candles.length} 根真实K线`; return; }
  if (asset.mode !== 'public-realtime') { state.candles = []; $('source-alert').hidden = false; $('source-alert').textContent = `${asset.symbol} 已进入统一资产目录。无密钥模式下，请导入已获授权或个人下载的 OHLCV CSV；导入后可立即使用全部指标、策略、观察列表和轻量回测。`; $('load-status').textContent = '等待用户导入真实CSV数据'; resetResearchForUnavailable(asset); return; }
  state.loading = true; $('load-status').textContent = '正在读取公开交易所K线…'; $('source-alert').hidden = true;
  try { const result = await fetchPublicCandles(asset); state.candles = result.candles; state.dataMode = 'public-realtime'; state.dataSource = result.source; renderResearch(); $('load-status').textContent = `已载入 ${state.candles.length} 根 ${state.interval} K线`; } catch (error) { state.candles = []; $('load-status').textContent = `数据读取失败：${error.message}`; $('source-alert').hidden = false; $('source-alert').textContent = 'Cloudflare 公开数据源暂不可用，请稍后刷新。'; resetResearchForUnavailable(asset); } finally { state.loading = false; }
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean); if (lines.length < 3) throw new Error('CSV 至少需要表头和两行K线'); const headers = lines[0].split(',').map(value => value.trim().toLowerCase()); const index = names => names.map(name => headers.indexOf(name)).find(position => position >= 0);
  const dateIndex = index(['date', 'time', 'datetime', 'timestamp']); const openIndex = index(['open']); const highIndex = index(['high']); const lowIndex = index(['low']); const closeIndex = index(['close', 'adj close', 'adj_close']); const volumeIndex = index(['volume']);
  if ([dateIndex, openIndex, highIndex, lowIndex, closeIndex].some(position => position == null)) throw new Error('CSV 需要 Date/Time、Open、High、Low、Close 列（Volume 可选）');
  const candles = lines.slice(1).map(line => line.split(',').map(value => value.trim())).map(row => { const rawTime = row[dateIndex]; const time = /^\d+$/.test(rawTime) ? Math.floor(Number(rawTime) / (rawTime.length > 10 ? 1000 : 1)) : Math.floor(new Date(rawTime).getTime() / 1000); return { time, open: Number(row[openIndex]), high: Number(row[highIndex]), low: Number(row[lowIndex]), close: Number(row[closeIndex]), volume: volumeIndex == null ? 0 : Number(row[volumeIndex]) || 0 }; }).filter(candle => [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)).sort((a, b) => a.time - b.time);
  if (candles.length < 60) throw new Error('至少导入 60 根有效K线才能计算完整指标'); return candles;
}

function scanRow(asset, candles, source) {
  const indicators = calculate(candles); const signal = signalFor(state.strategy, candles, indicators); const last = latest(candles); const first = candles[0]; return { asset, candles, source, signal, last, changePct: (last.close / first.close - 1) * 100 };
}
function renderScanResults(results) {
  const rows = [...results].sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score) || b.signal.score - a.signal.score);
  $('scan-results').innerHTML = rows.map(result => `<tr><td><button class="scan-action" data-scan-asset="${result.asset.id}" type="button"><span class="scan-symbol">${result.asset.symbol}</span><span class="scan-name">${result.asset.name}</span></button></td><td>${result.asset.type}</td><td>${fmt(result.last.close, result.last.close < 10 ? 4 : 2)}</td><td class="${result.changePct >= 0 ? 'positive' : 'negative'}">${pct(result.changePct)}</td><td><span class="badge ${result.signal.side}">${sideLabel(result.signal.side)}</span></td><td class="scan-score ${result.signal.score >= 0 ? 'positive' : 'negative'}">${result.signal.score >= 0 ? '+' : ''}${fmt(result.signal.score * 100, 0)}%</td><td><span class="scan-evidence" title="${result.signal.evidence}">${result.signal.evidence}</span></td><td><span class="scan-source">${result.source}</span></td></tr>`).join('');
}
async function runScan() {
  if (state.scanRunning) return; state.scanRunning = true; const button = $('run-scan'); button.disabled = true; button.textContent = '正在扫描…'; const candidates = ASSETS.filter(asset => asset.mode === 'public-realtime' || state.localSeries.has(asset.id)); const results = []; const failures = [];
  $('scan-status').textContent = `正在以“${STRATEGIES[state.strategy].name}”扫描 ${candidates.length} 个可用标的…`;
  for (let i = 0; i < candidates.length; i += 3) { const batch = candidates.slice(i, i + 3); const batchResults = await Promise.all(batch.map(async asset => { try { const imported = state.localSeries.get(asset.id); const remote = imported ? null : await fetchPublicCandles(asset, PUBLIC_SCAN_LIMIT); const candles = imported || remote.candles; return { ok: true, value: scanRow(asset, candles, imported ? '用户导入 CSV' : remote.source) }; } catch (error) { return { ok: false, asset, reason: error instanceof Error ? error.message : '读取失败' }; } })); batchResults.forEach(result => result.ok ? results.push(result.value) : failures.push(result)); $('scan-status').textContent = `正在扫描 ${Math.min(i + batch.length, candidates.length)}/${candidates.length} 个标的…`;
  }
  if (results.length) { renderScanResults(results); $('scan-status').textContent = `已完成：以“${STRATEGIES[state.strategy].name}”得到 ${results.length} 个真实数据研究结果${failures.length ? `；${failures.length} 个标的读取失败` : ''}。数据未上传或持久化。`; } else { $('scan-results').innerHTML = '<tr><td colspan="8" class="empty-state">未能取得可扫描的真实 OHLCV 数据，请检查网络或先导入CSV。</td></tr>'; $('scan-status').textContent = '扫描未取得可用数据。'; }
  state.scanRunning = false; button.disabled = false; button.textContent = '扫描当前策略';
}

function wire() {
  $('asset').addEventListener('change', event => selectAsset(event.target.value)); $('interval').addEventListener('change', event => { state.interval = event.target.value; loadCandles(); }); $('strategy').addEventListener('change', event => { state.strategy = event.target.value; if (state.candles.length) renderResearch(); });
  document.querySelectorAll('[data-indicator]').forEach(button => button.addEventListener('click', () => { const id = button.dataset.indicator; state.activeIndicators.has(id) ? state.activeIndicators.delete(id) : state.activeIndicators.add(id); button.classList.toggle('selected', state.activeIndicators.has(id)); if (state.candles.length) renderResearch(); }));
  $('refresh').addEventListener('click', loadCandles); $('watch-toggle').addEventListener('click', toggleWatchlist); $('watchlist').addEventListener('click', event => { const button = event.target.closest('[data-watch-asset]'); if (button) { const id = button.dataset.watchAsset; if (event.target.closest('.watch-remove')) { state.watchlist.delete(id); saveWatchlist(); renderWatchlist(); } else selectAsset(id); } }); $('run-scan').addEventListener('click', runScan); $('scan-results').addEventListener('click', event => { const button = event.target.closest('[data-scan-asset]'); if (button) selectAsset(button.dataset.scanAsset); });
  $('csv-file').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { const candles = parseCsv(await file.text()); state.localSeries.set(state.assetId, candles); state.candles = candles; state.dataMode = 'user-csv'; state.dataSource = `用户导入 CSV · ${file.name}`; $('source-alert').hidden = false; $('source-alert').textContent = `已导入 ${candles.length} 根真实K线。数据仅在当前浏览器会话中使用，不会上传至服务器。`; renderResearch(); $('load-status').textContent = `已载入用户导入的 ${candles.length} 根真实K线`; } catch (error) { $('source-alert').hidden = false; $('source-alert').textContent = `CSV 导入失败：${error.message}`; } finally { event.target.value = ''; } });
}
async function boot() { populateAssets(); renderWatchlist(); wire(); try { const health = await fetch(`${API_BASE}/api/health`).then(response => response.json()); $('cloud-status').textContent = health.status === 'ok' ? '云端研究服务正常' : '云端服务异常'; } catch { $('cloud-status').textContent = '云端研究服务连接受限'; } loadCandles(); }
boot();
