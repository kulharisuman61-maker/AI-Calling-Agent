# AI Caller Backend

Fastify service for AI-assisted voice calls, call review, and prompt versioning.

## Main Modules

```text
server.js                  # App entry point and service wiring
database/                  # SQLite schema and data access
handlers/                  # Twilio media stream handling
routes/                    # Calls, reviews, and prompt optimization routes
services/                  # Provider integrations and optimization logic
utils/                     # Audio, metrics, and prompt helpers
```

## Environment

Create `.env` in this directory before running locally.

```env
PORT=3002
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
OPENAI_API_KEY=
SALES_TEAM_NUMBER=
SALES_FALLBACK_NUMBER=
```

## Commands

```bash
npm install
npm run dev
npm test
```

## Key Endpoints

- `GET /health` checks service health.
- `POST /api/calls/outbound` creates an outbound call.
- `GET /api/calls` lists recent calls.
- `GET /api/dashboard/summary` returns dashboard metrics.
- `GET /api/review/pending` lists calls needing review.
- `POST /api/review/submit` records a review decision.
- `GET /api/prompts` lists prompt versions.
- `POST /api/prompts/activate` activates a prompt version.

## License

View-only proprietary license. See [`../LICENSE`](../LICENSE).
