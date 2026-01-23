/**
 * Risk Synthesizer
 * 
 * Aggregates agent insights into structured risk factors.
 */

import type {
    AgentInsight,
    GlobalContext,
    RiskFactorMap,
    RiskFactor,
    RiskComponent,
} from '../types/index.js';

/**
 * Synthesize agent insights into risk factors
 */
export async function synthesizeRiskFactors(
    insights: AgentInsight[],
    context: GlobalContext
): Promise<RiskFactorMap> {
    return {
        serviceability: synthesizeServiceability(insights, context),
        concentration: synthesizeConcentration(insights, context),
        retention: synthesizeRetention(insights, context),
        compliance: synthesizeCompliance(insights, context),
    };
}

function synthesizeServiceability(insights: AgentInsight[], context: GlobalContext): RiskFactor {
    const relevantInsights = insights.filter(i =>
        i.category === 'financial_health' ||
        i.category === 'risk_exposure'
    );

    const components: RiskComponent[] = [];

    // Try Plaid data first, then fall back to documents
    const plaid = context.apiSnapshots.plaid;
    if (plaid?.cashFlow) {
        const coverage = plaid.cashFlow.averageMonthlyInflow / plaid.cashFlow.averageMonthlyOutflow;
        components.push({
            name: 'Cash Flow Coverage',
            value: Math.min(100, coverage * 50),
            weight: 0.4,
            rawMetric: coverage,
            interpretation: coverage >= 1.5 ? 'Healthy' : coverage >= 1.0 ? 'Adequate' : 'Insufficient',
        });
    } else {
        // Fallback: Calculate from parsed documents (P&L data)
        const plDoc = context.documents.find(d => d.type === 'profit_and_loss');
        const bsDoc = context.documents.find(d => d.type === 'balance_sheet');

        if (plDoc?.data || bsDoc?.data) {
            // Extract latest year's metrics from document data
            const plData = plDoc?.data as Record<string, unknown> | undefined;
            const bsData = bsDoc?.data as Record<string, unknown> | undefined;

            // Try to get profitability indicators
            const netIncome = extractLatestValue(plData, 'netIncome') ?? 0;
            const revenue = extractLatestValue(plData, 'revenue') ?? 1;
            const totalAssets = extractLatestValue(bsData, 'totalAssets', 'assets') ?? 1;
            const totalLiabilities = extractLatestValue(bsData, 'totalLiabilities', 'liabilities') ?? 0;
            const equity = extractLatestValue(bsData, 'totalEquity', 'equity') ?? 0;

            // Profitability ratio (net income / revenue)
            // For manufacturing, 3-5% net margin is typical, 5-10% is good
            const profitMargin = revenue > 0 ? netIncome / revenue : 0;
            const profitScore = Math.min(100, Math.max(0, profitMargin > 0 ? 60 + (profitMargin * 400) : 40 + (profitMargin * 200)));

            components.push({
                name: 'Profitability',
                value: profitScore,
                weight: 0.4,
                rawMetric: profitMargin,
                interpretation: profitMargin >= 0.1 ? 'Healthy' : profitMargin >= 0.03 ? 'Adequate' : profitMargin >= 0 ? 'Marginal' : 'Loss-making',
            });

            // Equity ratio (equity / total assets)
            // 30%+ equity ratio is considered healthy for most industries
            const equityRatio = totalAssets > 0 ? equity / totalAssets : 0;
            const equityScore = Math.min(100, Math.max(0, equityRatio >= 0.4 ? 75 + (equityRatio * 50) : equityRatio * 200));

            components.push({
                name: 'Equity Ratio',
                value: equityScore,
                weight: 0.3,
                rawMetric: equityRatio,
                interpretation: equityRatio >= 0.5 ? 'Strong' : equityRatio >= 0.3 ? 'Adequate' : 'Leveraged',
            });

            // Debt serviceability (simplified: equity should cover debts)
            const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : 1;
            const debtScore = Math.min(100, Math.max(0, (1 - debtRatio) * 100));

            components.push({
                name: 'Debt Level',
                value: debtScore,
                weight: 0.3,
                rawMetric: debtRatio,
                interpretation: debtRatio <= 0.4 ? 'Low debt' : debtRatio <= 0.6 ? 'Moderate' : 'High debt',
            });
        }
    }

    // Runway component (from Plaid if available)
    if (plaid?.cashFlow?.runwayMonths) {
        const runway = plaid.cashFlow.runwayMonths;
        components.push({
            name: 'Runway',
            value: Math.min(100, runway * 5),
            weight: 0.3,
            rawMetric: runway,
            interpretation: runway >= 18 ? 'Strong' : runway >= 12 ? 'Adequate' : runway >= 6 ? 'Limited' : 'Critical',
        });
    }

    // Insight-derived component
    const avgImpact = relevantInsights.length > 0
        ? relevantInsights.reduce((sum, i) => sum + i.impact, 0) / relevantInsights.length
        : 0;

    if (components.length === 0 || relevantInsights.length > 0) {
        components.push({
            name: 'Financial Health Signals',
            value: 50 + avgImpact,
            weight: components.length === 0 ? 1.0 : 0.3,
            rawMetric: avgImpact,
            interpretation: avgImpact > 10 ? 'Positive signals' : avgImpact < -10 ? 'Concerning signals' : 'Mixed signals',
        });
    }

    const score = calculateWeightedScore(components);

    return {
        name: 'Serviceability',
        score,
        weight: 0.30,
        components,
        explanation: generateExplanation('serviceability', score, components, relevantInsights),
    };
}

