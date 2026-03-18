/**
 * Contradiction Detector
 *
 * Cross-references financial data from multiple sources (documents, Stripe, Plaid)
 * and flags discrepancies that exceed acceptable thresholds.
 *
 * Detection rules:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Revenue check                                              │
 *   │  P&L annual revenue  vs  Stripe MRR × 12                   │
 *   │  Flag if |doc − stripe| / max(doc, stripe) > 25%           │
 *   │                                                             │
 *   │  Cash position check                                        │
 *   │  Balance sheet cash  vs  Plaid account balance sum          │
 *   │  Flag if |doc − plaid| / max(doc, plaid) > 25%             │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Resolution: trust_ranking — documents outrank API snapshots.
 */

import { v4 as uuid } from 'uuid';
import type {
    GlobalContext,
    Contradiction,
    ConflictSource,
} from '../types/index.js';
import { extractLatestNumericValue } from '../utils/document-extraction.js';
import type { GlobalContextService } from '../core/global-context.js';

/** Maximum relative discrepancy (0–1) before a contradiction is flagged. */
const DISCREPANCY_THRESHOLD = 0.25;

/**
 * Detect cross-source contradictions in the context and record them.
 * Non-fatal: any error is logged and detection continues.
 */
export async function detectContradictions(
    context: GlobalContext,
    contextService: GlobalContextService,
): Promise<void> {
    const detectors = [checkRevenueContradiction, checkCashContradiction];

    // Run detectors in parallel (each is synchronous; only addContradiction is async)
    const contradictions = await Promise.all(
        detectors.map(async (detect) => {
            try {
                return detect(context);
            } catch (err) {
                console.error('[contradiction-detector] detection error:', (err as Error).message);
                return null;
            }
        })
    );

    for (const contradiction of contradictions) {
        if (contradiction) {
            await contextService.addContradiction(contradiction);
            console.log(`[contradiction-detector] Found: ${contradiction.description}`);
        }
    }
}

// ============================================
// DETECTION RULES
// ============================================

function checkRevenueContradiction(context: GlobalContext): Contradiction | null {
    const plDoc = context.documents?.find(d => d.type === 'profit_and_loss');
    if (!plDoc?.data) return null;

    const stripeSnapshot = context.apiSnapshots?.stripe;
    if (!stripeSnapshot || (stripeSnapshot.mrr ?? 0) <= 0) return null;

    const docRevenue = extractLatestNumericValue(
        plDoc.data as Record<string, unknown>,
        'revenue', 'totalRevenue', 'total_revenue', 'sales', 'totalSales',
    );
    if (docRevenue === undefined || docRevenue <= 0) return null;

    const stripeAnnual = stripeSnapshot.mrr * 12;
    const discrepancy = Math.abs(docRevenue - stripeAnnual) / Math.max(docRevenue, stripeAnnual);

    if (discrepancy <= DISCREPANCY_THRESHOLD) return null;

    const sources: ConflictSource[] = [
        {
            source: 'document',
            documentId: plDoc.id,
            field: 'annual_revenue',
            value: docRevenue,
            trustScore: plDoc.trustScore,
        },
        {
            source: 'stripe',
            field: 'mrr_annualized',
            value: stripeAnnual,
            trustScore: 0.7,
        },
    ];

    return buildContradiction(
        sources,
        `Revenue discrepancy: P&L shows $${fmt(docRevenue)} vs Stripe annualized $${fmt(stripeAnnual)} (${pct(discrepancy)} difference).`,
        docRevenue,
        'Documents reflect reported revenue; Stripe reflects processed payments. Difference may indicate unprocessed revenue streams, refunds, or data lag.',
    );
}

function checkCashContradiction(context: GlobalContext): Contradiction | null {
    const bsDoc = context.documents?.find(d => d.type === 'balance_sheet');
    if (!bsDoc?.data) return null;

    const plaidSnapshot = context.apiSnapshots?.plaid;
    if (!plaidSnapshot?.accounts || plaidSnapshot.accounts.length === 0) return null;

    const docCash = extractLatestNumericValue(
        bsDoc.data as Record<string, unknown>,
        'cash', 'cashAndEquivalents', 'cash_and_equivalents', 'currentAssets',
    );
    if (docCash === undefined || docCash <= 0) return null;

    const plaidCash = plaidSnapshot.accounts
        .reduce((sum, acc) => sum + (acc.currentBalance ?? 0), 0);
    if (plaidCash <= 0) return null;

    const discrepancy = Math.abs(docCash - plaidCash) / Math.max(docCash, plaidCash);
    if (discrepancy <= DISCREPANCY_THRESHOLD) return null;

    const sources: ConflictSource[] = [
        {
            source: 'document',
            documentId: bsDoc.id,
            field: 'cash_position',
            value: docCash,
            trustScore: bsDoc.trustScore,
        },
        {
            source: 'plaid',
            field: 'account_balance_sum',
            value: plaidCash,
            trustScore: 0.8,
        },
    ];

    return buildContradiction(
        sources,
        `Cash discrepancy: balance sheet shows $${fmt(docCash)} vs Plaid accounts $${fmt(plaidCash)} (${pct(discrepancy)} difference).`,
        docCash,
        'Balance sheet may reflect a period-end snapshot while Plaid reflects live balances. Large gaps can indicate off-balance-sheet accounts or timing differences.',
    );
}

// ============================================
// HELPERS
// ============================================

function buildContradiction(
    sources: ConflictSource[],
    description: string,
    acceptedValue: number,
    reasoning: string,
): Contradiction {
    // Trust-rank: highest trustScore wins
    const sorted = [...sources].sort((a, b) => b.trustScore - a.trustScore);

    return {
        id: uuid(),
        detectedAt: new Date(),
        sources: sorted,
        description,
        resolution: {
            resolvedAt: new Date(),
            method: 'trust_ranking',
            acceptedValue,
            reasoning,
        },
    };
}

function fmt(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function pct(ratio: number): string {
    return `${(ratio * 100).toFixed(0)}%`;
}
