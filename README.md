# AI Calling Agent

A full-stack AI voice calling system with a React operations console and a
Fastify backend for real-time call handling, review, and prompt optimization.

## Project Layout

```text
.
├── ai-caller/          # Voice backend, call routes, services, database schema
├── frontend/           # React dashboard for call operations
├── scripts/            # Local development scripts
├── LICENSE             # View-only proprietary license
└── package.json        # Workspace commands
```

## Tech Stack

- React and Tailwind CSS for the dashboard
- Node.js and Fastify for the voice backend
- SQLite for call history and prompt versions
- Twilio, ElevenLabs, and OpenAI integrations

## Run Locally

```bash
npm install
npm --prefix ai-caller install
npm --prefix frontend install
npm run dev
```

Create `ai-caller/.env` with the required provider credentials before starting
the backend.

## Useful Commands

```bash
npm run dev       # Start frontend and backend
npm run build     # Build the frontend
npm run test      # Run backend tests
npm run check     # Syntax check backend and build frontend
```

## License

View-only proprietary license. This repository is provided for viewing only.
Downloading, copying, installing, running, using, modifying, distributing, or
creating derivative works is not permitted without prior written permission.
