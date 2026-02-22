/**
 * MARKET THERMOMETER - CRON DATA FETCHER
 * Fetches market data and saves to JSON
 * Runs via GitHub Actions
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// APIs configuration
const APIS = {
  fearGreed: 'https://api.alternative.me/fng/?limit=1',
  binanceBTC: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
  binanceETH: 'https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT',
  binanceSOL: 'https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT',
  binanceFunding: 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1',
  coingeckoGlobal: 'https://api.coingecko.com/api/v3/global',
};

// Optional APIs (require keys)
const OPTIONAL_APIS = {
  gold: process.env.GOLD_API_KEY ? {
    url: 'https://www.goldapi.io/api/XAU/USD',
    headers: { 'x-access-token': process.env.GOLD_API_KEY }
  } : null,
  fred_dxy: process.env.FRED_API_KEY ? {
    url: `https://api.stlouisfed.org/fred/series/observations?series_id=DTWEXBGS&api_key=${process.env.FRED_API_KEY}&file_type=json&limit=1&sort_order=desc`
  } : null,
  fred_vix: process.env.FRED_API_KEY ? {
    url: `https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=${process.env.FRED_API_KEY}&file_type=json&limit=1&sort_order=desc`
  } : null,
};

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        ...options
      });
      return response.data;
    } catch (error) {
      if (i === retries) {
        console.error(`Failed to fetch ${url}:`, error.message);
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
    timestamp: fg.timestamp,
    signal: value <= 25 ? 'BUY' : value >= 75 ? 'SELL' : 'NEUTRAL'
  };
}

async function fetchBinanceTicker(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`;
  const data = await fetchWithRetry(url);
  if (!data) return null;

  const price = parseFloat(data.lastPrice);
  const change = parseFloat(data.priceChangePercent);

  return {
    symbol,
    price,
    priceFormatted: price > 1000 ? `$${price.toLocaleString('en-US', {maximumFractionDigits: 0})}` : `$${price.toFixed(2)}`,
    change24h: change,
    changeFormatted: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    high24h: parseFloat(data.highPrice),
    low24h: parseFloat(data.lowPrice),
    volume24h: parseFloat(data.quoteVolume),
    sentiment: change > 3 ? 'BULLISH' : change < -3 ? 'BEARISH' : 'NEUTRAL'
  };
}

async function fetchFundingRate() {
  const data = await fetchWithRetry(APIS.binanceFunding);
  if (!data?.[0]) return null;

  const rate = parseFloat(data[0].fundingRate);
  const ratePercent = rate * 100;

  return {
    rate,
    ratePercent,
    rateFormatted: `${ratePercent >= 0 ? '+' : ''}${ratePercent.toFixed(4)}%`,
    signal: rate > 0.0005 ? 'OVERHEATED' : rate < -0.0005 ? 'OVERSOLD' : 'NEUTRAL',
    interpretation: rate > 0.001 ? 'Longs paying high - correction risk' :
                    rate < -0.001 ? 'Shorts paying - possible reversal' :
                    'Market balanced'
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

async function fetchGold() {
  if (!OPTIONAL_APIS.gold) return { price: null, source: 'API_KEY_REQUIRED' };

  const data = await fetchWithRetry(OPTIONAL_APIS.gold.url, {
    headers: OPTIONAL_APIS.gold.headers
  });

  if (!data?.price) return null;

  return {
    price: data.price,
    priceFormatted: `$${data.price.toLocaleString('en-US', {maximumFractionDigits: 2})}`,
    change: data.ch,
    changePercent: data.chp,
    source: 'GoldAPI'
  };
}

async function fetchFredIndicator(type) {
  const api = type === 'vix' ? OPTIONAL_APIS.fred_vix : OPTIONAL_APIS.fred_dxy;
  if (!api) return { value: null, source: 'API_KEY_REQUIRED' };

  const data = await fetchWithRetry(api.url);
  if (!data?.observations?.[0]) return null;

  const value = parseFloat(data.observations[0].value);

  if (type === 'vix') {
    return {
      value,
      zone: value < 15 ? 'LOW' : value < 20 ? 'NORMAL' : value < 30 ? 'ELEVATED' : 'EXTREME',
      signal: value > 30 ? 'PANIC' : value > 25 ? 'FEAR' : value < 15 ? 'COMPLACENCY' : 'NEUTRAL',
      source: 'FRED'
    };
  } else {
    return {
      value,
      zone: value > 105 ? 'STRONG' : value > 100 ? 'NEUTRAL' : 'WEAK',
      impact: value > 105 ? 'Pressures BTC and gold' : value < 100 ? 'Favors BTC and gold' : 'Neutral',
      source: 'FRED'
    };
  }
}

function generateAlerts(data) {
  const alerts = [];

  // Fear & Greed
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

  // VIX
  if (data.vix?.value > 30) {
    alerts.push({
      level: 'critical',
      type: 'vix',
      title: 'Extreme VIX',
      message: `VIX at ${data.vix.value.toFixed(1)}. Market panic.`
    });
  }

  // BTC movement
  if (data.crypto?.BTC && Math.abs(data.crypto.BTC.change24h) > 8) {
    alerts.push({
      level: 'warning',
      type: 'btc_volatility',
      title: 'High BTC Volatility',
      message: `Bitcoin ${data.crypto.BTC.change24h > 0 ? 'up' : 'down'} ${Math.abs(data.crypto.BTC.change24h).toFixed(1)}% in 24h.`
    });
  }

  // Funding Rate
  if (data.fundingRate?.rate > 0.001) {
    alerts.push({
      level: 'warning',
      type: 'funding',
      title: 'High Funding Rate',
      message: `Funding at ${data.fundingRate.rateFormatted}. Longs paying high.`
    });
  }

  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.level] - order[b.level];
  });
}

async function main() {
  console.log('Fetching market data...\n');

  // Fetch all data in parallel
  const [fearGreed, btc, eth, sol, fundingRate, globalCrypto, gold, vix, dxy] = await Promise.all([
    fetchFearGreed(),
    fetchBinanceTicker('BTC'),
    fetchBinanceTicker('ETH'),
    fetchBinanceTicker('SOL'),
    fetchFundingRate(),
    fetchGlobalCrypto(),
    fetchGold(),
    fetchFredIndicator('vix'),
    fetchFredIndicator('dxy')
  ]);

  const thermometer = {
    // Main dashboard
    dashboard: {
      fearGreed,
      vix,
      dxy,
      bitcoin: btc,
      fundingRate
    },

    // Crypto
    crypto: {
      BTC: btc,
      ETH: eth,
      SOL: sol,
      global: globalCrypto
    },

    // Commodities
    commodities: {
      gold
    },

    // Alerts
    alerts: generateAlerts({ fearGreed, vix, crypto: { BTC: btc }, fundingRate }),

    // Meta
    meta: {
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
      source: 'GitHub Actions Cron',
      apis: {
        fearGreed: fearGreed ? 'OK' : 'ERROR',
        binance: btc ? 'OK' : 'ERROR',
        coingecko: globalCrypto ? 'OK' : 'ERROR',
        gold: gold?.price ? 'OK' : (gold?.source || 'ERROR'),
        fred: vix?.value ? 'OK' : (vix?.source || 'ERROR')
      }
    }
  };

  // Save to file
  const outputPath = path.join(__dirname, '..', 'data', 'thermometer.json');
  fs.writeFileSync(outputPath, JSON.stringify(thermometer, null, 2));

  console.log('Dashboard:');
  console.log(`  Fear & Greed: ${fearGreed?.value || 'N/A'} (${fearGreed?.classification || 'N/A'})`);
  console.log(`  BTC: ${btc?.priceFormatted || 'N/A'} (${btc?.changeFormatted || 'N/A'})`);
  console.log(`  VIX: ${vix?.value?.toFixed(1) || 'N/A'} (${vix?.zone || 'N/A'})`);
  console.log(`  DXY: ${dxy?.value?.toFixed(2) || 'N/A'} (${dxy?.zone || 'N/A'})`);
  console.log(`  Funding: ${fundingRate?.rateFormatted || 'N/A'}`);
  console.log(`  Gold: ${gold?.priceFormatted || 'N/A'}`);
  console.log(`\nAlerts: ${thermometer.alerts.length}`);
  thermometer.alerts.forEach(a => console.log(`  [${a.level.toUpperCase()}] ${a.title}`));
  console.log(`\nSaved to: ${outputPath}`);
}

main().catch(console.error);
