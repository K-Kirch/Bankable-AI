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
    if (providedKey.length !== expectedKey.length || !timingSafeEqual(providedKey, expectedKey)) {
        res.status(403).json({
            error: 'Invalid API key',
        });
        return;
    }

    next();
}

/** Simple constant-time string comparison */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}
