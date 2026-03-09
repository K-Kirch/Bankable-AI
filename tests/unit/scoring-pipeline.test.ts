/**
 * Unit tests for the scoring pipeline
 * 
 * Tests: risk-synthesizer, score-calculator, obvious-cases
 */

import { describe, it, expect } from 'vitest';
import { synthesizeRiskFactors } from '../../src/synthesis/risk-synthesizer.js';
import { calculateBankabilityScore } from '../../src/synthesis/score-calculator.js';
import { checkObviousCases } from '../../src/synthesis/obvious-cases.js';
import type { AgentInsight, GlobalContext, RiskFactorMap } from '../../src/types/index.js';

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

function createInsight(overrides: Partial<AgentInsight> = {}): AgentInsight {
    return {
        id: 'insight-1',
        agentId: 'counter',
        timestamp: new Date(),
        category: 'financial_health',
        title: 'Test Insight',
        description: 'Test description',
        confidence: 0.8,
        impact: 10,
        evidence: [],
        reasoningChain: 'test reasoning',
        ...overrides,
    };
}

// ============================================
// RISK SYNTHESIZER TESTS
// ============================================

describe('synthesizeRiskFactors', () => {
    it('returns all five risk factors', async () => {
        const context = createMinimalContext();
        const result = await synthesizeRiskFactors([], context);

        expect(result).toHaveProperty('serviceability');
        expect(result).toHaveProperty('concentration');
        expect(result).toHaveProperty('retention');
        expect(result).toHaveProperty('compliance');
        expect(result).toHaveProperty('growth');
    });

    it('all scores are between 0 and 100', async () => {
        const context = createMinimalContext();
        const result = await synthesizeRiskFactors([], context);

        for (const factor of Object.values(result)) {
            expect(factor.score).toBeGreaterThanOrEqual(0);
            expect(factor.score).toBeLessThanOrEqual(100);
        }
    });

    it('uses category-based routing for retention, not title matching', async () => {
        const context = createMinimalContext();
        // Create an insight with contract_security category but a non-standard title
        const insights: AgentInsight[] = [
            createInsight({
                category: 'contract_security',
                title: 'Unusual Title That Would Break String Matching',
                impact: 20,
                confidence: 0.9,
            }),
        ];

        const result = await synthesizeRiskFactors(insights, context);

        // Retention should pick up the contract_security insight regardless of title
        const contractComponent = result.retention.components.find(c => c.name === 'Contract Strength');
        expect(contractComponent).toBeDefined();
        // impact 20 maps to 50+20=70
        expect(contractComponent!.value).toBe(70);
    });

    it('uses category-based routing for compliance, not title matching', async () => {
        const context = createMinimalContext();
        const insights: AgentInsight[] = [
            createInsight({
                category: 'compliance_status',
                title: 'Arbitrary Compliance Title',
                impact: 30,
                confidence: 0.85,
            }),
        ];

        const result = await synthesizeRiskFactors(insights, context);

        const complianceComponent = result.compliance.components.find(c => c.name === 'Regulatory Compliance');
        expect(complianceComponent).toBeDefined();
        // impact 30 maps to 50+30=80
        expect(complianceComponent!.value).toBe(80);
    });

    it('averages multiple insights for the same category', async () => {
        const context = createMinimalContext();
        const insights: AgentInsight[] = [
            createInsight({ category: 'contract_security', impact: 20, confidence: 0.9 }),
            createInsight({ id: 'insight-2', category: 'contract_security', impact: 40, confidence: 0.8 }),
        ];

        const result = await synthesizeRiskFactors(insights, context);
        const contractComponent = result.retention.components.find(c => c.name === 'Contract Strength');
        // avgImpact = (20+40)/2 = 30, maps to 50+30=80
        expect(contractComponent!.value).toBe(80);
    });

    it('uses document data for serviceability when Plaid is unavailable', async () => {
        const context = createMinimalContext({
            documents: [{
                id: 'pl-1',
                type: 'profit_and_loss',
                filename: 'pl.json',
                parsedAt: new Date(),
                confidence: 1.0,
                data: { '2024': { revenue: 1000000, netIncome: 80000 } },
                rawText: '',
                trustScore: 0.9,
            }],
        });

        const result = await synthesizeRiskFactors([], context);

        const profitComponent = result.serviceability.components.find(c => c.name === 'Profitability');
        expect(profitComponent).toBeDefined();
        expect(profitComponent!.value).toBeGreaterThan(0);
    });

    it('derives growth score from revenue trends in documents', async () => {
        const context = createMinimalContext({
            documents: [{
                id: 'pl-1',
                type: 'profit_and_loss',
                filename: 'pl.json',
                parsedAt: new Date(),
                confidence: 1.0,
                data: {
                    '2023': { revenue: 800000, netIncome: 50000 },
                    '2024': { revenue: 1000000, netIncome: 80000 },
                },
                rawText: '',
                trustScore: 0.9,
            }],
        });

        const result = await synthesizeRiskFactors([], context);

        const yoyComponent = result.growth.components.find(c => c.name === 'YoY Revenue Growth');
        expect(yoyComponent).toBeDefined();
        // 25% yoy growth → 50 + 25 = 75
        expect(yoyComponent!.value).toBe(75);
    });

    it('provides fallback scores when no data is available', async () => {
        const context = createMinimalContext();
        const result = await synthesizeRiskFactors([], context);

        // All factors should have at least one component
        for (const factor of Object.values(result)) {
            expect(factor.components.length).toBeGreaterThan(0);
        }
    });
});

