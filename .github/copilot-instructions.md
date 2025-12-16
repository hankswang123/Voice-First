# Copilot Instructions for Voice-First

## Overview
Voice-First is a streamlined, interactive audio learning platform derived from Audio-Copilot. It enables real-time interaction with audio content, supporting features like voice commands, chat with AI assistants, flashcards, and integration with external APIs (OpenAI, SERPAPI, Recraft.ai, ZhipuAI).

## Architecture & Key Components
- **Frontend (React, TypeScript, SCSS)**: Located in `src/`. Main entry: `App.tsx`. Device-specific layouts: `DesktopLayout.tsx`, `TabletLayout.tsx`.
- **Backend (Node.js/Express)**: `local-server.js` (port 3001) handles API proxying, static asset serving, and integrations (SERPAPI, Recraft.ai, ZhipuAI, OpenAI).
- **Relay Server**: `relay-server/index.js` (port 8081) proxies OpenAI API requests, hiding API keys and enabling custom logic. Uses `@hankswang123/realtime-api-beta`.
- **Audio/Flashcard Data**: Under `public/play/` and `build/play/`, organized by magazine issue. Scripts, keywords, and flashcards are stored as `.txt` files.
- **Utilities**: `src/utils/app_util.js` manages magazine lists, keyword extraction, and audio script handling.

## Developer Workflows
- **Start Dev Servers**: 
  - `npm run dev:all` (runs both relay and local server)
  - `npm start` (runs React frontend and local server concurrently)
  - `npm run relay` (relay server only)
- **Production Build**: `npm run build` then `npm run start:prod`
- **Debugging**: `npm run debug` (enables Node.js inspector)
- **Environment**: Requires `.env` with `OPENAI_API_KEY` for relay server. Set `REACT_APP_LOCAL_RELAY_SERVER_URL` for custom relay endpoint.

## Project-Specific Patterns & Conventions
- **Magazine Data**: Add new issues by placing folders in `public/play/` and updating `magzines` in `src/utils/app_util.js`.
- **Keyword/Script Format**: Keywords are JSON objects in `.txt` files, mapping terms to `[start, end, page]`.
- **Assistant/Key Management**: On first use, users are prompted for OpenAI API Key and Assistant ID (stored in `localStorage`).
- **PDF Handling**: Uses `react-pdf` with custom worker path logic for deployment compatibility.
- **Voice/Chat**: Real-time audio and chat use `@hankswang123/realtime-api-beta` and OpenAI's Assistant API.

## Integration Points
- **OpenAI**: Used for chat, assistant, and real-time audio features.
- **SERPAPI**: For news and video search endpoints.
- **Recraft.ai**: For image generation based on keywords.
- **ZhipuAI**: Optional, for alternative model integration.

## Examples
- To add a new magazine: create a folder in `public/play/`, add `audio_scripts.txt`, `flashcards.txt`, and `keywords.txt`, then update `magzines` in `app_util.js`.
- To run locally with relay: ensure `.env` has `OPENAI_API_KEY`, then run `npm run dev:all`.

---
For more, see `README.md`, `src/utils/app_util.js`, and server files. Update this file as project conventions evolve.
