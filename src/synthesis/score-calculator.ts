/**
 * Score Calculator
 * 
 * Synthesizes risk factors into a single 0-100 Bankability Score
 * with explainability.
 */

import type {
    GlobalContext,
    RiskFactorMap,
    BankabilityScore,
    ScorePenalty,
    ScoreExplanation,
} from '../types/index.js';

/**
 * Calculate the final Bankability Score
 */
export function calculateBankabilityScore(
    riskFactors: RiskFactorMap,
    context: GlobalContext
): BankabilityScore {
    // Calculate weighted raw score
    const rawScore =
        riskFactors.serviceability.score * riskFactors.serviceability.weight +
        riskFactors.concentration.score * riskFactors.concentration.weight +
        riskFactors.retention.score * riskFactors.retention.weight +
        riskFactors.compliance.score * riskFactors.compliance.weight;

    // Apply penalty multipliers for critical failures
    const penalties = calculatePenalties(riskFactors);
    const penaltyMultiplier = penalties.reduce((mult, p) => mult * p.multiplier, 1);

    const finalScore = Math.round(Math.max(0, Math.min(100, rawScore * penaltyMultiplier)));

    // Determine grade
    const grade = scoreToGrade(finalScore);

    // Generate explanation
    const explanation = generateExplanation(riskFactors, penalties);

    // Generate summary
    const summary = generateSummary(finalScore, grade, riskFactors);

    return {
        score: finalScore,
        grade,
        riskFactors,
        penalties,
        summary,
        explanation,
        calculatedAt: new Date(),
    };
}

function calculatePenalties(riskFactors: RiskFactorMap): ScorePenalty[] {
    const penalties: ScorePenalty[] = [];

    // Critical compliance failure
    if (riskFactors.compliance.score < 40) {
        const impactPoints = Math.round((1 - 0.8) * 100 * 0.2); // 20% penalty impact
        penalties.push({
            reason: 'Critical compliance gaps detected',
            multiplier: 0.8,
            impactPoints,
        });
    }

    // Severe serviceability issues
    if (riskFactors.serviceability.score < 30) {
        const impactPoints = Math.round((1 - 0.7) * 100 * 0.3);
        penalties.push({
            reason: 'Cash flow insufficient to service obligations',
            multiplier: 0.7,
            impactPoints,
        });
    }

    // Extreme concentration risk
    if (riskFactors.concentration.score < 25) {
        const impactPoints = Math.round((1 - 0.85) * 100 * 0.25);
        penalties.push({
            reason: 'Extreme revenue concentration risk',
            multiplier: 0.85,
            impactPoints,
        });
    }

    return penalties;
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 35) return 'D';
    return 'F';
}

function generateExplanation(
    riskFactors: RiskFactorMap,
    penalties: ScorePenalty[]
): ScoreExplanation {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const criticalIssues: string[] = [];

    // Analyze each risk factor
    for (const [key, factor] of Object.entries(riskFactors)) {
        if (factor.score >= 70) {
            strengths.push(`Strong ${factor.name.toLowerCase()} (${factor.score.toFixed(0)}/100)`);
        } else if (factor.score >= 50) {
            weaknesses.push(`${factor.name} needs improvement (${factor.score.toFixed(0)}/100)`);
        } else {
            criticalIssues.push(`Critical ${factor.name.toLowerCase()} concern (${factor.score.toFixed(0)}/100)`);
        }
    }

    // Add penalty explanations to critical issues
    for (const penalty of penalties) {
        criticalIssues.push(`Penalty applied: ${penalty.reason} (-${penalty.impactPoints} points)`);
    }

    // Build reasoning chain
    const reasoningChain = buildReasoningChain(riskFactors, penalties);

    return {
        strengths,
        weaknesses,
        criticalIssues,
        reasoningChain,
    };
}

function buildReasoningChain(riskFactors: RiskFactorMap, penalties: ScorePenalty[]): string {
    const lines: string[] = [
        '## Score Calculation Breakdown',
        '',
        '### Risk Factor Contributions',
        `- Serviceability (30%): ${riskFactors.serviceability.score.toFixed(1)} × 0.30 = ${(riskFactors.serviceability.score * 0.30).toFixed(1)}`,
        `- Concentration (25%): ${riskFactors.concentration.score.toFixed(1)} × 0.25 = ${(riskFactors.concentration.score * 0.25).toFixed(1)}`,
        `- Retention (25%): ${riskFactors.retention.score.toFixed(1)} × 0.25 = ${(riskFactors.retention.score * 0.25).toFixed(1)}`,
        `- Compliance (20%): ${riskFactors.compliance.score.toFixed(1)} × 0.20 = ${(riskFactors.compliance.score * 0.20).toFixed(1)}`,
        '',
    ];

    const rawScore =
        riskFactors.serviceability.score * 0.30 +
        riskFactors.concentration.score * 0.25 +
        riskFactors.retention.score * 0.25 +
        riskFactors.compliance.score * 0.20;

    lines.push(`**Raw Score**: ${rawScore.toFixed(1)}`);

    if (penalties.length > 0) {
        lines.push('', '### Penalties Applied');
        for (const penalty of penalties) {
            lines.push(`- ${penalty.reason}: ×${penalty.multiplier} (-${penalty.impactPoints} effective points)`);
        }

        const multiplier = penalties.reduce((m, p) => m * p.multiplier, 1);
        lines.push('', `**Final Score**: ${rawScore.toFixed(1)} × ${multiplier.toFixed(2)} = ${(rawScore * multiplier).toFixed(0)}`);
    }

    return lines.join('\n');
}

function generateSummary(
    score: number,
    grade: string,
    riskFactors: RiskFactorMap
): string {
    const gradeDescriptions: Record<string, string> = {
        'A': 'Excellent bankability with strong fundamentals across all dimensions.',
        'B': 'Good bankability with minor areas for improvement.',
        'C': 'Moderate bankability with notable risks requiring attention.',
        'D': 'Below average bankability with significant concerns.',
        'F': 'Poor bankability with critical issues requiring immediate remediation.',
    };

    // Find strongest and weakest factors
    const factors = Object.values(riskFactors);
    const strongest = factors.reduce((max, f) => f.score > max.score ? f : max);
    const weakest = factors.reduce((min, f) => f.score < min.score ? f : min);

    return `**Grade ${grade}** (${score}/100): ${gradeDescriptions[grade]} Strongest: ${strongest.name} (${strongest.score.toFixed(0)}). Weakest: ${weakest.name} (${weakest.score.toFixed(0)}).`;
}
