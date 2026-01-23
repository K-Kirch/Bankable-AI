/**
 * Simple single-company evaluation test
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { AgentOrchestrator } from '../../src/core/orchestrator.js';
import { getGlobalContext, GlobalContextService } from '../../src/core/global-context.js';
import { createAuditTrail, getAuditTrail } from '../../src/core/audit-trail.js';
import { CounterAgent } from '../../src/agents/counter-agent.js';
import { LawyerAgent } from '../../src/agents/lawyer-agent.js';
import { ForecasterAgent } from '../../src/agents/forecaster-agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    console.log('Starting single eval...');

    try {
        // Load fixture
        const inputPath = path.join(__dirname, '..', 'fixtures', 'companies', 'hydrema-produktion', 'input.json');
        const content = await fs.readFile(inputPath, 'utf-8');
        const fixture = JSON.parse(content);

        console.log(`Company: ${fixture.company.name}`);
        console.log(`Expected: ${fixture.expectedScore.range[0]}-${fixture.expectedScore.range[1]}`);

        // Initialize
        const sessionId = `eval-test-${Date.now()}`;
        createAuditTrail(sessionId);

        const contextService = getGlobalContext();
        await contextService.createSession(fixture.company.cvr);

        // Add documents
        for (const [docType, years] of Object.entries(fixture.documents)) {
            if (typeof years === 'object' && years !== null) {
                await contextService.addDocument({
                    id: `${fixture.company.cvr}-${docType}`,
                    type: docType as any,
                    filename: `${docType}.pdf`,
                    parsedAt: new Date(),
                    confidence: 0.95,
                    data: years,
                    rawText: JSON.stringify(years, null, 2),
                    trustScore: 0.9,
                });
            }
        }

        // Add plaid
        if (fixture.plaid) {
            await contextService.setPlaidSnapshot({
                fetchedAt: new Date(),
                accounts: fixture.plaid.accounts || [],
                transactions: {
                    period: { start: new Date(), end: new Date() },
                    totalInflow: fixture.plaid.monthlyInflow || 0,
                    totalOutflow: fixture.plaid.monthlyOutflow || 0,
                    categoryBreakdown: {}
                },
                cashFlow: {
                    averageMonthlyInflow: fixture.plaid.monthlyInflow || 0,
                    averageMonthlyOutflow: fixture.plaid.monthlyOutflow || 0,
                    burnRate: Math.max(0, (fixture.plaid.monthlyOutflow || 0) - (fixture.plaid.monthlyInflow || 0)),
                    runwayMonths: 12,
                },
            });
        }

        console.log('Context initialized, running agents...');

        // Create orchestrator
        const orchestrator = new AgentOrchestrator();
        orchestrator.registerAgent(new CounterAgent());
        orchestrator.registerAgent(new LawyerAgent());
        orchestrator.registerAgent(new ForecasterAgent());

        // Run
        const result = await orchestrator.analyze(fixture.company.cvr);

        console.log(`\nActual Score: ${result.score.score} (${result.score.grade})`);
        const inRange = result.score.score >= fixture.expectedScore.range[0] &&
            result.score.score <= fixture.expectedScore.range[1];
        console.log(`In Range: ${inRange ? 'YES ✅' : 'NO ⚠️'}`);

        // Show insights
        const context = contextService.getContext();
        console.log('\nInsights:');
        for (const [agentId, insights] of context.agentInsights) {
            for (const insight of insights) {
                const sign = insight.impact >= 0 ? '+' : '';
                console.log(`  [${agentId}] ${insight.title} (${sign}${insight.impact})`);
            }
        }

        // Export audit
        const trail = getAuditTrail();
        console.log(`\nAudit Trail: ${trail.getAllEntries().length} entries`);
        console.log(`Summary: ${JSON.stringify(trail.getSummary(), null, 2)}`);

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