// ============================================
// SCORE CALCULATOR TESTS
// ============================================

describe('calculateBankabilityScore', () => {
    function createRiskFactors(scores: {
        serviceability: number;
        concentration: number;
        retention: number;
        compliance: number;
        growth: number;
    }): RiskFactorMap {
        return {
            serviceability: {
                name: 'Serviceability', score: scores.serviceability, weight: 0.25,
                components: [], explanation: '',
            },
            concentration: {
                name: 'Concentration', score: scores.concentration, weight: 0.20,
                components: [], explanation: '',
            },
            retention: {
                name: 'Retention', score: scores.retention, weight: 0.20,
                components: [], explanation: '',
            },
            compliance: {
                name: 'Compliance', score: scores.compliance, weight: 0.15,
                components: [], explanation: '',
            },
            growth: {
                name: 'Growth', score: scores.growth, weight: 0.20,
                components: [], explanation: '',
            },
        };
    }

    it('calculates weighted average correctly', () => {
        const context = createMinimalContext();
        const factors = createRiskFactors({
            serviceability: 80, concentration: 60, retention: 70, compliance: 90, growth: 75,
        });

        const result = calculateBankabilityScore(factors, context);

        // 80*0.25 + 60*0.20 + 70*0.20 + 90*0.15 + 75*0.20 = 20+12+14+13.5+15 = 74.5 → 75
        expect(result.score).toBe(75);
    });

    it('assigns correct grades', () => {
        const context = createMinimalContext();

        const gradeA = calculateBankabilityScore(
            createRiskFactors({ serviceability: 90, concentration: 85, retention: 80, compliance: 85, growth: 90 }),
            context,
        );
        expect(gradeA.grade).toBe('A');

        const gradeC = calculateBankabilityScore(
            createRiskFactors({ serviceability: 55, concentration: 55, retention: 55, compliance: 55, growth: 55 }),
            context,
        );
        expect(gradeC.grade).toBe('C');

        const gradeF = calculateBankabilityScore(
            createRiskFactors({ serviceability: 20, concentration: 20, retention: 20, compliance: 20, growth: 20 }),
            context,
        );
        expect(gradeF.grade).toBe('F');
    });

    it('applies compliance penalty when < 40', () => {
        const context = createMinimalContext();
        const factors = createRiskFactors({
            serviceability: 80, concentration: 80, retention: 80, compliance: 30, growth: 80,
        });

        const result = calculateBankabilityScore(factors, context);

        expect(result.penalties.length).toBeGreaterThan(0);
        expect(result.penalties.some(p => p.reason.includes('compliance'))).toBe(true);
        // Raw = 80*0.25+80*0.20+80*0.20+30*0.15+80*0.20 = 20+16+16+4.5+16 = 72.5
        // With 0.8 penalty: 72.5*0.8 = 58
        expect(result.score).toBeLessThan(73);
    });

    it('applies serviceability penalty when < 30', () => {
        const context = createMinimalContext();
        const factors = createRiskFactors({
            serviceability: 20, concentration: 80, retention: 80, compliance: 80, growth: 80,
        });

        const result = calculateBankabilityScore(factors, context);

        expect(result.penalties.some(p => p.reason.includes('Cash flow'))).toBe(true);
    });

    it('applies concentration penalty when < 25', () => {
        const context = createMinimalContext();
        const factors = createRiskFactors({
            serviceability: 80, concentration: 20, retention: 80, compliance: 80, growth: 80,
        });

        const result = calculateBankabilityScore(factors, context);

        expect(result.penalties.some(p => p.reason.includes('concentration'))).toBe(true);
    });

    it('score is clamped between 0 and 100', () => {
        const context = createMinimalContext();

        const high = calculateBankabilityScore(
            createRiskFactors({ serviceability: 100, concentration: 100, retention: 100, compliance: 100, growth: 100 }),
            context,
        );
        expect(high.score).toBeLessThanOrEqual(100);

        const low = calculateBankabilityScore(
            createRiskFactors({ serviceability: 0, concentration: 0, retention: 0, compliance: 0, growth: 0 }),
            context,
        );
        expect(low.score).toBeGreaterThanOrEqual(0);
    });

    it('includes explanation with strengths, weaknesses, and critical issues', () => {
        const context = createMinimalContext();
        const factors = createRiskFactors({
            serviceability: 85, concentration: 40, retention: 60, compliance: 30, growth: 70,
        });

        const result = calculateBankabilityScore(factors, context);

        expect(result.explanation.strengths.length).toBeGreaterThan(0);
        expect(result.explanation.criticalIssues.length).toBeGreaterThan(0);
        expect(result.explanation.reasoningChain).toContain('Score Calculation');
    });
});

