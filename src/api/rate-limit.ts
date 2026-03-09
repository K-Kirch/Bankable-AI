/**
 * Rate Limiting Middleware
 * 
 * Simple in-memory sliding-window rate limiter.
 * Limits the number of requests per IP within a configurable time window.
 * 
 * Uses configuration from src/config/index.ts (API_CONFIG.rateLimit).
 */

import { Request, Response, NextFunction } from 'express';
import { API_CONFIG } from '../config/index.js';

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const requestCounts = new Map<string, RateLimitEntry>();

// Periodically clean up expired entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of requestCounts) {
        if (now >= entry.resetAt) {
            requestCounts.delete(key);
        }
    }
}, 5 * 60 * 1000).unref();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const { windowMs, maxRequests } = API_CONFIG.rateLimit;
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = requestCounts.get(key);

    // Reset window if expired
    if (!entry || now >= entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        requestCounts.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
        res.status(429).json({
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil((entry.resetAt - now) / 1000)} seconds.`,
        });
        return;
    }

    next();
}
