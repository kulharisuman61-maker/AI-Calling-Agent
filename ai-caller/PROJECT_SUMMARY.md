# Project Summary

This project is a full-stack AI voice calling application built for reviewing,
tracking, and improving real-time phone conversations.

## Highlights

- React dashboard for call operations and recent activity.
- Fastify backend with REST routes and WebSocket media handling.
- SQLite schema for call history, metrics, reviews, and prompt versions.
- Provider integration layer for voice, conversation, and prompt analysis.
- Review workflow for approving calls and improving future prompts.

## Architecture

```text
Frontend dashboard
        |
        v
Fastify API
        |
        +-- Call routes
        +-- Review routes
        +-- Prompt optimization routes
        |
        v
Services layer
        |
        +-- Voice provider
        +-- Conversation provider
        +-- Analysis provider
        |
        v
SQLite database
```

## Backend Structure

```text
ai-caller/
├── server.js
├── database/
├── handlers/
├── routes/
├── services/
└── utils/
```

## Frontend Structure

```text
frontend/
├── public/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── App.js
│   └── index.js
└── package.json
```

## Reviewer Notes

- The backend entry point is `ai-caller/server.js`.
- Route behavior is split across `ai-caller/routes/`.
- Provider-specific code is isolated in `ai-caller/services/`.
- Shared call metrics and audio helpers live in `ai-caller/utils/`.
- The dashboard entry point is `frontend/src/App.js`.
