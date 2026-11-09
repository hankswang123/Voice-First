/**
 * Pi Agent client — talks to the local Pi Web API (http://127.0.0.1:30141)
 * through the Express proxy at /api/pi/* to avoid CORS issues.
 *
 * Usage:
 *   const agent = new PiAgent();
 *   const sessionId = await agent.createSession("Hello!");
 *   agent.onDelta = (text) => appendToUI(text);
 *   agent.onSettled = () => markDone();
 *   agent.streamEvents(sessionId);
 */

const PI_PROXY_BASE = '/api/pi';

export class PiAgent {
  constructor() {
    /** @type {string|null} */
    this.sessionId = null;
    /** @type {EventSource|null} */
    this.eventSource = null;

    // Callbacks — set by the consumer
    /** Called with each text delta chunk */
    this.onDelta = (_delta) => {};
    /** Called when the full assistant message is done */
    this.onMessageEnd = (_fullText) => {};
    /** Called when the agent has fully settled (no more work) */
    this.onSettled = () => {};
    /** Called on tool execution updates */
    this.onToolUpdate = (_toolName, _partialResult) => {};
    /** Called on errors */
    this.onError = (_error) => {};
    /** Called when streaming connects */
    this.onConnected = () => {};
  }

  /**
   * Create a new Pi agent session and send the first prompt.
   * @param {string} message
   * @param {string} [cwd]
   * @returns {Promise<string>} sessionId
   */
  async createSession(message, cwd) {
    const resp = await fetch(`${PI_PROXY_BASE}/agent/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cwd: cwd || 'C:/Users/I058700/Repo/Voice-First',
        type: 'prompt',
        message,
      }),
    });
    const data = await resp.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to create Pi agent session');
    }
    this.sessionId = data.sessionId;
    return data.sessionId;
  }

  /**
   * Send a follow-up prompt to an existing session.
   * @param {string} message
   * @returns {Promise<void>}
   */
  async sendMessage(message) {
    if (!this.sessionId) throw new Error('No active Pi session');
    const resp = await fetch(`${PI_PROXY_BASE}/agent/${this.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'prompt', message }),
    });
    const data = await resp.json();
    if (!data.success) {
      // Session might be busy — try as follow-up
      if (data.code === 'prompt_rejected') {
        const resp2 = await fetch(`${PI_PROXY_BASE}/agent/${this.sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'prompt',
            message,
            streamingBehavior: 'followUp',
          }),
        });
        const data2 = await resp2.json();
        if (!data2.success) throw new Error(data2.error || 'Failed to send message');
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    }
  }

  /**
   * Start streaming SSE events from the agent.
   * Calls onDelta/onMessageEnd/onSettled/onToolUpdate as events arrive.
   */
  streamEvents() {
    if (!this.sessionId) return;
    this.closeStream();

    const url = `${PI_PROXY_BASE}/agent/${this.sessionId}/events`;
    this.eventSource = new EventSource(url);

    let assistantText = '';

    this.eventSource.onopen = () => {
      this.onConnected();
    };

    this.eventSource.onmessage = (event) => {
      if (!event.data || event.data.trim() === '') return;

      let record;
      try {
        record = JSON.parse(event.data);
      } catch {
        return;
      }

      const type = record.type;

      if (type === 'message_update') {
        const update = record.assistantMessageEvent;
        if (!update) return;

        if (update.type === 'text_delta') {
          assistantText += update.delta;
          this.onDelta(update.delta);
        } else if (update.type === 'text_done') {
          // Full text available
        } else if (update.type === 'message_end') {
          this.onMessageEnd(assistantText);
          assistantText = '';
        }
      } else if (type === 'tool_execution_update') {
        const toolName = record.toolName || '';
        const partial = record.partialResult;
        this.onToolUpdate(toolName, partial);
      } else if (type === 'agent_settled') {
        this.onSettled();
      } else if (type === 'error') {
        this.onError(record.error || record.message || 'Unknown error');
      }
    };

    this.eventSource.onerror = () => {
      // SSE auto-reconnects; only fire error if connection dies completely
    };
  }

  /**
   * Close the SSE event stream.
   */
  closeStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Abort the current agent run.
   */
  async abort() {
    if (!this.sessionId) return;
    await fetch(`${PI_PROXY_BASE}/agent/${this.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'abort' }),
    });
  }

  /**
   * Clean up — close stream and reset state.
   */
  dispose() {
    this.closeStream();
    this.sessionId = null;
  }
}
