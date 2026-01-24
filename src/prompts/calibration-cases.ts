/**
 * Calibration Cases
 * 
 * Few-shot examples that anchor LLM scoring to expected ranges.
 * These help the model understand what scores different company
 * profiles should receive.
 */

// ============================================
// TYPES
// ============================================

export interface CalibrationCase {
    id: string;
    industry: string;
    profile: string;
    keyMetrics: {
        revenue?: string;
        growth?: string;
        margin?: string;
        concentration?: string;
        debtLevel?: string;
        runway?: string;
        years?: number;
    };
    expectedScore: number;
    expectedGrade: string;
    keyFactors: {
        factor: string;
        impact: string;
        reasoning: string;
    }[];
}

// ============================================
// CALIBRATION CASES
// ============================================

export const CALIBRATION_CASES: CalibrationCase[] = [
    // Manufacturing - Strong
    {
        id: 'mfg-strong-001',
        industry: 'manufacturing',
        profile: 'Established B2B heavy equipment manufacturer, 65+ years operating history, steady growth',
        keyMetrics: {
            revenue: '1.2B DKK',
            growth: '6% annual',
            margin: '30% gross, 4.3% net',
            concentration: '29% top customer',
            debtLevel: '1.5x debt/equity',
            years: 65,
        },
        expectedScore: 78,
        expectedGrade: 'B+',
        keyFactors: [
            { factor: 'Debt serviceability', impact: '+20 to +25', reasoning: 'Strong cash flow, reducing debt over time' },
            { factor: 'Operating history', impact: '+10 to +15', reasoning: '65 years demonstrates resilience' },
            { factor: 'Customer concentration', impact: '-5 to -10', reasoning: '29% is normal for B2B manufacturing' },
            { factor: 'Growth trajectory', impact: '+5 to +10', reasoning: 'Steady growth, improving margins' },
        ],
    },

    // Manufacturing - Moderate
    {
        id: 'mfg-moderate-001',
        industry: 'manufacturing',
        profile: 'Mid-sized construction supplier, 25 years history, flat growth',
        keyMetrics: {
            revenue: '200M DKK',
            growth: '1% annual',
            margin: '25% gross, 2% net',
            concentration: '35% top customer',
            debtLevel: '2.0x debt/equity',
            years: 25,
        },
        expectedScore: 62,
        expectedGrade: 'C',
        keyFactors: [
            { factor: 'Debt level', impact: '-10 to -15', reasoning: 'Higher than ideal leverage' },
            { factor: 'Growth stagnation', impact: '-5 to -10', reasoning: 'Flat growth is concerning' },
            { factor: 'Customer concentration', impact: '-10 to -15', reasoning: '35% approaching concerning level' },
            { factor: 'Operating history', impact: '+10', reasoning: '25 years is solid' },
        ],
    },

    // SaaS - Strong
    {
        id: 'saas-strong-001',
        industry: 'saas',
        profile: 'High-growth B2B SaaS, 5 years old, expanding internationally',
        keyMetrics: {
            revenue: '50M DKK ARR',
            growth: '80% annual',
            margin: '75% gross, -15% net',
            concentration: '8% top customer',
            debtLevel: '0.3x debt/equity',
            runway: '24 months',
        },
        expectedScore: 82,
        expectedGrade: 'A-',
        keyFactors: [
            { factor: 'Revenue growth', impact: '+25 to +30', reasoning: 'Exceptional growth rate' },
            { factor: 'Customer diversification', impact: '+15 to +20', reasoning: 'Excellent distribution' },
            { factor: 'Cash burn', impact: '-5 to -10', reasoning: 'Negative margins but strong runway' },
            { factor: 'Gross margin', impact: '+10', reasoning: 'High SaaS margins indicate scalability' },
        ],
    },

    // SaaS - Challenged
    {
        id: 'saas-challenged-001',
        industry: 'saas',
        profile: 'Struggling SaaS, high churn, slowing growth',
        keyMetrics: {
            revenue: '20M DKK ARR',
            growth: '5% annual',
            margin: '65% gross, -40% net',
            concentration: '22% top customer',
            debtLevel: '0.5x debt/equity',
            runway: '8 months',
        },
        expectedScore: 45,
        expectedGrade: 'D',
        keyFactors: [
            { factor: 'Growth slowdown', impact: '-15 to -20', reasoning: 'SaaS at 5% growth is stalling' },
            { factor: 'Cash runway', impact: '-20 to -25', reasoning: '8 months is critical' },
            { factor: 'Customer concentration', impact: '-10 to -15', reasoning: 'High for SaaS model' },
            { factor: 'Burn rate', impact: '-15', reasoning: 'Heavy losses without growth' },
        ],
    },

    // Services - Stable
    {
        id: 'services-stable-001',
        industry: 'services',
        profile: 'Established restaurant group, 3 locations, 15 years history',
        keyMetrics: {
            revenue: '25M DKK',
            growth: '3% annual',
            margin: '35% gross, 6% net',
            concentration: '5% top customer',
            debtLevel: '1.0x debt/equity',
            years: 15,
        },
        expectedScore: 68,
        expectedGrade: 'C+',
        keyFactors: [
            { factor: 'Customer diversification', impact: '+15', reasoning: 'Excellent for services' },
            { factor: 'Stable profitability', impact: '+10 to +15', reasoning: 'Consistent margins' },
            { factor: 'Multi-location risk', impact: '-5', reasoning: 'Increased complexity' },
            { factor: 'Industry volatility', impact: '-5 to -10', reasoning: 'Food service is cyclical' },
        ],
    },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get calibration examples for a specific industry
 */
export function getCalibrationCases(industry?: string, limit: number = 3): CalibrationCase[] {
    let cases = CALIBRATION_CASES;

    if (industry) {
        cases = cases.filter(c => c.industry === industry);
    }

    return cases.slice(0, limit);
}

/**
 * Format calibration cases for prompt injection
 */
export function getCalibrationPrompt(industry?: string, limit: number = 3): string {
    const cases = getCalibrationCases(industry, limit);

    if (cases.length === 0) {
        return '';
    }

    const formatted = cases.map(c => `
EXAMPLE: ${c.profile}
- Expected Score: ${c.expectedScore} (${c.expectedGrade})
- Key Factors:
${c.keyFactors.map(f => `  • ${f.factor}: ${f.impact} - ${f.reasoning}`).join('\n')}
`).join('\n');

    return `
CALIBRATION EXAMPLES:
Use these examples to calibrate your scoring:
${formatted}
`.trim();
}
