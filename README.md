# Market Thermometer (Cron)

Market indicators automatically updated via GitHub Actions - **24/7 safe**.

## Live Data

Access JSON data directly:
```
https://raw.githubusercontent.com/leo-schlanger/market-thermo-cron/main/data/thermometer.json
```

## Indicators

| Indicator | Source | Limit | Update |
|-----------|--------|-------|--------|
| Fear & Greed Index | Alternative.me | Unlimited | Hourly |
| BTC, ETH, SOL | CoinGecko | 10k/month | Hourly |
| Funding Rate | Binance | Unlimited | Hourly |
| Global Market Cap | CoinGecko | 10k/month | Hourly |
| VIX | FRED | 120/min | Hourly |
| DXY | FRED | 120/min | Hourly |

All APIs support 24/7 operation (720 calls/month).

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
    "bitcoin": { "price": 95000, "change24h": 2.5 },
    "vix": { "value": 18.5, "zone": "NORMAL" },
    "dxy": { "value": 103.5, "zone": "NEUTRAL" },
    "fundingRate": { "rate": 0.0001, "signal": "NEUTRAL" }
  },
  "crypto": { "BTC": {...}, "ETH": {...}, "SOL": {...} },
  "alerts": [...],
  "meta": { "timestamp": "...", "apis": {...} }
}
```

## License

MIT
