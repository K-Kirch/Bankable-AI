/**
 * The Forecaster Agent
 * 
 * Performs stress-tests and scenario modeling.
 * Analyzes: growth projections, sensitivity analysis, Monte Carlo simulations.
 */

import { BaseAgent } from './base-agent.js';
import type {
    AgentInsight,
    GlobalContext,
} from '../types/index.js';
import type { Message } from '../core/message-bus.js';

interface ScenarioResult {
    name: string;
    probability: number;
    cashFlowImpact: number;
    runwayChange: number;
    bankabilityImpact: number;
}

interface StressTestResults {
    baseCase: ScenarioResult;
    optimistic: ScenarioResult;
    pessimistic: ScenarioResult;
    catastrophic: ScenarioResult;
    monteCarlo: {
        medianOutcome: number;
        p10Outcome: number;
        p90Outcome: number;
        probabilityOfDefault: number;
    };
}

interface ForecastInsightResponse {
    findings: Array<{
        category: 'growth_trajectory' | 'risk_exposure';
        title: string;
        description: string;
        impact: number;
        confidence: number;
        reasoning: string;
    }>;
}

export class ForecasterAgent extends BaseAgent {
    readonly id = 'forecaster' as const;
    readonly name = 'The Forecaster';
    readonly description = 'Scenario analyst specializing in stress-testing, Monte Carlo simulations, and growth trajectory modeling.';

    private counterInsights: Array<{ category: string; impact: number; summary: string }> = [];

    protected handleMessage(message: Message): void {
        // Listen for Counter agent's findings to inform stress tests
        if (message.from === 'counter' && message.type === 'insight_update') {
            this.counterInsights.push(message.payload as { category: string; impact: number; summary: string });
        }
    }

    protected async analyze(context: GlobalContext): Promise<AgentInsight[]> {
        const insights: AgentInsight[] = [];

        // Run stress tests
        const stressResults = await this.runStressTests(context);
        insights.push(this.generateStressTestInsight(stressResults, context));

        // Monte Carlo simulation insight
        insights.push(this.generateMonteCarloInsight(stressResults, context));

        // Growth trajectory analysis
        const growthInsight = await this.analyzeGrowthTrajectory(context);
        insights.push(growthInsight);

        // LLM-enhanced scenario analysis
        const llmInsights = await this.performLLMAnalysis(context, stressResults);
        insights.push(...llmInsights);

        return insights;
    }

    private async runStressTests(context: GlobalContext): Promise<StressTestResults> {
        const stripe = context.apiSnapshots.stripe;
        const plaid = context.apiSnapshots.plaid;

        const baseMRR = stripe?.mrr ?? 0;
        const baseGrowth = stripe?.arrGrowthRate ?? 0;
        const burnRate = plaid?.cashFlow?.burnRate ?? 0;
        const currentRunway = plaid?.cashFlow?.runwayMonths ?? 12;
        const churnRate = stripe?.churnRate ?? 0.05;

        // Define scenarios
        const scenarios = {
            baseCase: { mrrMultiplier: 1.0, churnMultiplier: 1.0, costMultiplier: 1.0 },
            optimistic: { mrrMultiplier: 1.3, churnMultiplier: 0.7, costMultiplier: 0.9 },
            pessimistic: { mrrMultiplier: 0.8, churnMultiplier: 1.5, costMultiplier: 1.2 },
            catastrophic: { mrrMultiplier: 0.5, churnMultiplier: 2.5, costMultiplier: 1.5 },
        };

        const calculateScenario = (
            name: string,
            params: { mrrMultiplier: number; churnMultiplier: number; costMultiplier: number },
            probability: number
        ): ScenarioResult => {
            const projectedMRR = baseMRR * params.mrrMultiplier;
            const projectedChurn = churnRate * params.churnMultiplier;
            const projectedBurn = burnRate * params.costMultiplier;

            const netCashFlow = projectedMRR - projectedBurn;
            const runwayChange = currentRunway * (params.mrrMultiplier / params.costMultiplier) - currentRunway;

            // Simplified bankability impact calculation
            const bankabilityImpact =
                (params.mrrMultiplier - 1) * 30 +
                (1 - params.churnMultiplier) * 20 +
                (1 - params.costMultiplier) * 15;

            return {
                name,
                probability,
                cashFlowImpact: netCashFlow,
                runwayChange,
                bankabilityImpact,
            };
        };

        const baseCase = calculateScenario('Base Case', scenarios.baseCase, 0.5);
        const optimistic = calculateScenario('Optimistic', scenarios.optimistic, 0.2);
        const pessimistic = calculateScenario('Pessimistic', scenarios.pessimistic, 0.25);
        const catastrophic = calculateScenario('Catastrophic', scenarios.catastrophic, 0.05);

        // Monte Carlo simulation (simplified)
        const monteCarlo = this.runMonteCarloSimulation(baseMRR, baseGrowth, burnRate, churnRate);

        return {
            baseCase,
            optimistic,
            pessimistic,
            catastrophic,
            monteCarlo,
        };
    }

