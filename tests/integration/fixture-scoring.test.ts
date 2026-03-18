/**
 * Integration tests: Scoring pipeline with realistic fixture data
 *
 * These tests run synthesizeRiskFactors → calculateBankabilityScore using the
 * fixture company data to validate the synthesis layer with realistic inputs.
 *
 * NOTE: Expected score ranges in input.json are calibrated for the full LLM
 * pipeline (agents + synthesis). These tests validate the synthesis layer only,
 * so they assert qualitative correctness and relative ordering rather than
 * exact score ranges.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { describe, it, expect } from 'vitest';
import { synthesizeRiskFactors } from '../../src/synthesis/risk-synthesizer.js';
import { calculateBankabilityScore } from '../../src/synthesis/score-calculator.js';
import { checkObviousCases } from '../../src/synthesis/obvious-cases.js';
import type { GlobalContext, ParsedDocument, RiskFactorMap } from '../../src/types/index.js';

// ============================================
// FIXTURE LOADING
// ============================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../fixtures/companies');

function loadFixture(company: string) {
    return JSON.parse(readFileSync(join(fixturesDir, company, 'input.json'), 'utf-8'));
}

/**
 * Build a GlobalContext from a fixture JSON object.
 * Uses the document path for serviceability (no cashFlow wrapping)
 * so balance sheet + P&L data drive the synthesis.
 */
function buildContext(fixture: {
    company: { cvr?: string; name: string };
    documents: {
        profit_and_loss?: Record<string, unknown>;
        balance_sheet?: Record<string, unknown>;
    };
    stripe?: {
        mrr?: number;
        arrGrowthRate?: number;
        customerCount?: number;
        churnRate?: number;
        topCustomers?: Array<{ name: string; percentOfRevenue?: number; percentOfTotal?: number }>;
    } | null;
    plaid?: { accounts?: unknown[]; monthlyInflow?: number; monthlyOutflow?: number } | null;
}): GlobalContext {
    const documents: ParsedDocument[] = [];

    if (fixture.documents?.profit_and_loss) {
        documents.push({
            id: 'pl-1',
            type: 'profit_and_loss',
            filename: 'pl.json',
            parsedAt: new Date(),
            confidence: 0.9,
            data: fixture.documents.profit_and_loss,
            rawText: '',
            trustScore: 0.9,
        });
    }

    if (fixture.documents?.balance_sheet) {
        documents.push({
            id: 'bs-1',
            type: 'balance_sheet',
            filename: 'bs.json',
            parsedAt: new Date(),
            confidence: 0.9,
            data: fixture.documents.balance_sheet,
            rawText: '',
            trustScore: 0.9,
        });
    }

    const stripe = fixture.stripe ? {
        mrr: fixture.stripe.mrr,
        arrGrowthRate: fixture.stripe.arrGrowthRate,
        customerCount: fixture.stripe.customerCount,
        churnRate: fixture.stripe.churnRate,
        topCustomers: fixture.stripe.topCustomers?.map(c => ({
            ...c,
            percentOfTotal: c.percentOfRevenue ?? c.percentOfTotal ?? 0,
        })),
    } : undefined;

    return {
        sessionId: `test-${fixture.company.cvr ?? fixture.company.name}`,
        companyId: fixture.company.cvr ?? fixture.company.name,
        startedAt: new Date(),
        documents,
        apiSnapshots: { stripe },
        agentInsights: new Map(),
        riskFactors: {} as RiskFactorMap,
        contradictions: [],
    };
}

// ============================================
// NOVO NORDISK — Strong A-grade company
// ============================================

