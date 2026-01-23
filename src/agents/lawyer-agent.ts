/**
 * The Lawyer Agent (LLM-Only)
 * 
 * Evaluates legal structure and contract security.
 * All analysis performed by LLM with audit trail.
 */

import { BaseAgent } from './base-agent.js';
import type { InsightCategory } from '../types/index.js';

export class LawyerAgent extends BaseAgent {
    readonly id = 'lawyer' as const;
    readonly name = 'The Lawyer';
    readonly description = 'Legal analyst specializing in contract security, retention risk, customer lock-in assessment, and regulatory compliance evaluation.';

    readonly categories: InsightCategory[] = ['legal_structure', 'contract_security', 'compliance_status'];

    readonly analysisPrompt = `Perform comprehensive legal and compliance analysis focusing on:

1. CONTRACT SECURITY
   - Analyze contract terms from available documents
   - Evaluate notice periods (longer = better protection)
   - Check for auto-renewal clauses
   - Assess termination penalties and conditions
   - Score: Strong contracts (60+ day notice, auto-renew) = +15 to +25, Moderate = 0 to +10, Weak (<30 day notice, easy termination) = -15 to -30

2. CUSTOMER RETENTION PROTECTION
   - Evaluate contractual lock-in mechanisms
   - Assess switching costs for customers
   - Review service level agreements
   - Score: High retention protection = +10 to +20, Moderate = 0, Low protection = -10 to -20

3. COMPLIANCE STATUS
   - Check for tax filing documentation
   - Verify insurance certificates
   - Assess regulatory compliance indicators
   - Identify any compliance gaps or risks
   - Score: Full compliance = +10 to +15, Partial (missing items) = -5 to -15, Major gaps = -25 to -40

4. LEGAL STRUCTURE & GOVERNANCE
   - Evaluate corporate structure from available data
   - Assess jurisdiction considerations
   - Review any governance-related documents
   - Score: Clean structure = +5 to +15, Minor concerns = 0, Significant issues = -15 to -30

When documents are missing, note this as a compliance gap. Be specific about what you find in contracts.`;
}
