# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice-First is an interactive audio learning platform that enables real-time voice interaction with audio content using OpenAI's Realtime API. Users can interrupt playback to ask questions, control audio via voice commands, and engage with educational content through flashcards and AI-powered chat.

## Development Commands

```bash
# Start development (React frontend + local server with realtime relay)
npm start

# Start local server only (port 3001 with /realtime WebSocket endpoint)
npm run dev

# Start relay server only (port 8081, standalone)
npm run relay

# Start both relay and local server
npm run dev:all

# Production build then serve
npm run start:prod

# Debug with Node.js inspector
npm run debug

# Build React app
npm run build
```

## Architecture

### Server Components

- **`local-server.js`** (port 3001): Express server handling:

  - Static asset serving for production builds
  - API endpoints for SERPAPI (news/video search), Recraft.ai (image generation), ZhipuAI, DeepSeek
  - Magazine listing from `public/play/` directories
  - Audio file existence checks
  - Word card image caching in `src/wordCard` (temp) and `public/wordCard` (permanent)
  - WebSocket relay for OpenAI Realtime API mounted at `/realtime`
  - Chat history REST API (`/api/chat/sessions/*`) backed by SQLite
- **`db/chatHistory.js`**: SQLite database layer using `better-sqlite3`. Stores sessions, messages, and Realtime API items (including base64-encoded audio). Database file auto-created at `data/chat_history.db` on first run.
- **`relay-server/lib/relay.js`**: `RealtimeRelay` class that proxies WebSocket connections between browser and OpenAI Realtime API using `@hankswang123/realtime-api-beta`

### Frontend (React + TypeScript)

- **`src/App.tsx`**: Entry point with device detection routing to `DesktopLayout` or `TabletLayout`
- **`src/pages/DesktopLayout.tsx`** and **`TabletLayout.tsx`**: Main layouts containing audio player, PDF viewer, chat, and flashcards
- **`src/utils/app_util.js`**: Magazine data management, keyword extraction, audio script transformation, and AI instruction building
- **`src/hooks/useChatHistory.ts`**: React hook for chat history persistence (load/save messages and Realtime API items)
- **`src/utils/chatHistoryApi.ts`**: Frontend API client for chat history endpoints
- **`src/utils/audioSerializer.ts`**: Serialization of audio data (Int16Array/Blob URL to base64) for database storage

### Data Structure

Magazine content lives in `public/play/<magazine-name>/`:

- `<magazine-name>.wav|mp3|m4a` - Audio file
- `audio_scripts.txt` - Timestamped transcripts (optionally with interleaved translation lines)
- `keywords.txt` - JSON mapping keywords to `[startTime, endTime, pageNumber]`
- `flashcards.txt` - JSON flashcard data

## Environment Variables

Required in `.env`:

- `OPENAI_API_KEY` - Required for realtime relay and chat features
- `SERPAPI_API_KEY` - For YouTube video and Google News search
- `RECRAFT_API_KEY` and `RECRAFT_BASE_URL` - For image generation
- `ZHIPUAI_API_KEY` - For ZhipuAI integration
- `DEEPSEEK_API_KEY` and `DEEPSEEK_BASE_URL` - For DeepSeek chat

## Key Patterns

- Word card images are generated to `src/wordCard/` to avoid webpack hot-reload issues (public folder is monitored), then moved to `public/wordCard/` on next app start
- PDF worker (`pdf.worker.min.mjs`) must be served from the same origin for deployment compatibility
- Magazine list is fetched dynamically via `/api/magazines` endpoint, falling back to hardcoded list in `app_util.js`
- Voice commands trigger function calls in the realtime API (pause, resume, volume, skip, etc.)
- Chat history is stored in SQLite (`data/chat_history.db`) with no automatic expiration; data persists until manually cleared
- The `data/` directory and database are auto-created on first server start
- `prestart` hook automatically frees ports 3000/3001 before `npm start` using `kill-port`
- `cross-env` with `NODE_OPTIONS=--openssl-legacy-provider` enables compatibility with Node.js v24+
