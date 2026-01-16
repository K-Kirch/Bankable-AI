/**
 * Message Bus
 * 
 * Enables inter-agent communication during parallel execution.
 * Agents can share partial results and request data from each other.
 */

import { EventEmitter } from 'events';
import type { AgentId } from '../types/index.js';

// ============================================
// MESSAGE TYPES
// ============================================

export interface Message {
    id: string;
    from: AgentId;
    to: AgentId | 'broadcast';
    type: MessageType;
    payload: unknown;
    timestamp: Date;
    correlationId?: string; // For request/response pairing
}

export type MessageType =
    | 'insight_update'      // Agent sharing a finding
    | 'data_request'        // Agent requesting data from another
    | 'data_response'       // Response to a data request
    | 'contradiction_alert' // Alert about conflicting data
    | 'priority_signal';    // High-priority finding that may affect other agents

// ============================================
// MESSAGE BUS
// ============================================

export class MessageBus extends EventEmitter {
    private messageLog: Message[] = [];
    private pendingRequests: Map<string, {
        resolve: (response: Message) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();

    constructor() {
        super();
        this.setMaxListeners(20); // Support many agent subscriptions
    }

    /**
     * Send a message to a specific agent or broadcast to all
     */
    send(message: Omit<Message, 'id' | 'timestamp'>): void {
        const fullMessage: Message = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: new Date(),
        };

        this.messageLog.push(fullMessage);

        if (message.to === 'broadcast') {
            this.emit('message', fullMessage);
        } else {
            this.emit(`message:${message.to}`, fullMessage);
        }
    }

    /**
     * Send a request and wait for a response
     */
    async request(
        from: AgentId,
        to: AgentId,
        type: MessageType,
        payload: unknown,
        timeoutMs: number = 5000
    ): Promise<Message> {
        const correlationId = crypto.randomUUID();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new Error(`Request to ${to} timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pendingRequests.set(correlationId, { resolve, reject, timeout });

            this.send({
                from,
                to,
                type,
                payload,
                correlationId,
            });
        });
    }

    /**
     * Respond to a request
     */
    respond(originalMessage: Message, from: AgentId, payload: unknown): void {
        if (!originalMessage.correlationId) {
            throw new Error('Cannot respond to a message without correlationId');
        }

        const pending = this.pendingRequests.get(originalMessage.correlationId);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(originalMessage.correlationId);
        }

        this.send({
            from,
            to: originalMessage.from,
            type: 'data_response',
            payload,
            correlationId: originalMessage.correlationId,
        });

        if (pending) {
            pending.resolve({
                id: crypto.randomUUID(),
                from,
                to: originalMessage.from,
                type: 'data_response',
                payload,
                timestamp: new Date(),
                correlationId: originalMessage.correlationId,
            });
        }
    }

    /**
     * Subscribe to messages for a specific agent
     */
    subscribe(agentId: AgentId, handler: (message: Message) => void): () => void {
        const specificHandler = (msg: Message) => handler(msg);
        const broadcastHandler = (msg: Message) => {
            if (msg.from !== agentId) handler(msg); // Don't receive own broadcasts
        };

        this.on(`message:${agentId}`, specificHandler);
        this.on('message', broadcastHandler);

        return () => {
            this.off(`message:${agentId}`, specificHandler);
            this.off('message', broadcastHandler);
        };
    }

    /**
     * Broadcast a high-priority insight that other agents may want to react to
     */
    broadcastInsight(from: AgentId, insight: { category: string; impact: number; summary: string }): void {
        this.send({
            from,
            to: 'broadcast',
            type: 'insight_update',
            payload: insight,
        });
    }

    /**
     * Alert all agents about a data contradiction
     */
    alertContradiction(from: AgentId, contradiction: {
        field: string;
        sources: { source: string; value: unknown }[];
        severity: 'low' | 'medium' | 'high';
    }): void {
        this.send({
            from,
            to: 'broadcast',
            type: 'contradiction_alert',
            payload: contradiction,
        });
    }

    /**
     * Get message history for debugging/audit
     */
    getMessageLog(): Message[] {
        return [...this.messageLog];
    }

    /**
     * Get messages by type
     */
    getMessagesByType(type: MessageType): Message[] {
        return this.messageLog.filter(m => m.type === type);
    }

    /**
     * Clear message history (for testing)
     */
    clear(): void {
        this.messageLog = [];
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Message bus cleared'));
        }
        this.pendingRequests.clear();
    }
}
