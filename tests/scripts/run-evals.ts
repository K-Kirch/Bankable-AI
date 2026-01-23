/**
 * Agent Evaluation Suite
 * 
 * Tests the LLM-only agents against all test fixtures
 * and validates scores against expected ranges.
 * Also exports audit trails for review.
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import the orchestrator and agents
import { getOrchestrator, AgentOrchestrator } from '../../src/core/orchestrator.js';
import { getGlobalContext } from '../../src/core/global-context.js';
import { createAuditTrail, getAuditTrail } from '../../src/core/audit-trail.js';
import { CounterAgent } from '../../src/agents/counter-agent.js';
import { LawyerAgent } from '../../src/agents/lawyer-agent.js';
import { ForecasterAgent } from '../../src/agents/forecaster-agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// TEST FIXTURE INTERFACE
// ============================================

interface TestFixture {
    company: {
        name: string;
        cvr: string;
        industry: string;
    };
    documents: Record<string, unknown>;
    stripe: unknown;
    plaid: unknown;
    expectedScore: {
        range: [number, number];
        grade: string;
        notes: string;
    };
}

interface EvalResult {
    company: string;
    expectedRange: [number, number];
    expectedGrade: string;
    actualScore: number | null;
    actualGrade: string | null;
    inRange: boolean;
    insights: Array<{
        agent: string;
        title: string;
        impact: number;
        confidence: number;
    }>;
    error?: string;
    durationMs: number;
}

// ============================================
// EVAL RUNNER
// ============================================

async function loadFixture(companyDir: string): Promise<TestFixture> {
    const inputPath = path.join(__dirname, '..', 'fixtures', 'companies', companyDir, 'input.json');
    const content = await fs.readFile(inputPath, 'utf-8');
    return JSON.parse(content);
}

async function runEval(fixture: TestFixture): Promise<EvalResult> {
    const startTime = Date.now();

    try {
        // Initialize audit trail for this company
        const sessionId = `eval-${fixture.company.cvr}-${Date.now()}`;
        createAuditTrail(sessionId);

        // Initialize context with fixture data
        const contextService = getGlobalContext();
        const context = await contextService.createSession(fixture.company.cvr);

        // Inject fixture data into context
        if (fixture.documents) {
            // Convert fixture documents to ParsedDocument format
            for (const [docType, years] of Object.entries(fixture.documents)) {
                if (typeof years === 'object' && years !== null) {
                    contextService.addDocument({
                        id: `${fixture.company.cvr}-${docType}`,
                        type: docType.replace(/_/g, '_') as any,
                        filename: `${docType}.pdf`,
                        parsedAt: new Date(),
                        confidence: 0.95,
                        data: years,
                        rawText: JSON.stringify(years, null, 2),
                        trustScore: 0.9,
                    });
                }
            }
        }

        // Inject API snapshots
        if (fixture.plaid) {
            await contextService.setPlaidSnapshot({
                fetchedAt: new Date(),
                accounts: (fixture.plaid as any).accounts || [],
                transactions: { period: { start: new Date(), end: new Date() }, totalInflow: 0, totalOutflow: 0, categoryBreakdown: {} },
                cashFlow: {
                    averageMonthlyInflow: (fixture.plaid as any).monthlyInflow || 0,
                    averageMonthlyOutflow: (fixture.plaid as any).monthlyOutflow || 0,
                    burnRate: Math.max(0, ((fixture.plaid as any).monthlyOutflow || 0) - ((fixture.plaid as any).monthlyInflow || 0)),
                    runwayMonths: 12,
                },
            });
        }

        if (fixture.stripe) {
            await contextService.setStripeSnapshot(fixture.stripe as any);
        }

        // Create orchestrator and register agents
        const orchestrator = new AgentOrchestrator();
        orchestrator.registerAgent(new CounterAgent());
        orchestrator.registerAgent(new LawyerAgent());
        orchestrator.registerAgent(new ForecasterAgent());

        // Run analysis
        const result = await orchestrator.analyze(fixture.company.cvr);

        const durationMs = Date.now() - startTime;

        // Collect insights from context
        const insights: EvalResult['insights'] = [];
        const updatedContext = contextService.getContext();
        for (const [agentId, agentInsights] of updatedContext.agentInsights) {
            for (const insight of agentInsights) {
                insights.push({
                    agent: agentId,
                    title: insight.title,
                    impact: insight.impact,
                    confidence: insight.confidence,
                });
            }
        }

        const actualScore = result.score.score;
        const actualGrade = result.score.grade;
        const inRange = actualScore >= fixture.expectedScore.range[0] && actualScore <= fixture.expectedScore.range[1];

        return {
            company: fixture.company.name,
            expectedRange: fixture.expectedScore.range,
            expectedGrade: fixture.expectedScore.grade,
            actualScore,
            actualGrade,
            inRange,
            insights,
            durationMs,
        };
    } catch (error) {
        return {
            company: fixture.company.name,
            expectedRange: fixture.expectedScore.range,
            expectedGrade: fixture.expectedScore.grade,
            actualScore: null,
            actualGrade: null,
            inRange: false,
            insights: [],
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
        };
    }
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('═'.repeat(60));
    console.log('  BANKABLE.AI - LLM AGENT EVALUATION SUITE');
    console.log('═'.repeat(60));
    console.log();

    const companies = [
        'hydrema-produktion',
        'novo-nordisk',
        'pleo-technologies',
        'spisehuset-5c',
        'murermester-k',
    ];

    const results: EvalResult[] = [];

    for (const companyDir of companies) {
        console.log(`\n${'─'.repeat(50)}`);
        console.log(`Testing: ${companyDir}`);
        console.log('─'.repeat(50));

        try {
            const fixture = await loadFixture(companyDir);
            console.log(`Company: ${fixture.company.name}`);
            console.log(`Expected: ${fixture.expectedScore.range[0]}-${fixture.expectedScore.range[1]} (${fixture.expectedScore.grade})`);

            const result = await runEval(fixture);
            results.push(result);

            if (result.error) {
                console.log(`❌ ERROR: ${result.error}`);
            } else {
                const status = result.inRange ? '✅ PASS' : '⚠️  OUT OF RANGE';
                console.log(`Actual:   ${result.actualScore} (${result.actualGrade})`);
                console.log(`Result:   ${status}`);
                console.log(`Duration: ${result.durationMs}ms`);

                console.log(`\nInsights (${result.insights.length}):`);
                for (const insight of result.insights.slice(0, 6)) {
                    const sign = insight.impact >= 0 ? '+' : '';
                    console.log(`  [${insight.agent}] ${insight.title} (${sign}${insight.impact})`);
                }
                if (result.insights.length > 6) {
                    console.log(`  ... and ${result.insights.length - 6} more`);
                }
            }
        } catch (error) {
            console.log(`❌ Failed to load fixture: ${error}`);
            results.push({
                company: companyDir,
                expectedRange: [0, 0],
                expectedGrade: '?',
                actualScore: null,
                actualGrade: null,
                inRange: false,
                insights: [],
                error: String(error),
                durationMs: 0,
            });
        }
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('  EVALUATION SUMMARY');
    console.log('═'.repeat(60));

    const passed = results.filter(r => r.inRange).length;
    const failed = results.filter(r => !r.inRange && !r.error).length;
    const errors = results.filter(r => r.error).length;

    console.log(`\nTotal:  ${results.length} companies`);
    console.log(`Passed: ${passed} (scores in expected range)`);
    console.log(`Failed: ${failed} (scores out of range)`);
    console.log(`Errors: ${errors} (execution errors)`);

    console.log('\nResults Table:');
    console.log('─'.repeat(60));
    console.log('Company                          | Expected  | Actual | Status');
    console.log('─'.repeat(60));

    for (const r of results) {
        const name = r.company.substring(0, 32).padEnd(32);
        const expected = `${r.expectedRange[0]}-${r.expectedRange[1]}`.padEnd(9);
        const actual = r.actualScore !== null ? String(r.actualScore).padEnd(6) : 'ERROR '.padEnd(6);
        const status = r.error ? '❌' : (r.inRange ? '✅' : '⚠️');
        console.log(`${name} | ${expected} | ${actual} | ${status}`);
    }

    // Export audit trail
    try {
        const auditDir = path.join(__dirname, '..', 'audits');
        const trail = getAuditTrail();
        const auditPath = await trail.export(auditDir);
        console.log(`\nAudit trail exported: ${auditPath}`);
    } catch {
        console.log('\n(No audit trail to export)');
    }

    console.log('\n' + '═'.repeat(60));

    // Exit with proper code
    process.exit(errors > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
