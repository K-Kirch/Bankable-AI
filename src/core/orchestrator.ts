/**
 * Agent Orchestrator
 * 
 * Coordinates parallel execution of specialized agents and
 * synthesizes their outputs into a unified analysis.
 */

import type {
    AgentId,
    GlobalContext,
    AgentInsight,
    RiskFactorMap,
    BankabilityScore,
    RemediationRoadmap,
} from '../types/index.js';
import { GlobalContextService, getGlobalContext } from './global-context.js';
import { MessageBus } from './message-bus.js';

// ============================================
// AGENT INTERFACE
// ============================================

export interface Agent {
    id: AgentId;
    name: string;
    description: string;

    /**
     * Execute the agent's analysis
     * @param context - Shared global context
     * @param bus - Message bus for inter-agent communication
     */
    execute(context: GlobalContext, bus: MessageBus): Promise<AgentInsight[]>;
}

// ============================================
// ORCHESTRATION STATE
// ============================================

interface OrchestratorState {
    sessionId: string;
    status: 'initializing' | 'ingesting' | 'analyzing' | 'synthesizing' | 'complete' | 'error';
    agentStatuses: Map<AgentId, 'pending' | 'running' | 'complete' | 'error'>;
    errors: Error[];
    startTime: Date;
    endTime?: Date;
}

// ============================================
// ORCHESTRATOR
// ============================================

export class AgentOrchestrator {
    private contextService: GlobalContextService;
    private messageBus: MessageBus;
    private agents: Map<AgentId, Agent> = new Map();
    private state: OrchestratorState | null = null;

    constructor() {
        this.contextService = getGlobalContext();
        this.messageBus = new MessageBus();
    }

    /**
     * Register an agent with the orchestrator
     */
    registerAgent(agent: Agent): void {
        this.agents.set(agent.id, agent);
    }

    /**
     * Execute the full analysis pipeline
     */
    async analyze(companyId: string): Promise<{
        score: BankabilityScore;
        roadmap: RemediationRoadmap;
    }> {
        // Check if we already have a context with documents (from fixture injection)
        let context: GlobalContext;
        try {
            const existingContext = this.contextService.getContext();
            // Reuse existing context if it has documents loaded
            if (existingContext.documents.length > 0) {
                context = existingContext;
                console.log(`[Orchestrator] Reusing existing context with ${context.documents.length} documents`);
            } else {
                context = await this.contextService.createSession(companyId);
            }
        } catch {
            // No existing context, create new one
            context = await this.contextService.createSession(companyId);
        }

        this.state = {
            sessionId: context.sessionId,
            status: 'initializing',
            agentStatuses: new Map(),
            errors: [],
            startTime: new Date(),
        };

        try {
            // Run the workflow
            const result = await this.executeWorkflow(context);

            this.state.status = 'complete';
            this.state.endTime = new Date();

            return result;
        } catch (error) {
            this.state.status = 'error';
            this.state.errors.push(error as Error);
            throw error;
        }
    }

    /**
     * Get current orchestration status
     */
    getStatus(): OrchestratorState | null {
        return this.state;
    }

    // ============================================
    // PRIVATE: WORKFLOW EXECUTION
    // ============================================

    private async executeWorkflow(context: GlobalContext): Promise<{
        score: BankabilityScore;
        roadmap: RemediationRoadmap;
    }> {
        // Step 1: Run all agents in parallel
        this.state!.status = 'analyzing';
        const insights = await this.runAgentsParallel(context);

        // Step 2: Synthesize risk factors
        this.state!.status = 'synthesizing';
        const { synthesizeRiskFactors } = await import('../synthesis/risk-synthesizer.js');
        const riskFactors = await synthesizeRiskFactors(insights, context);
        await this.contextService.setRiskFactors(riskFactors);

        // Step 3: Calculate score
        const { calculateBankabilityScore } = await import('../synthesis/score-calculator.js');
        const score = calculateBankabilityScore(riskFactors, context);

        // Step 4: Generate roadmap
        const { generateRemediationRoadmap } = await import('../synthesis/remediation.js');
        const roadmap = await generateRemediationRoadmap(score, riskFactors, context);

        return { score, roadmap };
    }

    private async runAgentsParallel(context: GlobalContext): Promise<AgentInsight[]> {
        const agentPromises = Array.from(this.agents.values()).map(async (agent) => {
            this.state!.agentStatuses.set(agent.id, 'running');

            try {
                const insights = await agent.execute(context, this.messageBus);

                // Persist insights to global context
                for (const insight of insights) {
                    await this.contextService.addAgentInsight(agent.id, insight);
                }

                this.state!.agentStatuses.set(agent.id, 'complete');
                return insights;
            } catch (error) {
                this.state!.agentStatuses.set(agent.id, 'error');
                this.state!.errors.push(error as Error);
                return [];
            }
        });

        const allInsights = await Promise.all(agentPromises);
        return allInsights.flat();
    }
}

// Singleton instance
let orchestratorInstance: AgentOrchestrator | null = null;

export function getOrchestrator(): AgentOrchestrator {
    if (!orchestratorInstance) {
        orchestratorInstance = new AgentOrchestrator();
    }
    return orchestratorInstance;
}
