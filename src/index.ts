/**
 * Bankable.ai Entry Point
 * 
 * Agentic Credit Intelligence Platform
 */

import express from 'express';
import { apiRouter } from './api/routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', apiRouter);

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'bankable-ai',
        version: '0.1.0',
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🏦  Bankable.ai - Agentic Credit Intelligence Platform    ║
║                                                              ║
║   Server running on http://localhost:${PORT}                    ║
║                                                              ║
║   Endpoints:                                                 ║
║   • POST /api/sessions         - Create analysis session     ║
║   • POST /api/documents        - Upload documents            ║
║   • POST /api/integrations/*   - Connect Stripe/Plaid        ║
║   • POST /api/analyze          - Run full analysis           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

export { app };