describe('Novo Nordisk (strong financials)', () => {
    const fixture = loadFixture('novo-nordisk');
    const context = buildContext(fixture);

    it('does not trigger an obvious case', () => {
        const obvious = checkObviousCases(context);
        expect(obvious).toBeNull();
    });

    it('produces a valid score in range 0–100 with grade A or B (doc-only data, no Stripe/Plaid)', async () => {
        const factors = await synthesizeRiskFactors([], context);
        const score = calculateBankabilityScore(factors, context);

        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        // With only P&L + balance sheet (no Stripe/Plaid), concentration and retention
        // fall back to defaults (~60-65), so grade A is not achievable without API data.
        expect(['A', 'B']).toContain(score.grade);
        expect(score.score).toBeGreaterThan(60);
    });

    it('serviceability score reflects strong profitability and equity', async () => {
        // Profit margin ≈ 40%, equity ratio ≈ 62.5% → serviceability should be high
        const factors = await synthesizeRiskFactors([], context);
        expect(factors.serviceability.score).toBeGreaterThan(80);
    });

    it('growth score reflects 25% YoY revenue increase', async () => {
        const factors = await synthesizeRiskFactors([], context);

        // (290B - 232B) / 232B ≈ 25% → score = min(100, 50+25) = 75
        const yoyComponent = factors.growth.components.find(c => c.name === 'YoY Revenue Growth');
        expect(yoyComponent).toBeDefined();
        expect(yoyComponent!.value).toBeCloseTo(75, 0);
    });

    it('compliance score gets full documentation score (P&L + balance sheet)', async () => {
        const factors = await synthesizeRiskFactors([], context);

        const docComponent = factors.compliance.components.find(c => c.name === 'Documentation Completeness');
        expect(docComponent).toBeDefined();
        expect(docComponent!.value).toBe(100);
    });

    it('has a Profitability component in serviceability', async () => {
        const factors = await synthesizeRiskFactors([], context);

        const profitComponent = factors.serviceability.components.find(c => c.name === 'Profitability');
        expect(profitComponent).toBeDefined();
        expect(profitComponent!.value).toBe(100); // 40% margin → 60 + 40*4 = 220, capped at 100
    });
});

// ============================================
// MURERMESTER K — Distressed D-grade company
// ============================================

describe('Murermester K (distressed financials)', () => {
    const fixture = loadFixture('murermester-k');
    const context = buildContext(fixture);

    it('does not trigger an obvious case (has positive revenue and equity)', () => {
        const obvious = checkObviousCases(context);
        expect(obvious).toBeNull();
    });

    it('produces a valid score in range 0–100', async () => {
        const factors = await synthesizeRiskFactors([], context);
        const score = calculateBankabilityScore(factors, context);

        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
    });

    it('growth score reflects declining revenue (−7.6% YoY)', async () => {
        const factors = await synthesizeRiskFactors([], context);

        // (8.5M - 9.2M) / 9.2M ≈ -7.6% → score = max(0, 50 - 7.6) = 42.4
        const yoyComponent = factors.growth.components.find(c => c.name === 'YoY Revenue Growth');
        expect(yoyComponent).toBeDefined();
        expect(yoyComponent!.value).toBeCloseTo(42.4, 0);
        expect(yoyComponent!.interpretation).toContain('Declining');
    });

    it('serviceability score reflects thin profit margins (1.5%)', async () => {
        const factors = await synthesizeRiskFactors([], context);

        // profitMargin = 128K / 8.5M = 0.015 → profitScore = 60 + 0.015*400 = 66
        const profitComponent = factors.serviceability.components.find(c => c.name === 'Profitability');
        expect(profitComponent).toBeDefined();
        expect(profitComponent!.interpretation).toMatch(/Marginal|Adequate/);
    });

    it('debt level component reflects reasonable debt ratio', async () => {
        // debtRatio = 850K / 1950K ≈ 0.44 → debtScore = 56.4
        const factors = await synthesizeRiskFactors([], context);
        const debtComponent = factors.serviceability.components.find(c => c.name === 'Debt Level');
        expect(debtComponent).toBeDefined();
        expect(debtComponent!.value).toBeCloseTo(56.4, 0);
    });
});

// ============================================
// PLEO TECHNOLOGIES — High-growth, loss-making
// ============================================

