/**
 * Dashboard Page JavaScript
 * Renders score, risk factors, roadmap, and actionable insights
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

  // Render new sections
  renderCriticalIssues(result.score.explanation || result.breakdown?.explanation);
  renderExecutiveSummary(result.score.explanation || result.breakdown?.explanation);
  renderScoreProjection(score, result.roadmap);
  renderTimelineRoadmap(result.roadmap?.timeline);
  renderRiskFactors(result.score.breakdown || result.breakdown?.riskFactors || result.score.riskFactors);
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

function renderCriticalIssues(explanation) {
  const section = document.getElementById('criticalAlertSection');
  const list = document.getElementById('criticalIssuesList');

  if (!explanation?.criticalIssues || explanation.criticalIssues.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  list.innerHTML = explanation.criticalIssues
    .map(issue => `<li>${issue}</li>`)
    .join('');
}

function renderExecutiveSummary(explanation) {
  const container = document.getElementById('executiveSummary');

  if (!explanation) {
    container.innerHTML = '<p style="color: var(--text-muted);">No detailed insights available.</p>';
    return;
  }

  const strengths = explanation.strengths || [];
  const weaknesses = explanation.weaknesses || [];

  container.innerHTML = `
        <div class="summary-column strengths">
            <h3 class="summary-column-title">
                <span class="summary-icon">✅</span> Strengths
            </h3>
            ${strengths.length > 0
      ? strengths.map(s => `
                    <div class="insight-card strength">
                        <span class="insight-text">${s}</span>
                    </div>
                `).join('')
      : '<p class="no-items">No significant strengths identified</p>'
    }
        </div>
        <div class="summary-column concerns">
            <h3 class="summary-column-title">
                <span class="summary-icon">⚠️</span> Areas for Improvement
            </h3>
            ${weaknesses.length > 0
      ? weaknesses.map(w => `
                    <div class="insight-card concern">
                        <span class="insight-text">${w}</span>
                    </div>
                `).join('')
      : '<p class="no-items">No significant concerns identified</p>'
    }
        </div>
    `;
}

function renderScoreProjection(currentScore, roadmap) {
  const current = document.getElementById('projectionCurrent');
  const potential = document.getElementById('projectionPotential');
  const gain = document.getElementById('projectionGain');

  current.textContent = currentScore;

  const projectedScore = roadmap?.projectedScore || currentScore;
  potential.textContent = projectedScore;

  const gainAmount = projectedScore - currentScore;
  gain.textContent = `+${gainAmount}`;

  // Add animation class based on gain
  if (gainAmount >= 20) {
    gain.classList.add('high-gain');
  } else if (gainAmount >= 10) {
    gain.classList.add('medium-gain');
  }
}

function renderTimelineRoadmap(timeline) {
  if (!timeline) return;

  // Quick wins
  document.getElementById('quickWinsTasks').textContent = timeline.quickWins?.tasks || 0;
  document.getElementById('quickWinsDays').textContent = timeline.quickWins?.days || 0;
  document.getElementById('quickWinsGain').textContent = `+${timeline.quickWins?.scoreGain || 0}`;

  // Short-term
  document.getElementById('shortTermTasks').textContent = timeline.shortTerm?.tasks || 0;
  document.getElementById('shortTermDays').textContent = timeline.shortTerm?.days || 0;
  document.getElementById('shortTermGain').textContent = `+${timeline.shortTerm?.scoreGain || 0}`;

  // Long-term
  document.getElementById('longTermTasks').textContent = timeline.longTerm?.tasks || 0;
  document.getElementById('longTermDays').textContent = timeline.longTerm?.days || 0;
  document.getElementById('longTermGain').textContent = `+${timeline.longTerm?.scoreGain || 0}`;
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
    const data = breakdown?.[factor.key] || { score: 0, components: [] };
    const score = data.score || 0;
    const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    const components = data.components || [];
    const hasComponents = components.length > 0;

    return `
        <div class="risk-card animate-fadeIn ${hasComponents ? 'expandable' : ''}" ${hasComponents ? `onclick="toggleRiskDetails(this)"` : ''}>
            <div class="risk-card-header">
                <span class="risk-card-title">${factor.icon} ${factor.name}</span>
                <span class="risk-card-score">${Math.round(score)}</span>
            </div>
            <div class="risk-bar">
                <div class="risk-bar-fill ${level}" style="width: ${score}%"></div>
            </div>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                ${data.explanation || factor.description}
            </p>
            ${hasComponents ? `
                <div class="risk-components" style="display: none;">
                    <div class="risk-components-divider"></div>
                    ${components.map(c => `
                        <div class="risk-component">
                            <div class="risk-component-header">
                                <span class="risk-component-name">${c.name}</span>
                                <span class="risk-component-value">${Math.round(c.value)}/100</span>
                            </div>
                            <div class="risk-component-bar">
                                <div class="risk-component-bar-fill" style="width: ${c.value}%"></div>
                            </div>
                            <p class="risk-component-interpretation">${c.interpretation}</p>
                        </div>
                    `).join('')}
                </div>
                <div class="risk-card-expand">
                    <span class="expand-text">Show details</span>
                    <span class="expand-icon">▼</span>
                </div>
            ` : ''}
        </div>
        `;
  }).join('');
}

function toggleRiskDetails(card) {
  const components = card.querySelector('.risk-components');
  const expandText = card.querySelector('.expand-text');
  const expandIcon = card.querySelector('.expand-icon');

  if (!components) return;

  const isHidden = components.style.display === 'none';
  components.style.display = isHidden ? 'block' : 'none';
  expandText.textContent = isHidden ? 'Hide details' : 'Show details';
  expandIcon.textContent = isHidden ? '▲' : '▼';
  card.classList.toggle('expanded', isHidden);
}

function renderTasks(tasks) {
  const taskList = document.getElementById('taskList');

  if (tasks.length === 0) {
    taskList.innerHTML = '<p style="color: var(--text-muted);">No remediation tasks identified.</p>';
    return;
  }

  taskList.innerHTML = tasks.map((task, index) => {
    const priorityColors = {
      quick_win: '#22c55e',
      structural: '#8b5cf6',
      strategic: '#3b82f6'
    };
    const color = priorityColors[task.category] || '#3b82f6';
    const hasActionItems = task.actionItems && task.actionItems.length > 0;

    return `
        <div class="task-item animate-fadeIn ${hasActionItems ? 'expandable' : ''}" style="animation-delay: ${index * 0.1}s" ${hasActionItems ? `onclick="toggleTaskActions(this)"` : ''}>
            <div class="task-priority" style="background: ${color}"></div>
            <div class="task-content">
                <div class="task-header">
                    <div class="task-title">${task.title}</div>
                    <span class="task-category ${task.category}">${formatCategory(task.category)}</span>
                </div>
                <div class="task-description">${task.description}</div>
                <div class="task-meta">
                    <span class="task-impact">+${task.expectedScoreGain} pts</span>
                    <span>📅 ${task.estimatedDays} days</span>
                    <span>⚡ ${task.difficulty}</span>
                </div>
                ${hasActionItems ? `
                    <div class="task-actions" style="display: none;">
                        <div class="action-items-header">Action Items:</div>
                        <ul class="action-items-list">
                            ${task.actionItems.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="task-expand">
                        <span class="expand-text">Show action items</span>
                        <span class="expand-icon">▼</span>
                    </div>
                ` : ''}
            </div>
        </div>
        `;
  }).join('');
}

function toggleTaskActions(taskItem) {
  const actions = taskItem.querySelector('.task-actions');
  const expandText = taskItem.querySelector('.expand-text');
  const expandIcon = taskItem.querySelector('.expand-icon');

  if (!actions) return;

  const isHidden = actions.style.display === 'none';
  actions.style.display = isHidden ? 'block' : 'none';
  expandText.textContent = isHidden ? 'Hide action items' : 'Show action items';
  expandIcon.textContent = isHidden ? '▲' : '▼';
  taskItem.classList.toggle('expanded', isHidden);
}

function formatCategory(category) {
  const labels = {
    quick_win: 'Quick Win',
    structural: 'Structural',
    strategic: 'Strategic'
  };
  return labels[category] || category;
}

// Export functionality
function exportReport() {
  const data = {
    company: session.companyName,
    date: new Date().toISOString(),
    score: result.score,
    roadmap: result.roadmap,
    breakdown: result.breakdown
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `bankability-report-${session.companyName || 'company'}.json`;
  a.click();

  URL.revokeObjectURL(url);
}
