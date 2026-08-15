/* Strategy Lab: configurable research recipes and risk-aware historical evaluation. */
(() => {
  const SETTINGS_KEY = 'quantwatch:strategy-lab:v1';
  const recipes = {
    trend_pullback: { name: '趋势回撤', family: '趋势', description: '顺势等待价格回撤至 EMA20 附近，再由趋势与动量确认。' },
    donchian_breakout: { name: 'Donchian 突破', family: '突破', description: '价格突破 20 根K线区间后，结合成交量确认突破质量。' },
    bb_reversion: { name: '布林均值回归', family: '均值回归', description: '价格突破布林带后，配合 RSI 极端读数研究回归机会。' },
    rsi_divergence: { name: 'RSI 极值反转', family: '均值回归', description: 'RSI 进入极端区域后，以价格和动量恢复作为反转确认。' },
    macd_momentum: { name: 'MACD 动量扩张', family: '动量', description: 'MACD 柱由负转正或由正转负后，顺着动量方向进行研究。' },
    kdj_reversal: { name: 'KDJ 低高位反转', family: '动量', description: 'K/D 交叉且 J 值处于极端区域时研究短期反转。' },
    supertrend_follow: { name: 'SuperTrend 跟随', family: '趋势', description: '以 ATR 趋势轨道翻转为方向，以均线作为趋势一致性确认。' },
    ichimoku_cloud: { name: '一目云突破', family: '趋势', description: '价格突破云层并满足转换线、基准线关系后确认趋势。' },
    td_exhaustion: { name: '神奇九转衰竭', family: '反转', description: 'TD9 出现后只研究逆势衰竭，不将其单独视为交易信号。' },
    fib_reclaim: { name: '斐波那契回撤', family: '关键位', description: '价格在 38.2%、50% 或 61.8% 关键位附近重新收复时研究。' },
    range_fade: { name: '区间反转', family: '区间', description: '在低趋势、低波动状态下，于近 30 根K线区间边缘研究反转。' },
    volatility_expansion: { name: '波动率扩张', family: '突破', description: 'ATR 相对价格放大且价格突破近期区间时研究趋势延续。' },
    adx_dmi_trend: { name: 'ADX / DMI 趋势', family: '趋势', description: 'ADX 大于阈值且 +DI、-DI 出现方向优势时研究趋势延续。' },
    aroon_breakout: { name: 'Aroon 趋势突破', family: '趋势', description: 'Aroon Up / Down 拉开差值后研究趋势启动和延续。' },
    keltner_squeeze: { name: 'Keltner 挤压突破', family: '波动率', description: '价格脱离 Keltner 通道时研究波动率扩张。' },
    mfi_reversal: { name: 'MFI 资金流反转', family: '资金流', description: 'MFI 进入极端区间后观察资金流反转。' },
    williams_swing: { name: 'Williams %R 摆动', family: '动量', description: 'Williams %R 从超买超卖区域回归时研究短周期摆动。' },
    roc_acceleration: { name: 'ROC 加速度', family: '动量', description: 'ROC 穿越零轴且 MACD 同向时研究价格加速度。' },
    obv_confirmation: { name: 'OBV 量价确认', family: '资金流', description: 'OBV 趋势与价格趋势一致时研究量价确认。' },
    cmf_pressure: { name: 'CMF 资金压力', family: '资金流', description: 'CMF 穿越零轴并与价格方向一致时研究资金流压力。' },
    pivot_reclaim: { name: '枢轴点收复', family: '关键位', description: '价格重新站上或跌破前一根枢轴点时研究关键位反应。' },
    vwap_reclaim: { name: 'VWAP 回归', family: '资金流', description: '价格重新收复或跌破 VWAP 时研究日内价值区域的方向变化。' }
  };
  const get = id => document.getElementById(id);
  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const percent = value => `${value >= 0 ? '+' : ''}${fmt(value, 2)}%`;
  const latest = values => values[values.length - 1];

  function savedSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { return {}; }
  }
  function controls() {
    return {
      recipe: get('lab-strategy').value,
      mode: get('entry-mode').value,
      filters: { trend: get('filter-trend').checked, momentum: get('filter-momentum').checked, volume: get('filter-volume').checked, volatility: get('filter-volatility').checked },
      atrStop: Math.min(8, Math.max(0.5, n(get('risk-atr').value))),
      reward: Math.min(8, Math.max(0.5, n(get('risk-reward').value))),
      fee: Math.min(2, Math.max(0, n(get('risk-fee').value))) / 100,
      allocation: Math.min(10, Math.max(0.1, n(get('risk-allocation').value))) / 100
    };
  }
  function persist() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(controls())); }
  function setupControls() {
    const settings = savedSettings();
    get('lab-strategy').innerHTML = Object.entries(recipes).map(([id, recipe]) => `<option value="${id}">${recipe.name} · ${recipe.family}</option>`).join('');
    const fields = ['lab-strategy', 'entry-mode', 'filter-trend', 'filter-momentum', 'filter-volume', 'filter-volatility', 'risk-atr', 'risk-reward', 'risk-fee', 'risk-allocation'];
    fields.forEach(id => get(id).addEventListener('change', persist));
    if (settings.recipe) get('lab-strategy').value = settings.recipe;
    if (settings.mode) get('entry-mode').value = settings.mode;
    if (settings.filters) { get('filter-trend').checked = Boolean(settings.filters.trend); get('filter-momentum').checked = Boolean(settings.filters.momentum); get('filter-volume').checked = Boolean(settings.filters.volume); get('filter-volatility').checked = Boolean(settings.filters.volatility); }
    if (settings.atrStop) get('risk-atr').value = settings.atrStop;
    if (settings.reward) get('risk-reward').value = settings.reward;
    if (settings.fee != null) get('risk-fee').value = (settings.fee * 100).toFixed(2);
    if (settings.allocation) get('risk-allocation').value = (settings.allocation * 100).toFixed(1);
  }

  function factorState(i, candles, indicators) {
    const close = candles[i].close;
    const trendLong = indicators.sma20[i] != null && indicators.sma50[i] != null && close > indicators.sma20[i] && indicators.sma20[i] > indicators.sma50[i];
    const trendShort = indicators.sma20[i] != null && indicators.sma50[i] != null && close < indicators.sma20[i] && indicators.sma20[i] < indicators.sma50[i];
    const momentumLong = indicators.rsi[i] != null && indicators.rsi[i] > 52 && indicators.histogram[i] > 0;
    const momentumShort = indicators.rsi[i] != null && indicators.rsi[i] < 48 && indicators.histogram[i] < 0;
    const volumeRatio = candles[i].volume / (indicators.volumeSma[i] || candles[i].volume || 1);
    const volatility = indicators.atr[i] / close;
    return { close, trendLong, trendShort, momentumLong, momentumShort, volumeRatio, volatility };
  }
  function baseSignal(recipe, i, candles, indicators) {
    if (i < 60) return 0;
    const close = candles[i].close; const previous = candles[i - 1].close; const prior20 = candles.slice(i - 20, i); const high20 = Math.max(...prior20.map(item => item.high)); const low20 = Math.min(...prior20.map(item => item.low)); const range30 = candles.slice(i - 30, i); const high30 = Math.max(...range30.map(item => item.high)); const low30 = Math.min(...range30.map(item => item.low));
    const crossUp = (left, right) => left[i] != null && right[i] != null && left[i - 1] != null && right[i - 1] != null && left[i] > right[i] && left[i - 1] <= right[i - 1];
    const crossDown = (left, right) => left[i] != null && right[i] != null && left[i - 1] != null && left[i] < right[i] && left[i - 1] >= right[i - 1];
    if (recipe === 'trend_pullback') return close > indicators.sma50[i] && close > indicators.ema20[i] && previous <= indicators.ema20[i] ? 1 : close < indicators.sma50[i] && close < indicators.ema20[i] && previous >= indicators.ema20[i] ? -1 : 0;
    if (recipe === 'donchian_breakout') return close > high20 ? 1 : close < low20 ? -1 : 0;
    if (recipe === 'bb_reversion') return close < indicators.lower[i] && indicators.rsi[i] < 35 ? 1 : close > indicators.upper[i] && indicators.rsi[i] > 65 ? -1 : 0;
    if (recipe === 'rsi_divergence') return indicators.rsi[i] < 27 && close > candles[i].low ? 1 : indicators.rsi[i] > 73 && close < candles[i].high ? -1 : 0;
    if (recipe === 'macd_momentum') return crossUp(indicators.macdLine, indicators.signalLine) ? 1 : crossDown(indicators.macdLine, indicators.signalLine) ? -1 : 0;
    if (recipe === 'kdj_reversal') return crossUp(indicators.kdj.k, indicators.kdj.d) && indicators.kdj.j[i] < 25 ? 1 : crossDown(indicators.kdj.k, indicators.kdj.d) && indicators.kdj.j[i] > 75 ? -1 : 0;
    if (recipe === 'supertrend_follow') return indicators.supertrend.direction[i] !== indicators.supertrend.direction[i - 1] ? indicators.supertrend.direction[i] : 0;
    if (recipe === 'ichimoku_cloud') { const top = Math.max(n(indicators.ichimoku.spanA[i]), n(indicators.ichimoku.spanB[i])); const bottom = Math.min(n(indicators.ichimoku.spanA[i]), n(indicators.ichimoku.spanB[i])); return close > top && candles[i - 1].close <= top && indicators.ichimoku.conversion[i] > indicators.ichimoku.base[i] ? 1 : close < bottom && candles[i - 1].close >= bottom && indicators.ichimoku.conversion[i] < indicators.ichimoku.base[i] ? -1 : 0; }
    if (recipe === 'td_exhaustion') return indicators.td.buy[i] === 9 ? 1 : indicators.td.sell[i] === 9 ? -1 : 0;
    if (recipe === 'fib_reclaim') { const levels = Object.values(indicators.fibonacci.levels); const level = levels.reduce((near, value) => Math.abs(close - value) < Math.abs(close - near) ? value : near, levels[0]); return Math.abs(close / level - 1) < 0.006 ? (close >= level && previous < level ? 1 : close <= level && previous > level ? -1 : 0) : 0; }
    if (recipe === 'range_fade') return close <= low30 * 1.002 && indicators.rsi[i] < 40 ? 1 : close >= high30 * 0.998 && indicators.rsi[i] > 60 ? -1 : 0;
    if (recipe === 'adx_dmi_trend') return indicators.adx[i] > 22 && indicators.plusDI[i] > indicators.minusDI[i] ? 1 : indicators.adx[i] > 22 && indicators.minusDI[i] > indicators.plusDI[i] ? -1 : 0;
    if (recipe === 'aroon_breakout') return indicators.aroonUp[i] > 70 && indicators.aroonUp[i] - indicators.aroonDown[i] > 35 ? 1 : indicators.aroonDown[i] > 70 && indicators.aroonDown[i] - indicators.aroonUp[i] > 35 ? -1 : 0;
    if (recipe === 'keltner_squeeze') return close > indicators.keltnerUpper[i] ? 1 : close < indicators.keltnerLower[i] ? -1 : 0;
    if (recipe === 'mfi_reversal') return indicators.mfi[i] < 20 ? 1 : indicators.mfi[i] > 80 ? -1 : 0;
    if (recipe === 'williams_swing') return indicators.williams[i] > -80 && indicators.williams[i - 1] <= -80 ? 1 : indicators.williams[i] < -20 && indicators.williams[i - 1] >= -20 ? -1 : 0;
    if (recipe === 'roc_acceleration') return indicators.roc[i] > 0 && indicators.roc[i - 1] <= 0 && indicators.histogram[i] > 0 ? 1 : indicators.roc[i] < 0 && indicators.roc[i - 1] >= 0 && indicators.histogram[i] < 0 ? -1 : 0;
    if (recipe === 'obv_confirmation') return indicators.obv[i] > indicators.obv[i - 5] && close > indicators.sma20[i] ? 1 : indicators.obv[i] < indicators.obv[i - 5] && close < indicators.sma20[i] ? -1 : 0;
    if (recipe === 'cmf_pressure') return indicators.cmf[i] > 0 && indicators.cmf[i - 1] <= 0 ? 1 : indicators.cmf[i] < 0 && indicators.cmf[i - 1] >= 0 ? -1 : 0;
    if (recipe === 'pivot_reclaim') return close > indicators.pivots[i] && candles[i - 1].close <= indicators.pivots[i - 1] ? 1 : close < indicators.pivots[i] && candles[i - 1].close >= indicators.pivots[i - 1] ? -1 : 0;
    if (recipe === 'vwap_reclaim') return close > indicators.vwap[i] && candles[i - 1].close <= indicators.vwap[i - 1] ? 1 : close < indicators.vwap[i] && candles[i - 1].close >= indicators.vwap[i - 1] ? -1 : 0;
    return indicators.atr[i] / close > 0.012 && close > high20 ? 1 : indicators.atr[i] / close > 0.012 && close < low20 ? -1 : 0;
  }
  function compositeSignal(i, candles, indicators, config) {
    let direction = baseSignal(config.recipe, i, candles, indicators);
    if (!direction) return { direction: 0, score: 0, evidence: '基础条件未触发。' };
    const factors = factorState(i, candles, indicators); const agrees = direction > 0 ? { trend: factors.trendLong, momentum: factors.momentumLong } : { trend: factors.trendShort, momentum: factors.momentumShort };
    const conditions = [!config.filters.trend || agrees.trend, !config.filters.momentum || agrees.momentum, !config.filters.volume || factors.volumeRatio >= 1.15, !config.filters.volatility || factors.volatility >= 0.004];
    const score = (agrees.trend ? 0.35 : 0) + (agrees.momentum ? 0.3 : 0) + (factors.volumeRatio >= 1.15 ? 0.2 : 0) + (factors.volatility >= 0.004 ? 0.15 : 0);
    if (config.mode === 'confirmed' && !conditions.every(Boolean)) return { direction: 0, score, evidence: '基础条件出现，但未通过全部已启用过滤器。' };
    if (config.mode === 'score' && score < 0.5) return { direction: 0, score, evidence: `多因子评分 ${fmt(score * 100, 0)}%，未达到 50% 阈值。` };
    const labels = [agrees.trend ? '趋势一致' : null, agrees.momentum ? '动量一致' : null, factors.volumeRatio >= 1.15 ? '成交量确认' : null, factors.volatility >= 0.004 ? '波动率可用' : null].filter(Boolean);
    return { direction, score, evidence: labels.length ? labels.join(' · ') : '仅基础策略条件触发。' };
  }

  function backtest(candles, config) {
    const indicators = calculate(candles); const warmup = 60; let equity = 1; let peak = 1; let maxDrawdown = 0; let position = null; const trades = []; const equityCurve = [];
    for (let i = warmup; i < candles.length - 1; i++) {
      const candle = candles[i]; const next = candles[i + 1]; const signal = compositeSignal(i, candles, indicators, config);
      if (!position && signal.direction) {
        const distance = indicators.atr[i] * config.atrStop;
        if (!Number.isFinite(distance) || distance <= 0) continue;
        const entry = next.open; const stop = signal.direction > 0 ? entry - distance : entry + distance; const target = signal.direction > 0 ? entry + distance * config.reward : entry - distance * config.reward;
        position = { side: signal.direction, entry, stop, target, openedAt: i + 1, evidence: signal.evidence, score: signal.score };
      }
      if (position) {
        let exit = null; let reason = null;
        if (position.side > 0) { if (next.low <= position.stop) { exit = position.stop; reason = '止损'; } else if (next.high >= position.target) { exit = position.target; reason = '止盈'; } }
        else { if (next.high >= position.stop) { exit = position.stop; reason = '止损'; } else if (next.low <= position.target) { exit = position.target; reason = '止盈'; } }
        const reversal = compositeSignal(i, candles, indicators, config).direction === -position.side;
        if (!exit && reversal) { exit = next.close; reason = '反向信号'; }
        if (!exit && i === candles.length - 2) { exit = next.close; reason = '区间结束'; }
        if (exit != null) {
          const gross = position.side * (exit / position.entry - 1); const net = gross - config.fee * 2; const riskCapital = Math.min(config.allocation, 0.05); const strategyReturn = net * Math.min(1, riskCapital / Math.max(Math.abs((position.entry - position.stop) / position.entry), 0.0001));
          const before = equity; equity *= Math.max(0.01, 1 + strategyReturn); trades.push({ side: position.side, entry: position.entry, exit, gross, net, strategyReturn, reason, openedAt: position.openedAt, closedAt: i + 1, holding: i + 1 - position.openedAt, evidence: position.evidence, equityBefore: before }); position = null;
        }
      }
      peak = Math.max(peak, equity); maxDrawdown = Math.min(maxDrawdown, equity / peak - 1); equityCurve.push(equity);
    }
    const wins = trades.filter(trade => trade.net > 0); const losses = trades.filter(trade => trade.net <= 0); const grossProfit = wins.reduce((sum, trade) => sum + trade.net, 0); const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.net, 0)); const returns = trades.map(trade => trade.strategyReturn); const average = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0; const deviation = returns.length > 1 ? Math.sqrt(returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1)) : 0;
    return { total: (equity - 1) * 100, maxDrawdown: maxDrawdown * 100, trades, winRate: trades.length ? wins.length / trades.length * 100 : 0, profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0, expectancy: average * 100, avgHolding: trades.length ? trades.reduce((sum, trade) => sum + trade.holding, 0) / trades.length : 0, sharpe: deviation ? average / deviation * Math.sqrt(returns.length) : 0, equityCurve };
  }
  function render(result, config) {
    const strategy = recipes[config.recipe]; const metrics = [['策略收益', percent(result.total), result.total >= 0], ['最大回撤', `${fmt(result.maxDrawdown)}%`, false], ['胜率', `${fmt(result.winRate, 1)}%`, result.winRate >= 50], ['交易次数', String(result.trades.length), true], ['盈亏比', result.profitFactor === Infinity ? '∞' : fmt(result.profitFactor, 2), result.profitFactor >= 1], ['单笔期望', percent(result.expectancy), result.expectancy >= 0], ['平均持仓', `${fmt(result.avgHolding, 1)} 根K线`, true], ['交易夏普', fmt(result.sharpe, 2), result.sharpe >= 0]];
    get('backtest').innerHTML = metrics.map(([label, value, positive]) => `<div><span>${label}</span><strong class="${positive ? 'positive' : 'negative'}">${value}</strong></div>`).join('');
    const latestTrades = result.trades.slice(-3).reverse(); get('trade-summary').innerHTML = latestTrades.length ? `<strong>${strategy.name}</strong> · ${config.mode === 'template' ? '模板模式' : config.mode === 'confirmed' ? '确认模式' : '评分模式'}<br>${latestTrades.map(trade => `${trade.side > 0 ? '多' : '空'} ${fmt(trade.net * 100, 2)}% · ${trade.reason} · 持仓 ${trade.holding} 根`).join('<br>')}` : `<strong>${strategy.name}</strong> 在当前样本与参数下未生成满足条件的闭合交易。可调整周期、过滤器或风险参数后重试。`;
    get('lab-status').textContent = `${strategy.name} 已按当前 ${state.interval} K线运行；使用 ${result.trades.length} 笔闭合交易、单边费率 ${(config.fee * 100).toFixed(2)}%、单笔风险 ${(config.allocation * 100).toFixed(1)}% 计算。`;
  }
  function run() {
    if (!state.candles?.length || state.candles.length < 80) { get('lab-status').textContent = '需要至少 80 根有效 K 线后才能运行策略回测。'; return; }
    const config = controls(); persist(); const result = backtest(state.candles, config); render(result, config);
  }
  function boot() {
    setupControls(); get('run-backtest').addEventListener('click', run); ['asset', 'interval', 'strategy', 'refresh'].forEach(id => get(id)?.addEventListener(id === 'refresh' ? 'click' : 'change', () => { get('lab-status').textContent = '数据或研究模板已变化，请重新运行策略回测。'; }));
    window.QuantWatchStrategyLab = { recipes, run, backtest, compositeSignal };
  }
  boot();
})();
