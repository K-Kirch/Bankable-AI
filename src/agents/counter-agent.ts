/**
 * The Counter Agent
 * 
 * Evaluates financial health and debt serviceability.
 * Analyzes: cash flow, revenue quality, burn rate, debt obligations.
 */

import { BaseAgent } from './base-agent.js';
import type {
    AgentInsight,
    GlobalContext,
    StripeSnapshot,
} from '../types/index.js';

interface FinancialAnalysis {
    serviceabilityRatio: number;
    concentrationIndex: number;
    burnRate: number;
    runwayMonths: number;
    mrrGrowthTrend: 'declining' | 'stable' | 'growing';
    riskFlags: string[];
}

interface FinancialInsightResponse {
    findings: Array<{
        category: 'financial_health' | 'revenue_quality';
        title: string;
        description: string;
        impact: number;
        confidence: number;
        reasoning: string;
    }>;
}

export class CounterAgent extends BaseAgent {
    readonly id = 'counter' as const;
    readonly name = 'The Counter';
    readonly description = 'Financial health analyst specializing in cash flow, serviceability, and revenue concentration risk assessment.';

    protected async analyze(context: GlobalContext): Promise<AgentInsight[]> {
        const insights: AgentInsight[] = [];

        // Calculate core financial metrics
        const metrics = this.calculateFinancialMetrics(context);

        // Generate serviceability insight
        insights.push(this.generateServiceabilityInsight(metrics, context));

        // Generate concentration insight
        insights.push(this.generateConcentrationInsight(metrics, context));

        // LLM-enhanced analysis for nuanced findings
        const llmInsights = await this.performLLMAnalysis(context, metrics);
        insights.push(...llmInsights);

        return insights;
    }

    private calculateFinancialMetrics(context: GlobalContext): FinancialAnalysis {
        const stripe = context.apiSnapshots.stripe;
        const plaid = context.apiSnapshots.plaid;

        // Calculate serviceability ratio
        const monthlyInflow = plaid?.cashFlow?.averageMonthlyInflow ?? 0;
        const monthlyOutflow = plaid?.cashFlow?.averageMonthlyOutflow ?? 0;
        const estimatedDebtService = monthlyOutflow * 0.3; // Assume 30% of outflow is debt

        const serviceabilityRatio = estimatedDebtService > 0
            ? (monthlyInflow - monthlyOutflow + estimatedDebtService) / estimatedDebtService
            : 0;

        // Calculate Herfindahl-Hirschman Index for concentration
        const concentrationIndex = this.calculateHHI(stripe?.topCustomers ?? []);

        // Extract burn rate and runway
        const burnRate = plaid?.cashFlow?.burnRate ?? 0;
        const runwayMonths = plaid?.cashFlow?.runwayMonths ?? 0;

        // Determine MRR trend
        const mrrGrowthTrend = this.determineMRRTrend(stripe);

        // Identify risk flags
        const riskFlags = this.identifyRiskFlags({
            serviceabilityRatio,
            concentrationIndex,
            burnRate,
            runwayMonths,
            churnRate: stripe?.churnRate,
        });

        return {
            serviceabilityRatio,
            concentrationIndex,
            burnRate,
            runwayMonths,
            mrrGrowthTrend,
            riskFlags,
        };
    }

    private calculateHHI(customers: Array<{ percentOfTotal: number }>): number {
        if (customers.length === 0) return 0;
        return customers.reduce((sum, c) => sum + Math.pow(c.percentOfTotal, 2), 0);
    }

    private determineMRRTrend(stripe?: StripeSnapshot): 'declining' | 'stable' | 'growing' {
        if (!stripe) return 'stable';

        const growth = stripe.arrGrowthRate;
        if (growth < -0.05) return 'declining';
        if (growth > 0.1) return 'growing';
        return 'stable';
    }

    private identifyRiskFlags(metrics: {
        serviceabilityRatio: number;
        concentrationIndex: number;
        burnRate: number;
        runwayMonths: number;
        churnRate?: number;
    }): string[] {
        const flags: string[] = [];

        if (metrics.serviceabilityRatio < 1.0) {
            flags.push('CRITICAL: Cash flow insufficient to service debt obligations');
        }
        if (metrics.concentrationIndex > 0.25) {
            flags.push('HIGH: Revenue concentration risk - top customers represent majority of revenue');
        }
        if (metrics.runwayMonths < 6) {
            flags.push('WARNING: Less than 6 months runway remaining');
        }
        if (metrics.churnRate && metrics.churnRate > 0.05) {
            flags.push('WARNING: Monthly churn rate exceeds 5%');
        }

        return flags;
    }

