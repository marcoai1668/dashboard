const express = require('express');
const https = require('https');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Prevent browser from caching the dashboard shell during updates
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Richmond BC coordinates
const RICHMOND_LAT = 49.17;
const RICHMOND_LON = -123.13;

// BC Public Holidays (federal + provincial statutory holidays in BC)
const BC_HOLIDAYS = [
  { date: '2026-01-01', name: 'New Year\'s Day',     type: 'Federal' },
  { date: '2026-02-16', name: 'Family Day',          type: 'BC' },
  { date: '2026-04-03', name: 'Good Friday',         type: 'Federal' },
  { date: '2026-04-06', name: 'Easter Monday',       type: 'Optional' },
  { date: '2026-05-18', name: 'Victoria Day',        type: 'Federal' },
  { date: '2026-07-01', name: 'Canada Day',          type: 'Federal' },
  { date: '2026-08-03', name: 'BC Day',              type: 'BC' },
  { date: '2026-09-07', name: 'Labour Day',          type: 'Federal' },
  { date: '2026-09-30', name: 'National Day for Truth and Reconciliation', type: 'Federal' },
  { date: '2026-10-12', name: 'Thanksgiving',        type: 'Federal' },
  { date: '2026-11-11', name: 'Remembrance Day',     type: 'Federal' },
  { date: '2026-12-25', name: 'Christmas Day',       type: 'Federal' },
  { date: '2026-12-26', name: 'Boxing Day (observed Dec 28)', type: 'Optional' },
  // 2027
  { date: '2027-01-01', name: 'New Year\'s Day',     type: 'Federal' },
  { date: '2027-02-15', name: 'Family Day',          type: 'BC' },
  { date: '2027-03-26', name: 'Good Friday',         type: 'Federal' },
  { date: '2027-05-24', name: 'Victoria Day',        type: 'Federal' },
  { date: '2027-07-01', name: 'Canada Day',          type: 'Federal' },
  { date: '2027-08-02', name: 'BC Day',              type: 'BC' },
  { date: '2027-09-06', name: 'Labour Day',          type: 'Federal' },
  { date: '2027-09-30', name: 'National Day for Truth and Reconciliation', type: 'Federal' },
  { date: '2027-10-11', name: 'Thanksgiving',        type: 'Federal' },
  { date: '2027-11-11', name: 'Remembrance Day',     type: 'Federal' },
  { date: '2027-12-25', name: 'Christmas Day',       type: 'Federal' },
];

// Generic HTTPS fetch helper
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Dashboard/1.0',
        ...headers
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Health check — used by the frontend to detect "local server" mode
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'dashboard', time: Date.now() });
});

