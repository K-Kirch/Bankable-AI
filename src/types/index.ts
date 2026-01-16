/**
 * Type definitions for Bankable.ai
 * Core interfaces used across the platform
 */

// ============================================
// GLOBAL CONTEXT TYPES
// ============================================

export interface GlobalContext {
    /** Unique identifier for this analysis session */
    sessionId: string;
    /** Company being analyzed */
    companyId: string;
    /** Timestamp when analysis started */
    startedAt: Date;

    /** Parsed documents from ingestion */
    documents: ParsedDocument[];

    /** Live API data snapshots */
    apiSnapshots: {
        stripe?: StripeSnapshot;
        plaid?: PlaidSnapshot;
    };

    /** Agent-contributed insights (append-only during analysis) */
    agentInsights: Map<AgentId, AgentInsight[]>;

    /** Computed risk factors after agent synthesis */
    riskFactors: RiskFactorMap;

    /** Detected contradictions between data sources */
    contradictions: Contradiction[];
}

export type AgentId = 'counter' | 'lawyer' | 'forecaster';

// ============================================
// DOCUMENT TYPES
// ============================================

export interface ParsedDocument {
    id: string;
    type: DocumentType;
    filename: string;
    parsedAt: Date;

    /** Confidence in parsing accuracy (0-1) */
    confidence: number;

    /** Extracted structured data */
    data: Record<string, unknown>;

    /** Raw text content for vector embedding */
    rawText: string;

    /** Source of truth ranking */
    trustScore: number;
}

export type DocumentType =
    | 'profit_and_loss'
    | 'balance_sheet'
    | 'contract'
    | 'bank_statement'
    | 'tax_filing'
    | 'insurance_certificate'
    | 'other';

// ============================================
// API SNAPSHOT TYPES
// ============================================

export interface StripeSnapshot {
    fetchedAt: Date;
    mrr: number;
    arrGrowthRate: number;
    customerCount: number;
    churnRate: number;
    topCustomers: CustomerRevenue[];
    paymentHistory: PaymentSummary;
}

export interface PlaidSnapshot {
    fetchedAt: Date;
    accounts: BankAccount[];
    transactions: TransactionSummary;
    cashFlow: CashFlowMetrics;
}

export interface CustomerRevenue {
    customerId: string;
    name?: string | undefined;
    monthlyRevenue: number;
    percentOfTotal: number;
}

export interface PaymentSummary {
    successRate: number;
    averagePaymentDelay: number;
    disputeRate: number;
}

export interface BankAccount {
    accountId: string;
    type: 'checking' | 'savings' | 'credit';
    currentBalance: number;
    availableBalance: number;
}

export interface TransactionSummary {
    period: { start: Date; end: Date };
    totalInflow: number;
    totalOutflow: number;
    categoryBreakdown: Record<string, number>;
}

export interface CashFlowMetrics {
    averageMonthlyInflow: number;
    averageMonthlyOutflow: number;
    burnRate: number;
    runwayMonths: number;
}

// ============================================
// AGENT TYPES
// ============================================

export interface AgentInsight {
    id: string;
    agentId: AgentId;
    timestamp: Date;

    /** Category of insight */
    category: InsightCategory;

    /** Brief finding title */
    title: string;

    /** Detailed explanation */
    description: string;

    /** Confidence level (0-1) */
    confidence: number;

    /** Impact on bankability (-100 to +100) */
    impact: number;

    /** Supporting evidence references */
    evidence: Evidence[];

    /** LLM reasoning chain */
    reasoningChain: string;
}

export type InsightCategory =
    | 'financial_health'
    | 'revenue_quality'
    | 'legal_structure'
    | 'contract_security'
    | 'compliance_status'
    | 'growth_trajectory'
    | 'risk_exposure';

export interface Evidence {
    source: 'document' | 'api' | 'derived';
    documentId?: string;
    field?: string;
    value: unknown;
    confidence: number;
}

// ============================================
// RISK FACTOR TYPES
// ============================================

export interface RiskFactorMap {
    serviceability: RiskFactor;
    concentration: RiskFactor;
    retention: RiskFactor;
    compliance: RiskFactor;
}

export interface RiskFactor {
    name: string;
    score: number; // 0-100
    weight: number; // 0-1
    components: RiskComponent[];
    explanation: string;
}

export interface RiskComponent {
    name: string;
    value: number;
    weight: number;
    rawMetric: unknown;
    interpretation: string;
}

// ============================================
// CONTRADICTION TYPES
// ============================================

export interface Contradiction {
    id: string;
    detectedAt: Date;

    /** Data sources in conflict */
    sources: ConflictSource[];

    /** Nature of the discrepancy */
    description: string;

    /** How it was resolved */
    resolution?: ContradictionResolution;
}

export interface ConflictSource {
    source: 'document' | 'stripe' | 'plaid';
    documentId?: string;
    field: string;
    value: unknown;
    trustScore: number;
}

export interface ContradictionResolution {
    resolvedAt: Date;
    method: 'trust_ranking' | 'llm_adjudication' | 'manual';
    acceptedValue: unknown;
    reasoning: string;
}

// ============================================
// SCORE & REMEDIATION TYPES
// ============================================

export interface BankabilityScore {
    /** Final score 0-100 */
    score: number;

    /** Letter grade */
    grade: 'A' | 'B' | 'C' | 'D' | 'F';

    /** Risk breakdown */
    riskFactors: RiskFactorMap;

    /** Penalties applied */
    penalties: ScorePenalty[];

    /** Human-readable explanation */
    summary: string;

    /** Detailed reasoning */
    explanation: ScoreExplanation;

    /** Generated at */
    calculatedAt: Date;
}

export interface ScorePenalty {
    reason: string;
    multiplier: number;
    impactPoints: number;
}

export interface ScoreExplanation {
    strengths: string[];
    weaknesses: string[];
    criticalIssues: string[];
    reasoningChain: string;
}

export interface ScoreDrag {
    factor: keyof RiskFactorMap;
    currentScore: number;
    potentialScore: number;
    impactPoints: number;
    difficulty: 'low' | 'medium' | 'high';
    estimatedDays: number;
}

export interface RemediationTask {
    id: string;
    priority: number;

    /** Which risk factor this addresses */
    targetFactor: keyof RiskFactorMap;

    /** Task details */
    title: string;
    description: string;

    /** Expected impact */
    expectedScoreGain: number;

    /** Effort estimation */
    difficulty: 'low' | 'medium' | 'high';
    estimatedDays: number;

    /** Task category */
    category: 'quick_win' | 'structural' | 'strategic';

    /** Action items */
    actionItems: string[];
}

export interface RemediationRoadmap {
    sessionId: string;
    companyId: string;
    generatedAt: Date;

    /** Current score */
    currentScore: number;

    /** Projected score if all tasks completed */
    projectedScore: number;

    /** Identified score drags */
    scoreDrags: ScoreDrag[];

    /** Prioritized task list */
    tasks: RemediationTask[];

    /** Timeline summary */
    timeline: {
        quickWins: { tasks: number; days: number; scoreGain: number };
        shortTerm: { tasks: number; days: number; scoreGain: number };
        longTerm: { tasks: number; days: number; scoreGain: number };
    };
}
