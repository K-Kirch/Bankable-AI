/**
 * REST API Routes
 * 
 * Exposes the Bankable.ai platform via HTTP API.
 */

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { AgentOrchestrator } from '../core/orchestrator.js';
import { createGlobalContext } from '../core/global-context.js';
import { createJob, getJob, updateJob } from '../core/job-store.js';
import { fetchAnalysis } from '../core/analysis-store.js';
import { CounterAgent } from '../agents/counter-agent.js';
import { LawyerAgent } from '../agents/lawyer-agent.js';
import { ForecasterAgent } from '../agents/forecaster-agent.js';
import { MarketAgent } from '../agents/market-agent.js';
import { PDFParser } from '../ingestion/pdf-parser.js';
import { StripeAdapter } from '../ingestion/stripe-adapter.js';
import { PlaidAdapter } from '../ingestion/plaid-adapter.js';
import { apiKeyAuth } from './auth.js';
import { rateLimiter } from './rate-limit.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Apply rate limiting first, then authentication
router.use(rateLimiter);
router.use(apiKeyAuth);


/**
 * Create a fresh orchestrator with all agents registered.
 * Each analysis request gets its own isolated instance.
 */
function createOrchestrator(contextService?: ReturnType<typeof createGlobalContext>): AgentOrchestrator {
    const orchestrator = new AgentOrchestrator(contextService);
    orchestrator.registerAgent(new CounterAgent());
    orchestrator.registerAgent(new LawyerAgent());
    orchestrator.registerAgent(new ForecasterAgent());
    orchestrator.registerAgent(new MarketAgent());
    return orchestrator;
}

// ============================================
// ANALYSIS ENDPOINTS
// ============================================

/**
 * POST /api/analyze
 * Enqueue an analysis job and return immediately.
 * Poll GET /api/analyze/:sessionId/status for progress and results.
 */
router.post('/analyze', (req: Request, res: Response) => {
    const { companyId } = req.body;

    if (!companyId) {
        res.status(400).json({ error: 'companyId is required' });
        return;
    }

    const jobId = uuid();
    createJob(jobId, companyId);

    // Defer analysis off the request cycle — critical gap fix: top-level catch marks job as error
    setImmediate(() => {
        const orchestrator = createOrchestrator();
        updateJob(jobId, { status: 'analyzing' });

        orchestrator.analyze(companyId)
            .then(result => {
                updateJob(jobId, {
                    status: 'complete',
                    completedAt: new Date(),
                    score: result.score,
                    roadmap: result.roadmap,
                    failedAgents: result.failedAgents,
                });
            })
            .catch((err: Error) => {
                updateJob(jobId, {
                    status: 'error',
                    completedAt: new Date(),
                    errorMessage: err.message,
                });
            });
    });

    res.status(202).json({
        success: true,
        jobId,
        status: 'queued',
        statusUrl: `/api/analyze/${jobId}/status`,
    });
});

/**
 * POST /api/test/analyze-fixture
 * Test endpoint: Analyze a company using fixture JSON data directly
 * This bypasses PDF parsing for testing scoring logic
 */
