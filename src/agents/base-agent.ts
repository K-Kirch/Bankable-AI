/**
 * Base Agent
 * 
 * Abstract base class for all specialized agents.
 * Provides common utilities for LLM interaction, insight generation,
 * and message bus communication.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuid } from 'uuid';
import type {
    AgentId,
    AgentInsight,
    GlobalContext,
    InsightCategory,
    Evidence,
} from '../types/index.js';
import type { MessageBus, Message } from '../core/message-bus.js';

// ============================================
// BASE AGENT CLASS
// ============================================

export abstract class BaseAgent {
    abstract readonly id: AgentId;
    abstract readonly name: string;
    abstract readonly description: string;

    protected genAI: GoogleGenerativeAI;
    protected model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
    protected messageBus: MessageBus | null = null;
    protected context: GlobalContext | null = null;
    private unsubscribe: (() => void) | null = null;

    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY environment variable is required');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp',
            generationConfig: {
                temperature: 0.3, // Lower temperature for more consistent analysis
                topP: 0.95,
                maxOutputTokens: 8192,
            },
        });
    }

    /**
     * Execute the agent's analysis
     */
    async execute(context: GlobalContext, bus: MessageBus): Promise<AgentInsight[]> {
        this.context = context;
        this.messageBus = bus;

        // Subscribe to messages
        this.unsubscribe = bus.subscribe(this.id, this.handleMessage.bind(this));

        try {
            // Run agent-specific analysis
            const insights = await this.analyze(context);

            // Broadcast significant findings
            for (const insight of insights) {
                if (Math.abs(insight.impact) > 20) {
                    bus.broadcastInsight(this.id, {
                        category: insight.category,
                        impact: insight.impact,
                        summary: insight.title,
                    });
                }
            }

            return insights;
        } finally {
            this.unsubscribe?.();
            this.unsubscribe = null;
        }
    }

    /**
     * Agent-specific analysis implementation
     */
    protected abstract analyze(context: GlobalContext): Promise<AgentInsight[]>;

    /**
     * Handle incoming messages from other agents
     */
    protected handleMessage(message: Message): void {
        // Override in subclasses to react to other agents' findings
        console.log(`[${this.id}] Received message from ${message.from}: ${message.type}`);
    }

    // ============================================
    // INSIGHT CREATION HELPERS
    // ============================================

    protected createInsight(params: {
        category: InsightCategory;
        title: string;
        description: string;
        confidence: number;
        impact: number;
        evidence: Evidence[];
        reasoningChain: string;
    }): AgentInsight {
        return {
            id: uuid(),
            agentId: this.id,
            timestamp: new Date(),
            ...params,
        };
    }

    protected createEvidence(params: {
        source: 'document' | 'api' | 'derived';
        documentId?: string;
        field?: string;
        value: unknown;
        confidence: number;
    }): Evidence {
        return params;
    }

    // ============================================
    // LLM INTERACTION HELPERS
    // ============================================

    protected async promptLLM(prompt: string): Promise<string> {
        const result = await this.model.generateContent(prompt);
        return result.response.text();
    }

    protected async promptLLMWithJSON<T>(prompt: string): Promise<T> {
        const jsonPrompt = `${prompt}

IMPORTANT: Respond with valid JSON only, no markdown code blocks or other formatting.`;

        const result = await this.model.generateContent(jsonPrompt);
        const text = result.response.text().trim();

        // Clean up any accidental markdown
        const cleaned = text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '');

        return JSON.parse(cleaned) as T;
    }

    protected buildAnalysisPrompt(
        taskDescription: string,
        dataContext: Record<string, unknown>
    ): string {
        return `You are "${this.name}", a specialized AI agent for the Bankable.ai platform.

YOUR ROLE: ${this.description}

TASK: ${taskDescription}

AVAILABLE DATA:
${JSON.stringify(dataContext, null, 2)}

Analyze the data and provide insights. For each finding:
1. Assess its impact on bankability (-100 to +100 scale)
2. State your confidence level (0-1)
3. Provide clear reasoning

Focus on actionable insights that affect credit risk assessment.`;
    }
}
