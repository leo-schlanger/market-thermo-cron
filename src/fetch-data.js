/**
 * MARKET THERMOMETER - CRON DATA FETCHER
 * Fetches market data and saves to JSON
 * Runs via GitHub Actions (hourly, 24/7 safe)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// All APIs are free and support 24/7 usage (720+ calls/month)
const APIS = {
  fearGreed: 'https://api.alternative.me/fng/?limit=1',
  coingeckoGlobal: 'https://api.coingecko.com/api/v3/global',
  coingeckoPrices: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true',
};

// FRED API (120 calls/min - very generous)
const FRED_API_KEY = process.env.FRED_API_KEY;
const fredUrl = (seriesId) =>
  `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&limit=1&sort_order=desc`;

const FRED_SERIES = FRED_API_KEY ? {
  vix: fredUrl('VIXCLS'),
  dxy: fredUrl('DTWEXBGS'),
  sp500: fredUrl('SP500'),
  treasury10y: fredUrl('DGS10'),
  gold: fredUrl('GOLDAMGBD228NLBM'),
} : null;

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      return response.data;
    } catch (error) {
      if (i === retries) {
        console.error(`Failed: ${url.split('?')[0]}`, error.message);
        return null;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function fetchFearGreed() {
  const data = await fetchWithRetry(APIS.fearGreed);
  if (!data?.data?.[0]) return null;

  const fg = data.data[0];
  const value = parseInt(fg.value);

  return {
    value,
    classification: fg.value_classification,
    signal: value <= 25 ? 'BUY' : value >= 75 ? 'SELL' : 'NEUTRAL'
  };
}

async function fetchCryptoPrices() {
  const data = await fetchWithRetry(APIS.coingeckoPrices);
  if (!data) return null;

  const format = (coin, symbol) => ({
    symbol,
    price: coin.usd,
    priceFormatted: coin.usd > 1000
      ? `$${coin.usd.toLocaleString('en-US', {maximumFractionDigits: 0})}`
      : `$${coin.usd.toFixed(2)}`,
    change24h: parseFloat(coin.usd_24h_change?.toFixed(2)) || 0,
    changeFormatted: `${coin.usd_24h_change >= 0 ? '+' : ''}${coin.usd_24h_change?.toFixed(2) || 0}%`,
    marketCap: coin.usd_market_cap,
    sentiment: coin.usd_24h_change > 3 ? 'BULLISH' : coin.usd_24h_change < -3 ? 'BEARISH' : 'NEUTRAL'
  });

  return {
    BTC: data.bitcoin ? format(data.bitcoin, 'BTC') : null,
    ETH: data.ethereum ? format(data.ethereum, 'ETH') : null,
    SOL: data.solana ? format(data.solana, 'SOL') : null,
  };
}

async function fetchGlobalCrypto() {
  const data = await fetchWithRetry(APIS.coingeckoGlobal);
  if (!data?.data) return null;

  return {
    totalMarketCap: data.data.total_market_cap?.usd,
    totalMarketCapFormatted: `$${(data.data.total_market_cap?.usd / 1e12).toFixed(2)}T`,
    btcDominance: data.data.market_cap_percentage?.btc?.toFixed(1),
    ethDominance: data.data.market_cap_percentage?.eth?.toFixed(1),
    marketCapChange24h: data.data.market_cap_change_percentage_24h_usd?.toFixed(2)
  };
}

async function fetchFredValue(key) {
  if (!FRED_SERIES?.[key]) return null;

  const data = await fetchWithRetry(FRED_SERIES[key]);
  if (!data?.observations?.[0]) return null;

  const raw = data.observations[0].value;
  if (raw === '.') return null; // FRED uses '.' for missing data

  return parseFloat(raw);
}

async function fetchVix() {
  const value = await fetchFredValue('vix');
  if (value === null) return FRED_API_KEY ? null : { value: null, source: 'API_KEY_REQUIRED' };

  return {
    value,
    zone: value < 15 ? 'LOW' : value < 20 ? 'NORMAL' : value < 30 ? 'ELEVATED' : 'EXTREME',
    signal: value > 30 ? 'PANIC' : value > 25 ? 'FEAR' : value < 15 ? 'COMPLACENCY' : 'NEUTRAL',
    source: 'FRED'
  };
}

async function fetchDxy() {
  const value = await fetchFredValue('dxy');
  if (value === null) return FRED_API_KEY ? null : { value: null, source: 'API_KEY_REQUIRED' };

  return {
    value,
    zone: value > 105 ? 'STRONG' : value > 100 ? 'NEUTRAL' : 'WEAK',
    impact: value > 105 ? 'Pressures BTC and gold' : value < 100 ? 'Favors BTC and gold' : 'Neutral',
    source: 'FRED'
  };
}

async function fetchSP500() {
  const value = await fetchFredValue('sp500');
  if (value === null) return null;

  return {
    value,
    valueFormatted: `$${value.toLocaleString('en-US', {maximumFractionDigits: 0})}`,
    source: 'FRED'
  };
}

async function fetchTreasury10y() {
  const value = await fetchFredValue('treasury10y');
  if (value === null) return null;

  return {
    value,
    valueFormatted: `${value.toFixed(2)}%`,
    zone: value > 5 ? 'HIGH' : value > 4 ? 'ELEVATED' : value > 3 ? 'NORMAL' : 'LOW',
    source: 'FRED'
  };
}

async function fetchGold() {
  const value = await fetchFredValue('gold');
  if (value === null) return null;

  return {
    value,
    valueFormatted: `$${value.toLocaleString('en-US', {maximumFractionDigits: 2})}`,
    source: 'FRED'
  };
}

function generateAlerts(data) {
  const alerts = [];

  // Fear & Greed extremes
  if (data.fearGreed?.value <= 20) {
    alerts.push({
      level: 'critical',
      type: 'fear_greed',
      title: 'Extreme Fear',
      message: `Fear & Greed at ${data.fearGreed.value}. Historically precedes reversals.`
    });
  } else if (data.fearGreed?.value >= 80) {
    alerts.push({
      level: 'warning',
      type: 'fear_greed',
      title: 'Extreme Greed',
      message: `Fear & Greed at ${data.fearGreed.value}. High correction risk.`
    });
  }

  // VIX panic
  if (data.vix?.value > 30) {
    alerts.push({
      level: 'critical',
      type: 'vix',
      title: 'Extreme VIX',
      message: `VIX at ${data.vix.value.toFixed(1)}. Market panic.`
    });
  }

  // BTC high volatility
  if (data.crypto?.BTC && Math.abs(data.crypto.BTC.change24h) > 8) {
    alerts.push({
      level: 'warning',
      type: 'btc_volatility',
      title: 'High BTC Volatility',
      message: `Bitcoin ${data.crypto.BTC.change24h > 0 ? 'up' : 'down'} ${Math.abs(data.crypto.BTC.change24h).toFixed(1)}% in 24h.`
    });
  }

  // Treasury 10Y yield spike
  if (data.treasury10y?.value > 5) {
    alerts.push({
      level: 'warning',
      type: 'treasury_10y',
      title: 'High Treasury Yield',
      message: `10Y Treasury at ${data.treasury10y.value.toFixed(2)}%. Risk-off pressure on equities and crypto.`
    });
  }

  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.level] - order[b.level];
  });
}

async function main() {
  console.log('Fetching market data...\n');

  const [fearGreed, crypto, globalCrypto, vix, dxy, sp500, treasury10y, gold] = await Promise.all([
    fetchFearGreed(),
    fetchCryptoPrices(),
    fetchGlobalCrypto(),
    fetchVix(),
    fetchDxy(),
    fetchSP500(),
    fetchTreasury10y(),
    fetchGold()
  ]);

  const thermometer = {
    dashboard: {
      fearGreed,
      vix,
      dxy,
      sp500,
      treasury10y,
      gold,
      bitcoin: crypto?.BTC
    },
    crypto: {
      ...crypto,
      global: globalCrypto
    },
    alerts: generateAlerts({ fearGreed, vix, crypto, treasury10y }),
    meta: {
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      source: 'GitHub Actions Cron',
      nextUpdate: 'Every hour',
      apis: {
        fearGreed: fearGreed ? 'OK' : 'ERROR',
        coingecko: crypto ? 'OK' : 'ERROR',
        fred: vix?.value != null ? 'OK' : (vix?.source || 'ERROR')
      }
    }
  };

  const outputPath = path.join(__dirname, '..', 'data', 'thermometer.json');
  fs.writeFileSync(outputPath, JSON.stringify(thermometer, null, 2));

  console.log('Dashboard:');
  console.log(`  Fear & Greed: ${fearGreed?.value ?? 'N/A'} (${fearGreed?.classification ?? 'N/A'})`);
  console.log(`  BTC: ${crypto?.BTC?.priceFormatted ?? 'N/A'} (${crypto?.BTC?.changeFormatted ?? 'N/A'})`);
  console.log(`  VIX: ${vix?.value?.toFixed(1) ?? 'N/A'} (${vix?.zone ?? 'N/A'})`);
  console.log(`  DXY: ${dxy?.value?.toFixed(2) ?? 'N/A'} (${dxy?.zone ?? 'N/A'})`);
  console.log(`  S&P 500: ${sp500?.valueFormatted ?? 'N/A'}`);
  console.log(`  10Y Treasury: ${treasury10y?.valueFormatted ?? 'N/A'} (${treasury10y?.zone ?? 'N/A'})`);
  console.log(`  Gold: ${gold?.valueFormatted ?? 'N/A'}`);
  console.log(`\nAlerts: ${thermometer.alerts.length}`);
  thermometer.alerts.forEach(a => console.log(`  [${a.level.toUpperCase()}] ${a.title}`));
  console.log(`\nSaved to: ${outputPath}`);
}

main().catch(console.error);
