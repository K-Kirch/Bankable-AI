/**
 * Analysis Persistence Store
 *
 * Persists completed/errored analysis jobs to PostgreSQL.
 * In-memory job-store remains the source of truth for active jobs.
 *
 * Schema (single table, auto-created on first use):
 *
 *   analyses
 *   ├── id          TEXT PRIMARY KEY       -- jobId (UUID)
 *   ├── company_id  TEXT NOT NULL
 *   ├── status      TEXT NOT NULL          -- 'complete' | 'error'
 *   ├── created_at  TIMESTAMPTZ NOT NULL
 *   ├── completed_at TIMESTAMPTZ NOT NULL
 *   ├── score       JSONB                  -- BankabilityScore (null on error)
 *   ├── roadmap     JSONB                  -- RemediationRoadmap (null on error)
 *   ├── failed_agents TEXT[]               -- AgentId[] (null on error)
 *   └── error_message TEXT                -- null on complete
 *
 * When DATABASE_URL is not set, all functions are no-ops.
 */

import { getPool } from './db.js';
import type { BankabilityScore, RemediationRoadmap, AgentId } from '../types/index.js';

let tableInitPromise: Promise<boolean> | null = null;

async function ensureTable(): Promise<boolean> {
    const pool = getPool();
    if (!pool) return false;

    if (!tableInitPromise) {
        tableInitPromise = pool.query(`
            CREATE TABLE IF NOT EXISTS analyses (
                id            TEXT PRIMARY KEY,
                company_id    TEXT NOT NULL,
                status        TEXT NOT NULL,
                created_at    TIMESTAMPTZ NOT NULL,
                completed_at  TIMESTAMPTZ NOT NULL,
                score         JSONB,
                roadmap       JSONB,
                failed_agents TEXT[],
                error_message TEXT
            )
        `).then(() => true);
    }

    return tableInitPromise;
}

export interface PersistedAnalysis {
    id: string;
    companyId: string;
    status: 'complete' | 'error';
    createdAt: Date;
    completedAt: Date;
    score?: BankabilityScore;
    roadmap?: RemediationRoadmap;
    failedAgents?: AgentId[];
    errorMessage?: string;
}

export async function persistAnalysis(job: PersistedAnalysis): Promise<void> {
    const pool = getPool();
    if (!pool) return;

    try {
        if (!(await ensureTable())) return;

        await pool.query(
            `INSERT INTO analyses
                (id, company_id, status, created_at, completed_at, score, roadmap, failed_agents, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
                status        = EXCLUDED.status,
                completed_at  = EXCLUDED.completed_at,
                score         = EXCLUDED.score,
                roadmap       = EXCLUDED.roadmap,
                failed_agents = EXCLUDED.failed_agents,
                error_message = EXCLUDED.error_message`,
            [
                job.id,
                job.companyId,
                job.status,
                job.createdAt,
                job.completedAt,
                job.score ? JSON.stringify(job.score) : null,
                job.roadmap ? JSON.stringify(job.roadmap) : null,
                job.failedAgents ?? null,
                job.errorMessage ?? null,
            ]
        );
    } catch (err) {
        // Non-fatal: log and continue. In-memory result is still served.
        console.error('[analysis-store] persist error:', (err as Error).message);
    }
}

export async function fetchAnalysis(id: string): Promise<PersistedAnalysis | null> {
    const pool = getPool();
    if (!pool) return null;

    try {
        if (!(await ensureTable())) return null;

        const { rows } = await pool.query(
            'SELECT * FROM analyses WHERE id = $1',
            [id]
        );

        if (rows.length === 0) return null;

        const row = rows[0];
        return {
            id: row.id,
            companyId: row.company_id,
            status: row.status,
            createdAt: new Date(row.created_at),
            completedAt: new Date(row.completed_at),
            score: row.score ?? undefined,
            roadmap: row.roadmap ?? undefined,
            failedAgents: row.failed_agents ?? undefined,
            errorMessage: row.error_message ?? undefined,
        };
    } catch (err) {
        console.error('[analysis-store] fetch error:', (err as Error).message);
        return null;
    }
}
