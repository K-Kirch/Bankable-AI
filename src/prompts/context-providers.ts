/**
 * Context Providers
 * 
 * Modular prompt components that can be composed together
 * to build comprehensive agent prompts.
 */

import type { GlobalContext } from '../types/index.js';
import type { AgentId } from '../types/index.js';

// ============================================
// TYPES
// ============================================

export interface ContextProvider {
    name: string;
    description: string;
    getContext(data: ContextProviderInput): string;
}

export interface ContextProviderInput {
    agentId: AgentId;
    globalContext?: GlobalContext;
    industry?: string;
    analysisData?: Record<string, unknown>;
}

// ============================================
// COORDINATION RULES
// ============================================

const AGENT_DOMAINS: Record<AgentId, { primary: string[]; avoid: string[] }> = {
    counter: {
        primary: [
            'Cash flow analysis',
            'Debt serviceability',
            'Revenue quality and trends',
            'Financial ratios',
            'Burn rate and runway',
        ],
        avoid: [
            'Contract terms (Lawyer domain)',
            'Future projections beyond 12 months (Forecaster domain)',
            'Legal compliance (Lawyer domain)',
        ],
    },
    lawyer: {
        primary: [
            'Contract analysis',
            'Customer/supplier agreement terms',
            'Compliance documentation',
            'Legal structure',
            'Regulatory risks',
        ],
        avoid: [
            'Financial calculations (Counter domain)',
            'Growth projections (Forecaster domain)',
            'Cash flow metrics (Counter domain)',
        ],
    },
    forecaster: {
        primary: [
            'Growth trajectory projections',
            'Scenario analysis and stress testing',
            'Default probability estimation',
            'Market and external risks',
            'Long-term viability',
        ],
        avoid: [
            'Current financial state (Counter domain)',
            'Contract details (Lawyer domain)',
            'Historical compliance (Lawyer domain)',
        ],
    },
};

// ============================================
// CONTEXT PROVIDERS
// ============================================

export const CONTEXT_PROVIDERS: ContextProvider[] = [
    {
        name: 'coordination_rules',
        description: 'Prevents agents from double-counting or overlapping analysis',
        getContext: ({ agentId }) => {
            const domain = AGENT_DOMAINS[agentId];
            if (!domain) return '';

            return `
AGENT COORDINATION RULES:
You are ONE of THREE specialized agents analyzing this company. To avoid overlap:

YOUR PRIMARY FOCUS (score these):
${domain.primary.map(p => `• ${p}`).join('\n')}

DEFER TO OTHER AGENTS (do NOT score these):
${domain.avoid.map(a => `• ${a}`).join('\n')}

If you notice something outside your domain, briefly mention it but DO NOT assign an impact score.
            `.trim();
        },
    },

    {
        name: 'scoring_guidelines',
        description: 'General scoring calibration rules',
        getContext: () => `
SCORING BEST PRACTICES:
• Impact scores should sum to a reasonable total (typically +20 to +80 for healthy, -20 to +40 for moderate, <0 for distressed)
• Avoid extreme scores (-40 or +40) unless truly exceptional
• One insight per distinct finding - don't split or duplicate
• Be decisive: avoid 0 impact scores (neutral observations add no value)
• Confidence reflects data quality: 0.9+ if from verified source, 0.6-0.8 if inferred
        `.trim(),
    },

    {
        name: 'operating_history',
        description: 'Provides context about company age and stability',
        getContext: ({ analysisData }) => {
            const years = extractOperatingYears(analysisData);
            if (!years) return '';

            let guidance: string;
            if (years >= 50) {
                guidance = 'EXCEPTIONAL longevity - this company has survived multiple economic cycles. Award +10 to +15 for stability.';
            } else if (years >= 20) {
                guidance = 'STRONG track record - established business. Award +5 to +10 for stability.';
            } else if (years >= 10) {
                guidance = 'SOLID history - moderate track record. Neutral to slight positive.';
            } else if (years >= 5) {
                guidance = 'DEVELOPING - still proving sustainability. Neutral.';
            } else {
                guidance = 'EARLY stage - higher risk due to lack of track record. Consider -5 to -10.';
            }

            return `
OPERATING HISTORY: ${years} years
${guidance}
            `.trim();
        },
    },

    {
        name: 'data_quality',
        description: 'Indicates what data sources are available',
        getContext: ({ globalContext }) => {
            if (!globalContext) return '';

            const sources: string[] = [];
            if (globalContext.documents.length > 0) {
                sources.push(`${globalContext.documents.length} documents`);
            }
            if (globalContext.apiSnapshots.stripe) {
                sources.push('Stripe data');
            }
            if (globalContext.apiSnapshots.plaid) {
                sources.push('Plaid banking data');
            }

            return `
AVAILABLE DATA SOURCES: ${sources.join(', ') || 'Limited data'}
Adjust confidence scores based on data availability. Missing data sources = lower confidence.
            `.trim();
        },
    },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractOperatingYears(data?: Record<string, unknown>): number | null {
    if (!data) return null;

    // Try to find founding year or years in operation
    const company = data.company as Record<string, unknown> | undefined;
    if (company?.founded) {
        const founded = parseInt(String(company.founded), 10);
        if (!isNaN(founded)) {
            return new Date().getFullYear() - founded;
        }
    }

    return null;
}

/**
 * Get all context for an agent
 */
export function getAllContext(input: ContextProviderInput): string {
    return CONTEXT_PROVIDERS
        .map(provider => provider.getContext(input))
        .filter(text => text.length > 0)
        .join('\n\n');
}

/**
 * Get specific context providers by name
 */
export function getContextByName(names: string[], input: ContextProviderInput): string {
    return CONTEXT_PROVIDERS
        .filter(p => names.includes(p.name))
        .map(p => p.getContext(input))
        .filter(text => text.length > 0)
        .join('\n\n');
}