/**
 * Extract the latest year's value from document data
 * Handles both flat structure and year-keyed structure
 */
function extractLatestValue(
    data: Record<string, unknown> | undefined,
    ...keys: string[]
): number | undefined {
    if (!data) return undefined;

    // Check for year-keyed data (e.g., { "2024": { revenue: 100 }, "2023": { revenue: 90 } })
    const years = Object.keys(data).filter(k => /^\d{4}$/.test(k)).sort().reverse();
    if (years.length > 0) {
        const latestYear = data[years[0]!] as Record<string, unknown>;
        for (const key of keys) {
            const value = extractNestedValue(latestYear, key);
            if (value !== undefined) return value;
        }
    }

    // Check flat structure
    for (const key of keys) {
        const value = extractNestedValue(data, key);
        if (value !== undefined) return value;
    }

    return undefined;
}

function extractNestedValue(obj: Record<string, unknown>, key: string): number | undefined {
    if (obj[key] !== undefined && typeof obj[key] === 'number') {
        return obj[key] as number;
    }
    // Check nested objects (e.g., balance_sheet.assets.totalAssets)
    for (const k of Object.keys(obj)) {
        const nested = obj[k];
        if (typeof nested === 'object' && nested !== null) {
            const value = extractNestedValue(nested as Record<string, unknown>, key);
            if (value !== undefined) return value;
        }
    }
    return undefined;
}

function synthesizeConcentration(insights: AgentInsight[], context: GlobalContext): RiskFactor {
    const relevantInsights = insights.filter(i => i.category === 'revenue_quality');
    const components: RiskComponent[] = [];

    // Customer concentration from Stripe
    const stripe = context.apiSnapshots.stripe;
    if (stripe?.topCustomers && stripe.topCustomers.length > 0) {
        const topCustomerPct = stripe.topCustomers[0]?.percentOfTotal ?? 0;
        const hhi = stripe.topCustomers.reduce((sum, c) => sum + Math.pow(c.percentOfTotal, 2), 0);

        components.push({
            name: 'Top Customer Dependency',
            value: 100 - (topCustomerPct * 100),
            weight: 0.5,
            rawMetric: topCustomerPct,
            interpretation: topCustomerPct < 0.15 ? 'Low dependency' : topCustomerPct < 0.30 ? 'Moderate' : 'High dependency',
        });

        components.push({
            name: 'Revenue Diversification (HHI)',
            value: 100 - (hhi * 100),
            weight: 0.5,
            rawMetric: hhi,
            interpretation: hhi < 0.1 ? 'Well diversified' : hhi < 0.25 ? 'Moderate concentration' : 'Highly concentrated',
        });
    } else {
        // Fallback: Extract from contract documents if available
        const contractDocs = context.documents.filter(d => d.type === 'contract');

        if (contractDocs.length > 0) {
            // Assume moderate diversification based on presence of multiple contracts
            const diversificationScore = Math.min(100, 50 + (contractDocs.length * 10));
            components.push({
                name: 'Contract Diversification',
                value: diversificationScore,
                weight: 1.0,
                rawMetric: contractDocs.length,
                interpretation: contractDocs.length >= 5 ? 'Well diversified' : contractDocs.length >= 2 ? 'Moderate' : 'Limited data',
            });
        } else {
            // No data available - assume moderate risk (neutral score)
            components.push({
                name: 'Customer Concentration (estimated)',
                value: 60,
                weight: 1.0,
                rawMetric: null,
                interpretation: 'Insufficient data - moderate risk assumed',
            });
        }
    }

    const score = calculateWeightedScore(components);

    return {
        name: 'Concentration',
        score: Math.max(0, Math.min(100, score)),
        weight: 0.25,
        components,
        explanation: generateExplanation('concentration', score, components, relevantInsights),
    };
}

