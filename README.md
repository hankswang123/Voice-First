# Voice-First

Voice-First is clean version of Audio-Copilot. Only core features will be kept in Voice-First and also make Audio-Copilot not affected.

# Audio Copilot

Audio Copilot enables the interaction with content during playback on-going. It will help transform the passive listening into an interactive, engaging and real-time experience. It can understand the on-going playback intelligently and be ready for user’s query at any time.

## Features/Tests TBD

- Check how to integrate some OpenAI compatiable Free Models API, e.g. zhipu realtime API
- Logic to generate new Assistant ID when the existing assistant expires
- Test [WebRTC API Integration](https://platform.openai.com/docs/guides/realtime-webrtc), the [openai-realtime-agents](https://github.com/openai/openai-realtime-agents) is a good example to learn, which use WebRTC to connect to realtime model
- Model settings, e.g. voice to be used, before launching a conversation
- Launch two realtime api instants to talk with each other to implment the NotebookLM audio overview effect
- Test more features of different models in OpenAI
- PDF Loading Performance Improvements (for large files 10MB+):
  - Lazy loading / pagination: Only load pages user is viewing
  - PDF compression: Compress PDFs before adding to project
  - Caching headers: Add `maxAge` for static PDF files to avoid re-download
  - Loading progress indicator: Show progress while PDF loads
  - Convert PDF to images: Pre-convert pages to optimized JPEG/WebP
  - CDN for static assets: Host large PDFs on Cloudflare/AWS CloudFront

## Functions implemented

- Audio Copilot. ( Key feature: Interrupt the on-going playback and ask for questions by integrating [OpenAI Realtime API](https://openai.com/index/introducing-the-realtime-api/) )
- Chatbot integrated to ask question by typing with communicating GPT-4o by [Assistant API](https://platform.openai.com/docs/assistants/overview)
- Control the player by voice commands. e.g. 'stop', 'resume'...
- Follow up mode: Play as one of two speakers. -to be done
- Image Generation by [Recraft.ai](https://www.recraft.ai) for selected Word which is part of function wordCard
- Screenshot analyzation and read aloud by Realtime API
- Search Videos by youtube.com integrated by [SERPAPI](https://serpapi.com/search-api)
- Search News by google integrated by [SERPAPI](https://serpapi.com/search-api)
- Chat history persistence (text, voice, images) saved to SQLite database

## An Education Scenario which Audio Copilot could help

### Whole process

- Step 1 - Preapre the PDF file from [National Geographic Little Kids](https://magazinelib.com/?s=national+geographic+little+kids) or any other PDF files - **Mandatory**
- Step 2 - Generate the **podcast**(Audio overview for PDF file) by uploading PDF to [NotebookLM](https://notebooklm.google.com/)
  - Prompt example: Use very simple and interesting English words, the target audience is for grade 2 student. Tone should be supportive and encouraging. Also repeat some keywords letter by letter according to you judgement.
- Step 3 - Generate the **Audio Scripts** by uploading podcast(audio file) to [Tongyi-&gt;Efficiency](https://tongyi.aliyun.com/efficiency)， [Fireflies](https://app.fireflies.ai/) or [Google AI Studio](https://aistudio.google.com/prompts/new_chat) - Optional
  - Tongyi Efficiency supports editting the transribed scripts dynamically
  - **Tongyi now support export the scripts generated** and exported scripts could be used by default without any modification
- Step 4 - Prepare are the **Keywords** based Audio Scripts - Optional
- Step 4 - Generate the **Flashcards content** by uploading to Tongyi - Optional
- Step 5 - User could engage an realtime dicussion by Audio Copilot during listening podcast and reading the magzine.
- Step 6 - Additional features: analyze selected screenshot, word card...

## API Key required

- [OpenAI API Key](https://platform.openai.com/api-keys) - for Realtime API calling
- [Recraft API Key](https://www.recraft.ai/profile/api) - for image generation
- [SERP API Key](https://serpapi.com/manage-api-key) - for youtube video and google news search
- [ZhipuAI API Key](https://open.bigmodel.cn/) - for ZhipuAI integration
- [DeepSeek API Key](https://platform.deepseek.com/) - for DeepSeek chat

<img src="/readme/audio-copilot.png" width="800" />
<img src="/readme/audio-copilot-2.png" width="800" />

This idea is implemented based on [OpenAI Realtime Console](https://github.com/openai/openai-realtime-console) `<br>`

## Issues solved

- put 'fnm env --use-on-cd | Out-String | Invoke-Expression' to 'C:\Users\<YourUsername>\Documents\WindowsPowerShell\profile.ps1' to avoid run this command each time before 'npm start'
- install 'concurrently' as dependency to start the 'server.js' and react app(react-scripts start) are started together
- `RealtimeClient.updateSession({ modalities: ['text', 'voice'] });` will lead to other setting not working, e.g. voice, function calling
- Sometimes frontend page will be refreshed after image generated by Recraft, possiblely because codes changed but pages not refreshed manually， cause is found that public folder is monitored by webpack(web server), when new files are put into it, the whole app will be refreshed. The generated image will be stored in src/wordCard temporaly, they will be moved to public/wordCard when the app is launched next time.
- **OpenAI disabled the Realtime Beta API.** The relay returned `beta_api_shape_disabled` and the connect button got stuck at "Connect...". Migrated off the unmaintained `@hankswang123/realtime-api-beta` npm package by **vendoring it in-tree** at `src/lib/realtime/` and patching it to speak the GA wire shape (drop the `openai-beta.realtime-v1` subprotocol + `OpenAI-Beta` header, inject `session.type='realtime'`, strip 8 GA-rejected session fields, and re-emit GA-renamed inbound events under their Beta names so layouts don't need to know which API version is on the wire). See [the migration design](docs/superpowers/specs/2026-05-22-realtime-ga-migration-design.md) for the full story.

## Realtime model selection (optional)

The Realtime client defaults to `gpt-realtime-mini`. To override:

- **Server-side (relay running on Render or locally):** set `REALTIME_MODEL=<model-id>` in the environment.
- **Browser-side (ephemeral-key path only):** set `REACT_APP_REALTIME_MODEL=<model-id>` in `.env` before running `npm run build`.

The relay path used by `voice-first-1.onrender.com` ignores the browser-side variable; only `REALTIME_MODEL` (server-side) takes effect there. Configure it in the Render service's Environment settings.
