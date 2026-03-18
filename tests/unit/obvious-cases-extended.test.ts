/**
 * Extended unit tests for Obvious Cases
 *
 * Covers all 5 case types and edge cases not tested in scoring-pipeline.test.ts:
 * - all_negative, zero_revenue, empty_documents
 * - case ordering (all_negative checked before negative_equity)
 * - caseType-specific task content
 */

import { describe, it, expect } from 'vitest';
import { checkObviousCases } from '../../src/synthesis/obvious-cases.js';
import type { GlobalContext, RiskFactorMap } from '../../src/types/index.js';

// ============================================
// TEST HELPERS
// ============================================

function createMinimalContext(overrides: Partial<GlobalContext> = {}): GlobalContext {
    return {
        sessionId: 'test-session',
        companyId: 'test-company',
        startedAt: new Date(),
        documents: [],
        apiSnapshots: {},
        agentInsights: new Map(),
        riskFactors: {} as RiskFactorMap,
        contradictions: [],
        ...overrides,
    };
}

function makePLDoc(data: Record<string, unknown>) {
    return {
        id: 'pl-1',
        type: 'profit_and_loss' as const,
        filename: 'pl.pdf',
        parsedAt: new Date(),
        confidence: 0.9,
        data,
        rawText: '',
        trustScore: 0.9,
    };
}

function makeBSDoc(data: Record<string, unknown>) {
    return {
        id: 'bs-1',
        type: 'balance_sheet' as const,
        filename: 'bs.pdf',
        parsedAt: new Date(),
        confidence: 0.9,
        data,
        rawText: '',
        trustScore: 0.9,
    };
}

// ============================================
// ALL_NEGATIVE CASE
// ============================================

describe('all_negative case', () => {
    it('detects when all year-keyed periods show negative net income', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 1000000, netIncome: -50000 },
                '2023': { revenue: 800000, netIncome: -30000 },
                '2022': { revenue: 600000, netIncome: -10000 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.caseType).toBe('all_negative');
        expect(result!.score.score).toBe(15);
    });

    it('does not trigger when at least one period is profitable', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 1000000, netIncome: -50000 },
                '2023': { revenue: 800000, netIncome: 10000 },  // profitable
            })],
        });

        const result = checkObviousCases(context);

        // Should not be all_negative; may or may not be null depending on other checks
        if (result !== null) {
            expect(result.caseType).not.toBe('all_negative');
        }
    });

    it('assigns serviceability override of 10', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 500000, netIncome: -200000 },
                '2023': { revenue: 400000, netIncome: -100000 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.caseType).toBe('all_negative');
        expect(result!.score.riskFactors.serviceability.score).toBe(10);
    });

    it('generates cost reduction and revenue growth tasks', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 500000, netIncome: -200000 },
                '2023': { revenue: 400000, netIncome: -50000 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        const taskTitles = result!.roadmap.tasks.map(t => t.title);
        expect(taskTitles.some(t => t.toLowerCase().includes('cost'))).toBe(true);
        expect(taskTitles.some(t => t.toLowerCase().includes('revenue'))).toBe(true);
    });
});

// ============================================
// ZERO_REVENUE CASE
// ============================================

describe('zero_revenue case', () => {
    it('detects when the latest year has zero revenue', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 0, netIncome: 0 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.caseType).toBe('zero_revenue');
        expect(result!.score.score).toBe(5);
    });

    it('assigns serviceability override of 5', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 0, netIncome: 0 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result!.score.riskFactors.serviceability.score).toBe(5);
    });

    it('includes an Achieve First Revenue task', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 0, netIncome: 0 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.roadmap.tasks.some(t => t.title.includes('Revenue'))).toBe(true);
    });

    it('does not trigger for positive revenue', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 500000, netIncome: 50000 },
            })],
        });

        const result = checkObviousCases(context);

        if (result !== null) {
            expect(result.caseType).not.toBe('zero_revenue');
        }
    });
});

// ============================================
// EMPTY_DOCUMENTS CASE
// ============================================

