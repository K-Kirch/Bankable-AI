/**
 * Global Context Service
 * 
 * Manages shared state between all agents during analysis.
 * Uses Redis for real-time updates and PostgreSQL for persistence.
 */

import { Redis } from 'ioredis';
import { v4 as uuid } from 'uuid';
import type {
    GlobalContext,
    AgentId,
    AgentInsight,
    ParsedDocument,
    StripeSnapshot,
    PlaidSnapshot,
    RiskFactorMap,
    Contradiction,
} from '../types/index.js';

export class GlobalContextService {
    private redis: Redis;
    private context: GlobalContext | null = null;
    private subscribers: Map<string, (ctx: GlobalContext) => void> = new Map();

    constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
        this.redis = new Redis(redisUrl);
    }

    /**
     * Initialize a new analysis session
     */
    async createSession(companyId: string): Promise<GlobalContext> {
        const sessionId = uuid();

        this.context = {
            sessionId,
            companyId,
            startedAt: new Date(),
            documents: [],
            apiSnapshots: {},
            agentInsights: new Map(),
            riskFactors: this.createEmptyRiskFactors(),
            contradictions: [],
        };

        await this.persist();
        return this.context;
    }

    /**
     * Load an existing session
     */
    async loadSession(sessionId: string): Promise<GlobalContext | null> {
        const data = await this.redis.get(`session:${sessionId}`);
        if (!data) return null;

        const parsed = JSON.parse(data);
        // Restore Map from serialized format
        parsed.agentInsights = new Map(Object.entries(parsed.agentInsights || {}));
        parsed.startedAt = new Date(parsed.startedAt);

        this.context = parsed as GlobalContext;
        return this.context;
    }

    /**
     * Get current context (throws if no session active)
     */
    getContext(): GlobalContext {
        if (!this.context) {
            throw new Error('No active session. Call createSession() first.');
        }
        return this.context;
    }

    /**
     * Add a parsed document to the context
     */
    async addDocument(doc: ParsedDocument): Promise<void> {
        this.ensureSession();
        this.context!.documents.push(doc);
        await this.persist();
        this.notifySubscribers();
    }

    /**
     * Update API snapshots
     */
    async setStripeSnapshot(snapshot: StripeSnapshot): Promise<void> {
        this.ensureSession();
        this.context!.apiSnapshots.stripe = snapshot;
        await this.persist();
        this.notifySubscribers();
    }

    async setPlaidSnapshot(snapshot: PlaidSnapshot): Promise<void> {
        this.ensureSession();
        this.context!.apiSnapshots.plaid = snapshot;
        await this.persist();
        this.notifySubscribers();
    }

    /**
     * Add an insight from an agent (append-only)
     */
    async addAgentInsight(agentId: AgentId, insight: AgentInsight): Promise<void> {
        this.ensureSession();

        const insights = this.context!.agentInsights.get(agentId) || [];
        insights.push(insight);
        this.context!.agentInsights.set(agentId, insights);

        await this.persist();
        await this.publishInsight(agentId, insight);
        this.notifySubscribers();
    }

    /**
     * Get all insights from a specific agent
     */
    getAgentInsights(agentId: AgentId): AgentInsight[] {
        this.ensureSession();
        return this.context!.agentInsights.get(agentId) || [];
    }

    /**
     * Get all insights from all agents
     */
    getAllInsights(): AgentInsight[] {
        this.ensureSession();
        const all: AgentInsight[] = [];
        for (const insights of this.context!.agentInsights.values()) {
            all.push(...insights);
        }
        return all.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    /**
     * Record a contradiction between data sources
     */
    async addContradiction(contradiction: Contradiction): Promise<void> {
        this.ensureSession();
        this.context!.contradictions.push(contradiction);
        await this.persist();
        this.notifySubscribers();
    }

    /**
     * Update computed risk factors
     */
    async setRiskFactors(factors: RiskFactorMap): Promise<void> {
        this.ensureSession();
        this.context!.riskFactors = factors;
        await this.persist();
        this.notifySubscribers();
    }

    /**
     * Subscribe to context updates
     */
    subscribe(id: string, callback: (ctx: GlobalContext) => void): () => void {
        this.subscribers.set(id, callback);
        return () => this.subscribers.delete(id);
    }

    /**
     * Subscribe to real-time insight stream from other agents
     */
    async subscribeToInsights(callback: (agentId: AgentId, insight: AgentInsight) => void): Promise<void> {
        const subscriber = this.redis.duplicate();
        await subscriber.subscribe('insights');

        subscriber.on('message', (_channel, message) => {
            const { agentId, insight } = JSON.parse(message);
            insight.timestamp = new Date(insight.timestamp);
            callback(agentId, insight);
        });
    }

    /**
     * Clean up resources
     */
    async disconnect(): Promise<void> {
        await this.redis.quit();
    }

    // ============================================
    // PRIVATE METHODS
    // ============================================

    private ensureSession(): void {
        if (!this.context) {
            throw new Error('No active session. Call createSession() or loadSession() first.');
        }
    }

    private async persist(): Promise<void> {
        if (!this.context) return;

        // Convert Map to object for JSON serialization
        const serializable = {
            ...this.context,
            agentInsights: Object.fromEntries(this.context.agentInsights),
        };

        await this.redis.set(
            `session:${this.context.sessionId}`,
            JSON.stringify(serializable),
            'EX',
            86400 // 24 hour TTL
        );
    }

    private async publishInsight(agentId: AgentId, insight: AgentInsight): Promise<void> {
        await this.redis.publish('insights', JSON.stringify({ agentId, insight }));
    }

    private notifySubscribers(): void {
        if (!this.context) return;
        for (const callback of this.subscribers.values()) {
            callback(this.context);
        }
    }

    private createEmptyRiskFactors(): RiskFactorMap {
        return {
            serviceability: { name: 'Serviceability', score: 0, weight: 0.30, components: [], explanation: '' },
            concentration: { name: 'Concentration', score: 0, weight: 0.25, components: [], explanation: '' },
            retention: { name: 'Retention', score: 0, weight: 0.25, components: [], explanation: '' },
            compliance: { name: 'Compliance', score: 0, weight: 0.20, components: [], explanation: '' },
        };
    }
}

// Singleton instance
let instance: GlobalContextService | null = null;

export function getGlobalContext(): GlobalContextService {
    if (!instance) {
        instance = new GlobalContextService();
    }
    return instance;
}
