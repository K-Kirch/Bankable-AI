/**
 * Dashboard Page JavaScript
 * Renders score, risk factors, and remediation tasks
 */

// Get stored results
const session = JSON.parse(localStorage.getItem('bankable_session') || '{}');
const result = JSON.parse(localStorage.getItem('bankable_result') || '{}');

if (!result.score) {
    // No results, redirect back
    window.location.href = '/upload.html';
} else {
    renderDashboard();
}

function renderDashboard() {
    // Company name
    document.getElementById('companyName').textContent = session.companyName || 'Your Company';

    // Score
    const score = result.score.score;
    const grade = result.score.grade;

    document.getElementById('scoreValue').textContent = score;

    const gradeBadge = document.getElementById('gradeBadge');
    gradeBadge.textContent = grade;
    gradeBadge.className = `grade-badge grade-${grade}`;

    document.getElementById('scoreSummary').textContent = result.score.summary;

    // Animate score circle
    animateScoreCircle(score);

    // Risk factors
    renderRiskFactors(result.score.breakdown);

    // Tasks
    renderTasks(result.roadmap?.tasks || []);
}

function animateScoreCircle(score) {
    const circle = document.getElementById('scoreCircle');
    const circumference = 2 * Math.PI * 120; // radius = 120
    const offset = circumference - (score / 100) * circumference;

    // Animate after a short delay
    setTimeout(() => {
        circle.style.strokeDashoffset = offset;
    }, 300);
}

function renderRiskFactors(breakdown) {
    const grid = document.getElementById('riskGrid');

    const factors = [
        { key: 'serviceability', name: 'Serviceability', icon: '💰', description: 'Cash flow coverage' },
        { key: 'concentration', name: 'Concentration', icon: '🎯', description: 'Revenue distribution' },
        { key: 'retention', name: 'Retention', icon: '🔒', description: 'Contract stickiness' },
        { key: 'compliance', name: 'Compliance', icon: '✅', description: 'Regulatory status' }
    ];

    grid.innerHTML = factors.map(factor => {
        const data = breakdown[factor.key] || { score: 0 };
        const score = data.score || 0;
        const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

        return `
      <div class="risk-card animate-fadeIn">
        <div class="risk-card-header">
          <span class="risk-card-title">${factor.icon} ${factor.name}</span>
          <span class="risk-card-score">${score}</span>
        </div>
        <div class="risk-bar">
          <div class="risk-bar-fill ${level}" style="width: ${score}%"></div>
        </div>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
          ${factor.description}
        </p>
      </div>
    `;
    }).join('');
}

function renderTasks(tasks) {
    const taskList = document.getElementById('taskList');

    if (tasks.length === 0) {
        taskList.innerHTML = '<p style="color: var(--text-muted);">No remediation tasks identified.</p>';
        return;
    }

    taskList.innerHTML = tasks.map((task, index) => {
        const priorityColors = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b'];
        const color = priorityColors[index % priorityColors.length];

        return `
      <div class="task-item animate-fadeIn" style="animation-delay: ${index * 0.1}s">
        <div class="task-priority" style="background: ${color}"></div>
        <div class="task-content">
          <div class="task-title">${task.title}</div>
          <div class="task-description">${task.description}</div>
          <div class="task-meta">
            <span class="task-impact">+${task.expectedScoreGain} pts</span>
            <span>📅 ${task.estimatedDays} days</span>
            <span>⚡ ${task.difficulty}</span>
          </div>
        </div>
      </div>
    `;
    }).join('');
}

// Add export/share functionality
function exportReport() {
    const data = {
        company: session.companyName,
        date: new Date().toISOString(),
        score: result.score,
        roadmap: result.roadmap
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `bankability-report-${session.companyName || 'company'}.json`;
    a.click();

    URL.revokeObjectURL(url);
}
