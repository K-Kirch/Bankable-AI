/**
 * Audit Trail
 * 
 * Comprehensive logging of all LLM interactions for transparency,
 * debugging, and compliance purposes.
 */

import { v4 as uuid } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import type { AgentId } from '../types/index.js';

// ============================================
// AUDIT ENTRY TYPES
// ============================================

export interface AuditEntry {
    /** Unique identifier for this entry */
    id: string;

    /** Which agent made this LLM call */
    agentId: AgentId;

    /** When the call was made */
    timestamp: Date;

    /** The prompt sent to the LLM */
    prompt: string;

    /** Input data provided for context */
    inputData: Record<string, unknown>;

    /** Raw text response from the LLM */
    rawResponse: string;

    /** Parsed/structured response (if applicable) */
    parsedResponse: unknown;

    /** Which model was used */
    modelUsed: string;

    /** Token usage statistics */
    tokenCount: {
        prompt: number;
        completion: number;
        total: number;
    };

    /** How long the call took */
    latencyMs: number;

    /** Confidence in the response (0-1) */
    confidence: number;

    /** Whether this call was retried */
    wasRetried: boolean;
    retryCount?: number;

    /** Any errors encountered during parsing */
    parseErrors?: string[];

    /** Category of analysis being performed */
    analysisType: string;
}

// ============================================
// AUDIT TRAIL CLASS
// ============================================

export class AuditTrail {
    private entries: AuditEntry[] = [];
    private readonly sessionId: string;
    private readonly startedAt: Date;

    constructor(sessionId: string) {
        this.sessionId = sessionId;
        this.startedAt = new Date();
    }

    /**
     * Log an LLM interaction
     */
    log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
        const fullEntry: AuditEntry = {
            ...entry,
            id: uuid(),
            timestamp: new Date(),
        };

        this.entries.push(fullEntry);

        // Log to console for real-time visibility
        console.log(`[Audit] ${entry.agentId} | ${entry.analysisType} | ${entry.latencyMs}ms | ${entry.tokenCount.total} tokens`);

        return fullEntry;
    }

    /**
     * Get all entries for a specific agent
     */
    getEntriesForAgent(agentId: AgentId): AuditEntry[] {
        return this.entries.filter(e => e.agentId === agentId);
    }

    /**
     * Get all entries
     */
    getAllEntries(): AuditEntry[] {
        return [...this.entries];
    }

    /**
     * Get summary statistics
     */
    getSummary(): {
        totalCalls: number;
        totalTokens: number;
        totalLatencyMs: number;
        averageLatencyMs: number;
        byAgent: Record<AgentId, { calls: number; tokens: number }>;
    } {
        const byAgent: Record<string, { calls: number; tokens: number }> = {};
        let totalTokens = 0;
        let totalLatencyMs = 0;

        for (const entry of this.entries) {
            totalTokens += entry.tokenCount.total;
            totalLatencyMs += entry.latencyMs;

            if (!byAgent[entry.agentId]) {
                byAgent[entry.agentId] = { calls: 0, tokens: 0 };
            }
            // Safe to use ! since we just ensured it exists above
            byAgent[entry.agentId]!.calls++;
            byAgent[entry.agentId]!.tokens += entry.tokenCount.total;
        }

        return {
            totalCalls: this.entries.length,
            totalTokens,
            totalLatencyMs,
            averageLatencyMs: this.entries.length > 0 ? totalLatencyMs / this.entries.length : 0,
            byAgent: byAgent as Record<AgentId, { calls: number; tokens: number }>,
        };
    }

    /**
     * Export to JSON format
     */
    toJSON(): object {
        return {
            sessionId: this.sessionId,
            startedAt: this.startedAt.toISOString(),
            exportedAt: new Date().toISOString(),
            summary: this.getSummary(),
            entries: this.entries.map(e => ({
                ...e,
                timestamp: e.timestamp.toISOString(),
            })),
        };
    }

    /**
     * Export audit trail to a file
     */
    async export(outputDir: string): Promise<string> {
        const filename = `audit-${this.sessionId}-${Date.now()}.json`;
        const filePath = path.join(outputDir, filename);

        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(this.toJSON(), null, 2));

        console.log(`[Audit] Exported to ${filePath}`);
        return filePath;
    }

    /**
     * Find entry by ID (for linking insights back to LLM calls)
     */
    findById(id: string): AuditEntry | undefined {
        return this.entries.find(e => e.id === id);
    }
}

// ============================================
// SINGLETON MANAGEMENT
// ============================================

let currentAuditTrail: AuditTrail | null = null;

export function createAuditTrail(sessionId: string): AuditTrail {
    currentAuditTrail = new AuditTrail(sessionId);
    return currentAuditTrail;
}

export function getAuditTrail(): AuditTrail {
    if (!currentAuditTrail) {
        throw new Error('Audit trail not initialized. Call createAuditTrail() first.');
    }
    return currentAuditTrail;
}

export function hasAuditTrail(): boolean {
    return currentAuditTrail !== null;
}
