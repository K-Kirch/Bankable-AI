/**
 * Unit tests for the async analysis job store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createJob, getJob, updateJob } from '../../src/core/job-store.js';

// Each test gets a unique job ID to avoid cross-test state pollution
function uid() {
    return `test-${Math.random().toString(36).slice(2)}`;
}

describe('job-store', () => {
    describe('createJob', () => {
        it('creates a job with queued status', () => {
            const id = uid();
            const job = createJob(id, 'company-abc');
            expect(job.id).toBe(id);
            expect(job.companyId).toBe('company-abc');
            expect(job.status).toBe('queued');
            expect(job.createdAt).toBeInstanceOf(Date);
        });

        it('persisted job is retrievable via getJob', () => {
            const id = uid();
            createJob(id, 'company-abc');
            expect(getJob(id)).toBeDefined();
        });
    });

    describe('getJob', () => {
        it('returns undefined for unknown id', () => {
            expect(getJob('does-not-exist-xyz')).toBeUndefined();
        });
    });

    describe('updateJob', () => {
        it('transitions status from queued to analyzing', () => {
            const id = uid();
            createJob(id, 'company-abc');
            updateJob(id, { status: 'analyzing' });
            expect(getJob(id)?.status).toBe('analyzing');
        });

        it('stores score and roadmap on completion', () => {
            const id = uid();
            createJob(id, 'company-abc');
            const fakeScore = { score: 72 } as any;
            const fakeRoadmap = { tasks: [] } as any;
            updateJob(id, {
                status: 'complete',
                completedAt: new Date(),
                score: fakeScore,
                roadmap: fakeRoadmap,
                failedAgents: [],
            });
            const job = getJob(id);
            expect(job?.status).toBe('complete');
            expect(job?.score).toBe(fakeScore);
            expect(job?.roadmap).toBe(fakeRoadmap);
            expect(job?.failedAgents).toEqual([]);
        });

        it('stores error message on failure', () => {
            const id = uid();
            createJob(id, 'company-abc');
            updateJob(id, { status: 'error', errorMessage: 'LLM timeout' });
            const job = getJob(id);
            expect(job?.status).toBe('error');
            expect(job?.errorMessage).toBe('LLM timeout');
        });

        it('is a no-op for unknown id (does not throw)', () => {
            expect(() => updateJob('nonexistent', { status: 'error' })).not.toThrow();
        });
    });
});
