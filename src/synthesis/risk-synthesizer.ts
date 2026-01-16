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

    // Cash flow coverage component
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
    }

    // Runway component
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

    components.push({
        name: 'Financial Health Signals',
        value: 50 + avgImpact,
        weight: 0.3,
        rawMetric: avgImpact,
        interpretation: avgImpact > 10 ? 'Positive signals' : avgImpact < -10 ? 'Concerning signals' : 'Mixed signals',
    });

    const score = calculateWeightedScore(components);

    return {
        name: 'Serviceability',
        score,
        weight: 0.30,
        components,
        explanation: generateExplanation('serviceability', score, components, relevantInsights),
    };
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

    // Churn rate component
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
    }

    // Document completeness
    const docTypes = context.documents.map(d => d.type);
    const requiredDocs = ['tax_filing', 'insurance_certificate'];
    const presentDocs = requiredDocs.filter(t => docTypes.includes(t as typeof docTypes[number]));
    const docScore = (presentDocs.length / requiredDocs.length) * 100;

    components.push({
        name: 'Documentation Completeness',
        value: docScore,
        weight: 0.4,
        rawMetric: { present: presentDocs, required: requiredDocs },
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
