// Tier-2 test: confirm the local relay round-trips a session.update +
// text response through to OpenAI and back.
//
// Pre-requisite: in another shell, run `npm run relay`. The relay must
// be listening on ws://localhost:8081/.
//
// Run from repo root: node tools/test-relay.mjs
// Exits 0 if the model speaks "OK" within 30s, exits 1 otherwise.

import WebSocket from 'ws';

const RELAY = process.env.RELAY_URL || 'ws://localhost:8081/';

const ws = new WebSocket(RELAY, { handshakeTimeout: 10_000 });
let transcript = '';
const t0 = Date.now();

const timeout = setTimeout(() => {
  console.error(`FAIL: timed out after 30s. Transcript so far: ${JSON.stringify(transcript)}`);
  ws.terminate();
  process.exit(1);
}, 30_000);

ws.on('open', () => {
  console.log(`[relay-test] OPEN after ${Date.now() - t0}ms`);
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      instructions: 'Reply with exactly the two letters: OK',
      modalities: ['text'],
      turn_detection: null,
    },
  }));
  ws.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Say OK' }],
    },
  }));
  ws.send(JSON.stringify({ type: 'response.create' }));
});

ws.on('message', (buf) => {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch {
    return;
  }
  if (msg.type === 'response.text.delta' && typeof msg.delta === 'string') {
    transcript += msg.delta;
  }
  if (msg.type === 'response.audio_transcript.delta' && typeof msg.delta === 'string') {
    transcript += msg.delta;
  }
  if (msg.type === 'response.done' || msg.type === 'response.text.done') {
    if (transcript.toUpperCase().includes('OK')) {
      clearTimeout(timeout);
      console.log(`PASS: model replied with "${transcript.trim()}"`);
      ws.close();
      process.exit(0);
    }
    clearTimeout(timeout);
    console.error(`FAIL: response done but transcript did not contain OK: ${JSON.stringify(transcript)}`);
    ws.close();
    process.exit(1);
  }
  if (msg.type === 'error') {
    clearTimeout(timeout);
    console.error('FAIL: relay returned error event:', JSON.stringify(msg.error));
    ws.close();
    process.exit(1);
  }
});

ws.on('close', (code) => {
  console.log(`[relay-test] CLOSE code=${code} after ${Date.now() - t0}ms`);
});

ws.on('error', (err) => {
  clearTimeout(timeout);
  console.error('FAIL: socket error:', err.message);
  process.exit(1);
});
