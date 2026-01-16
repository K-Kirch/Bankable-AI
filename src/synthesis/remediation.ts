/**
 * Remediation Engine
 * 
 * Identifies Score Drags and generates prioritized remediation tasks.
 */

import { v4 as uuid } from 'uuid';
import type {
    GlobalContext,
    RiskFactorMap,
    BankabilityScore,
    ScoreDrag,
    RemediationTask,
    RemediationRoadmap,
} from '../types/index.js';

/**
 * Generate a remediation roadmap based on score analysis
 */
export async function generateRemediationRoadmap(
    score: BankabilityScore,
    riskFactors: RiskFactorMap,
    context: GlobalContext
): Promise<RemediationRoadmap> {
    // Identify score drags
    const scoreDrags = identifyScoreDrags(riskFactors);

    // Generate tasks for each drag
    const tasks = await generateTasks(scoreDrags, riskFactors, context);

    // Sort by priority
    tasks.sort((a, b) => b.priority - a.priority);

    // Calculate projected score
    const projectedScore = Math.min(100, score.score +
        tasks.reduce((sum, t) => sum + t.expectedScoreGain, 0)
    );

    // Calculate timeline summary
    const timeline = calculateTimeline(tasks);

    return {
        sessionId: context.sessionId,
        companyId: context.companyId,
        generatedAt: new Date(),
        currentScore: score.score,
        projectedScore,
        scoreDrags,
        tasks,
        timeline,
    };
}

function identifyScoreDrags(riskFactors: RiskFactorMap): ScoreDrag[] {
    const drags: ScoreDrag[] = [];
    const targetScore = 75; // Target for "good" bankability

    for (const [key, factor] of Object.entries(riskFactors) as [keyof RiskFactorMap, typeof riskFactors.serviceability][]) {
        if (factor.score < targetScore) {
            const gap = targetScore - factor.score;
            const potentialGain = gap * factor.weight;

            drags.push({
                factor: key,
                currentScore: factor.score,
                potentialScore: targetScore,
                impactPoints: Math.round(potentialGain),
                difficulty: estimateDifficulty(key, gap),
                estimatedDays: estimateDays(key, gap),
            });
        }
    }

    // Sort by impact/effort ratio (higher is better)
    drags.sort((a, b) => {
        const aRatio = a.impactPoints / (a.estimatedDays * getDifficultyWeight(a.difficulty));
        const bRatio = b.impactPoints / (b.estimatedDays * getDifficultyWeight(b.difficulty));
        return bRatio - aRatio;
    });

    return drags;
}

function estimateDifficulty(factor: keyof RiskFactorMap, gap: number): 'low' | 'medium' | 'high' {
    const baseDifficulty: Record<keyof RiskFactorMap, number> = {
        serviceability: 3, // Hardest to change quickly
        concentration: 3,  // Takes time to diversify
        retention: 2,      // Contract renegotiation possible
        compliance: 1,     // Often quick document uploads
    };

    const adjustedDifficulty = baseDifficulty[factor] + (gap > 30 ? 1 : 0);

    if (adjustedDifficulty <= 1) return 'low';
    if (adjustedDifficulty <= 2) return 'medium';
    return 'high';
}

function estimateDays(factor: keyof RiskFactorMap, gap: number): number {
    const baseDays: Record<keyof RiskFactorMap, number> = {
        serviceability: 90,
        concentration: 180,
        retention: 60,
        compliance: 14,
    };

    return Math.round(baseDays[factor] * (gap / 50));
}

function getDifficultyWeight(difficulty: 'low' | 'medium' | 'high'): number {
    return { low: 1, medium: 2, high: 3 }[difficulty];
}

async function generateTasks(
    scoreDrags: ScoreDrag[],
    riskFactors: RiskFactorMap,
    context: GlobalContext
): Promise<RemediationTask[]> {
    const tasks: RemediationTask[] = [];

    for (const drag of scoreDrags) {
        const factorData = {
            serviceability: { score: drag.currentScore },
            concentration: { score: drag.currentScore },
            retention: { score: drag.currentScore },
            compliance: { score: drag.currentScore },
        }[drag.factor];
        const dragTasks = generateTasksForDrag(drag, factorData, context);
        tasks.push(...dragTasks);
    }

    // Calculate priority for each task
    for (const task of tasks) {
        task.priority = calculatePriority(task);
    }

    return tasks;
}

