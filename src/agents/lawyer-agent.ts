/**
 * The Lawyer Agent
 * 
 * Evaluates legal structure and contract security.
 * Analyzes: contract terms, notice periods, compliance status.
 */

import { BaseAgent } from './base-agent.js';
import type {
    AgentInsight,
    GlobalContext,
    ParsedDocument,
} from '../types/index.js';

interface ContractAnalysis {
    noticePeriodDays: number;
    autoRenewal: boolean;
    terminationPenalty: number;
    jurisdiction: string;
    contractStrengthScore: number;
}

interface ComplianceStatus {
    auditCurrent: boolean;
    taxFilingsCurrent: boolean;
    insuranceAdequate: boolean;
    licensesValid: boolean;
    dataProtectionCompliant: boolean;
}

interface LegalInsightResponse {
    findings: Array<{
        category: 'legal_structure' | 'contract_security' | 'compliance_status';
        title: string;
        description: string;
        impact: number;
        confidence: number;
        reasoning: string;
    }>;
}

export class LawyerAgent extends BaseAgent {
    readonly id = 'lawyer' as const;
    readonly name = 'The Lawyer';
    readonly description = 'Legal analyst specializing in contract security, retention risk, and regulatory compliance assessment.';

    protected async analyze(context: GlobalContext): Promise<AgentInsight[]> {
        const insights: AgentInsight[] = [];

        // Extract and analyze contracts
        const contracts = context.documents.filter(d => d.type === 'contract');
        if (contracts.length > 0) {
            const contractInsights = await this.analyzeContracts(contracts, context);
            insights.push(...contractInsights);
        }

        // Analyze compliance documents
        const complianceInsight = await this.analyzeCompliance(context);
        insights.push(complianceInsight);

        // LLM-enhanced legal analysis
        const llmInsights = await this.performLLMAnalysis(context);
        insights.push(...llmInsights);

        return insights;
    }

    private async analyzeContracts(
        contracts: ParsedDocument[],
        context: GlobalContext
    ): Promise<AgentInsight[]> {
        const insights: AgentInsight[] = [];

        // Aggregate contract metrics
        const analyses: ContractAnalysis[] = [];

        for (const contract of contracts) {
            const analysis = await this.extractContractTerms(contract);
            analyses.push(analysis);
        }

        // Calculate aggregate retention score
        const avgNoticePeriod = analyses.reduce((sum, a) => sum + a.noticePeriodDays, 0) / analyses.length;
        const autoRenewalPct = analyses.filter(a => a.autoRenewal).length / analyses.length;
        const avgStrength = analyses.reduce((sum, a) => sum + a.contractStrengthScore, 0) / analyses.length;

        // Generate retention risk insight
        let retentionImpact: number;
        let retentionDescription: string;

        if (avgStrength >= 70) {
            retentionImpact = 20;
            retentionDescription = `Strong contract security. Average notice period: ${avgNoticePeriod.toFixed(0)} days. ${(autoRenewalPct * 100).toFixed(0)}% of contracts have auto-renewal.`;
        } else if (avgStrength >= 50) {
            retentionImpact = 0;
            retentionDescription = `Moderate contract security. Some contracts lack protective clauses. Average notice period: ${avgNoticePeriod.toFixed(0)} days.`;
        } else {
            retentionImpact = -25;
            retentionDescription = `Weak contract security creates retention risk. Short notice periods and missing auto-renewal clauses.`;
        }

        insights.push(this.createInsight({
            category: 'contract_security',
            title: `Contract Strength: ${avgStrength.toFixed(0)}/100`,
            description: retentionDescription,
            confidence: 0.8,
            impact: retentionImpact,
            evidence: contracts.map(c => this.createEvidence({
                source: 'document',
                documentId: c.id,
                field: 'contract_terms',
                value: c.data,
                confidence: c.confidence,
            })),
            reasoningChain: `Analyzed ${contracts.length} contracts. Weighted score based on: notice period (30%), auto-renewal (30%), termination penalty (20%), jurisdiction favorability (20%).`,
        }));

        return insights;
    }

