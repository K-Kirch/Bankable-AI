/**
 * Obvious Cases Validation
 * 
 * Pre-analysis validation layer that detects obvious edge cases
 * and returns hardcoded scores without invoking LLM analysis.
 */

import type {
    GlobalContext,
    BankabilityScore,
    RiskFactorMap,
    RemediationRoadmap,
    RiskFactor,
} from '../types/index.js';

// ============================================
// OBVIOUS CASE TYPES
// ============================================

export interface ObviousCaseResult {
    isObvious: true;
    caseType: ObviousCaseType;
    score: BankabilityScore;
    roadmap: RemediationRoadmap;
}

export type ObviousCaseType =
    | 'no_data'
    | 'empty_documents'
    | 'all_negative'
    | 'negative_equity'
    | 'zero_revenue';

// ============================================
// OBVIOUS CASE DETECTION
// ============================================

/**
 * Check if the context represents an obvious case
 * Returns null if LLM analysis should proceed
 */
export function checkObviousCases(context: GlobalContext): ObviousCaseResult | null {
    // Case 1: No data whatsoever
    if (isNoDataCase(context)) {
        return createObviousResult('no_data', 0, 'F', context, {
            summary: 'Unable to calculate score — no financial data provided.',
            explanation: 'No documents, Stripe data, or Plaid data were provided. Please upload financial documents (P&L, balance sheet) or connect financial APIs to enable analysis.'
        });
    }

    // Case 2: Documents exist but are empty/unparseable
    if (isEmptyDocumentsCase(context)) {
        return createObviousResult('empty_documents', 0, 'F', context, {
            summary: 'Unable to calculate score — documents contain no analyzable data.',
            explanation: 'Documents were uploaded but no financial data could be extracted. Please ensure documents are readable P&L statements, balance sheets, or other financial records.'
        });
    }

    // Case 3: All financial periods show losses
    const allNegative = isAllNegativeCase(context);
    if (allNegative) {
        return createObviousResult('all_negative', 15, 'F', context, {
            summary: 'Critical: All periods show financial losses.',
            explanation: 'Every financial period analyzed shows negative net income. This indicates severe financial distress requiring immediate attention.',
            serviceabilityOverride: 10,
        });
    }

    // Case 4: Negative equity (liabilities > assets)
    const negativeEquity = isNegativeEquityCase(context);
    if (negativeEquity) {
        return createObviousResult('negative_equity', 12, 'F', context, {
            summary: 'Critical: Negative equity position.',
            explanation: 'Total liabilities exceed total assets, indicating insolvency. Immediate financial restructuring required.',
            serviceabilityOverride: 8,
        });
    }

    // Case 5: Zero revenue
    if (isZeroRevenueCase(context)) {
        return createObviousResult('zero_revenue', 5, 'F', context, {
            summary: 'Critical: No revenue recorded.',
            explanation: 'Financial records show zero or no revenue. This may indicate a pre-revenue startup or data extraction issues.',
            serviceabilityOverride: 5,
        });
    }

    // Not an obvious case — proceed with LLM analysis
    return null;
}

// ============================================
// CASE DETECTION HELPERS
// ============================================

function isNoDataCase(context: GlobalContext): boolean {
    const hasDocuments = context.documents && context.documents.length > 0;
    const hasStripe = context.apiSnapshots?.stripe && (
        (context.apiSnapshots.stripe.mrr ?? 0) > 0 ||
        (context.apiSnapshots.stripe.customerCount ?? 0) > 0
    );
    const hasPlaid = context.apiSnapshots?.plaid && (
        (context.apiSnapshots.plaid.accounts?.length ?? 0) > 0 ||
        !!context.apiSnapshots.plaid.transactions
    );

    return !hasDocuments && !hasStripe && !hasPlaid;
}

function isEmptyDocumentsCase(context: GlobalContext): boolean {
    if (!context.documents || context.documents.length === 0) {
        return false; // No documents = no_data case, not empty_documents
    }

    // Check if all documents have empty/null data
    const allEmpty = context.documents.every(doc => {
        if (!doc.data) return true;
        if (typeof doc.data === 'object' && Object.keys(doc.data).length === 0) return true;
        return false;
    });

    return allEmpty;
}

function isAllNegativeCase(context: GlobalContext): boolean {
    const plDoc = context.documents?.find(d => d.type === 'profit_and_loss');
    if (!plDoc?.data) return false;

    const data = plDoc.data as Record<string, unknown>;

    // Check for year-keyed data
    const years = Object.keys(data).filter(k => /^\d{4}$/.test(k));
    if (years.length > 0) {
        const allNegative = years.every(year => {
            const yearData = data[year] as Record<string, unknown>;
            const netIncome = extractNumericValue(yearData, 'netIncome', 'net_income', 'profit', 'netProfit');
            return netIncome !== undefined && netIncome < 0;
        });
        return allNegative && years.length > 0;
    }

    // Check flat structure
    const netIncome = extractNumericValue(data, 'netIncome', 'net_income', 'profit', 'netProfit');
    return netIncome !== undefined && netIncome < 0;
}