describe('empty_documents case', () => {
    it('detects when all documents have empty data objects', () => {
        const context = createMinimalContext({
            documents: [
                { id: 'pl-1', type: 'profit_and_loss' as const, filename: 'pl.pdf', parsedAt: new Date(), confidence: 0.5, data: {}, rawText: '', trustScore: 0.5 },
                { id: 'bs-1', type: 'balance_sheet' as const, filename: 'bs.pdf', parsedAt: new Date(), confidence: 0.5, data: {}, rawText: '', trustScore: 0.5 },
            ],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.caseType).toBe('empty_documents');
        expect(result!.score.score).toBe(0);
    });

    it('detects when all documents have null data', () => {
        const context = createMinimalContext({
            documents: [
                { id: 'pl-1', type: 'profit_and_loss' as const, filename: 'pl.pdf', parsedAt: new Date(), confidence: 0.5, data: null as unknown as Record<string, unknown>, rawText: '', trustScore: 0.5 },
            ],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.caseType).toBe('empty_documents');
    });

    it('does not trigger empty_documents when at least one doc has data', () => {
        const context = createMinimalContext({
            documents: [
                { id: 'pl-1', type: 'profit_and_loss' as const, filename: 'pl.pdf', parsedAt: new Date(), confidence: 0.5, data: {}, rawText: '', trustScore: 0.5 },
                makePLDoc({ '2024': { revenue: 100000, netIncome: 5000 } }),
            ],
        });

        const result = checkObviousCases(context);

        if (result !== null) {
            expect(result.caseType).not.toBe('empty_documents');
        }
    });

    it('recommends uploading readable documents', () => {
        const context = createMinimalContext({
            documents: [
                { id: 'pl-1', type: 'profit_and_loss' as const, filename: 'pl.pdf', parsedAt: new Date(), confidence: 0.5, data: {}, rawText: '', trustScore: 0.5 },
            ],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.roadmap.tasks.some(t =>
            t.description.toLowerCase().includes('readable') ||
            t.title.toLowerCase().includes('readable')
        )).toBe(true);
    });
});

// ============================================
// NEGATIVE_EQUITY CASE
// ============================================

describe('negative_equity case', () => {
    it('detects when liabilities exceed assets', () => {
        const context = createMinimalContext({
            documents: [makeBSDoc({
                '2024': {
                    totalAssets: 100000,
                    totalLiabilities: 150000,
                    totalEquity: -50000,
                },
            })],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.caseType).toBe('negative_equity');
        expect(result!.score.score).toBe(12);
    });

    it('detects negative equity even when totalEquity is nested', () => {
        const context = createMinimalContext({
            documents: [makeBSDoc({
                '2024': {
                    assets: { totalAssets: 200000 },
                    liabilities: { totalLiabilities: 300000 },
                    equity: { totalEquity: -100000 },
                },
            })],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.caseType).toBe('negative_equity');
    });

    it('assigns serviceability override of 8', () => {
        const context = createMinimalContext({
            documents: [makeBSDoc({
                '2024': { totalAssets: 100000, totalLiabilities: 200000, totalEquity: -100000 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result!.score.riskFactors.serviceability.score).toBe(8);
    });

    it('generates debt restructuring and capital injection tasks', () => {
        const context = createMinimalContext({
            documents: [makeBSDoc({
                '2024': { totalAssets: 100000, totalLiabilities: 200000, totalEquity: -100000 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        const taskTitles = result!.roadmap.tasks.map(t => t.title);
        expect(taskTitles.some(t => t.toLowerCase().includes('debt'))).toBe(true);
        expect(taskTitles.some(t => t.toLowerCase().includes('capital'))).toBe(true);
    });
});

// ============================================
// CASE ORDERING & INTERACTION
// ============================================

describe('case ordering', () => {
    it('all_negative is checked before negative_equity', () => {
        // Company has all-negative income AND negative equity → all_negative fires first
        const context = createMinimalContext({
            documents: [
                makePLDoc({
                    '2024': { revenue: 200000, netIncome: -50000 },
                    '2023': { revenue: 150000, netIncome: -20000 },
                }),
                makeBSDoc({
                    '2024': { totalAssets: 100000, totalLiabilities: 200000, totalEquity: -100000 },
                }),
            ],
        });

        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.caseType).toBe('all_negative');
    });

    it('returns null for a healthy company with positive revenue and equity', () => {
        const context = createMinimalContext({
            documents: [
                makePLDoc({
                    '2024': { revenue: 5000000, netIncome: 300000 },
                    '2023': { revenue: 4000000, netIncome: 200000 },
                }),
                makeBSDoc({
                    '2024': { totalAssets: 3000000, totalLiabilities: 1000000, totalEquity: 2000000 },
                }),
            ],
        });

        const result = checkObviousCases(context);

        expect(result).toBeNull();
    });
});

// ============================================
// COMMON RESULT STRUCTURE
// ============================================

describe('obvious case result structure', () => {
    it('always has isObvious=true', () => {
        const result = checkObviousCases(createMinimalContext()); // no_data

        expect(result!.isObvious).toBe(true);
    });

    it('roadmap projectedScore is greater than the current score', () => {
        const result = checkObviousCases(createMinimalContext()); // no_data, score=0

        expect(result!.roadmap.projectedScore).toBeGreaterThan(result!.score.score);
    });

    it('roadmap has timeline with three buckets', () => {
        const result = checkObviousCases(createMinimalContext());

        expect(result!.roadmap.timeline).toHaveProperty('quickWins');
        expect(result!.roadmap.timeline).toHaveProperty('shortTerm');
        expect(result!.roadmap.timeline).toHaveProperty('longTerm');
    });

    it('score explanation includes the case description as a weakness', () => {
        const context = createMinimalContext({
            documents: [makePLDoc({
                '2024': { revenue: 500000, netIncome: -100000 },
                '2023': { revenue: 400000, netIncome: -50000 },
            })],
        });

        const result = checkObviousCases(context);

        expect(result!.score.explanation.weaknesses.length).toBeGreaterThan(0);
    });
});