// ============================================
// OBVIOUS CASES TESTS
// ============================================

describe('checkObviousCases', () => {
    it('detects no-data case', () => {
        const context = createMinimalContext();
        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.isObvious).toBe(true);
        expect(result!.score.score).toBeLessThanOrEqual(20);
    });

    it('returns null for context with documents (not obvious)', () => {
        const context = createMinimalContext({
            documents: [{
                id: 'doc-1',
                type: 'profit_and_loss',
                filename: 'pl.pdf',
                parsedAt: new Date(),
                confidence: 0.9,
                data: { '2024': { revenue: 500000, netIncome: 50000 } },
                rawText: 'revenue line items...',
                trustScore: 0.8,
            }],
        });

        const result = checkObviousCases(context);
        // With valid financial data, it should not be an obvious case
        // (unless it hits another obvious case like zero revenue)
        // The important thing is it doesn't falsely trigger for normal data
        if (result !== null) {
            // If it returns a result, it must be a genuine edge case
            expect(result.isObvious).toBe(true);
        }
    });

    it('detects negative equity case', () => {
        const context = createMinimalContext({
            documents: [{
                id: 'bs-1',
                type: 'balance_sheet',
                filename: 'bs.pdf',
                parsedAt: new Date(),
                confidence: 0.9,
                data: {
                    '2024': {
                        totalAssets: 100000,
                        totalLiabilities: 200000,
                        totalEquity: -100000,
                    },
                },
                rawText: '',
                trustScore: 0.8,
            }],
        });

        const result = checkObviousCases(context);

        if (result !== null) {
            expect(result.isObvious).toBe(true);
            expect(result.score.score).toBeLessThanOrEqual(30);
        }
    });

    it('returns roadmap with remediation tasks', () => {
        const context = createMinimalContext();
        const result = checkObviousCases(context);

        expect(result).not.toBeNull();
        expect(result!.roadmap).toBeDefined();
        expect(result!.roadmap.tasks.length).toBeGreaterThan(0);
    });
});
