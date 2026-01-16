# 🏦 Bankable.ai

**Agentic Credit Intelligence Platform** — AI-powered Bankability Scores and remediation roadmaps for startups.

## Overview

Bankable.ai uses parallel AI agents to analyze startup financial health and produce:
- **Bankability Score (0-100)** with letter grades (A-F)
- **Remediation Roadmap** with prioritized tasks to improve creditworthiness

### The Agents

| Agent | Role |
|-------|------|
| 🧮 **The Counter** | Financial health, cash flow, revenue concentration |
| ⚖️ **The Lawyer** | Legal structure, contract terms, compliance |
| 📈 **The Forecaster** | Stress testing, Monte Carlo simulations |

## Quick Start

### Prerequisites
- Node.js 20+
- Docker (for Redis, PostgreSQL, ChromaDB)
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

# Run full analysis
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"companyId": "startup-001"}'
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
├── agents/          # Specialized AI agents
├── core/            # Orchestrator, context, messaging
├── ingestion/       # PDF parser, Stripe/Plaid adapters
├── synthesis/       # Risk calculation, scoring, remediation
├── api/             # REST endpoints
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
