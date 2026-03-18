/**
 * Analysis Job Store
 *
 * Tracks the lifecycle of async analysis jobs in memory.
 * Jobs transition: queued → analyzing → complete | error
 *
 *   POST /api/analyze  ──► createJob() ──► 202 { jobId }
 *                               │
 *                         [background worker]
 *                               │
 *                         updateJob(id, ...)
 *                               │
 *   GET /api/analyze/:id/status ──► getJob(id)
 *
 * TTL: completed/errored jobs are evicted after JOB_TTL_MS (default 2h).
 * Active jobs (queued/analyzing) are never evicted. Eviction runs on createJob().
 */

import type { AgentId, BankabilityScore, RemediationRoadmap } from '../types/index.js';
import { persistAnalysis } from './analysis-store.js';

const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Discriminated union — compiler enforces correct field access per status
export type AnalysisJob =
    | { id: string; companyId: string; status: 'queued' | 'analyzing'; createdAt: Date }
    | { id: string; companyId: string; status: 'complete'; createdAt: Date; completedAt: Date; score: BankabilityScore; roadmap: RemediationRoadmap; failedAgents: AgentId[] }
    | { id: string; companyId: string; status: 'error'; createdAt: Date; completedAt: Date; errorMessage: string };

// Mutable working type used internally before the job reaches a terminal state
type MutableJob = {
    id: string;
    companyId: string;
    status: 'queued' | 'analyzing' | 'complete' | 'error';
    createdAt: Date;
    completedAt?: Date;
    score?: BankabilityScore;
    roadmap?: RemediationRoadmap;
    failedAgents?: AgentId[];
    errorMessage?: string;
};

// Module-level store — scoped per process (sufficient for single-instance deployments)
const jobs = new Map<string, MutableJob>();

/** Evict completed/errored jobs older than JOB_TTL_MS. Called on each createJob(). */
function evictStale(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
        if (
            (job.status === 'complete' || job.status === 'error') &&
            job.completedAt &&
            job.completedAt.getTime() < cutoff
        ) {
            jobs.delete(id);
        }
    }
}

export function createJob(id: string, companyId: string): AnalysisJob {
    evictStale();
    const job: MutableJob = { id, companyId, status: 'queued', createdAt: new Date() };
    jobs.set(id, job);
    return job as unknown as AnalysisJob;
}

export function getJob(id: string): AnalysisJob | undefined {
    return jobs.get(id) as unknown as AnalysisJob | undefined;
}

export function updateJob(
    id: string,
    update: Partial<Omit<MutableJob, 'id' | 'companyId' | 'createdAt'>>,
): void {
    const job = jobs.get(id);
    if (!job) return;

    Object.assign(job, update);

    // Persist to DB when the job reaches a terminal state
    if (job.status === 'complete' || job.status === 'error') {
        persistAnalysis({
            id: job.id,
            companyId: job.companyId,
            status: job.status,
            createdAt: job.createdAt,
            completedAt: job.completedAt!,
            score: job.score,
            roadmap: job.roadmap,
            failedAgents: job.failedAgents,
            errorMessage: job.errorMessage,
        }).catch((err: Error) => {
            console.error('[job-store] failed to persist job to DB:', err.message);
        });
    }
}
