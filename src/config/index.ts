/**
 * Centralized Configuration
 * 
 * Single source of truth for model settings, feature flags,
 * and application configuration.
 */

// ============================================
// LLM MODEL CONFIGURATION
// ============================================

export interface ModelConfig {
    name: string;
    temperature: number;
    maxOutputTokens: number;
}

/**
 * The model configuration used across all LLM interactions.
 * Change this one value to update the model everywhere.
 */
export const MODEL_CONFIG: ModelConfig = {
    name: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    temperature: 0.3,
    maxOutputTokens: 8192,
};

/**
 * Vision model config (for PDF parsing)
 */
export const VISION_MODEL_CONFIG: ModelConfig = {
    name: process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash',
    temperature: 0.1,
    maxOutputTokens: 4096,
};

// ============================================
// FEATURE FLAGS
// ============================================

export const FEATURES = {
    /** Enable Redis for session storage (falls back to in-memory) */
    useRedis: !!process.env.REDIS_URL,

    /** Enable verbose audit logging to console */
    verboseAudit: process.env.NODE_ENV === 'development',

    /** Enable test endpoints */
    enableTestEndpoints: process.env.NODE_ENV !== 'production',
};

// ============================================
// SCORING CONFIGURATION
// ============================================

export const SCORING = {
    /** Risk factor weights (must sum to 1.0) */
    weights: {
        serviceability: 0.30,
        concentration: 0.25,
        retention: 0.25,
        compliance: 0.20,
    },

    /** Default scores when data is missing (conservative) */
    fallbackScores: {
        serviceability: 45,
        concentration: 45,
        retention: 50,
        compliance: 50,
    },

    /** Score thresholds for grade assignment */
    grades: {
        'A+': 95, 'A': 90, 'A-': 85,
        'B+': 80, 'B': 75, 'B-': 70,
        'C+': 65, 'C': 60, 'C-': 55,
        'D+': 50, 'D': 45, 'D-': 40,
        'F': 0,
    },
};

// ============================================
// API CONFIGURATION
// ============================================

export const API_CONFIG = {
    /** Port for the Express server */
    port: parseInt(process.env.PORT || '3000', 10),

    /** Rate limit: max requests per window */
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '50', 10),
    },
};

// ============================================
// VALIDATION
// ============================================

/**
 * Validate that required environment variables are set.
 * Call this at startup.
 */
export function validateEnvironment(): { valid: boolean; missing: string[] } {
    const required = ['GOOGLE_API_KEY'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return { valid: missing.length === 0, missing };
}