function isNegativeEquityCase(context: GlobalContext): boolean {
    const bsDoc = context.documents?.find(d => d.type === 'balance_sheet');
    if (!bsDoc?.data) return false;

    const data = bsDoc.data as Record<string, unknown>;

    // Try to get latest values
    const equity = extractLatestNumericValue(data, 'equity', 'totalEquity', 'total_equity', 'shareholdersEquity');
    const totalAssets = extractLatestNumericValue(data, 'totalAssets', 'total_assets', 'assets');
    const totalLiabilities = extractLatestNumericValue(data, 'totalLiabilities', 'total_liabilities', 'liabilities');

    // Direct negative equity
    if (equity !== undefined && equity < 0) {
        return true;
    }

    // Liabilities > Assets
    if (totalAssets !== undefined && totalLiabilities !== undefined) {
        return totalLiabilities > totalAssets;
    }

    return false;
}

function isZeroRevenueCase(context: GlobalContext): boolean {
    const plDoc = context.documents?.find(d => d.type === 'profit_and_loss');
    if (!plDoc?.data) return false;

    const data = plDoc.data as Record<string, unknown>;
    const revenue = extractLatestNumericValue(data, 'revenue', 'totalRevenue', 'total_revenue', 'sales', 'totalSales');

    return revenue !== undefined && revenue === 0;
}

// ============================================
// VALUE EXTRACTION HELPERS
// ============================================

function extractNumericValue(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
    for (const key of keys) {
        if (obj[key] !== undefined && typeof obj[key] === 'number') {
            return obj[key] as number;
        }
        // Check nested objects
        for (const k of Object.keys(obj)) {
            const nested = obj[k];
            if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
                const value = extractNumericValue(nested as Record<string, unknown>, key);
                if (value !== undefined) return value;
            }
        }
    }
    return undefined;
}

function extractLatestNumericValue(data: Record<string, unknown>, ...keys: string[]): number | undefined {
    // Check for year-keyed data first
    const years = Object.keys(data).filter(k => /^\d{4}$/.test(k)).sort().reverse();
    if (years.length > 0) {
        const latestYear = data[years[0]!] as Record<string, unknown>;
        return extractNumericValue(latestYear, ...keys);
    }

    // Flat structure
    return extractNumericValue(data, ...keys);
}

// ============================================
// RESULT BUILDERS
// ============================================

interface ObviousResultOptions {
    summary: string;
    explanation: string;
    serviceabilityOverride?: number;
    concentrationOverride?: number;
    retentionOverride?: number;
    complianceOverride?: number;
}

function createObviousResult(
    caseType: ObviousCaseType,
    score: number,
    grade: 'A' | 'B' | 'C' | 'D' | 'F',
    context: GlobalContext,
    options: ObviousResultOptions
): ObviousCaseResult {
    // Create minimal risk factors
    const riskFactors = createMinimalRiskFactors(score, options);

    const bankabilityScore: BankabilityScore = {
        score,
        grade,
        riskFactors,
        penalties: [],
        summary: options.summary,
        explanation: {
            strengths: [],
            weaknesses: [options.explanation],
            criticalIssues: score < 20 ? [`Score: ${score}/100 - Immediate attention required`] : [],
            reasoningChain: `Obvious case detected: ${caseType}. ${options.explanation}`,
        },
        calculatedAt: new Date(),
    };

    const roadmap = createMinimalRoadmap(context, score, caseType);

    return {
        isObvious: true,
        caseType,
        score: bankabilityScore,
        roadmap,
    };
}

function createMinimalRiskFactors(baseScore: number, options: ObviousResultOptions): RiskFactorMap {
    const createFactor = (name: string, override?: number): RiskFactor => ({
        name,
        score: override ?? baseScore,
        weight: 0.25,
        components: [],
        explanation: `Score set to ${override ?? baseScore} due to ${options.summary.toLowerCase()}`,
    });

    return {
        serviceability: createFactor('Serviceability', options.serviceabilityOverride),
        concentration: createFactor('Concentration', options.concentrationOverride),
        retention: createFactor('Retention', options.retentionOverride),
        compliance: createFactor('Compliance', options.complianceOverride),
    };
}

