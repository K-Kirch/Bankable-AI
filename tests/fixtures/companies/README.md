# Test Company Fixtures

Realistic test data based on Danish companies for validating the Bankable.ai scoring system.

## Companies

| Company | Industry | Size | Expected Grade | Test Purpose |
|---------|----------|------|----------------|--------------|
| **Novo Nordisk** | Pharmaceutical | Large (47K employees) | A (88-95) | Healthy large-cap with strong growth |
| **Pleo Technologies** | Fintech SaaS | Scale-up (850 employees) | C (58-70) | High-growth, high-burn scenario |
| **Spisehuset 5C** | Restaurant | Small (8 employees) | C+ (62-74) | Small business improving trajectory |
| **Hydrema Produktion** | Manufacturing | Medium (450 employees) | B+ (74-84) | Stable deleveraging company |
| **Murermester K** | Construction | Small (12 employees) | D (38-52) | Severe deterioration stress test |

## Data Structure

Each company folder contains:

```
company-name/
  └── input.json   # 3 years of financial data
```

### input.json Schema

```json
{
  "company": { /* name, cvr, industry, employees */ },
  "documents": {
    "profit_and_loss": {
      "2024": { /* revenue, grossProfit, netIncome, etc */ },
      "2023": { /* ... */ },
      "2022": { /* ... */ }
    },
    "balance_sheet": {
      "2024": { /* assets, liabilities, equity */ },
      "2023": { /* ... */ },
      "2022": { /* ... */ }
    },
    "contracts": [ /* customer & supplier agreements */ ]
  },
  "stripe": { /* SaaS metrics if applicable */ },
  "plaid": { /* bank balances, cash flows */ },
  "trends": {
    "revenueGrowth": [yoy_2024, yoy_2023],
    "netIncomeGrowth": [yoy_2024, yoy_2023],
    "notes": "Trajectory analysis"
  },
  "expectedScore": {
    "range": [min, max],
    "grade": "A|B|C|D|F",
    "notes": "Why this score is expected"
  }
}
```

## Test Scenarios

1. **Strong growth (Novo Nordisk)** - 25-30% YoY growth, should score 88+
2. **SaaS metrics (Pleo)** - Losses but improving unit economics, ~60-70
3. **Recovery (Spisehuset)** - Post-COVID improvement visible in trends
4. **Stable (Hydrema)** - Consistent growth, deleveraging, ~75-84
5. **Stress test (Murermester K)** - 77% profit collapse in latest year, <52
