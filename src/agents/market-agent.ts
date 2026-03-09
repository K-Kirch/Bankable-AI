/**
 * The Market Agent (LLM-Only)
 * 
 * Evaluates industry positioning, competitive landscape, and growth trajectory.
 * All analysis performed by LLM with audit trail.
 */

import { BaseAgent } from './base-agent.js';
import type { InsightCategory } from '../types/index.js';

export class MarketAgent extends BaseAgent {
    readonly id = 'market' as const;
    readonly name = 'The Market Analyst';
    readonly description = 'Industry positioning specialist analyzing competitive landscape, market sizing, growth trajectory, and sector-specific risk factors.';

    readonly categories: InsightCategory[] = ['growth_trajectory', 'risk_exposure'];

    readonly analysisPrompt = `Perform comprehensive market and industry analysis focusing on:

1. MARKET POSITIONING
   - Assess the company's competitive position within its industry
   - Evaluate barriers to entry and competitive moat
   - Identify key differentiators or lack thereof
   - Score: Strong moat/position = +20 to +35, Average = 0 to +10, Weak/commoditized = -15 to -30

2. GROWTH TRAJECTORY
   - Analyze revenue growth trends and sustainability
   - Evaluate market size and the company's penetration
   - Assess scalability of the business model
   - Score: Strong, sustainable growth = +20 to +35, Moderate = 0 to +15, Stalling/declining = -20 to -35

3. INDUSTRY RISK FACTORS
   - Identify sector-specific regulatory or macroeconomic risks
   - Evaluate cyclicality and sensitivity to economic downturns
   - Assess technological disruption risk
   - Score: Low-risk industry = +10 to +20, Moderate = -5 to +5, High-risk = -15 to -30

4. CUSTOMER & MARKET DYNAMICS
   - Evaluate total addressable market (TAM) relative to current revenue
   - Assess customer acquisition efficiency signals
   - Analyze pricing power and margin sustainability
   - Score: Large TAM, strong pricing = +15 to +30, Average = 0 to +10, Shrinking/pressured = -10 to -25

Use available financial data, document content, and any industry indicators to form your assessment.
Be specific about what industry the company operates in and benchmark against sector norms.
If industry cannot be determined, state this explicitly and use general SME benchmarks.`;
}
