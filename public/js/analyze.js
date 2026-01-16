/**
 * Analyze Page JavaScript
 * Handles analysis polling and agent status updates
 */

const statusMessage = document.getElementById('statusMessage');
const statusCounter = document.getElementById('status-counter');
const statusLawyer = document.getElementById('status-lawyer');
const statusForecaster = document.getElementById('status-forecaster');

// Get session from localStorage
const session = JSON.parse(localStorage.getItem('bankable_session') || '{}');

if (!session.sessionId) {
    // No session, redirect back
    window.location.href = '/upload.html';
} else {
    startAnalysis();
}

async function startAnalysis() {
    try {
        // Start the analysis
        const analyzeRes = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId: session.companyId || 'demo-company' })
        });

        // Simulate agent progress while waiting
        simulateAgentProgress();

        const result = await analyzeRes.json();

        if (result.success) {
            // Store results
            localStorage.setItem('bankable_result', JSON.stringify(result));

            // Mark all agents complete
            statusCounter.classList.remove('active');
            statusCounter.classList.add('complete');
            statusLawyer.classList.remove('active');
            statusLawyer.classList.add('complete');
            statusForecaster.classList.remove('active');
            statusForecaster.classList.add('complete');

            statusMessage.textContent = 'Analysis complete! Redirecting...';

            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1500);
        } else {
            throw new Error(result.error || 'Analysis failed');
        }
    } catch (error) {
        console.error('Analysis error:', error);
        statusMessage.textContent = 'Analysis encountered an error. Using demo data...';

        // Use demo data for testing
        setTimeout(() => {
            localStorage.setItem('bankable_result', JSON.stringify(getDemoResult()));
            window.location.href = '/dashboard.html';
        }, 2000);
    }
}

function simulateAgentProgress() {
    // Stage 1: Counter starts
    statusCounter.classList.add('active');

    // Stage 2: Lawyer starts
    setTimeout(() => {
        statusLawyer.classList.add('active');
    }, 2000);

    // Stage 3: Forecaster starts
    setTimeout(() => {
        statusForecaster.classList.add('active');
    }, 4000);

    // Stage 4: Counter completes
    setTimeout(() => {
        statusCounter.classList.remove('active');
        statusCounter.classList.add('complete');
        statusMessage.textContent = 'Financial analysis complete...';
    }, 6000);

    // Stage 5: Lawyer completes
    setTimeout(() => {
        statusLawyer.classList.remove('active');
        statusLawyer.classList.add('complete');
        statusMessage.textContent = 'Legal analysis complete...';
    }, 8000);
}

function getDemoResult() {
    return {
        success: true,
        score: {
            score: 72,
            grade: 'B',
            summary: 'Good overall bankability with room for improvement in customer concentration and contract terms.',
            breakdown: {
                serviceability: { score: 78, weight: 0.30 },
                concentration: { score: 62, weight: 0.25 },
                retention: { score: 68, weight: 0.25 },
                compliance: { score: 85, weight: 0.20 }
            }
        },
        roadmap: {
            currentScore: 72,
            projectedScore: 85,
            tasks: [
                {
                    id: '1',
                    title: 'Diversify customer base',
                    description: 'Top 3 customers represent 45% of revenue. Target new customer segments.',
                    targetFactor: 'concentration',
                    expectedScoreGain: 8,
                    difficulty: 'high',
                    estimatedDays: 90
                },
                {
                    id: '2',
                    title: 'Strengthen contract terms',
                    description: 'Add 60-day notice periods to major contracts.',
                    targetFactor: 'retention',
                    expectedScoreGain: 5,
                    difficulty: 'medium',
                    estimatedDays: 30
                },
                {
                    id: '3',
                    title: 'Complete financial audit',
                    description: 'Engage auditors for certified financial statements.',
                    targetFactor: 'compliance',
                    expectedScoreGain: 3,
                    difficulty: 'low',
                    estimatedDays: 45
                }
            ]
        }
    };
}
