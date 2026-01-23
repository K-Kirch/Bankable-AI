/**
 * Debug script to understand why document data extraction is failing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractNestedValue(obj: Record<string, unknown>, key: string): number | undefined {
    if (obj[key] !== undefined && typeof obj[key] === 'number') {
        return obj[key] as number;
    }
    for (const k of Object.keys(obj)) {
        const nested = obj[k];
        if (typeof nested === 'object' && nested !== null) {
            const value = extractNestedValue(nested as Record<string, unknown>, key);
            if (value !== undefined) return value;
        }
    }
    return undefined;
}

function extractLatestValue(
    data: Record<string, unknown> | undefined,
    ...keys: string[]
): number | undefined {
    if (!data) return undefined;

    // Check for year-keyed data
    const years = Object.keys(data).filter(k => /^\d{4}$/.test(k)).sort().reverse();
    console.log('Found years:', years);

    if (years.length > 0) {
        const latestYear = data[years[0]!] as Record<string, unknown>;
        console.log('Latest year data:', latestYear);
        for (const key of keys) {
            const value = extractNestedValue(latestYear, key);
            console.log(`  Key "${key}" = ${value}`);
            if (value !== undefined) return value;
        }
    }

    // Check flat structure
    for (const key of keys) {
        const value = extractNestedValue(data, key);
        if (value !== undefined) return value;
    }

    return undefined;
}

async function main() {
    const fixturePath = path.join(
        __dirname, '..', 'fixtures', 'companies',
        'hydrema-produktion', 'input.json'
    );

    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    console.log('='.repeat(50));
    console.log('Document Data Debug');
    console.log('='.repeat(50));

    console.log('\nP&L Structure:');
    console.log(JSON.stringify(fixture.documents.profit_and_loss, null, 2).slice(0, 500));

    console.log('\nBalance Sheet Structure:');
    console.log(JSON.stringify(fixture.documents.balance_sheet, null, 2).slice(0, 500));

    console.log('\n--- Testing Extraction ---');

    const plData = fixture.documents.profit_and_loss;
    const bsData = fixture.documents.balance_sheet;

    console.log('\nFrom P&L:');
    const netIncome = extractLatestValue(plData, 'netIncome');
    console.log('netIncome:', netIncome);

    const revenue = extractLatestValue(plData, 'revenue');
    console.log('revenue:', revenue);

    console.log('\nFrom Balance Sheet:');
    const totalAssets = extractLatestValue(bsData, 'totalAssets', 'assets');
    console.log('totalAssets:', totalAssets);

    const totalEquity = extractLatestValue(bsData, 'totalEquity', 'equity');
    console.log('totalEquity:', totalEquity);

    console.log('\n--- Calculated Ratios ---');
    if (netIncome && revenue) {
        console.log('Profit Margin:', (netIncome / revenue * 100).toFixed(2) + '%');
    }
    if (totalEquity && totalAssets) {
        console.log('Equity Ratio:', (totalEquity / totalAssets * 100).toFixed(2) + '%');
    }
}

main().catch(console.error);
