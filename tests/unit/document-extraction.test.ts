/**
 * Unit tests for the shared document extraction utilities
 */

import { describe, it, expect } from 'vitest';
import { extractNumericValue, extractLatestNumericValue } from '../../src/utils/document-extraction.js';

describe('extractNumericValue', () => {
    it('extracts a top-level key', () => {
        expect(extractNumericValue({ revenue: 1000 }, 'revenue')).toBe(1000);
    });

    it('extracts from a nested object', () => {
        expect(extractNumericValue({ income: { netIncome: 50000 } }, 'netIncome')).toBe(50000);
    });

    it('tries multiple keys in order, returns first match', () => {
        expect(extractNumericValue({ totalEquity: 200 }, 'equity', 'totalEquity')).toBe(200);
    });

    it('returns undefined when no key matches', () => {
        expect(extractNumericValue({ foo: 'bar' }, 'revenue')).toBeUndefined();
    });

    it('ignores non-numeric values for the key', () => {
        expect(extractNumericValue({ revenue: 'not-a-number' }, 'revenue')).toBeUndefined();
    });
});

describe('extractLatestNumericValue', () => {
    it('extracts from the most recent year in a year-keyed object', () => {
        const data = {
            '2022': { revenue: 800 },
            '2024': { revenue: 1000 },
            '2023': { revenue: 900 },
        };
        expect(extractLatestNumericValue(data, 'revenue')).toBe(1000);
    });

    it('falls back to flat structure when no year keys present', () => {
        const data = { revenue: 500 };
        expect(extractLatestNumericValue(data, 'revenue')).toBe(500);
    });

    it('returns undefined when key not found in any year', () => {
        const data = { '2024': { netIncome: 100 } };
        expect(extractLatestNumericValue(data, 'revenue')).toBeUndefined();
    });

    it('handles deeply nested values inside year keys', () => {
        const data = {
            '2024': { income: { netIncome: 75000 } },
        };
        expect(extractLatestNumericValue(data, 'netIncome')).toBe(75000);
    });
});
