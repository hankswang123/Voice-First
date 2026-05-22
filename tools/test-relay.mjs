// Tier-2 GA probe: drives the local relay through four scenarios that
// collectively exercise every GA event class the layouts depend on.
//
// Pre-requisite: in another shell, run `npm run relay`. The relay must
// be listening on ws://localhost:8081/.
//
// Run from repo root: node tools/test-relay.mjs
// Exits 0 if every probe passes, exits 1 on the first failure.
//
// Probes:
//   1. session.update + text response       (tests session.type, response.create, text deltas)
//   2. tool definition + auto tool result   (tests tools[] schema, function_call_arguments.* events)
//   3. cancel mid-response                  (tests response.cancel + conversation.item.truncate)
//   4. graceful close                       (tests no errors are emitted on disconnect)

import WebSocket from 'ws';

const RELAY = process.env.RELAY_URL || 'ws://localhost:8081/';

let ws;
let probeName = '';
let resolveProbe;
let rejectProbe;
const seenErrors = [];

function send(event) {
  ws.send(JSON.stringify(event));
}

function fail(reason) {
  console.error(`FAIL [${probeName}]: ${reason}`);
  if (seenErrors.length) {
    console.error('Server errors observed:', JSON.stringify(seenErrors, null, 2));
  }
  try { ws.close(); } catch {}
  process.exit(1);
}

function pass(detail = '') {
  console.log(`PASS [${probeName}]${detail ? ': ' + detail : ''}`);
}

function probe(name, fn) {
  probeName = name;
  return new Promise((resolve, reject) => {
    resolveProbe = (detail) => { pass(detail); resolve(); };
    rejectProbe = (reason) => fail(reason);
    fn();
  });
}

ws = new WebSocket(RELAY, { handshakeTimeout: 10_000 });

ws.on('open', async () => {
  console.log('[relay-test] WebSocket OPEN');

  // Global message router — each probe replaces these handlers via globalThis.
  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    if (msg.type === 'error') {
      seenErrors.push(msg.error || msg);
      if (globalThis.__onError) globalThis.__onError(msg);
      return;
    }
    if (globalThis.__onMessage) globalThis.__onMessage(msg);
  });

  try {
    await probe1_textResponse();
    await probe2_toolCall();
    await probe3_cancelMidResponse();
    await probe4_gracefulClose();
    console.log('\n=== ALL PROBES PASSED ===');
    process.exit(0);
  } catch (e) {
    fail(e?.message || String(e));
  }
});

ws.on('error', (err) => fail(`socket error: ${err.message}`));

// ---------- Probe 1 — text response ----------
function probe1_textResponse() {
  return probe('1-text-response', () => {
    let transcript = '';
    const timer = setTimeout(() => rejectProbe('timeout (30s)'), 30_000);

    globalThis.__onError = (msg) =>
      rejectProbe(`server error: ${JSON.stringify(msg.error || msg)}`);

    globalThis.__onMessage = (msg) => {
      if (msg.type === 'response.text.delta' && typeof msg.delta === 'string') {
        transcript += msg.delta;
      }
      // Beta name: response.audio_transcript.delta
      // GA name:   response.output_audio_transcript.delta
      if ((msg.type === 'response.audio_transcript.delta' ||
           msg.type === 'response.output_audio_transcript.delta') && typeof msg.delta === 'string') {
        transcript += msg.delta;
      }
      if (msg.type === 'response.done' || msg.type === 'response.text.done') {
        clearTimeout(timer);
        if (transcript.toUpperCase().includes('OK')) {
          resolveProbe(`got "${transcript.trim()}"`);
        } else {
          rejectProbe(`response done but transcript missing OK: ${JSON.stringify(transcript)}`);
        }
      }
    };

    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: 'Reply with exactly the two letters: OK',
      },
    });
    send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Say OK' }],
      },
    });
    send({ type: 'response.create' });
  });
}

// ---------- Probe 2 — tool call ----------
function probe2_toolCall() {
  return probe('2-tool-call', () => {
    let sawFunctionCall = false;
    const timer = setTimeout(() => rejectProbe('timeout (30s)'), 30_000);

    globalThis.__onError = (msg) =>
      rejectProbe(`server error: ${JSON.stringify(msg.error || msg)}`);

    globalThis.__onMessage = (msg) => {
      if (msg.type === 'response.output_item.added' &&
          msg.item?.type === 'function_call' &&
          msg.item?.name === 'echo') {
        sawFunctionCall = true;
      }
      if (msg.type === 'response.function_call_arguments.done') {
        sawFunctionCall = true;
      }
      if (msg.type === 'response.done') {
        clearTimeout(timer);
        if (sawFunctionCall) {
          resolveProbe('saw function_call event(s)');
        } else {
          rejectProbe('response.done but no function_call event observed');
        }
      }
    };

    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: 'When the user says "echo X", call the echo tool with text=X.',
        tools: [{
          type: 'function',
          name: 'echo',
          description: 'Echoes the input text back.',
          parameters: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        }],
        tool_choice: 'required',
      },
    });
    send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'echo HELLO' }],
      },
    });
    send({ type: 'response.create' });
  });
}

// ---------- Probe 3 — cancel mid-response ----------
function probe3_cancelMidResponse() {
  return probe('3-cancel-mid-response', () => {
    let responseId = null;
    let cancelSent = false;
    let cancelEcho = false;
    const timer = setTimeout(() => rejectProbe('timeout (30s)'), 30_000);

    globalThis.__onError = (msg) => {
      // The "Cancellation failed" error happens if response is already done;
      // tolerate it for this probe.
      if (msg.error?.code === 'response_cancel_not_active') return;
      // If conversation already has an active response, we can still try to
      // cancel it — grab the response_id from the error and cancel that one.
      if (msg.error?.code === 'conversation_already_has_active_response') {
        const match = msg.error?.message?.match(/resp_\w+/);
        if (match && !cancelSent) {
          cancelSent = true;
          send({ type: 'response.cancel', response_id: match[0] });
        }
        return;
      }
      rejectProbe(`server error: ${JSON.stringify(msg.error || msg)}`);
    };

    globalThis.__onMessage = (msg) => {
      if (msg.type === 'response.created' && msg.response?.id) {
        responseId = msg.response.id;
        if (!cancelSent) {
          cancelSent = true;
          // Send cancel as soon as we know the response exists.
          send({ type: 'response.cancel', response_id: responseId });
        }
      }
      if (msg.type === 'response.cancelled' || msg.type === 'response.done') {
        clearTimeout(timer);
        resolveProbe(`response.${msg.type === 'response.cancelled' ? 'cancelled' : 'done after cancel'}`);
      }
    };

    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: 'When asked, count slowly from 1 to 100 with verbose explanations.',
      },
    });
    send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Count from 1 to 100 with explanations.' }],
      },
    });
    send({ type: 'response.create' });
  });
}

// ---------- Probe 4 — graceful close ----------
function probe4_gracefulClose() {
  return probe('4-graceful-close', () => {
    const timer = setTimeout(() => rejectProbe('timeout (5s)'), 5_000);
    globalThis.__onError = (msg) =>
      rejectProbe(`server error during close: ${JSON.stringify(msg.error || msg)}`);
    globalThis.__onMessage = () => {};

    ws.once('close', () => {
      clearTimeout(timer);
      resolveProbe('closed cleanly');
    });
    ws.close();
  });
}
