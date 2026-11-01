#!/usr/bin/env node
/**
 * 抓取環球指數行情，寫入 public/data/markets.json
 * 供 GitHub Pages（純靜態）版本使用。
 *
 * 由 .github/workflows/deploy.yml 在每次部署前執行。
 * 抓取失敗時「不覆寫」舊檔，保留上一次成功的快照。
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'markets.json');

const SYMBOLS = {
  HSI:    { cnbc: '.HSI',  name: 'Hang Seng Index',      symbol: 'HSI',  currency: 'HKD' },
  SP500:  { cnbc: '.SPX',  name: 'S&P 500',              symbol: 'SPX',  currency: 'USD' },
  NAS100: { cnbc: '.NDX',  name: 'NASDAQ 100',           symbol: 'NDX',  currency: 'USD' },
  DOW30:  { cnbc: '.DJI',  name: 'Dow Jones Industrial', symbol: 'DJI',  currency: 'USD' },
  GOLD:   { cnbc: '@GC.1', name: 'Gold Futures',         symbol: 'GC=F', currency: 'USD' },
};

const CNBC_URL =
  'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol' +
  '?symbols=' + encodeURIComponent('.SPX|.NDX|.DJI|.HSI|@GC.1') +
  '&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                      '(KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.cnbc.com/',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g, '').replace(/%/g, '').trim();
  if (!s || /^(unch|n\/a|--)$/i.test(s)) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const data = await fetchJSON(CNBC_URL);

  let quotes = data?.FormattedQuoteResult?.FormattedQuote;
  if (!quotes) throw new Error('CNBC 回應格式不如預期');
  if (!Array.isArray(quotes)) quotes = [quotes];

  const bySymbol = {};
  quotes.forEach(q => { if (q && q.symbol) bySymbol[q.symbol.toUpperCase()] = q; });

  const markets = {};
  for (const [key, info] of Object.entries(SYMBOLS)) {
    const q = bySymbol[info.cnbc.toUpperCase()];
    if (!q) { markets[key] = { name: info.name, error: '無此報價' }; continue; }

    const price = toNum(q.last);
    const prevClose = toNum(q.previous_day_closing);
    let change = toNum(q.change);
    let changePct = toNum(q.change_pct);

    if ((changePct === null || changePct === 0) && price && prevClose) {
      change = change || (price - prevClose);
      changePct = (change / prevClose) * 100;
    }
    if (price === null) { markets[key] = { name: info.name, error: '無價格' }; continue; }

    markets[key] = {
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

  const ok = Object.values(markets).filter(m => !m.error).length;
  if (ok === 0) throw new Error('全部報價都失敗，保留舊快照');

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({
    timestamp: Date.now(),
    source: 'CNBC',
    generatedAt: new Date().toISOString(),
    markets,
  }, null, 2));

  console.log(`✓ 已寫入 ${OUT_FILE}（${ok}/${Object.keys(SYMBOLS).length} 個報價成功）`);
}

main().catch(err => {
  console.error('✗ 抓取失敗：', err.message);
  console.error('  保留現有快照，部署繼續進行。');
  // 不讓 workflow 失敗，否則連頁面都部署不了
  process.exit(0);
});