    private runMonteCarloSimulation(
        baseMRR: number,
        growthRate: number,
        burnRate: number,
        churnRate: number
    ): { medianOutcome: number; p10Outcome: number; p90Outcome: number; probabilityOfDefault: number } {
        const iterations = 1000;
        const horizonMonths = 12;
        const outcomes: number[] = [];
        let defaults = 0;

        for (let i = 0; i < iterations; i++) {
            let mrr = baseMRR;
            let cash = baseMRR * 6; // Assume 6 months cash

            for (let month = 0; month < horizonMonths; month++) {
                // Random variation in growth (-10% to +10% of base growth)
                const growthVar = (Math.random() - 0.5) * 0.2;
                const effectiveGrowth = growthRate + growthVar;

                // Random churn variation
                const churnVar = (Math.random() - 0.5) * 0.02;
                const effectiveChurn = Math.max(0, churnRate + churnVar);

                mrr = mrr * (1 + effectiveGrowth / 12) * (1 - effectiveChurn);
                cash = cash + mrr - burnRate;

                if (cash < 0) {
                    defaults++;
                    break;
                }
            }

            outcomes.push(cash);
        }

        outcomes.sort((a, b) => a - b);

        return {
            medianOutcome: outcomes[Math.floor(iterations * 0.5)] ?? 0,
            p10Outcome: outcomes[Math.floor(iterations * 0.1)] ?? 0,
            p90Outcome: outcomes[Math.floor(iterations * 0.9)] ?? 0,
            probabilityOfDefault: defaults / iterations,
        };
    }

    private generateStressTestInsight(results: StressTestResults, context: GlobalContext): AgentInsight {
        const worstCase = results.catastrophic;
        const bestCase = results.optimistic;

        // Weighted expected outcome
        const expectedImpact =
            results.baseCase.bankabilityImpact * results.baseCase.probability +
            results.optimistic.bankabilityImpact * results.optimistic.probability +
            results.pessimistic.bankabilityImpact * results.pessimistic.probability +
            results.catastrophic.bankabilityImpact * results.catastrophic.probability;

        let impact: number;
        let description: string;

        if (worstCase.runwayChange > -3) {
            impact = 15;
            description = `Resilient under stress. Even catastrophic scenario (5% probability) shows manageable runway reduction of ${worstCase.runwayChange.toFixed(1)} months.`;
        } else if (worstCase.runwayChange > -6) {
            impact = -10;
            description = `Moderate stress vulnerability. Catastrophic scenario would reduce runway by ${Math.abs(worstCase.runwayChange).toFixed(1)} months.`;
        } else {
            impact = -25;
            description = `High stress vulnerability. Adverse scenarios significantly impact viability. Catastrophic case: ${worstCase.runwayChange.toFixed(1)} month runway change.`;
        }

        return this.createInsight({
            category: 'risk_exposure',
            title: `Stress Test: ${expectedImpact > 0 ? '+' : ''}${expectedImpact.toFixed(1)} expected impact`,
            description,
            confidence: 0.75,
            impact,
            evidence: [
                this.createEvidence({
                    source: 'derived',
                    field: 'stress_test_results',
                    value: {
                        scenarios: [results.baseCase, results.optimistic, results.pessimistic, results.catastrophic],
                    },
                    confidence: 0.75,
                }),
            ],
            reasoningChain: `Ran 4 scenarios: Base (50%), Optimistic (20%), Pessimistic (25%), Catastrophic (5%). Weighted expected bankability impact: ${expectedImpact.toFixed(1)} points.`,
        });
    }