    private generateServiceabilityInsight(
        metrics: FinancialAnalysis,
        context: GlobalContext
    ): AgentInsight {
        const ratio = metrics.serviceabilityRatio;
        let impact: number;
        let description: string;

        if (ratio >= 1.5) {
            impact = 25;
            description = `Strong serviceability with ${ratio.toFixed(2)}x debt coverage. Cash flow comfortably exceeds obligations.`;
        } else if (ratio >= 1.0) {
            impact = 0;
            description = `Adequate serviceability with ${ratio.toFixed(2)}x coverage. Some buffer but limited margin for downturns.`;
        } else {
            impact = -40;
            description = `Critical serviceability concern: ${ratio.toFixed(2)}x coverage ratio indicates cash flow below debt obligations.`;
        }

        return this.createInsight({
            category: 'financial_health',
            title: `Debt Serviceability: ${ratio.toFixed(2)}x coverage`,
            description,
            confidence: context.apiSnapshots.plaid ? 0.9 : 0.5,
            impact,
            evidence: [
                this.createEvidence({
                    source: 'api',
                    field: 'plaid.cashFlow',
                    value: context.apiSnapshots.plaid?.cashFlow,
                    confidence: 0.95,
                }),
            ],
            reasoningChain: `Calculated serviceability as (Monthly Inflow - Operating Expenses + Debt Service) / Debt Service = ${ratio.toFixed(2)}. Industry standard minimum is 1.2x.`,
        });
    }

    private generateConcentrationInsight(
        metrics: FinancialAnalysis,
        context: GlobalContext
    ): AgentInsight {
        const hhi = metrics.concentrationIndex;
        const stripe = context.apiSnapshots.stripe;
        const topCustomerPct = stripe?.topCustomers?.[0]?.percentOfTotal ?? 0;

        let impact: number;
        let description: string;

        if (hhi < 0.1) {
            impact = 20;
            description = `Healthy revenue diversification. No single customer exceeds ${(topCustomerPct * 100).toFixed(1)}% of revenue.`;
        } else if (hhi < 0.25) {
            impact = -5;
            description = `Moderate concentration risk. Top customer represents ${(topCustomerPct * 100).toFixed(1)}% of revenue.`;
        } else {
            impact = -30;
            description = `High concentration risk. Revenue heavily dependent on top customers (HHI: ${(hhi * 100).toFixed(1)}%).`;
        }

        return this.createInsight({
            category: 'revenue_quality',
            title: `Revenue Concentration: HHI ${(hhi * 100).toFixed(1)}%`,
            description,
            confidence: stripe ? 0.9 : 0.4,
            impact,
            evidence: [
                this.createEvidence({
                    source: 'api',
                    field: 'stripe.topCustomers',
                    value: stripe?.topCustomers?.slice(0, 3),
                    confidence: 0.95,
                }),
            ],
            reasoningChain: `Calculated Herfindahl-Hirschman Index (HHI) from customer revenue distribution. HHI > 0.25 indicates high concentration. Current HHI: ${hhi.toFixed(4)}.`,
        });
    }

    private async performLLMAnalysis(
        context: GlobalContext,
        metrics: FinancialAnalysis
    ): Promise<AgentInsight[]> {
        const prompt = this.buildAnalysisPrompt(
            'Analyze the financial health of this startup and identify additional risk factors or positive signals not captured by standard metrics.',
            {
                calculatedMetrics: metrics,
                stripeData: context.apiSnapshots.stripe,
                plaidData: context.apiSnapshots.plaid,
                documentCount: context.documents.length,
                documentTypes: context.documents.map(d => d.type),
            }
        );

        const response = await this.promptLLMWithJSON<FinancialInsightResponse>(prompt + `

Respond in this JSON format:
{
  "findings": [
    {
      "category": "financial_health" | "revenue_quality",
      "title": "Brief title",
      "description": "Detailed explanation",
      "impact": -100 to 100,
      "confidence": 0 to 1,
      "reasoning": "Explanation of analysis"
    }
  ]
}`);

        return response.findings.map(f => this.createInsight({
            category: f.category,
            title: f.title,
            description: f.description,
            confidence: f.confidence,
            impact: f.impact,
            evidence: [],
            reasoningChain: f.reasoning,
        }));
    }
}