function synthesizeRetention(insights: AgentInsight[], context: GlobalContext): RiskFactor {
    const relevantInsights = insights.filter(i => i.category === 'contract_security');
    const components: RiskComponent[] = [];

    // Contract strength from insights
    const contractInsight = relevantInsights.find(i => i.title.includes('Contract Strength'));
    if (contractInsight) {
        const match = contractInsight.title.match(/(\d+)\/100/);
        const strength = match ? parseInt(match[1] ?? '50', 10) : 50;
        components.push({
            name: 'Contract Strength',
            value: strength,
            weight: 0.5,
            rawMetric: strength,
            interpretation: strength >= 70 ? 'Strong protection' : strength >= 50 ? 'Moderate' : 'Weak protection',
        });
    }

    // Churn rate component from Stripe
    const stripe = context.apiSnapshots.stripe;
    if (stripe?.churnRate !== undefined) {
        const churnScore = Math.max(0, 100 - (stripe.churnRate * 1000)); // 10% churn = 0 score
        components.push({
            name: 'Revenue Retention',
            value: churnScore,
            weight: 0.5,
            rawMetric: stripe.churnRate,
            interpretation: stripe.churnRate < 0.02 ? 'Excellent' : stripe.churnRate < 0.05 ? 'Good' : 'Concerning',
        });
    }

    // Fallback: If no components yet, estimate from revenue trend in documents
    if (components.length === 0) {
        const plDoc = context.documents.find(d => d.type === 'profit_and_loss');
        if (plDoc?.data) {
            const data = plDoc.data as Record<string, unknown>;
            const years = Object.keys(data).filter(k => /^\d{4}$/.test(k)).sort().reverse();

            if (years.length >= 2) {
                const latest = extractNestedValue(data[years[0]!] as Record<string, unknown>, 'revenue') ?? 0;
                const prior = extractNestedValue(data[years[1]!] as Record<string, unknown>, 'revenue') ?? 0;

                if (prior > 0) {
                    const growth = (latest - prior) / prior;
                    // Revenue growing = good retention signal
                    const retentionScore = Math.min(100, Math.max(0, 60 + (growth * 100)));
                    components.push({
                        name: 'Revenue Trend (retention proxy)',
                        value: retentionScore,
                        weight: 1.0,
                        rawMetric: growth,
                        interpretation: growth >= 0.1 ? 'Growing' : growth >= 0 ? 'Stable' : 'Declining',
                    });
                }
            }
        }
    }

    // Ultimate fallback: Neutral score if no data
    if (components.length === 0) {
        components.push({
            name: 'Revenue Retention (estimated)',
            value: 65,
            weight: 1.0,
            rawMetric: null,
            interpretation: 'Insufficient data - moderate retention assumed',
        });
    }

    const score = calculateWeightedScore(components);

    return {
        name: 'Retention',
        score: Math.max(0, Math.min(100, score)),
        weight: 0.25,
        components,
        explanation: generateExplanation('retention', score, components, relevantInsights),
    };
}

function synthesizeCompliance(insights: AgentInsight[], context: GlobalContext): RiskFactor {
    const relevantInsights = insights.filter(i => i.category === 'compliance_status');
    const components: RiskComponent[] = [];

    // Compliance score from insights
    const complianceInsight = relevantInsights.find(i => i.title.includes('Compliance Score'));
    if (complianceInsight) {
        const match = complianceInsight.title.match(/(\d+)\/100/);
        const score = match ? parseInt(match[1] ?? '50', 10) : 50;
        components.push({
            name: 'Regulatory Compliance',
            value: score,
            weight: 0.6,
            rawMetric: score,
            interpretation: score >= 80 ? 'Fully compliant' : score >= 60 ? 'Mostly compliant' : 'Gaps present',
        });
    } else {
        // Default: Assume moderate compliance if no specific issues found
        components.push({
            name: 'Regulatory Compliance (estimated)',
            value: 70,
            weight: 0.6,
            rawMetric: null,
            interpretation: 'No compliance issues detected - assumed compliant',
        });
    }

    // Document completeness - check for financial documents rather than just specific types
    const docTypes = context.documents.map(d => d.type);
    const financialDocs = ['profit_and_loss', 'balance_sheet', 'tax_filing', 'insurance_certificate'];
    const presentDocs = financialDocs.filter(t => docTypes.includes(t as typeof docTypes[number]));
    const docScore = Math.min(100, (presentDocs.length / 2) * 100); // 2 docs = 100%

    components.push({
        name: 'Documentation Completeness',
        value: docScore,
        weight: 0.4,
        rawMetric: { present: presentDocs, checked: financialDocs },
        interpretation: docScore >= 100 ? 'Complete' : docScore >= 50 ? 'Partial' : 'Incomplete',
    });

    const score = calculateWeightedScore(components);

    return {
        name: 'Compliance',
        score: Math.max(0, Math.min(100, score)),
        weight: 0.20,
        components,
        explanation: generateExplanation('compliance', score, components, relevantInsights),
    };
}

function calculateWeightedScore(components: RiskComponent[]): number {
    if (components.length === 0) return 50;

    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    return components.reduce((sum, c) => sum + (c.value * c.weight / totalWeight), 0);
}

function generateExplanation(
    factor: string,
    score: number,
    components: RiskComponent[],
    insights: AgentInsight[]
): string {
    const componentSummary = components
        .map(c => `${c.name}: ${c.value.toFixed(0)}/100 (${c.interpretation})`)
        .join('; ');

    const insightSummary = insights.slice(0, 2)
        .map(i => i.title)
        .join(', ');

    return `${factor.charAt(0).toUpperCase() + factor.slice(1)} score: ${score.toFixed(0)}/100. Components: ${componentSummary}. Key findings: ${insightSummary || 'None'}.`;
}
