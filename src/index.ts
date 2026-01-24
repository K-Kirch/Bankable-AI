/**
 * Bankable.ai Entry Point
 * 
 * Agentic Credit Intelligence Platform
 */

// Load environment variables FIRST (before other imports)
import 'dotenv/config';

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './api/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

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

// Fallback to index.html for SPA-like behavior
app.get('*', (req, res) => {
    // If it's an API route or file request, let it 404
    if (req.path.startsWith('/api') || req.path.includes('.')) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
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
║   Frontend:                                                  ║
║   • /                 - Landing page                         ║
║   • /upload.html      - Document upload                      ║
║   • /analyzing.html   - Analysis progress                    ║
║   • /dashboard.html   - Score dashboard                      ║
║                                                              ║
║   API Endpoints:                                             ║
║   • POST /api/sessions         - Create analysis session     ║
║   • POST /api/documents        - Upload documents            ║
║   • POST /api/analyze          - Run full analysis           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

export { app };
