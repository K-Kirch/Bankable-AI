/**
 * The Counter Agent (LLM-Only)
 * 
 * Evaluates financial health and debt serviceability.
 * All analysis performed by LLM with audit trail.
 */

import { BaseAgent } from './base-agent.js';
import type { InsightCategory } from '../types/index.js';

export class CounterAgent extends BaseAgent {
    readonly id = 'counter' as const;
    readonly name = 'The Counter';
    readonly description = 'Financial health analyst specializing in cash flow analysis, debt serviceability assessment, and revenue concentration risk evaluation.';

    readonly categories: InsightCategory[] = ['financial_health', 'revenue_quality'];

    readonly analysisPrompt = `Perform comprehensive financial analysis focusing on:

1. DEBT SERVICEABILITY
   - Analyze cash inflow vs outflow patterns
   - Calculate effective debt service coverage ratio (DSCR)
   - Assess ability to meet financial obligations
   - Score: Strong (>1.5x) = +20 to +30, Adequate (1.0-1.5x) = 0 to +10, Weak (<1.0x) = -20 to -40

2. REVENUE CONCENTRATION
   - Evaluate customer concentration risk using available data
   - Identify if any single customer represents >20% of revenue
   - Assess revenue diversification
   - Score: Well diversified = +15 to +25, Moderate concentration = -5 to +5, High concentration = -20 to -35

3. CASH FLOW HEALTH
   - Analyze burn rate and runway
   - Evaluate cash flow stability and predictability
   - Identify seasonal patterns or concerning trends
   - Score: Strong positive cash flow = +15 to +25, Neutral = 0, Negative/declining = -15 to -30

4. REVENUE QUALITY
   - Assess MRR/ARR trends if SaaS
   - Evaluate revenue growth trajectory
   - Analyze churn rates and customer retention
   - Score: High quality recurring = +20 to +30, Mixed = 0 to +10, Low quality/volatile = -15 to -25

Be specific about numbers you find in the data. If data is missing, state assumptions clearly.`;
}
