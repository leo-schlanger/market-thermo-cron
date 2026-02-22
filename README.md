# Market Thermometer (Cron)

Market indicators automatically updated via GitHub Actions.

## Live Data

Access JSON data directly:
```
https://raw.githubusercontent.com/YOUR_USERNAME/market-thermo-cron/main/data/thermometer.json
```

## Indicators

| Indicator | Source | Update |
|-----------|--------|--------|
| Fear & Greed Index | Alternative.me | Every 15min |
| BTC, ETH, SOL | Binance | Every 15min |
| Funding Rate | Binance Futures | Every 15min |
| Global Market Cap | CoinGecko | Every 15min |
| VIX | FRED* | Every 15min |
| DXY | FRED* | Every 15min |
| Gold | GoldAPI* | Every 15min |

*Requires API key configured in secrets

## Setup

1. Fork this repository
2. Configure secrets (optional):
   - `FRED_API_KEY` - [Get free](https://fred.stlouisfed.org/docs/api/api_key.html)
   - `GOLD_API_KEY` - [Get free](https://www.goldapi.io/)
3. GitHub Actions will update data automatically

## Local Usage

```bash
npm install
npm run update
```

## Data Structure

```json
{
  "dashboard": {
    "fearGreed": { "value": 45, "signal": "NEUTRAL" },
    "bitcoin": { "price": 95000, "change24h": 2.5 },
    "vix": { "value": 18.5, "zone": "NORMAL" },
    "fundingRate": { "rate": 0.0001, "signal": "NEUTRAL" }
  },
  "crypto": { "BTC": {...}, "ETH": {...}, "SOL": {...} },
  "alerts": [...],
  "meta": { "timestamp": "...", "apis": {...} }
}
```

## License

MIT