describe('Pleo Technologies (VC-backed, all-negative income)', () => {
    const fixture = loadFixture('pleo-technologies');
    const context = buildContext(fixture);

    it('triggers the all_negative obvious case', () => {
        // All 3 years have negative net income
        const obvious = checkObviousCases(context);

        expect(obvious).not.toBeNull();
        expect(obvious!.caseType).toBe('all_negative');
        expect(obvious!.score.score).toBe(15);
    });

    it('Stripe ARR growth shows up in growth factor when not short-circuited', async () => {
        // Even though Pleo hits all_negative, the synthesizer itself still works
        // This tests that Stripe data flows correctly into the growth component
        const factors = await synthesizeRiskFactors([], context);

        // arrGrowthRate = 0.55 → growthPct = 55 → score = min(100, 50+110) = 100
        const arrComponent = factors.growth.components.find(c => c.name === 'ARR Growth Rate');
        expect(arrComponent).toBeDefined();
        expect(arrComponent!.value).toBe(100);
    });

    it('Stripe churn rate shows up in retention factor', async () => {
        const factors = await synthesizeRiskFactors([], context);

        // churnRate = 0.025 → churnScore = max(0, 100 - 25) = 75
        const churnComponent = factors.retention.components.find(c => c.name === 'Revenue Retention');
        expect(churnComponent).toBeDefined();
        expect(churnComponent!.value).toBeCloseTo(75, 0);
        expect(churnComponent!.interpretation).toContain('Good');
    });

    it('concentration is low due to diversified Stripe top customers', async () => {
        const factors = await synthesizeRiskFactors([], context);

        // topCustomer = 3% of revenue → concentration score near 100
        const topCustComponent = factors.concentration.components.find(c => c.name === 'Top Customer Dependency');
        expect(topCustComponent).toBeDefined();
        expect(topCustComponent!.value).toBeCloseTo(97, 0); // 100 - 3
    });
});

// ============================================
// RELATIVE ORDERING
// ============================================

describe('relative ordering between companies', () => {
    const novoFixture = loadFixture('novo-nordisk');
    const murermesterFixture = loadFixture('murermester-k');

    const novoContext = buildContext(novoFixture);
    const murermesterContext = buildContext(murermesterFixture);

    it('Novo Nordisk scores higher than Murermester K overall', async () => {
        const novoFactors = await synthesizeRiskFactors([], novoContext);
        const murermesterFactors = await synthesizeRiskFactors([], murermesterContext);

        const novoScore = calculateBankabilityScore(novoFactors, novoContext);
        const murermesterScore = calculateBankabilityScore(murermesterFactors, murermesterContext);

        expect(novoScore.score).toBeGreaterThan(murermesterScore.score);
    });

    it('Novo Nordisk serviceability exceeds Murermester K (higher margins, equity)', async () => {
        const novoFactors = await synthesizeRiskFactors([], novoContext);
        const murermesterFactors = await synthesizeRiskFactors([], murermesterContext);

        expect(novoFactors.serviceability.score).toBeGreaterThan(murermesterFactors.serviceability.score);
    });

    it('Novo Nordisk growth exceeds Murermester K (25% vs −7.6% revenue growth)', async () => {
        const novoFactors = await synthesizeRiskFactors([], novoContext);
        const murermesterFactors = await synthesizeRiskFactors([], murermesterContext);

        expect(novoFactors.growth.score).toBeGreaterThan(murermesterFactors.growth.score);
    });

    it('both companies get compliance score boost from having P&L + balance sheet', async () => {
        const novoFactors = await synthesizeRiskFactors([], novoContext);
        const murermesterFactors = await synthesizeRiskFactors([], murermesterContext);

        // Both have P&L + balance sheet → docScore = 100 for both
        const novoDoc = novoFactors.compliance.components.find(c => c.name === 'Documentation Completeness');
        const murermesterDoc = murermesterFactors.compliance.components.find(c => c.name === 'Documentation Completeness');

        expect(novoDoc!.value).toBe(100);
        expect(murermesterDoc!.value).toBe(100);
    });
});
