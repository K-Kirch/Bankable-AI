/**
 * Unit tests for the Remediation Engine
 *
 * Tests: generateRemediationRoadmap, score drags, task generation, timeline bucketing
 */

import { describe, it, expect } from 'vitest';
import { generateRemediationRoadmap } from '../../src/synthesis/remediation.js';
import type { BankabilityScore, GlobalContext, RiskFactorMap } from '../../src/types/index.js';

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

function createRiskFactors(scores: {
    serviceability: number;
    concentration: number;
    retention: number;
    compliance: number;
    growth: number;
}): RiskFactorMap {
    return {
        serviceability: { name: 'Serviceability', score: scores.serviceability, weight: 0.25, components: [], explanation: '' },
        concentration: { name: 'Concentration', score: scores.concentration, weight: 0.20, components: [], explanation: '' },
        retention: { name: 'Retention', score: scores.retention, weight: 0.20, components: [], explanation: '' },
        compliance: { name: 'Compliance', score: scores.compliance, weight: 0.15, components: [], explanation: '' },
        growth: { name: 'Growth', score: scores.growth, weight: 0.20, components: [], explanation: '' },
    };
}

function createScore(score: number, riskFactors: RiskFactorMap): BankabilityScore {
    return {
        score,
        grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F',
        riskFactors,
        penalties: [],
        summary: 'Test score',
        explanation: { strengths: [], weaknesses: [], criticalIssues: [], reasoningChain: '' },
        calculatedAt: new Date(),
    };
}

// ============================================
// SCORE DRAGS
// ============================================

describe('score drags', () => {
    it('identifies factors below 75 as score drags', async () => {
        const factors = createRiskFactors({
            serviceability: 50, concentration: 60, retention: 70, compliance: 40, growth: 30,
        });
        const roadmap = await generateRemediationRoadmap(createScore(50, factors), factors, createMinimalContext());

        expect(roadmap.scoreDrags.length).toBe(5);
        expect(roadmap.scoreDrags.every(d => d.currentScore < 75)).toBe(true);
    });

    it('does not include factors at or above 75 as drags', async () => {
        const factors = createRiskFactors({
            serviceability: 80, concentration: 75, retention: 90, compliance: 76, growth: 100,
        });
        const roadmap = await generateRemediationRoadmap(createScore(84, factors), factors, createMinimalContext());

        expect(roadmap.scoreDrags.length).toBe(0);
    });

    it('calculates impact points as gap × factor.weight (rounded)', async () => {
        // compliance: score=30, gap=45, weight=0.15 (from createRiskFactors) → impactPoints = round(6.75) = 7
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 30, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(60, factors), factors, createMinimalContext());

        const complianceDrag = roadmap.scoreDrags.find(d => d.factor === 'compliance');
        expect(complianceDrag).toBeDefined();
        expect(complianceDrag!.impactPoints).toBe(Math.round(45 * factors.compliance.weight));
        expect(complianceDrag!.currentScore).toBe(30);
        expect(complianceDrag!.potentialScore).toBe(75);
    });

    it('sorts drags by impact/effort ratio (highest first)', async () => {
        // compliance is fastest to fix (baseDays=14), so it should rank first
        const factors = createRiskFactors({
            serviceability: 50, concentration: 50, retention: 50, compliance: 50, growth: 50,
        });
        const roadmap = await generateRemediationRoadmap(createScore(50, factors), factors, createMinimalContext());

        expect(roadmap.scoreDrags.length).toBeGreaterThan(0);
        // Each drag's impact/effort should be non-increasing
        for (let i = 1; i < roadmap.scoreDrags.length; i++) {
            const prev = roadmap.scoreDrags[i - 1]!;
            const curr = roadmap.scoreDrags[i]!;
            const prevRatio = prev.impactPoints / prev.estimatedDays;
            const currRatio = curr.impactPoints / curr.estimatedDays;
            expect(prevRatio).toBeGreaterThanOrEqual(currRatio);
        }
    });
});

// ============================================
// TASK GENERATION
// ============================================

describe('task generation', () => {
    it('generates tasks for each score drag', async () => {
        const factors = createRiskFactors({
            serviceability: 50, concentration: 75, retention: 75, compliance: 75, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(50, factors), factors, createMinimalContext());

        expect(roadmap.tasks.length).toBeGreaterThan(0);
        expect(roadmap.tasks.every(t => t.targetFactor === 'serviceability')).toBe(true);
    });

    it('generates tasks targeting the correct factor', async () => {
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 40, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(60, factors), factors, createMinimalContext());

        expect(roadmap.tasks.every(t => t.targetFactor === 'compliance')).toBe(true);
    });

    it('all tasks have required fields with valid values', async () => {
        const factors = createRiskFactors({
            serviceability: 50, concentration: 50, retention: 50, compliance: 50, growth: 50,
        });
        const roadmap = await generateRemediationRoadmap(createScore(50, factors), factors, createMinimalContext());

        for (const task of roadmap.tasks) {
            expect(task.id).toBeTruthy();
            expect(task.title).toBeTruthy();
            expect(task.description).toBeTruthy();
            expect(task.actionItems.length).toBeGreaterThan(0);
            expect(task.estimatedDays).toBeGreaterThan(0);
            expect(task.expectedScoreGain).toBeGreaterThanOrEqual(0);
            expect(['quick_win', 'structural', 'strategic']).toContain(task.category);
            expect(['low', 'medium', 'high']).toContain(task.difficulty);
        }
    });

    it('tasks are sorted highest priority first', async () => {
        const factors = createRiskFactors({
            serviceability: 50, concentration: 50, retention: 50, compliance: 50, growth: 50,
        });
        const roadmap = await generateRemediationRoadmap(createScore(50, factors), factors, createMinimalContext());

        for (let i = 1; i < roadmap.tasks.length; i++) {
            expect(roadmap.tasks[i - 1]!.priority).toBeGreaterThanOrEqual(roadmap.tasks[i]!.priority);
        }
    });

    it('task priority is calculated and greater than zero', async () => {
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 30, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(60, factors), factors, createMinimalContext());

        expect(roadmap.tasks.every(t => t.priority > 0)).toBe(true);
    });

    it('produces an empty task list when all factors are above threshold', async () => {
        const factors = createRiskFactors({
            serviceability: 80, concentration: 80, retention: 80, compliance: 80, growth: 80,
        });
        const roadmap = await generateRemediationRoadmap(createScore(80, factors), factors, createMinimalContext());

        expect(roadmap.tasks).toHaveLength(0);
        expect(roadmap.scoreDrags).toHaveLength(0);
    });

    it('compliance drag generates quick_win tasks (insurance=7 days, tax=14 days)', async () => {
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 30, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(60, factors), factors, createMinimalContext());

        const quickWinTasks = roadmap.tasks.filter(t => t.estimatedDays <= 14);
        expect(quickWinTasks.length).toBeGreaterThan(0);
        // Insurance (7 days) and tax (14 days) both qualify as quick wins
        expect(quickWinTasks.some(t => t.estimatedDays <= 7)).toBe(true);
    });
});

