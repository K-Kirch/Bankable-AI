/**
 * Analyze Page JavaScript
 * Drives the analysis polling loop against the async 202+poll API.
 *
 * Flow:
 *   POST /api/analyze → { jobId, statusUrl } (202)
 *   GET  /api/analyze/:jobId/status (every 2s, up to 60 polls / ~2 min)
 *   → status: queued | analyzing → keep polling
 *   → status: complete           → store result, redirect to dashboard
 *   → status: error              → fall back to demo data
 */

const statusMessage    = document.getElementById('statusMessage');
const statusCounter    = document.getElementById('status-counter');
const statusLawyer     = document.getElementById('status-lawyer');
const statusForecaster = document.getElementById('status-forecaster');
const statusMarket     = document.getElementById('status-market');

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS        = 60; // 2-minute timeout

// Get session from localStorage
const session = JSON.parse(localStorage.getItem('bankable_session') || '{}');

if (!session.sessionId) {
    window.location.href = '/upload.html';
} else {
    startAnalysis();
}

async function startAnalysis() {
    // Kick off the analysis job
    let jobId;
    let statusUrl;

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId: session.companyId || 'demo-company' })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        jobId     = data.jobId;
        statusUrl = data.statusUrl;

        localStorage.setItem('bankable_job', JSON.stringify({ jobId, statusUrl }));
    } catch (err) {
        console.error('Failed to start analysis:', err);
        fallbackToDemo();
        return;
    }

    // Begin polling
    setAgentStage('queued');
    pollForResult(statusUrl);
}

async function pollForResult(statusUrl) {
    let polls = 0;

    const interval = setInterval(async () => {
        polls++;

        if (polls > MAX_POLLS) {
            clearInterval(interval);
            console.error('Analysis timed out after 2 minutes');
            fallbackToDemo();
            return;
        }

        try {
            const res = await fetch(statusUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            switch (data.status) {
                case 'queued':
                    setAgentStage('queued');
                    break;

                case 'analyzing':
                    setAgentStage('analyzing', polls);
                    break;

                case 'complete':
                    clearInterval(interval);
                    setAgentStage('complete');
                    localStorage.setItem('bankable_result', JSON.stringify(data));
                    statusMessage.textContent = 'Analysis complete! Redirecting...';
                    setTimeout(() => { window.location.href = '/dashboard.html'; }, 1500);
                    break;

                case 'error':
                    clearInterval(interval);
                    console.error('Analysis error:', data.error);
                    fallbackToDemo();
                    break;
            }
        } catch (err) {
            console.error('Poll error:', err);
            // Transient network error — keep polling
        }
    }, POLL_INTERVAL_MS);
}

/**
 * Drive agent status indicators from real API status.
 * 'analyzing' uses poll count to stagger the visual reveal of each agent.
 */
function setAgentStage(stage, pollCount = 0) {
    if (stage === 'queued') {
        statusMessage.textContent = 'Queued for analysis...';
        return;
    }

    if (stage === 'analyzing') {
        statusMessage.textContent = 'Running analysis...';

        // Stagger agent indicators: counter → lawyer → forecaster → market
        if (pollCount >= 1) activate(statusCounter);
        if (pollCount >= 4) activate(statusLawyer);
        if (pollCount >= 7) activate(statusForecaster);
        if (pollCount >= 10) activate(statusMarket);
        return;
    }

    if (stage === 'complete') {
        complete(statusCounter);
        complete(statusLawyer);
        complete(statusForecaster);
        complete(statusMarket);
    }
}

function activate(el) {
    if (el && !el.classList.contains('active') && !el.classList.contains('complete')) {
        el.classList.add('active');
    }
}

function complete(el) {
    if (el) {
        el.classList.remove('active');
        el.classList.add('complete');
    }
}

function fallbackToDemo() {
    statusMessage.textContent = 'Analysis encountered an error. Using demo data...';
    setTimeout(() => {
        localStorage.setItem('bankable_result', JSON.stringify(getDemoResult()));
        window.location.href = '/dashboard.html';
    }, 2000);
}

function getDemoResult() {
    return {
        success: true,
        score: {
            score: 72,
            grade: 'B',
            summary: 'Good overall bankability with room for improvement in customer concentration and contract terms.',
            breakdown: {
                serviceability: { score: 78, weight: 0.25 },
                concentration:  { score: 62, weight: 0.20 },
                retention:      { score: 68, weight: 0.20 },
                compliance:     { score: 85, weight: 0.15 },
                growth:         { score: 70, weight: 0.20 },
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
