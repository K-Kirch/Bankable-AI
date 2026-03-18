# 🏦 Bankable.ai

**Agentic Credit Intelligence Platform** — AI-powered Bankability Scores and remediation roadmaps for startups.

## Overview

Bankable.ai uses parallel AI agents to analyze startup financial health and produce:
- **Bankability Score (0-100)** with 13-tier letter grades (A+ through F)
- **Remediation Roadmap** with prioritized tasks to improve creditworthiness

### The Agents

| Agent | Role |
|-------|------|
| 🧮 **The Counter** | Financial health, cash flow, revenue concentration |
| ⚖️ **The Lawyer** | Legal structure, contract terms, compliance |
| 📈 **The Forecaster** | Stress testing, Monte Carlo simulations |
| 🌐 **The Market Analyst** | Industry positioning, competitive landscape, growth trajectory |

## Quick Start

### Prerequisites
- Node.js 20+
- Docker (for Redis, ChromaDB) — PostgreSQL is optional; set `DATABASE_URL` to persist completed analyses
- API Keys: Google AI (Gemini), Stripe, Plaid

### Installation

```bash
# Clone the repository
git clone https://github.com/K-Kirch/Bankable-AI.git
cd Bankable-AI

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start infrastructure
docker-compose up -d

# Run development server
npm run dev
```

### API Usage

```bash
# Create analysis session
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"companyId": "startup-001"}'

# Upload documents
curl -X POST http://localhost:3000/api/documents \
  -F "file=@profit-loss.pdf" \
  -F "sessionId=<session-id>"

# Connect Stripe
curl -X POST http://localhost:3000/api/integrations/stripe \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "<session-id>"}'

# Start analysis (returns immediately with a job ID)
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"companyId": "startup-001"}'
# → { "jobId": "...", "statusUrl": "/api/analyze/.../status", "status": "queued" }

# Poll for results
curl http://localhost:3000/api/analyze/<job-id>/status
# → { "status": "complete", "score": {...}, "roadmap": {...} }
```

## Risk Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Serviceability | 30% | Cash flow vs debt obligations |
| Concentration | 25% | Revenue spread across customers |
| Retention | 25% | Contract stickiness and churn |
| Compliance | 20% | Audit, tax, and insurance status |

## Project Structure

```
src/
├── agents/          # Specialized AI agents (Counter, Lawyer, Forecaster, Market)
├── core/            # Orchestrator, context, messaging, job store, DB pool
├── ingestion/       # PDF parser, Stripe/Plaid adapters
├── synthesis/       # Risk calculation, scoring, contradiction detection, remediation
├── api/             # REST endpoints
├── utils/           # Document extraction helpers
└── types/           # TypeScript definitions
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **AI**: Google Gemini 2.0 Flash
- **State**: Redis + PostgreSQL
- **Integrations**: Stripe, Plaid
- **Vector Store**: ChromaDB

## License

MIT
