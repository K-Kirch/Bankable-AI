/**
 * Validation Schemas
 * 
 * Zod schemas for validating LLM responses and API inputs.
 * Ensures malformed AI outputs don't silently corrupt data.
 */

import { z } from 'zod';

// ============================================
// LLM RESPONSE SCHEMAS
// ============================================

/**
 * Schema for a single agent insight returned by the LLM
 */
export const LLMInsightSchema = z.object({
    title: z.string().min(1).max(200),
    category: z.string().min(1),
    impact: z.number().min(-50).max(50),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.object({
        source: z.string(),
        detail: z.string(),
        weight: z.number().min(0).max(1).optional(),
    })).optional().default([]),
    explanation: z.string().optional().default(''),
});

/**
 * Schema for the full LLM analysis response
 */
export const LLMAnalysisResponseSchema = z.object({
    insights: z.array(LLMInsightSchema).min(1).max(20),
    dataSufficiency: z.object({
        sufficient: z.boolean(),
        missingData: z.array(z.string()).optional().default([]),
        recommendation: z.string().optional(),
    }).optional(),
});

/**
 * Schema for document type detection response
 */
export const DocumentTypeResponseSchema = z.object({
    type: z.enum([
        'profit_and_loss',
        'balance_sheet',
        'cash_flow',
        'tax_return',
        'contract',
        'invoice',
        'bank_statement',
        'other',
        'unknown',
    ]),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional(),
});

/**
 * Schema for extracted document data
 */
export const ExtractedDataSchema = z.record(z.string(), z.unknown());

// ============================================
// SAFE PARSE HELPERS
// ============================================

/**
 * Safely parse an LLM response with a Zod schema.
 * Returns the parsed data or null with error details.
 */
export function safeParseLLMResponse<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context?: string
): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    const errorDetails = result.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ');

    console.warn(
        `[Validation] ${context || 'LLM response'} failed validation: ${errorDetails}`
    );

    return { success: false, error: errorDetails };
}
