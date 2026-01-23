/**
 * Test script for the /api/test/analyze-fixture endpoint
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testFixture(companyName: string) {
    const fixturePath = path.join(
        __dirname, '..', 'fixtures', 'companies',
        companyName, 'input.json'
    );

    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    console.log(`\nTesting: ${fixture.company.name}`);
    console.log(`Expected Score: ${fixture.expectedScore.range[0]}-${fixture.expectedScore.range[1]} (${fixture.expectedScore.grade})`);

    const response = await fetch('http://localhost:3000/api/test/analyze-fixture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixture }),
    });

    const result = await response.json();

    if (result.success) {
        const actual = result.actualScore?.score ?? 'N/A';
        const expected = fixture.expectedScore.range;
        const inRange = actual >= expected[0] && actual <= expected[1];

        console.log(`Actual Score: ${actual} (${result.actualScore?.grade ?? 'N/A'})`);
        console.log(`Status: ${inRange ? '✅ IN RANGE' : '❌ OUT OF RANGE'}`);

        // Show individual risk factors if available
        if (result.actualScore?.riskFactors) {
            console.log('\nRisk Factor Breakdown:');
            for (const [key, factor] of Object.entries(result.actualScore.riskFactors)) {
                const f = factor as { name: string; score: number };
                console.log(`  ${f.name}: ${f.score.toFixed(0)}/100`);
            }
        }
    } else {
        console.log(`Error: ${result.error}`);
    }

    return result;
}

async function main() {
    console.log('='.repeat(50));
    console.log('Bankable.ai Scoring Logic Test');
    console.log('='.repeat(50));

    // Test Hydrema first
    await testFixture('hydrema-produktion');
}

main().catch(console.error);
