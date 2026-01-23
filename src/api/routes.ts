/**
 * REST API Routes
 * 
 * Exposes the Bankable.ai platform via HTTP API.
 */

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getOrchestrator } from '../core/orchestrator.js';
import { getGlobalContext } from '../core/global-context.js';
import { CounterAgent } from '../agents/counter-agent.js';
import { LawyerAgent } from '../agents/lawyer-agent.js';
import { ForecasterAgent } from '../agents/forecaster-agent.js';
import { PDFParser } from '../ingestion/pdf-parser.js';
import { StripeAdapter } from '../ingestion/stripe-adapter.js';
import { PlaidAdapter } from '../ingestion/plaid-adapter.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize orchestrator with agents
const orchestrator = getOrchestrator();
orchestrator.registerAgent(new CounterAgent());
orchestrator.registerAgent(new LawyerAgent());
orchestrator.registerAgent(new ForecasterAgent());

// ============================================
// ANALYSIS ENDPOINTS
// ============================================

/**
 * POST /api/analyze
 * Start a full analysis for a company
 */
router.post('/analyze', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { companyId } = req.body;

        if (!companyId) {
            res.status(400).json({ error: 'companyId is required' });
            return;
        }

        const result = await orchestrator.analyze(companyId);

        res.json({
            success: true,
            score: result.score,
            roadmap: result.roadmap,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/test/analyze-fixture
 * Test endpoint: Analyze a company using fixture JSON data directly
 * This bypasses PDF parsing for testing scoring logic
 */
router.post('/test/analyze-fixture', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { fixture } = req.body;

        if (!fixture || !fixture.company) {
            res.status(400).json({ error: 'fixture with company data is required' });
            return;
        }

        const context = getGlobalContext();
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

        // Run the analysis
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
 * Get the status of an ongoing analysis
 */
router.get('/analyze/:sessionId/status', async (req: Request, res: Response) => {
    const status = orchestrator.getStatus();

    if (!status || status.sessionId !== req.params.sessionId) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    res.json({
        sessionId: status.sessionId,
        status: status.status,
        agentStatuses: Object.fromEntries(status.agentStatuses),
        errors: status.errors.map(e => e.message),
        startTime: status.startTime,
        endTime: status.endTime,
    });
});

// ============================================
// DOCUMENT ENDPOINTS
// ============================================

/**
 * POST /api/documents
 * Upload and parse a document
 */
router.post('/documents', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.body;
        const file = req.file;

        if (!file) {
            res.status(400).json({ error: 'File is required' });
            return;
        }

        const parser = new PDFParser();
        const document = await parser.parse(file.buffer, file.originalname);

        if (sessionId) {
            const context = getGlobalContext();
            await context.loadSession(sessionId);
            await context.addDocument(document);
        }

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
 * Fetch Stripe data and add to session
 */
router.post('/integrations/stripe', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.body;

        const adapter = new StripeAdapter();
        const snapshot = await adapter.fetchSnapshot();

        if (sessionId) {
            const context = getGlobalContext();
            await context.loadSession(sessionId);
            await context.setStripeSnapshot(snapshot);
        }

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
        const { publicToken, sessionId } = req.body;

        if (!publicToken) {
            res.status(400).json({ error: 'publicToken is required' });
            return;
        }

        const adapter = new PlaidAdapter();
        const accessToken = await adapter.exchangeToken(publicToken);
        const snapshot = await adapter.fetchSnapshot(accessToken);

        if (sessionId) {
            const context = getGlobalContext();
            await context.loadSession(sessionId);
            await context.setPlaidSnapshot(snapshot);
        }

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

        const context = getGlobalContext();
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

/**
 * GET /api/sessions/:sessionId
 * Get session details
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId || Array.isArray(sessionId)) {
            res.status(400).json({ error: 'sessionId is required' });
            return;
        }
        const context = getGlobalContext();
        const session = await context.loadSession(sessionId as string);

        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }

        res.json({
            sessionId: session.sessionId,
            companyId: session.companyId,
            startedAt: session.startedAt,
            documentCount: session.documents.length,
            hasStripe: !!session.apiSnapshots.stripe,
            hasPlaid: !!session.apiSnapshots.plaid,
            insightCount: Array.from(session.agentInsights.values()).flat().length,
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