// ============================
// API: Weather (current + 9-day forecast + sunrise/sunset)
// ============================
app.get('/api/weather', async (req, res) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${RICHMOND_LAT}&longitude=${RICHMOND_LON}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max` +
      `&timezone=America/Vancouver&forecast_days=9`;
    const data = await fetchJSON(url);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// API: Exchange Rates (HKD base)
// ============================
app.get('/api/exchange', async (req, res) => {
  try {
    const data = await fetchJSON('https://open.er-api.com/v6/latest/HKD');
    const rates = data.rates;
    // Compute HKD -> target rates
    const result = {
      base: 'HKD',
      lastUpdate: data.time_last_update_utc,
      nextUpdate: data.time_next_update_utc,
      rates: {
        CAD: rates.CAD,
        JPY: rates.JPY,
        GBP: rates.GBP,
        // also include inverse for display flexibility
        CAD_to_HKD: 1 / rates.CAD,
        JPY_to_HKD: 1 / rates.JPY,
        GBP_to_HKD: 1 / rates.GBP,
      }
    };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// API: BC Public Holidays
// ============================
app.get('/api/holidays', (req, res) => {
  const now = new Date();
  const upcoming = BC_HOLIDAYS
    .map(h => {
      const date = new Date(h.date + 'T00:00:00-08:00'); // BC timezone approx
      const diffMs = date - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return { ...h, daysUntil: diffDays, dateObj: date.toISOString() };
    })
    .filter(h => h.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  res.json({
    now: now.toISOString(),
    holidays: upcoming
  });
});

// ============================
// API: Market Indices
// 主要來源：CNBC（keyless，單一請求拿齊 5 個報價，雲端 IP 亦穩定）
// 備用來源：Yahoo Finance（本機通常可用，雲端 IP 常被限流）
// ============================
const MARKET_SYMBOLS = {
  HSI:    { cnbc: '.HSI',   yahoo: '%5EHSI',  name: 'Hang Seng Index',      symbol: 'HSI',   currency: 'HKD' },
  SP500:  { cnbc: '.SPX',   yahoo: '%5EGSPC', name: 'S&P 500',              symbol: 'SPX',   currency: 'USD' },
  NAS100: { cnbc: '.NDX',   yahoo: '%5EIXIC', name: 'NASDAQ 100',           symbol: 'NDX',   currency: 'USD' },
  DOW30:  { cnbc: '.DJI',   yahoo: '%5EDJI',  name: 'Dow Jones Industrial', symbol: 'DJI',   currency: 'USD' },
  GOLD:   { cnbc: '@GC.1',  yahoo: 'GC%3DF',  name: 'Gold Futures',         symbol: 'GC=F',  currency: 'USD' },
};

const CNBC_URL = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol' +
  '?symbols=' + encodeURIComponent('.SPX|.NDX|.DJI|.HSI|@GC.1') +
  '&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1';

function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g, '').replace(/%/g, '').trim();
  if (!s || /^(unch|n\/a|--)$/i.test(s)) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchCNBCMarkets() {
  const data = await fetchJSON(CNBC_URL, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.cnbc.com/',
  });

  let quotes = data?.FormattedQuoteResult?.FormattedQuote;
  if (!quotes) throw new Error('CNBC: unexpected response');
  if (!Array.isArray(quotes)) quotes = [quotes];

  const bySymbol = {};
  quotes.forEach(q => { if (q && q.symbol) bySymbol[q.symbol.toUpperCase()] = q; });

  const out = {};
  for (const [key, info] of Object.entries(MARKET_SYMBOLS)) {
    const q = bySymbol[info.cnbc.toUpperCase()];
    if (!q) { out[key] = { name: info.name, error: 'CNBC 無此報價' }; continue; }

    const price = toNum(q.last);
    const prevClose = toNum(q.previous_day_closing);
    let change = toNum(q.change);
    let changePct = toNum(q.change_pct);

    if (change === 0 && /unch/i.test(String(q.change))) change = 0;
    if (changePct === 0 && /unch/i.test(String(q.change_pct))) changePct = 0;
    if ((changePct === null || changePct === 0) && price && prevClose) {
      change = change || (price - prevClose);
      changePct = (change / prevClose) * 100;
    }
    if (price === null) { out[key] = { name: info.name, error: '無價格' }; continue; }

    out[key] = {
      name: info.name,
      symbol: info.symbol,
      currency: q.currencyCode || info.currency,
      price,
      previousClose: prevClose,
      change: change || 0,
      changePercent: changePct || 0,
      dayHigh: toNum(q.high),
      dayLow: toNum(q.low),
      marketTime: q.last_time || null,
      source: 'CNBC',
    };
  }
  return out;
}

async function fetchYahooMarkets() {
  const out = {};
  await Promise.all(Object.entries(MARKET_SYMBOLS).map(async ([key, info]) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${info.yahoo}?interval=1d&range=5d`;
    try {
      const data = await fetchJSON(url);
      const meta = data.chart.result[0].meta;
      const current = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose;
      const change = current - prevClose;
      out[key] = {
        name: info.name,
        symbol: info.symbol,
        currency: meta.currency || info.currency,
        price: current,
        previousClose: prevClose,
        change,
        changePercent: meta.regularMarketChangePercent || (change / prevClose * 100),
        dayHigh: meta.regularMarketDayHigh,
        dayLow: meta.regularMarketDayLow,
        marketTime: meta.regularMarketTime,
        source: 'Yahoo',
      };
    } catch (e) {
      out[key] = { name: info.name, error: e.message };
    }
  }));
  return out;
}

// 30 秒快取：減少上游請求，多人同時開頁面也不會被限流
let marketsCache = { at: 0, data: null };

app.get('/api/markets', async (req, res) => {
  try {
    if (marketsCache.data && Date.now() - marketsCache.at < 30000) {
      return res.json({ timestamp: marketsCache.at, cached: true, markets: marketsCache.data });
    }

    let markets = null;
    let source = 'CNBC';

    try {
      markets = await fetchCNBCMarkets();
    } catch (e) {
      console.warn('CNBC 失敗，改用 Yahoo：', e.message);
      source = 'Yahoo';
      markets = await fetchYahooMarkets();
    }

    // 若 CNBC 有個別項目失敗，用 Yahoo 補上
    const missing = Object.keys(markets).filter(k => markets[k].error);
    if (missing.length) {
      try {
        const yahoo = await fetchYahooMarkets();
        missing.forEach(k => { if (yahoo[k] && !yahoo[k].error) markets[k] = yahoo[k]; });
        if (missing.length === Object.keys(markets).length) source = 'Yahoo';
      } catch (_) { /* 保持原狀 */ }
    }

    marketsCache = { at: Date.now(), data: markets };
    res.json({ timestamp: marketsCache.at, source, markets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings save/load — 只限本機存取，避免部署到公開網站後被其他訪客讀寫
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const fs = require('fs');

function isLoopback(req) {
  const ip = (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

app.post('/api/settings', (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ error: 'local only' });
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
    res.json({ status: 'saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  if (!isLoopback(req)) return res.json({});
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  ┌────────────────────────────────────────────┐');
  console.log('  │  Dashboard 已啟動                          │');
  console.log(`  │  ${url.padEnd(42)}│`);
  console.log('  └────────────────────────────────────────────┘');
  console.log('');
  console.log('  請用以上網址開啟（不要直接開 index.html 檔案）');
  console.log('  按 Ctrl+C 可停止服務');
  console.log('');

  // 只在本機啟動時自動開瀏覽器；雲端部署（有 PORT 環境變數）不開
  if (process.env.NO_OPEN !== '1' && !process.env.PORT) {
    const platform = process.platform;
    const cmd = platform === 'win32' ? `start "" "${url}"`
      : platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`;
    require('child_process').exec(cmd, () => {});
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  端口 ${PORT} 已被佔用。`);
    console.error('  可能儀表板已經在執行中 — 直接開 http://localhost:' + PORT);
    console.error('  或設定其他端口： set PORT=3001 && node server.js');
    console.error('');
  } else {
    console.error('伺服器錯誤：', err.message);
  }
  process.exit(1);
});