// ============================================
// PROJECTED SCORE & TIMELINE
// ============================================

describe('projected score', () => {
    it('equals current score plus sum of task gains (when under 100)', async () => {
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 30, growth: 75,
        });
        const score = createScore(50, factors);
        const roadmap = await generateRemediationRoadmap(score, factors, createMinimalContext());

        const totalGain = roadmap.tasks.reduce((sum, t) => sum + t.expectedScoreGain, 0);
        expect(roadmap.projectedScore).toBe(Math.min(100, 50 + totalGain));
    });

    it('projected score is capped at 100', async () => {
        // Give a very high current score and many drags
        const factors = createRiskFactors({
            serviceability: 95, concentration: 20, retention: 20, compliance: 20, growth: 20,
        });
        const roadmap = await generateRemediationRoadmap(createScore(95, factors), factors, createMinimalContext());

        expect(roadmap.projectedScore).toBeLessThanOrEqual(100);
    });

    it('projected score equals current score when no drags exist', async () => {
        const factors = createRiskFactors({
            serviceability: 80, concentration: 80, retention: 80, compliance: 80, growth: 80,
        });
        const roadmap = await generateRemediationRoadmap(createScore(80, factors), factors, createMinimalContext());

        expect(roadmap.projectedScore).toBe(80);
    });
});

describe('timeline bucketing', () => {
    it('correctly counts quick wins (≤14 days)', async () => {
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 30, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(60, factors), factors, createMinimalContext());

        const expected = roadmap.tasks.filter(t => t.estimatedDays <= 14).length;
        expect(roadmap.timeline.quickWins.tasks).toBe(expected);
    });

    it('correctly counts short-term tasks (15–60 days)', async () => {
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 30, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(60, factors), factors, createMinimalContext());

        const expected = roadmap.tasks.filter(t => t.estimatedDays > 14 && t.estimatedDays <= 60).length;
        expect(roadmap.timeline.shortTerm.tasks).toBe(expected);
    });

    it('correctly counts long-term tasks (>60 days)', async () => {
        // Concentration drag has 180-day tasks
        const factors = createRiskFactors({
            serviceability: 75, concentration: 30, retention: 75, compliance: 75, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(50, factors), factors, createMinimalContext());

        const expected = roadmap.tasks.filter(t => t.estimatedDays > 60).length;
        expect(roadmap.timeline.longTerm.tasks).toBe(expected);
        expect(roadmap.timeline.longTerm.tasks).toBeGreaterThan(0);
    });

    it('scoreGain totals per bucket match the individual tasks', async () => {
        const factors = createRiskFactors({
            serviceability: 50, concentration: 50, retention: 50, compliance: 50, growth: 50,
        });
        const roadmap = await generateRemediationRoadmap(createScore(50, factors), factors, createMinimalContext());

        const qwGain = roadmap.tasks
            .filter(t => t.estimatedDays <= 14)
            .reduce((sum, t) => sum + t.expectedScoreGain, 0);
        expect(roadmap.timeline.quickWins.scoreGain).toBe(qwGain);
    });
});

// ============================================
// ROADMAP METADATA
// ============================================

describe('roadmap metadata', () => {
    it('carries sessionId and companyId from context', async () => {
        const context = createMinimalContext({ sessionId: 'sess-abc', companyId: 'comp-xyz' });
        const factors = createRiskFactors({
            serviceability: 50, concentration: 75, retention: 75, compliance: 75, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(50, factors), factors, context);

        expect(roadmap.sessionId).toBe('sess-abc');
        expect(roadmap.companyId).toBe('comp-xyz');
    });

    it('has a generatedAt timestamp', async () => {
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 75, growth: 75,
        });
        const roadmap = await generateRemediationRoadmap(createScore(80, factors), factors, createMinimalContext());

        expect(roadmap.generatedAt).toBeInstanceOf(Date);
    });

    it('currentScore matches the input score', async () => {
        const factors = createRiskFactors({
            serviceability: 75, concentration: 75, retention: 75, compliance: 75, growth: 75,
        });
        const score = createScore(72, factors);
        const roadmap = await generateRemediationRoadmap(score, factors, createMinimalContext());

        expect(roadmap.currentScore).toBe(72);
    });
});
