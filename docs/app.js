/* QuantWatch Research Terminal v1 — browser-side charting and analysis. */
const API_BASE = 'https://quantwatch-api.2333333434.workers.dev';
const BINANCE_KLINES = 'https://api.binance.com/api/v3/klines';

const ASSETS = [
  { id: 'BTCUSDT', symbol: 'BTC/USDT', name: 'Bitcoin', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'ETHUSDT', symbol: 'ETH/USDT', name: 'Ethereum', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'SOLUSDT', symbol: 'SOL/USDT', name: 'Solana', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'BNBUSDT', symbol: 'BNB/USDT', name: 'BNB', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'XRPUSDT', symbol: 'XRP/USDT', name: 'XRP', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'ADAUSDT', symbol: 'ADA/USDT', name: 'Cardano', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'DOGEUSDT', symbol: 'DOGE/USDT', name: 'Dogecoin', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'AVAXUSDT', symbol: 'AVAX/USDT', name: 'Avalanche', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'LINKUSDT', symbol: 'LINK/USDT', name: 'Chainlink', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
  { id: 'DOTUSDT', symbol: 'DOT/USDT', name: 'Polkadot', type: '加密资产', source: 'Binance Spot', mode: 'public-realtime' },
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

const state = { assetId: 'BTCUSDT', interval: '4h', strategy: 'trend', candles: [], chart: null, series: {}, activeIndicators: new Set(['sma', 'ema', 'bb', 'volume']), loading: false };
const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const pct = (value) => `${Number(value) >= 0 ? '+' : ''}${fmt(value, 2)}%`;
const latest = (items) => items[items.length - 1];

function populateAssets() {
  const groups = ASSETS.reduce((acc, asset) => { (acc[asset.type] ||= []).push(asset); return acc; }, {});
  $('asset').innerHTML = Object.entries(groups).map(([type, assets]) => `<optgroup label="${type}">${assets.map(a => `<option value="${a.id}">${a.symbol} · ${a.name}${a.mode !== 'public-realtime' ? '（需数据授权）' : ''}</option>`).join('')}</optgroup>`).join('');
  $('strategy').innerHTML = Object.entries(STRATEGIES).map(([id, strategy]) => `<option value="${id}">${strategy.name} · ${strategy.family}</option>`).join('');
}

function sma(values, period) {
  return values.map((_, i) => i + 1 < period ? null : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
}
function ema(values, period) {
  const k = 2 / (period + 1); let previous = values[0];
  return values.map((value, i) => { previous = i === 0 ? value : value * k + previous * (1 - k); return i + 1 < period ? null : previous; });
}
function stddev(values, period, mean) {
  return values.map((_, i) => { if (i + 1 < period || mean[i] == null) return null; const window = values.slice(i - period + 1, i + 1); return Math.sqrt(window.reduce((sum, value) => sum + (value - mean[i]) ** 2, 0) / period); });
}
function rsi(values, period = 14) {
  const out = Array(values.length).fill(null); let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (i <= period) { gain += Math.max(diff, 0); loss += Math.max(-diff, 0); if (i === period) { gain /= period; loss /= period; out[i] = 100 - 100 / (1 + gain / (loss || 1e-12)); } }
    else { gain = (gain * (period - 1) + Math.max(diff, 0)) / period; loss = (loss * (period - 1) + Math.max(-diff, 0)) / period; out[i] = 100 - 100 / (1 + gain / (loss || 1e-12)); }
  }
  return out;
}
function atr(candles, period = 14) {
  const trs = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  return ema(trs, period);
}
function stochastic(candles, period = 14) {
  return candles.map((c, i) => { if (i + 1 < period) return null; const part = candles.slice(i - period + 1, i + 1); const hi = Math.max(...part.map(x => x.high)); const lo = Math.min(...part.map(x => x.low)); return (c.close - lo) / ((hi - lo) || 1e-12) * 100; });
}
function calculate(candles) {
  const close = candles.map(c => c.close); const volume = candles.map(c => c.volume);
  const sma20 = sma(close, 20), sma50 = sma(close, 50), ema20 = ema(close, 20), basis = sma(close, 20), sd = stddev(close, 20, basis);
  const upper = basis.map((v, i) => v == null ? null : v + 2 * sd[i]); const lower = basis.map((v, i) => v == null ? null : v - 2 * sd[i]);
  const ema12 = ema(close, 12), ema26 = ema(close, 26); const macdLine = close.map((_, i) => ema12[i] == null || ema26[i] == null ? null : ema12[i] - ema26[i]);
  const compactMacd = macdLine.map(x => x ?? 0); const signalLine = ema(compactMacd, 9); const histogram = macdLine.map((v, i) => v == null || signalLine[i] == null ? null : v - signalLine[i]);
  return { close, volume, sma20, sma50, ema20, upper, lower, rsi: rsi(close), atr: atr(candles), stoch: stochastic(candles), macdLine, signalLine, histogram, volumeSma: sma(volume, 20) };
}

function indicatorData(candles, values) { return candles.map((c, i) => values[i] == null ? null : ({ time: c.time, value: values[i] })).filter(Boolean); }
function resetChart() { if (state.chart) { $('chart').innerHTML = ''; state.chart.remove(); state.chart = null; } }
function renderChart(ind) {
  resetChart();
  const chart = LightweightCharts.createChart($('chart'), { layout: { background: { type: 'solid', color: '#0b1727' }, textColor: '#a9bdd6' }, grid: { vertLines: { color: 'rgba(61,88,124,.25)' }, horzLines: { color: 'rgba(61,88,124,.25)' } }, rightPriceScale: { borderColor: '#263d5c' }, timeScale: { borderColor: '#263d5c', timeVisible: true }, crosshair: { mode: LightweightCharts.CrosshairMode.Normal }, height: 440 });
  const candle = chart.addSeries(LightweightCharts.CandlestickSeries, { upColor: '#34d399', downColor: '#fb7185', borderVisible: false, wickUpColor: '#34d399', wickDownColor: '#fb7185' });
  candle.setData(state.candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
  const volume = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false });
  volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
  volume.setData(state.candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(52,211,153,.35)' : 'rgba(251,113,133,.35)' })));
  if (state.activeIndicators.has('sma')) { const s = chart.addSeries(LightweightCharts.LineSeries, { color: '#60a5fa', lineWidth: 2, title: 'SMA20' }); s.setData(indicatorData(state.candles, ind.sma20)); const l = chart.addSeries(LightweightCharts.LineSeries, { color: '#a78bfa', lineWidth: 1, title: 'SMA50' }); l.setData(indicatorData(state.candles, ind.sma50)); }
  if (state.activeIndicators.has('ema')) { const e = chart.addSeries(LightweightCharts.LineSeries, { color: '#fbbf24', lineWidth: 2, title: 'EMA20' }); e.setData(indicatorData(state.candles, ind.ema20)); }
  if (state.activeIndicators.has('bb')) { for (const [color, values, title] of [['#64748b', ind.upper, 'BB Upper'], ['#64748b', ind.lower, 'BB Lower']]) { const line = chart.addSeries(LightweightCharts.LineSeries, { color, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title }); line.setData(indicatorData(state.candles, values)); } }
  if (!state.activeIndicators.has('volume')) volume.applyOptions({ visible: false });
  chart.timeScale().fitContent(); state.chart = chart;
  new ResizeObserver(() => chart.applyOptions({ width: $('chart').clientWidth })).observe($('chart'));
}

function signalFor(strategyId, candles, ind) {
  const i = candles.length - 1; const close = candles[i].close; const previous = candles[i - 1]?.close ?? close;
  const long = (score, evidence) => ({ side: 'long', score, evidence }); const short = (score, evidence) => ({ side: 'short', score, evidence }); const neutral = (evidence) => ({ side: 'neutral', score: 0, evidence });
  if (strategyId === 'trend') return ind.sma20[i] > ind.sma50[i] && close > ind.sma20[i] ? long(0.62, '价格位于 SMA20 之上，且 SMA20 高于 SMA50。') : ind.sma20[i] < ind.sma50[i] && close < ind.sma20[i] ? short(-0.62, '价格位于 SMA20 之下，且 SMA20 低于 SMA50。') : neutral('均线趋势尚未形成一致方向。');
  if (strategyId === 'rsi') return ind.rsi[i] < 30 ? long(0.55, `RSI 为 ${fmt(ind.rsi[i], 1)}，处于超卖研究区间。`) : ind.rsi[i] > 70 ? short(-0.55, `RSI 为 ${fmt(ind.rsi[i], 1)}，处于超买研究区间。`) : neutral(`RSI 为 ${fmt(ind.rsi[i], 1)}，未达到极端阈值。`);
  if (strategyId === 'macd') return ind.histogram[i] > 0 && ind.histogram[i] > ind.histogram[i - 1] ? long(0.48, 'MACD 柱状图为正并扩大。') : ind.histogram[i] < 0 && ind.histogram[i] < ind.histogram[i - 1] ? short(-0.48, 'MACD 柱状图为负并扩大。') : neutral('MACD 动量未出现明确加速。');
  if (strategyId === 'bollinger') return close < ind.lower[i] ? long(0.46, '收盘价低于布林下轨，记录为均值回归研究条件。') : close > ind.upper[i] ? short(-0.46, '收盘价高于布林上轨，记录为均值回归研究条件。') : neutral('价格处于布林通道内部。');
  if (strategyId === 'breakout') { const prior = candles.slice(-21, -1); const hi = Math.max(...prior.map(c => c.high)); const lo = Math.min(...prior.map(c => c.low)); return close > hi ? long(0.66, '收盘价突破前 20 根K线最高价。') : close < lo ? short(-0.66, '收盘价跌破前 20 根K线最低价。') : neutral('尚未突破 20 期 Donchian 通道。'); }
  if (strategyId === 'stochastic') return ind.stoch[i] < 20 ? long(0.42, `随机指标为 ${fmt(ind.stoch[i], 1)}，处于低位。`) : ind.stoch[i] > 80 ? short(-0.42, `随机指标为 ${fmt(ind.stoch[i], 1)}，处于高位。`) : neutral('随机指标未处于极端区间。');
  if (strategyId === 'volatility') return Math.abs((close - previous) / previous) > (ind.atr[i] / close) ? long(0.24, `当前 ATR 为 ${fmt(ind.atr[i])}；请用 2 ATR 作为研究止损距离参考。`) : neutral(`当前 ATR 为 ${fmt(ind.atr[i])}，波动尚未显著放大。`);
  return state.candles[i].volume > ind.volumeSma[i] * 1.4 ? long(0.28, '成交量高于 20 期均量的 1.4 倍。') : neutral('成交量未显著放大。');
}
function compactBacktest(candles, ind, strategyId) {
  const close = candles.map(c => c.close); let equity = 1, peak = 1, maxDD = 0, position = 0, trades = 0, wins = 0, entry = 0;
  for (let i = 51; i < close.length; i++) {
    const bullish = strategyId === 'rsi' ? ind.rsi[i] < 30 : strategyId === 'macd' ? ind.histogram[i] > 0 : ind.sma20[i] > ind.sma50[i];
    const bearish = strategyId === 'rsi' ? ind.rsi[i] > 70 : strategyId === 'macd' ? ind.histogram[i] < 0 : ind.sma20[i] < ind.sma50[i];
    const desired = bullish ? 1 : bearish ? -1 : 0;
    if (position !== desired) { if (position !== 0) { const ret = position * (close[i] / entry - 1); equity *= 1 + ret; trades++; if (ret > 0) wins++; } if (desired !== 0) entry = close[i]; position = desired; }
    peak = Math.max(peak, equity); maxDD = Math.min(maxDD, equity / peak - 1);
  }
  return { total: (equity - 1) * 100, maxDD: maxDD * 100, trades, winRate: trades ? wins / trades * 100 : 0 };
}
function renderResearch() {
  const ind = calculate(state.candles); const signal = signalFor(state.strategy, state.candles, ind); const asset = ASSETS.find(a => a.id === state.assetId); const last = latest(state.candles); const backtest = compactBacktest(state.candles, ind, state.strategy);
  renderChart(ind);
  $('asset-meta').textContent = `${asset.symbol} · ${asset.name} · ${asset.type} · ${asset.source}`;
  $('strategy-name').textContent = `${STRATEGIES[state.strategy].name} · ${STRATEGIES[state.strategy].family}`;
  $('research-source').textContent = '公开交易所实时 K线'; $('research-time').textContent = new Date(last.time * 1000).toLocaleString('zh-CN', { hour12: false });
  $('price').textContent = fmt(last.close, last.close < 10 ? 4 : 2); $('signal').className = `badge ${signal.side}`; $('signal').textContent = signal.side === 'long' ? '偏多研究' : signal.side === 'short' ? '偏空研究' : '中性观察';
  $('signal-score').textContent = `${signal.score >= 0 ? '+' : ''}${fmt(signal.score * 100, 0)}%`; $('strategy-evidence').textContent = signal.evidence; $('strategy-description').textContent = STRATEGIES[state.strategy].description;
  const rows = [ ['SMA20 / SMA50', `${fmt(ind.sma20.at(-1))} / ${fmt(ind.sma50.at(-1))}`], ['EMA20', fmt(ind.ema20.at(-1))], ['RSI(14)', fmt(ind.rsi.at(-1), 1)], ['MACD Hist', fmt(ind.histogram.at(-1), 3)], ['布林带', `${fmt(ind.lower.at(-1))} — ${fmt(ind.upper.at(-1))}`], ['ATR(14)', fmt(ind.atr.at(-1))], ['Stoch %K', fmt(ind.stoch.at(-1), 1)], ['均量比', `${fmt(last.volume / (ind.volumeSma.at(-1) || last.volume), 2)}x`] ];
  $('indicators').innerHTML = rows.map(([label, value]) => `<div class="indicator"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('backtest').innerHTML = `<div><span>区间收益</span><strong class="${backtest.total >= 0 ? 'positive' : 'negative'}">${pct(backtest.total)}</strong></div><div><span>最大回撤</span><strong class="negative">${fmt(backtest.maxDD, 2)}%</strong></div><div><span>已平仓交易</span><strong>${backtest.trades}</strong></div><div><span>胜率</span><strong>${fmt(backtest.winRate, 1)}%</strong></div>`;
}
async function loadCandles() {
  const asset = ASSETS.find(a => a.id === state.assetId); if (asset.mode !== 'public-realtime') { $('source-alert').hidden = false; $('source-alert').textContent = `${asset.symbol} 已进入统一资产目录，但当前未配置经授权的股票/ETF 数据供应商密钥；请先切换至加密资产，或在下一阶段配置服务端数据密钥。`; return; }
  state.loading = true; $('load-status').textContent = '正在读取公开交易所K线…'; $('source-alert').hidden = true;
  try {
    const url = `${BINANCE_KLINES}?symbol=${asset.id}&interval=${state.interval}&limit=350`;
    const response = await fetch(url); if (!response.ok) throw new Error(`上游接口 HTTP ${response.status}`); const raw = await response.json();
    state.candles = raw.map(row => ({ time: Math.floor(Number(row[0]) / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }));
    renderResearch(); $('load-status').textContent = `已载入 ${state.candles.length} 根 ${state.interval} K线`;
  } catch (error) { $('load-status').textContent = `数据读取失败：${error.message}`; $('source-alert').hidden = false; $('source-alert').textContent = '公开数据源暂不可用，请稍后刷新。'; }
  finally { state.loading = false; }
}
function wire() {
  $('asset').addEventListener('change', e => { state.assetId = e.target.value; loadCandles(); }); $('interval').addEventListener('change', e => { state.interval = e.target.value; loadCandles(); }); $('strategy').addEventListener('change', e => { state.strategy = e.target.value; if (state.candles.length) renderResearch(); });
  document.querySelectorAll('[data-indicator]').forEach(button => button.addEventListener('click', () => { const id = button.dataset.indicator; state.activeIndicators.has(id) ? state.activeIndicators.delete(id) : state.activeIndicators.add(id); button.classList.toggle('selected', state.activeIndicators.has(id)); if (state.candles.length) renderResearch(); }));
  $('refresh').addEventListener('click', loadCandles);
}
async function boot() { populateAssets(); wire(); try { const health = await fetch(`${API_BASE}/api/health`).then(r => r.json()); $('cloud-status').textContent = health.status === 'ok' ? '云端研究服务正常' : '云端服务异常'; } catch { $('cloud-status').textContent = '云端研究服务连接受限'; } loadCandles(); }
boot();