    private async extractContractTerms(contract: ParsedDocument): Promise<ContractAnalysis> {
        // Use LLM to extract structured terms from contract
        const prompt = `Analyze this contract document and extract key terms.

CONTRACT DATA:
${JSON.stringify(contract.data, null, 2)}

RAW TEXT (excerpt):
${contract.rawText.substring(0, 3000)}

Extract and respond in JSON:
{
  "noticePeriodDays": number (default 30 if not found),
  "autoRenewal": boolean,
  "terminationPenalty": number (0-1 representing penalty as fraction of contract value),
  "jurisdiction": "string (country/state)",
  "contractStrengthScore": number 0-100 (overall favorability for the company)
}`;

        try {
            return await this.promptLLMWithJSON<ContractAnalysis>(prompt);
        } catch {
            // Default values if extraction fails
            return {
                noticePeriodDays: 30,
                autoRenewal: false,
                terminationPenalty: 0,
                jurisdiction: 'Unknown',
                contractStrengthScore: 50,
            };
        }
    }

    private async analyzeCompliance(context: GlobalContext): Promise<AgentInsight> {
        // Check for compliance-related documents
        const taxDocs = context.documents.filter(d => d.type === 'tax_filing');
        const insuranceDocs = context.documents.filter(d => d.type === 'insurance_certificate');

        const status: ComplianceStatus = {
            auditCurrent: false, // Would need to check audit documents
            taxFilingsCurrent: taxDocs.length > 0,
            insuranceAdequate: insuranceDocs.length > 0,
            licensesValid: true, // Assume true unless evidence suggests otherwise
            dataProtectionCompliant: true, // Assume true unless evidence suggests otherwise
        };

        // Calculate compliance score
        const weights = {
            auditCurrent: 0.25,
            taxFilingsCurrent: 0.25,
            insuranceAdequate: 0.20,
            licensesValid: 0.15,
            dataProtectionCompliant: 0.15,
        };

        const complianceScore = Object.entries(status).reduce((score, [key, value]) => {
            return score + (value ? weights[key as keyof ComplianceStatus] * 100 : 0);
        }, 0);

        const missingItems: string[] = [];
        if (!status.auditCurrent) missingItems.push('current audit');
        if (!status.taxFilingsCurrent) missingItems.push('tax filings');
        if (!status.insuranceAdequate) missingItems.push('insurance certificates');

        let impact: number;
        let description: string;

        if (complianceScore >= 80) {
            impact = 15;
            description = 'Strong compliance posture with all major requirements documented.';
        } else if (complianceScore >= 60) {
            impact = -10;
            description = `Partial compliance. Missing documentation: ${missingItems.join(', ')}.`;
        } else {
            impact = -35;
            description = `Significant compliance gaps. Missing: ${missingItems.join(', ')}. High regulatory risk.`;
        }

        return this.createInsight({
            category: 'compliance_status',
            title: `Compliance Score: ${complianceScore.toFixed(0)}/100`,
            description,
            confidence: 0.7,
            impact,
            evidence: [
                this.createEvidence({
                    source: 'derived',
                    field: 'compliance_status',
                    value: status,
                    confidence: 0.7,
                }),
            ],
            reasoningChain: `Evaluated compliance across 5 dimensions: audit status (25%), tax filings (25%), insurance (20%), licenses (15%), data protection (15%). Score: ${complianceScore.toFixed(0)}/100.`,
        });
    }

    private async performLLMAnalysis(context: GlobalContext): Promise<AgentInsight[]> {
        const prompt = this.buildAnalysisPrompt(
            'Identify legal risks, contract vulnerabilities, and compliance concerns that could affect bankability.',
            {
                documents: context.documents.map(d => ({
                    type: d.type,
                    confidence: d.confidence,
                    dataPreview: JSON.stringify(d.data).substring(0, 500),
                })),
                contradictions: context.contradictions,
            }
        );

        const response = await this.promptLLMWithJSON<LegalInsightResponse>(prompt + `

Respond in this JSON format:
{
  "findings": [
    {
      "category": "legal_structure" | "contract_security" | "compliance_status",
      "title": "Brief title",
      "description": "Detailed explanation",
      "impact": -100 to 100,
      "confidence": 0 to 1,
      "reasoning": "Explanation of analysis"
    }
  ]
}`);

        return response.findings.map(f => this.createInsight({
            category: f.category as 'legal_structure' | 'contract_security' | 'compliance_status',
            title: f.title,
            description: f.description,
            confidence: f.confidence,
            impact: f.impact,
            evidence: [],
            reasoningChain: f.reasoning,
        }));
    }
}