function createMinimalRoadmap(
    context: GlobalContext,
    currentScore: number,
    caseType: ObviousCaseType
): RemediationRoadmap {
    const tasks = getTasksForCaseType(caseType);

    return {
        sessionId: context.sessionId,
        companyId: context.companyId,
        generatedAt: new Date(),
        currentScore,
        projectedScore: Math.min(100, currentScore + 50), // Optimistic projection
        scoreDrags: [],
        tasks,
        timeline: {
            quickWins: { tasks: tasks.filter(t => t.category === 'quick_win').length, days: 7, scoreGain: 10 },
            shortTerm: { tasks: tasks.filter(t => t.category === 'structural').length, days: 30, scoreGain: 20 },
            longTerm: { tasks: tasks.filter(t => t.category === 'strategic').length, days: 90, scoreGain: 20 },
        },
    };
}

function getTasksForCaseType(caseType: ObviousCaseType) {
    const baseTasks = {
        no_data: [
            {
                id: 'upload-financials',
                priority: 100,
                targetFactor: 'compliance' as const,
                title: 'Upload Financial Documents',
                description: 'Upload P&L statements, balance sheets, or other financial records to enable analysis.',
                expectedScoreGain: 30,
                difficulty: 'low' as const,
                estimatedDays: 1,
                category: 'quick_win' as const,
                actionItems: [
                    'Gather recent P&L statement (last 2-3 years)',
                    'Gather recent balance sheet',
                    'Upload documents to Bankable.ai',
                ],
            },
            {
                id: 'connect-apis',
                priority: 90,
                targetFactor: 'serviceability' as const,
                title: 'Connect Financial APIs',
                description: 'Connect Stripe or Plaid for real-time financial data integration.',
                expectedScoreGain: 20,
                difficulty: 'low' as const,
                estimatedDays: 1,
                category: 'quick_win' as const,
                actionItems: [
                    'Connect Stripe account for payment data',
                    'Connect Plaid for banking data',
                ],
            },
        ],
        empty_documents: [
            {
                id: 'upload-readable-docs',
                priority: 100,
                targetFactor: 'compliance' as const,
                title: 'Upload Readable Financial Documents',
                description: 'The uploaded documents could not be parsed. Please upload clear, machine-readable PDFs.',
                expectedScoreGain: 30,
                difficulty: 'low' as const,
                estimatedDays: 1,
                category: 'quick_win' as const,
                actionItems: [
                    'Ensure documents are not scanned images',
                    'Export directly from accounting software as PDF',
                    'Re-upload with clearly formatted financial data',
                ],
            },
        ],
        all_negative: [
            {
                id: 'cost-reduction',
                priority: 100,
                targetFactor: 'serviceability' as const,
                title: 'Implement Cost Reduction Plan',
                description: 'Identify and eliminate non-essential expenses to stop losses.',
                expectedScoreGain: 15,
                difficulty: 'high' as const,
                estimatedDays: 60,
                category: 'structural' as const,
                actionItems: [
                    'Audit all operating expenses',
                    'Identify top 20% of costs',
                    'Negotiate vendor contracts',
                    'Consider headcount optimization',
                ],
            },
            {
                id: 'revenue-growth',
                priority: 90,
                targetFactor: 'serviceability' as const,
                title: 'Revenue Growth Initiative',
                description: 'Focus on increasing revenue to return to profitability.',
                expectedScoreGain: 20,
                difficulty: 'high' as const,
                estimatedDays: 90,
                category: 'strategic' as const,
                actionItems: [
                    'Analyze pricing strategy',
                    'Identify upsell opportunities',
                    'Launch customer acquisition campaign',
                ],
            },
        ],
        negative_equity: [
            {
                id: 'debt-restructuring',
                priority: 100,
                targetFactor: 'serviceability' as const,
                title: 'Debt Restructuring',
                description: 'Work with creditors to restructure debt obligations.',
                expectedScoreGain: 20,
                difficulty: 'high' as const,
                estimatedDays: 90,
                category: 'structural' as const,
                actionItems: [
                    'List all outstanding debts',
                    'Prioritize debts by interest rate',
                    'Negotiate terms with creditors',
                    'Consider debt consolidation',
                ],
            },
            {
                id: 'capital-injection',
                priority: 90,
                targetFactor: 'serviceability' as const,
                title: 'Seek Capital Injection',
                description: 'Raise equity capital to restore positive net worth.',
                expectedScoreGain: 25,
                difficulty: 'high' as const,
                estimatedDays: 120,
                category: 'strategic' as const,
                actionItems: [
                    'Prepare investor materials',
                    'Identify potential investors',
                    'Negotiate terms',
                ],
            },
        ],
        zero_revenue: [
            {
                id: 'first-sale',
                priority: 100,
                targetFactor: 'serviceability' as const,
                title: 'Achieve First Revenue',
                description: 'Focus on closing first paying customers.',
                expectedScoreGain: 30,
                difficulty: 'high' as const,
                estimatedDays: 60,
                category: 'strategic' as const,
                actionItems: [
                    'Define target customer profile',
                    'Build sales pipeline',
                    'Close first paying customer',
                ],
            },
        ],
    };

    return baseTasks[caseType] || baseTasks.no_data;
}