router.post('/test/analyze-fixture', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Guard: only available in development
        if (process.env.NODE_ENV === 'production') {
            res.status(404).json({ error: 'Not found' });
            return;
        }

        const { fixture } = req.body;

        if (!fixture || !fixture.company) {
            res.status(400).json({ error: 'fixture with company data is required' });
            return;
        }

        // Create isolated context and orchestrator for this test
        const context = createGlobalContext();
        await context.createSession(fixture.company.name || 'Test Company');

        // Inject P&L as parsed document
        if (fixture.documents?.profit_and_loss) {
            await context.addDocument({
                id: `pl-${Date.now()}`,
                type: 'profit_and_loss',
                filename: 'profit_and_loss.json',
                parsedAt: new Date(),
                confidence: 1.0,
                data: fixture.documents.profit_and_loss,
                rawText: JSON.stringify(fixture.documents.profit_and_loss),
                trustScore: 0.9,
            });
        }

        // Inject Balance Sheet as parsed document
        if (fixture.documents?.balance_sheet) {
            await context.addDocument({
                id: `bs-${Date.now()}`,
                type: 'balance_sheet',
                filename: 'balance_sheet.json',
                parsedAt: new Date(),
                confidence: 1.0,
                data: fixture.documents.balance_sheet,
                rawText: JSON.stringify(fixture.documents.balance_sheet),
                trustScore: 0.9,
            });
        }

        // Run the analysis with isolated orchestrator
        const orchestrator = createOrchestrator(context);
        const result = await orchestrator.analyze(fixture.company.name);

        res.json({
            success: true,
            company: fixture.company.name,
            expectedScore: fixture.expectedScore,
            actualScore: result.score,
            roadmap: result.roadmap,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analyze/:sessionId/status
 * Poll the status of an async analysis job.
 * Returns score + roadmap once status is 'complete'.
 */
router.get('/analyze/:sessionId/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobId = req.params.sessionId as string;
        const inMemory = getJob(jobId);

        if (inMemory) {
            switch (inMemory.status) {
                case 'complete':
                    res.json({
                        jobId: inMemory.id,
                        status: inMemory.status,
                        completedAt: inMemory.completedAt,
                        score: inMemory.score,
                        roadmap: inMemory.roadmap,
                        failedAgents: inMemory.failedAgents,
                    });
                    return;
                case 'error':
                    res.status(500).json({
                        jobId: inMemory.id,
                        status: inMemory.status,
                        completedAt: inMemory.completedAt,
                        error: inMemory.errorMessage,
                    });
                    return;
                case 'queued':
                case 'analyzing':
                    res.json({ jobId: inMemory.id, status: inMemory.status, createdAt: inMemory.createdAt });
                    return;
            }
        }

        // Not in memory — check DB (covers evicted jobs and post-restart lookups)
        const persisted = await fetchAnalysis(jobId);

        if (!persisted) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        if (persisted.status === 'complete') {
            res.json({
                jobId: persisted.id,
                status: persisted.status,
                completedAt: persisted.completedAt,
                score: persisted.score,
                roadmap: persisted.roadmap,
                failedAgents: persisted.failedAgents,
            });
        } else {
            res.status(500).json({
                jobId: persisted.id,
                status: persisted.status,
                completedAt: persisted.completedAt,
                error: persisted.errorMessage,
            });
        }
    } catch (err) {
        next(err);
    }
});

// ============================================
// DOCUMENT ENDPOINTS
// ============================================

/**
 * POST /api/documents
 * Upload and parse a document (standalone, not tied to a session)
 */
router.post('/documents', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const file = req.file;

        if (!file) {
            res.status(400).json({ error: 'File is required' });
            return;
        }

        const parser = new PDFParser();
        const document = await parser.parse(file.buffer, file.originalname);

        res.json({
            success: true,
            document: {
                id: document.id,
                type: document.type,
                confidence: document.confidence,
                data: document.data,
            },
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// INTEGRATION ENDPOINTS
// ============================================

/**
 * POST /api/integrations/stripe
 * Fetch Stripe data snapshot
 */
router.post('/integrations/stripe', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const adapter = new StripeAdapter();
        const snapshot = await adapter.fetchSnapshot();

        res.json({
            success: true,
            snapshot: {
                mrr: snapshot.mrr,
                customerCount: snapshot.customerCount,
                churnRate: snapshot.churnRate,
                topCustomerCount: snapshot.topCustomers.length,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/integrations/plaid/link
 * Create a Plaid Link token
 */
router.post('/integrations/plaid/link', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }

        const adapter = new PlaidAdapter();
        const linkToken = await adapter.createLinkToken(userId);

        res.json({ success: true, linkToken });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/integrations/plaid/exchange
 * Exchange Plaid public token and fetch data
 */
router.post('/integrations/plaid/exchange', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { publicToken } = req.body;

        if (!publicToken) {
            res.status(400).json({ error: 'publicToken is required' });
            return;
        }

        const adapter = new PlaidAdapter();
        const accessToken = await adapter.exchangeToken(publicToken);
        const snapshot = await adapter.fetchSnapshot(accessToken);

        res.json({
            success: true,
            snapshot: {
                accountCount: snapshot.accounts.length,
                cashFlow: snapshot.cashFlow,
            },
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// SESSION ENDPOINTS
// ============================================

/**
 * POST /api/sessions
 * Create a new analysis session
 */
router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyId } = req.body;

        if (!companyId) {
            res.status(400).json({ error: 'companyId is required' });
            return;
        }

        const context = createGlobalContext();
        const session = await context.createSession(companyId);

        res.json({
            success: true,
            sessionId: session.sessionId,
            companyId: session.companyId,
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// ERROR HANDLER
// ============================================

router.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API Error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
});

export { router as apiRouter };


