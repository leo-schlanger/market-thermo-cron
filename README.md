# Market Thermometer (Cron)

Market indicators automatically updated via GitHub Actions - **24/7 safe**.

## Live Data

Access JSON data directly:
```
https://raw.githubusercontent.com/leo-schlanger/market-thermo-cron/main/data/thermometer.json
```

## Indicators

| Indicator | Source | Key Required | Rate Limit | Update |
|-----------|--------|:------------:|------------|--------|
| Fear & Greed Index | Alternative.me | No | Unlimited | Hourly |
| BTC, ETH, SOL | CoinGecko | No | 10k/month | Hourly |
| Global Market Cap | CoinGecko | No | 10k/month | Hourly |
| VIX | FRED | Yes (free) | 120/min | Hourly |
| DXY | FRED | Yes (free) | 120/min | Hourly |
| S&P 500 | FRED | Yes (free) | 120/min | Hourly |
| 10Y Treasury | FRED | Yes (free) | 120/min | Hourly |
| Gold (London PM) | FRED | Yes (free) | 120/min | Hourly |

All APIs support 24/7 operation (720 calls/month).

## Alerts

Automatic alerts for extreme market conditions:

| Condition | Level | Trigger |
|-----------|-------|---------|
| Extreme Fear | Critical | Fear & Greed ≤ 20 |
| Extreme Greed | Warning | Fear & Greed ≥ 80 |
| Market Panic | Critical | VIX > 30 |
| BTC High Volatility | Warning | BTC 24h change > ±8% |
| Treasury Yield Spike | Warning | 10Y > 5% |

## Setup

1. Fork this repository
2. Add secret `FRED_API_KEY` - [Get free](https://fred.stlouisfed.org/docs/api/api_key.html)
3. Enable Actions in your fork
4. Data updates automatically every hour

## Local Usage

```bash
npm install
FRED_API_KEY=your_key npm run update
```

## Data Structure

```json
{
  "dashboard": {
    "fearGreed": { "value": 45, "signal": "NEUTRAL" },
    "vix": { "value": 18.5, "zone": "NORMAL" },
    "dxy": { "value": 103.5, "zone": "NEUTRAL" },
    "sp500": { "value": 5200, "valueFormatted": "$5,200" },
    "treasury10y": { "value": 4.25, "zone": "ELEVATED" },
    "gold": { "value": 2350.50, "valueFormatted": "$2,350.50" },
    "bitcoin": { "price": 95000, "change24h": 2.5 }
  },
  "crypto": { "BTC": {...}, "ETH": {...}, "SOL": {...}, "global": {...} },
  "alerts": [{ "level": "warning", "type": "...", "title": "...", "message": "..." }],
  "meta": { "timestamp": "...", "apis": { "fearGreed": "OK", "coingecko": "OK", "fred": "OK" } }
}
```

## License

MIT
