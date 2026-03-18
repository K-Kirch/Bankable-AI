/**
 * Document Data Extraction Utilities
 *
 * Shared helpers for extracting numeric values from parsed financial documents.
 * Documents may be structured as flat objects or year-keyed maps:
 *
 *   Flat:       { revenue: 1000000, netIncome: 80000 }
 *   Year-keyed: { "2024": { revenue: 1000000 }, "2023": { revenue: 900000 } }
 *
 * Both formats, as well as arbitrary nesting depth, are handled transparently.
 */

/**
 * Recursively search an object for a key, returning the first numeric value found.
 */
export function extractNumericValue(
    obj: Record<string, unknown> | undefined | null,
    ...keys: string[]
): number | undefined {
    if (!obj) return undefined;
    for (const key of keys) {
        if (obj[key] !== undefined && typeof obj[key] === 'number') {
            return obj[key] as number;
        }
        for (const k of Object.keys(obj)) {
            const nested = obj[k];
            if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
                const value = extractNumericValue(nested as Record<string, unknown>, key);
                if (value !== undefined) return value;
            }
        }
    }
    return undefined;
}

/**
 * Return year keys from a document object, sorted descending (most recent first).
 * e.g. { "2022": {...}, "2024": {...} } → ["2024", "2022"]
 */
export function getSortedYearKeys(data: Record<string, unknown> | undefined | null): string[] {
    if (!data) return [];
    return Object.keys(data).filter(k => /^\d{4}$/.test(k)).sort().reverse();
}

/**
 * Extract a value from the most recent year in a year-keyed document,
 * falling back to a flat-structure search.
 */
export function extractLatestNumericValue(
    data: Record<string, unknown> | undefined | null,
    ...keys: string[]
): number | undefined {
    if (!data) return undefined;
    const years = getSortedYearKeys(data);
    if (years.length > 0) {
        return extractNumericValue(data[years[0]!] as Record<string, unknown>, ...keys);
    }
    return extractNumericValue(data, ...keys);
}