function generateTasksForDrag(
    drag: ScoreDrag,
    factor: { score: number },
    context: GlobalContext
): RemediationTask[] {
    const tasks: RemediationTask[] = [];

    // Task templates per factor type
    const taskTemplates: Record<keyof RiskFactorMap, Array<Partial<RemediationTask>>> = {
        serviceability: [
            {
                title: 'Reduce operating expenses',
                description: 'Identify and cut non-essential expenses to improve cash flow coverage.',
                category: 'structural',
                difficulty: 'medium',
                estimatedDays: 30,
                actionItems: [
                    'Audit all recurring expenses',
                    'Negotiate vendor contracts',
                    'Consolidate software subscriptions',
                    'Review staffing efficiency',
                ],
            },
            {
                title: 'Accelerate accounts receivable',
                description: 'Reduce days sales outstanding (DSO) to improve cash position.',
                category: 'quick_win',
                difficulty: 'low',
                estimatedDays: 14,
                actionItems: [
                    'Review payment terms with customers',
                    'Implement early payment discounts',
                    'Automate invoice reminders',
                    'Consider invoice factoring',
                ],
            },
            {
                title: 'Establish credit line',
                description: 'Secure a revolving credit facility to buffer cash flow volatility.',
                category: 'strategic',
                difficulty: 'high',
                estimatedDays: 60,
                actionItems: [
                    'Prepare financial statements',
                    'Research lending options',
                    'Apply for business line of credit',
                    'Negotiate favorable terms',
                ],
            },
        ],
        concentration: [
            {
                title: 'Diversify customer base',
                description: 'Reduce dependency on top customers by acquiring new clients.',
                category: 'strategic',
                difficulty: 'high',
                estimatedDays: 180,
                actionItems: [
                    'Identify target customer segments',
                    'Launch marketing campaigns for new segments',
                    'Develop partnerships and channel sales',
                    'Set customer concentration limits',
                ],
            },
            {
                title: 'Expand product offerings',
                description: 'Create additional revenue streams to reduce single-product risk.',
                category: 'strategic',
                difficulty: 'high',
                estimatedDays: 120,
                actionItems: [
                    'Survey existing customers for needs',
                    'Analyze competitive offerings',
                    'Develop MVP of new offering',
                    'Beta test with existing customers',
                ],
            },
        ],
        retention: [
            {
                title: 'Strengthen contract terms',
                description: 'Renegotiate contracts to include longer notice periods and auto-renewal.',
                category: 'structural',
                difficulty: 'medium',
                estimatedDays: 45,
                actionItems: [
                    'Review all active contracts',
                    'Identify weak terms',
                    'Prepare updated contract templates',
                    'Negotiate renewals with improved terms',
                ],
            },
            {
                title: 'Reduce churn rate',
                description: 'Implement customer success initiatives to improve retention.',
                category: 'structural',
                difficulty: 'medium',
                estimatedDays: 60,
                actionItems: [
                    'Analyze churn patterns',
                    'Implement health scoring',
                    'Create proactive outreach program',
                    'Develop retention playbooks',
                ],
            },
        ],
        compliance: [
            {
                title: 'Complete financial audit',
                description: 'Engage auditors to produce certified financial statements.',
                category: 'quick_win',
                difficulty: 'low',
                estimatedDays: 30,
                actionItems: [
                    'Select audit firm',
                    'Prepare financial records',
                    'Complete audit process',
                    'Address any findings',
                ],
            },
            {
                title: 'Update tax filings',
                description: 'Ensure all tax returns are current and properly filed.',
                category: 'quick_win',
                difficulty: 'low',
                estimatedDays: 14,
                actionItems: [
                    'Review filing status for all jurisdictions',
                    'Prepare any overdue returns',
                    'Address outstanding liabilities',
                    'Set up compliance calendar',
                ],
            },
            {
                title: 'Obtain adequate insurance',
                description: 'Review and upgrade insurance coverage to meet requirements.',
                category: 'quick_win',
                difficulty: 'low',
                estimatedDays: 7,
                actionItems: [
                    'Audit current coverage',
                    'Identify gaps',
                    'Obtain quotes',
                    'Update policies',
                ],
            },
        ],
    };

    const templates = taskTemplates[drag.factor];
    const scoreGapPerTask = drag.impactPoints / templates.length;

    for (const template of templates) {
        tasks.push({
            id: uuid(),
            priority: 0, // Calculated later
            targetFactor: drag.factor,
            title: template.title!,
            description: template.description!,
            expectedScoreGain: Math.round(scoreGapPerTask),
            difficulty: template.difficulty!,
            estimatedDays: template.estimatedDays!,
            category: template.category!,
            actionItems: template.actionItems!,
        });
    }

    return tasks;
}

function calculatePriority(task: RemediationTask): number {
    // Priority = (Impact × 100) / (Difficulty Weight × Days)
    const difficultyWeight = getDifficultyWeight(task.difficulty);
    return Math.round((task.expectedScoreGain * 100) / (difficultyWeight * task.estimatedDays));
}

function calculateTimeline(tasks: RemediationTask[]): RemediationRoadmap['timeline'] {
    const quickWins = tasks.filter(t => t.estimatedDays <= 14);
    const shortTerm = tasks.filter(t => t.estimatedDays > 14 && t.estimatedDays <= 60);
    const longTerm = tasks.filter(t => t.estimatedDays > 60);

    return {
        quickWins: {
            tasks: quickWins.length,
            days: Math.max(...quickWins.map(t => t.estimatedDays), 0),
            scoreGain: quickWins.reduce((sum, t) => sum + t.expectedScoreGain, 0),
        },
        shortTerm: {
            tasks: shortTerm.length,
            days: Math.max(...shortTerm.map(t => t.estimatedDays), 0),
            scoreGain: shortTerm.reduce((sum, t) => sum + t.expectedScoreGain, 0),
        },
        longTerm: {
            tasks: longTerm.length,
            days: Math.max(...longTerm.map(t => t.estimatedDays), 0),
            scoreGain: longTerm.reduce((sum, t) => sum + t.expectedScoreGain, 0),
        },
    };
}
