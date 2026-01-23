/**
 * Base Agent (LLM-Only Architecture)
 * 
 * Abstract base class for all specialized agents.
 * All analysis is performed by the LLM with comprehensive audit logging.
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
import { AuditTrail, getAuditTrail, hasAuditTrail, createAuditTrail } from '../core/audit-trail.js';

// ============================================
// LLM RESPONSE TYPES
// ============================================

export interface LLMInsightResponse {
    insights: Array<{
        category: InsightCategory;
        title: string;
        description: string;
        impact: number;
        confidence: number;
        reasoning: string;
        evidence?: Array<{
            source: 'document' | 'api' | 'derived';
            field?: string;
            description: string;
        }>;
    }>;
}

// ============================================
// BASE AGENT CLASS
// ============================================

export abstract class BaseAgent {
    abstract readonly id: AgentId;
    abstract readonly name: string;
    abstract readonly description: string;

    /** Categories this agent can produce insights for */
    abstract readonly categories: InsightCategory[];

    /** Specific analysis instructions for this agent */
    abstract readonly analysisPrompt: string;

    protected genAI: GoogleGenerativeAI;
    protected model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
    protected messageBus: MessageBus | null = null;
    protected context: GlobalContext | null = null;
    protected auditTrail: AuditTrail | null = null;
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
                temperature: 0.3,
                topP: 0.95,
                maxOutputTokens: 8192,
            },
        });
    }

    /**
     * Execute the agent's analysis (pure LLM approach)
     */
    async execute(context: GlobalContext, bus: MessageBus): Promise<AgentInsight[]> {
        this.context = context;
        this.messageBus = bus;

        // Get or create audit trail
        this.auditTrail = hasAuditTrail()
            ? getAuditTrail()
            : createAuditTrail(context.sessionId);

        // Subscribe to messages
        this.unsubscribe = bus.subscribe(this.id, this.handleMessage.bind(this));

        try {
            // Prepare context data for LLM
            const analysisData = this.prepareAnalysisData(context);

            // Build the comprehensive prompt
            const prompt = this.buildLLMPrompt(analysisData);

            // Call LLM with audit logging
            const response = await this.callLLMWithAudit<LLMInsightResponse>(
                prompt,
                analysisData,
                'full_analysis'
            );

            // Convert LLM response to AgentInsights with audit references
            const insights = this.processLLMResponse(response);

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
     * Prepare analysis data for the LLM - can be overridden by subclasses
     */
    protected prepareAnalysisData(context: GlobalContext): Record<string, unknown> {
        return {
            company: context.companyId,
            documents: context.documents.map(d => ({
                type: d.type,
                filename: d.filename,
                confidence: d.confidence,
                data: d.data,
                rawTextPreview: d.rawText.substring(0, 2000),
            })),
            apiData: {
                stripe: context.apiSnapshots.stripe,
                plaid: context.apiSnapshots.plaid,
            },
            existingContradictions: context.contradictions,
        };
    }

    /**
     * Build the full LLM prompt
     */
    protected buildLLMPrompt(analysisData: Record<string, unknown>): string {
        return `You are "${this.name}", a specialized AI agent for the Bankable.ai credit analysis platform.

YOUR ROLE: ${this.description}

IMPORTANT INSTRUCTIONS:
1. You are the SOLE analyst - perform comprehensive analysis based on all available data
2. Do NOT defer to other systems or suggest "further analysis needed"
3. Make concrete assessments with specific impact scores
4. Explain your reasoning clearly for auditability

CATEGORIES YOU ANALYZE: ${this.categories.join(', ')}

SPECIFIC ANALYSIS FOCUS:
${this.analysisPrompt}

AVAILABLE DATA:
${JSON.stringify(analysisData, null, 2)}

RESPONSE FORMAT - Respond with valid JSON only:
{
  "insights": [
    {
      "category": "${this.categories[0]}", 
      "title": "Brief descriptive title",
      "description": "Detailed explanation of the finding",
      "impact": <number from -100 to +100>,
      "confidence": <number from 0 to 1>,
      "reasoning": "Step-by-step explanation of how you reached this conclusion",
      "evidence": [
        {
          "source": "document" | "api" | "derived",
          "field": "specific field name if applicable",
          "description": "What this evidence shows"
        }
      ]
    }
  ]
}

Analyze the data thoroughly and provide 2-5 key insights. Each insight should be actionable and specific.
For impact scoring:
- Positive impacts (+1 to +100): Factors that IMPROVE bankability
- Negative impacts (-1 to -100): Factors that REDUCE bankability
- Zero impact: Neutral observations (avoid these - be decisive)`;
    }

    /**
     * Call LLM with comprehensive audit logging
     */
    protected async callLLMWithAudit<T>(
        prompt: string,
        inputData: Record<string, unknown>,
        analysisType: string
    ): Promise<T> {
        const startTime = Date.now();
        const parseErrors: string[] = [];
        let wasRetried = false;
        let retryCount = 0;
        let rawText = '';
        let parsed: T | null = null;

        // Attempt with retry
        while (retryCount < 3) {
            try {
                const result = await this.model.generateContent(prompt);
                rawText = result.response.text().trim();

                // Clean up markdown if present
                const cleaned = rawText
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/i, '')
                    .replace(/\s*```$/i, '');

                parsed = JSON.parse(cleaned) as T;
                break;
            } catch (error) {
                retryCount++;
                wasRetried = true;
                parseErrors.push(`Attempt ${retryCount}: ${error instanceof Error ? error.message : String(error)}`);

                if (retryCount >= 3) {
                    throw new Error(`Failed to get valid JSON response after 3 attempts: ${parseErrors.join('; ')}`);
                }
            }
        }

        // This should never happen due to the throw above, but TypeScript needs assurance
        if (parsed === null) {
            throw new Error('Unexpected: parsed is null after retry loop');
        }

        const latencyMs = Date.now() - startTime;

        // Log to audit trail
        const auditEntry = this.auditTrail?.log({
            agentId: this.id,
            prompt,
            inputData,
            rawResponse: rawText,
            parsedResponse: parsed,
            modelUsed: 'gemini-2.0-flash-exp',
            tokenCount: {
                prompt: Math.ceil(prompt.length / 4), // Rough estimate
                completion: Math.ceil(rawText.length / 4),
                total: Math.ceil((prompt.length + rawText.length) / 4),
            },
            latencyMs,
            confidence: 1.0, // Will be updated per-insight
            wasRetried,
            retryCount: wasRetried ? retryCount : undefined,
            parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
            analysisType,
        });

        // Store the audit ID for linking
        (parsed as Record<string, unknown>).__auditEntryId = auditEntry?.id;

        return parsed;
    }

    /**
     * Process LLM response into AgentInsights
     */
    protected processLLMResponse(response: LLMInsightResponse): AgentInsight[] {
        const auditEntryId = (response as any).__auditEntryId;

        return response.insights.map(insight => ({
            id: uuid(),
            agentId: this.id,
            timestamp: new Date(),
            category: insight.category,
            title: insight.title,
            description: insight.description,
            confidence: insight.confidence,
            impact: insight.impact,
            evidence: (insight.evidence ?? []).map(e => ({
                source: e.source,
                field: e.field,
                value: e.description,
                confidence: insight.confidence,
            })),
            reasoningChain: insight.reasoning,
            auditEntryId,
        }));
    }

    /**
     * Handle incoming messages from other agents
     */
    protected handleMessage(message: Message): void {
        console.log(`[${this.id}] Received message from ${message.from}: ${message.type}`);
    }

    // ============================================
    // LEGACY METHODS (kept for backward compatibility)
    // ============================================

    protected createInsight(params: {
        category: InsightCategory;
        title: string;
        description: string;
        confidence: number;
        impact: number;
        evidence: Evidence[];
        reasoningChain: string;
        auditEntryId?: string;
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
}
