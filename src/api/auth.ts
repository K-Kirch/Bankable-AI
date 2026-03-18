/**
 * API Key Authentication Middleware
 * 
 * Protects API routes by requiring a valid API key.
 * The key is checked against the BANKABLE_API_KEY environment variable.
 * 
 * Supports two header formats:
 *   - Authorization: Bearer <key>
 *   - x-api-key: <key>
 * 
 * If BANKABLE_API_KEY is not set, authentication is skipped (dev mode).
 */

import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const expectedKey = process.env.BANKABLE_API_KEY;

    // If no key is configured, skip auth (development mode)
    if (!expectedKey) {
        next();
        return;
    }

    // Extract key from Authorization header or x-api-key header
    const authHeader = req.headers.authorization;
    const xApiKey = req.headers['x-api-key'] as string | undefined;

    let providedKey: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
        providedKey = authHeader.slice(7);
    } else if (xApiKey) {
        providedKey = xApiKey;
    }

    if (!providedKey) {
        res.status(401).json({
            error: 'Authentication required',
            message: 'Provide API key via Authorization: Bearer <key> or x-api-key header',
        });
        return;
    }

    // Constant-time comparison to prevent timing attacks
    const a = Buffer.from(providedKey);
    const b = Buffer.from(expectedKey);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        res.status(403).json({
            error: 'Invalid API key',
        });
        return;
    }

    next();
}