    private generateMonteCarloInsight(results: StressTestResults, context: GlobalContext): AgentInsight {
        const mc = results.monteCarlo;
        const podPercent = (mc.probabilityOfDefault * 100).toFixed(1);

        let impact: number;
        let description: string;

        if (mc.probabilityOfDefault < 0.05) {
            impact = 20;
            description = `Low default risk. Monte Carlo simulation (1,000 iterations) shows ${podPercent}% probability of cash depletion over 12 months.`;
        } else if (mc.probabilityOfDefault < 0.15) {
            impact = -5;
            description = `Moderate default risk. Monte Carlo shows ${podPercent}% probability of default. Median outcome: $${(mc.medianOutcome / 1000).toFixed(0)}K cash position.`;
        } else {
            impact = -30;
            description = `High default risk. Monte Carlo shows ${podPercent}% probability of cash depletion. P10 outcome: $${(mc.p10Outcome / 1000).toFixed(0)}K.`;
        }

        return this.createInsight({
            category: 'risk_exposure',
            title: `Monte Carlo: ${podPercent}% Default Probability`,
            description,
            confidence: 0.7,
            impact,
            evidence: [
                this.createEvidence({
                    source: 'derived',
                    field: 'monte_carlo_simulation',
                    value: mc,
                    confidence: 0.7,
                }),
            ],
            reasoningChain: `Simulated 1,000 scenarios with random variations in growth rate (±10%), churn (±2%), over 12 month horizon. Probability of default = iterations where cash < 0 / total iterations.`,
        });
    }

    private async analyzeGrowthTrajectory(context: GlobalContext): Promise<AgentInsight> {
        const stripe = context.apiSnapshots.stripe;
        const growthRate = stripe?.arrGrowthRate ?? 0;
        const churnRate = stripe?.churnRate ?? 0;

        // Net growth = new revenue growth - churn
        const netGrowth = growthRate - (churnRate * 12); // Annualized

        let impact: number;
        let description: string;
        let trajectory: string;

        if (netGrowth > 0.5) {
            impact = 25;
            trajectory = 'Hypergrowth';
            description = `Hypergrowth trajectory with ${(netGrowth * 100).toFixed(0)}% net annual growth. Strong momentum despite ${(churnRate * 100).toFixed(1)}% monthly churn.`;
        } else if (netGrowth > 0.2) {
            impact = 15;
            trajectory = 'Strong Growth';
            description = `Strong growth trajectory: ${(netGrowth * 100).toFixed(0)}% net annual growth after accounting for churn.`;
        } else if (netGrowth > 0) {
            impact = 0;
            trajectory = 'Modest Growth';
            description = `Modest growth: ${(netGrowth * 100).toFixed(0)}% net annual growth. Churn partially offsets new revenue.`;
        } else {
            impact = -20;
            trajectory = 'Declining';
            description = `Concerning trajectory: ${(netGrowth * 100).toFixed(0)}% net growth. Churn exceeds new revenue acquisition.`;
        }

        return this.createInsight({
            category: 'growth_trajectory',
            title: `Growth Trajectory: ${trajectory}`,
            description,
            confidence: stripe ? 0.85 : 0.5,
            impact,
            evidence: [
                this.createEvidence({
                    source: 'api',
                    field: 'stripe.arrGrowthRate',
                    value: growthRate,
                    confidence: 0.9,
                }),
                this.createEvidence({
                    source: 'api',
                    field: 'stripe.churnRate',
                    value: churnRate,
                    confidence: 0.9,
                }),
            ],
            reasoningChain: `Net growth = ARR growth rate (${(growthRate * 100).toFixed(1)}%) - annualized churn (${(churnRate * 12 * 100).toFixed(1)}%) = ${(netGrowth * 100).toFixed(1)}%.`,
        });
    }

    private async performLLMAnalysis(
        context: GlobalContext,
        stressResults: StressTestResults
    ): Promise<AgentInsight[]> {
        const prompt = this.buildAnalysisPrompt(
            'Analyze forward-looking risks and opportunities. Consider market conditions, growth sustainability, and potential black swan events.',
            {
                stressTestResults: stressResults,
                counterAgentFindings: this.counterInsights,
                stripeMetrics: context.apiSnapshots.stripe,
                plaidMetrics: context.apiSnapshots.plaid,
            }
        );

        const response = await this.promptLLMWithJSON<ForecastInsightResponse>(prompt + `

Respond in this JSON format:
{
  "findings": [
    {
      "category": "growth_trajectory" | "risk_exposure",
      "title": "Brief title",
      "description": "Detailed explanation",
      "impact": -100 to 100,
      "confidence": 0 to 1,
      "reasoning": "Explanation of analysis"
    }
  ]
}`);

        return response.findings.map(f => this.createInsight({
            category: f.category as 'growth_trajectory' | 'risk_exposure',
            title: f.title,
            description: f.description,
            confidence: f.confidence,
            impact: f.impact,
            evidence: [],
            reasoningChain: f.reasoning,
        }));
    }
}
