# MINDORA AI

MINDORA AI is a responsive learning workspace for turning study material into summaries, flashcards, quizzes, and study plans. The React client talks to an Express API. Account data is stored in SQLite, and AI provider credentials stay on the server. When no API key is configured, AI workflows return clearly labelled demo responses, not live model output.

## Requirements

- Node.js 20.19+ (Vite 8 requirement)
- npm

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The API runs on `http://localhost:3001`. Register an account or use the clearly labelled demo account. Demo mode is enabled until `OPENAI_API_KEY` is set in `.env`.

To enable live AI, set `OPENAI_API_KEY` in `.env`. Optionally configure `OPENAI_MODEL` and `OPENAI_BASE_URL` for an OpenAI-compatible provider, then restart the API process. Never put provider credentials in frontend environment variables or commit `.env`. The API health endpoint (`/api/health`) reports whether it is connected to SQLite and whether AI is in demo mode.

## Features

- Responsive landing page, dashboard, learning tools, and settings
- Password-hashed registration/login, HTTP-only server sessions, and a labelled shared demo account
- Account-scoped SQLite persistence for notes, tasks, preferences, and AI usage statistics (`DATABASE_PATH` can override `./data/mindora.sqlite`)
- Notes summarizer with six styles, notes-aware chat, flashcards, scored multiple-choice/true-false/fill-in-the-blank quizzes, and study-plan generation
- PDF, DOCX, TXT, and Markdown text extraction (10 MB upload limit; scanned PDFs require OCR)
- Notes search, library, study tasks, and theme preference
- Explicit demo labels whenever AI credentials are not configured
- Express API validation, request limiting, security headers, and protected server-side AI credentials

Uploaded files are extracted in memory and are not retained as documents. Provider-generated results require a valid API key and network access to the configured OpenAI-compatible provider. Demo responses are generated from the supplied text and are not live AI.

## Commands

```powershell
npm run dev       # Start the API and Vite client
npm run build     # Type-check client and API, then create the production client build
npm run lint      # Lint client and API source
npm run start:api # Start only the Express API
```

The production frontend can be served with `npm run preview`; deploy the API separately and configure the frontend host to proxy `/api` requests to it. Back up the SQLite database file to preserve account data.
