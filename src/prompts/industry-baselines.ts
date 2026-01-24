/**
 * Industry Baselines
 * 
 * Provides industry-specific metric thresholds for calibrating
 * agent analysis. These help the LLM understand what's "normal"
 * for different business types.
 */

// ============================================
// TYPES
// ============================================

export interface MetricRange {
    low: number;
    typical: number;
    high: number;
    unit?: string;
}

export interface IndustryBaseline {
    name: string;
    description: string;
    keywords: string[];  // For matching

    metrics: {
        grossMargin: MetricRange;
        netMargin: MetricRange;
        customerConcentration: { acceptable: number; concerning: number; critical: number };
        debtToEquity: MetricRange;
        revenueGrowth: MetricRange;
        employeeCount: MetricRange;
    };

    considerations: string[];
    scoringGuidelines: string[];
}

// ============================================
// BASELINE DEFINITIONS
// ============================================

export const INDUSTRY_BASELINES: Record<string, IndustryBaseline> = {
    manufacturing: {
        name: 'Manufacturing',
        description: 'Companies producing physical goods, heavy equipment, machinery',
        keywords: ['manufacturing', 'production', 'equipment', 'machinery', 'factory', 'industrial'],

        metrics: {
            grossMargin: { low: 0.20, typical: 0.30, high: 0.45, unit: '%' },
            netMargin: { low: 0.03, typical: 0.07, high: 0.12, unit: '%' },
            customerConcentration: { acceptable: 0.30, concerning: 0.45, critical: 0.60 },
            debtToEquity: { low: 0.8, typical: 1.5, high: 2.5 },
            revenueGrowth: { low: 0.02, typical: 0.06, high: 0.15, unit: 'annual' },
            employeeCount: { low: 50, typical: 200, high: 1000 },
        },

        considerations: [
            'Capital-intensive with significant fixed assets',
            'Longer sales cycles and customer contracts',
            'Customer concentration is normal in B2B - 30% with top customer is acceptable',
            'Inventory management is critical',
            'Operating history adds significant value',
        ],

        scoringGuidelines: [
            'Customer concentration 25-35% → mild negative (-5 to -10), not severe',
            'Steady 5-7% annual growth is healthy for mature manufacturing',
            'Debt/Equity of 1.5x is normal for capital-intensive industries',
            '65+ years operating history → strong positive (+10 to +15)',
        ],
    },

    saas: {
        name: 'SaaS / Software',
        description: 'Software-as-a-service, subscription-based software companies',
        keywords: ['saas', 'software', 'technology', 'subscription', 'platform', 'tech'],

        metrics: {
            grossMargin: { low: 0.60, typical: 0.75, high: 0.85, unit: '%' },
            netMargin: { low: -0.20, typical: 0.05, high: 0.20, unit: '%' },
            customerConcentration: { acceptable: 0.15, concerning: 0.25, critical: 0.40 },
            debtToEquity: { low: 0.2, typical: 0.5, high: 1.2 },
            revenueGrowth: { low: 0.15, typical: 0.40, high: 1.00, unit: 'annual' },
            employeeCount: { low: 10, typical: 50, high: 300 },
        },

        considerations: [
            'High gross margins due to software scalability',
            'Net losses acceptable if driving growth',
            'Churn rate is critical metric',
            'Customer diversification is more important than manufacturing',
            'NRR (Net Revenue Retention) indicates expansion potential',
        ],

        scoringGuidelines: [
            'MRR growth 40%+ annually → strong positive (+20 to +30)',
            'Churn >5% monthly is concerning → negative (-15 to -25)',
            'Customer concentration >25% is higher risk for SaaS → (-15 to -20)',
            'Cash burn acceptable if runway >18 months',
        ],
    },

    services: {
        name: 'Professional Services',
        description: 'Restaurants, consulting, hospitality, personal services',
        keywords: ['restaurant', 'hospitality', 'consulting', 'services', 'agency', 'cafe'],

        metrics: {
            grossMargin: { low: 0.25, typical: 0.40, high: 0.55, unit: '%' },
            netMargin: { low: 0.02, typical: 0.08, high: 0.15, unit: '%' },
            customerConcentration: { acceptable: 0.10, concerning: 0.20, critical: 0.35 },
            debtToEquity: { low: 0.3, typical: 1.0, high: 2.0 },
            revenueGrowth: { low: 0.00, typical: 0.05, high: 0.20, unit: 'annual' },
            employeeCount: { low: 5, typical: 25, high: 100 },
        },

        considerations: [
            'People-intensive businesses',
            'Location and reputation drive value',
            'Seasonal variations common',
            'Lower barriers to entry',
            'Customer loyalty is key differentiator',
        ],

        scoringGuidelines: [
            'Stable revenue in services is positive - less emphasis on high growth',
            'Employee retention matters more than customer concentration',
            'Multi-location businesses have higher complexity risk',
            'Lease terms and location stability are important',
        ],
    },

    default: {
        name: 'General Business',
        description: 'Default baseline for unclassified industries',
        keywords: [],

        metrics: {
            grossMargin: { low: 0.25, typical: 0.40, high: 0.60, unit: '%' },
            netMargin: { low: 0.03, typical: 0.08, high: 0.15, unit: '%' },
            customerConcentration: { acceptable: 0.25, concerning: 0.40, critical: 0.55 },
            debtToEquity: { low: 0.5, typical: 1.2, high: 2.0 },
            revenueGrowth: { low: 0.03, typical: 0.10, high: 0.30, unit: 'annual' },
            employeeCount: { low: 10, typical: 50, high: 250 },
        },

        considerations: [
            'Apply general business principles',
            'Consider industry-specific factors case by case',
        ],

        scoringGuidelines: [
            'Focus on profitability, cash flow, and debt management',
            'Balance growth with stability',
        ],
    },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Detect industry from company data
 */
export function detectIndustry(data: { industry?: string; description?: string }): string {
    const text = `${data.industry || ''} ${data.description || ''}`.toLowerCase();

    for (const [key, baseline] of Object.entries(INDUSTRY_BASELINES)) {
        if (key === 'default') continue;
        if (baseline.keywords.some(kw => text.includes(kw))) {
            return key;
        }
    }

    return 'default';
}

/**
 * Format industry baseline for prompt injection
 */
export function getIndustryBaselinePrompt(industryKey: string): string {
    // Guaranteed to have a value due to default fallback
    const baseline: IndustryBaseline = INDUSTRY_BASELINES[industryKey] ?? INDUSTRY_BASELINES['default']!;

    const grossMargin = baseline.metrics.grossMargin;
    const concentration = baseline.metrics.customerConcentration;
    const debtToEquity = baseline.metrics.debtToEquity;
    const revenueGrowth = baseline.metrics.revenueGrowth;

    return `
INDUSTRY BASELINE: ${baseline.name}
${baseline.description}

TYPICAL METRICS FOR THIS INDUSTRY:
- Gross Margin: ${(grossMargin.typical * 100).toFixed(0)}% typical (${(grossMargin.low * 100).toFixed(0)}% low, ${(grossMargin.high * 100).toFixed(0)}% high)
- Customer Concentration: ${(concentration.acceptable * 100).toFixed(0)}% acceptable, >${(concentration.concerning * 100).toFixed(0)}% concerning
- Debt/Equity: ${debtToEquity.typical}x typical
- Annual Growth: ${(revenueGrowth.typical * 100).toFixed(0)}% typical

INDUSTRY CONSIDERATIONS:
${baseline.considerations.map(c => `• ${c}`).join('\n')}

SCORING GUIDELINES FOR THIS INDUSTRY:
${baseline.scoringGuidelines.map(g => `• ${g}`).join('\n')}
`.trim();
}
