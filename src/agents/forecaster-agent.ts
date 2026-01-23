/**
 * The Forecaster Agent (LLM-Only)
 * 
 * Performs stress-tests and scenario modeling.
 * All analysis performed by LLM with audit trail.
 */

import { BaseAgent } from './base-agent.js';
import type { InsightCategory, GlobalContext } from '../types/index.js';
import type { Message } from '../core/message-bus.js';

export class ForecasterAgent extends BaseAgent {
    readonly id = 'forecaster' as const;
    readonly name = 'The Forecaster';
    readonly description = 'Scenario analyst specializing in stress-testing, future risk projection, growth trajectory modeling, and probability assessment of adverse outcomes.';

    readonly categories: InsightCategory[] = ['growth_trajectory', 'risk_exposure'];

    readonly analysisPrompt = `Perform comprehensive forward-looking risk analysis focusing on:

1. GROWTH TRAJECTORY ANALYSIS
   - Project growth based on current trends
   - Assess sustainability of current growth rate
   - Consider churn/retention impact on net growth
   - Score: Hypergrowth (>50% net) = +25 to +35, Strong (20-50%) = +15 to +25, Modest (0-20%) = 0 to +10, Declining = -20 to -35

2. STRESS TEST SCENARIOS
   Analyze company resilience under scenarios:
   
   a) BASE CASE (50% probability)
      - Current trajectory continues
      
   b) PESSIMISTIC CASE (25% probability)  
      - 20% revenue decline
      - 50% increase in churn
      - 20% cost increase
      
   c) CATASTROPHIC CASE (5% probability)
      - 50% revenue decline
      - Major customer loss
      - 50% cost increase
   
   Score overall resilience: Highly resilient = +15 to +25, Moderate = 0 to +10, Fragile = -20 to -35

3. DEFAULT PROBABILITY ASSESSMENT
   - Estimate 12-month cash depletion probability
   - Consider current runway and burn rate
   - Factor in revenue trajectory
   - Score: <5% default prob = +15 to +25, 5-15% = 0 to +10, 15-30% = -15 to -25, >30% = -30 to -45

4. BLACK SWAN VULNERABILITY
   - Identify specific external risks (market, regulatory, technological)
   - Assess customer dependency risks
   - Evaluate operational single points of failure
   - Score: Well hedged = +5 to +15, Some exposure = -5 to +5, Highly vulnerable = -15 to -30

Be quantitative where possible. State assumptions clearly. Consider both upside and downside scenarios.`;

    /** Insights received from other agents that may inform our analysis */
    private otherAgentInsights: Array<{ from: string; category: string; impact: number; summary: string }> = [];

    protected handleMessage(message: Message): void {
        // Capture insights from other agents to inform scenario analysis
        if (message.type === 'insight_update') {
            const payload = message.payload as { category: string; impact: number; summary: string };
            this.otherAgentInsights.push({
                from: message.from,
                ...payload,
            });
            console.log(`[${this.id}] Received insight from ${message.from}: ${payload.summary}`);
        }
    }

    /**
     * Override to include insights from other agents in our analysis
     */
    protected prepareAnalysisData(context: GlobalContext): Record<string, unknown> {
        const baseData = super.prepareAnalysisData(context);

        return {
            ...baseData,
            otherAgentFindings: this.otherAgentInsights,
            analysisNote: this.otherAgentInsights.length > 0
                ? 'Other agents have already identified these findings - factor them into your stress scenarios'
                : 'You are analyzing independently - no findings from other agents yet',
        };
    }
}
