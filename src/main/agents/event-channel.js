/**
 * agents/event-channel.js — Ortak streaming olay kanalı (ADR-005, F2.2)
 *
 * Dört provider'ın SSE ayrıştırma kodunu tek olay kümesine map'ler:
 *   token      — modelden gelen metin parçası
 *   thinking   — reasoning/extended thinking içeriği
 *   tool-call  — ajanın araç çağrısı (OpenAI tool_calls / Anthropic tool_use /
 *                Gemini functionCall / Ollama + MCP delegasyonu)
 *   tool-result— çalıştırılmış aracın sonucu (lokal, modele geri bildirim)
 *   error      — akış hatası
 *   done       — akış tamamlandı
 *
 * Renderer tarafı bu olayları event:tool-call / event:thinking gibi
 * chat-chunk benzeri event'ler olarak alır (main.js adapter'ı görevi).
 */

'use strict';

const { EventEmitter } = require('events');

const VALID_EVENTS = new Set(['token', 'thinking', 'tool-call', 'tool-result', 'error', 'done']);

class EventChannel extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
    this.thinkingBuffer = '';
    this.toolCallBuffers = new Map(); // id -> {name,args}
  }

  push(eventType, payload = {}) {
    if (!VALID_EVENTS.has(eventType)) {
      console.warn(`[EventChannel] bilinmeyen olay tipi: ${eventType}`);
      return;
    }
    if (eventType === 'thinking') {
      this.thinkingBuffer += typeof payload.delta === 'string' ? payload.delta : '';
    }
    if (eventType === 'tool-call' && payload.id) {
      const buf = this.toolCallBuffers.get(payload.id) || { name: '', args: '' };
      if (payload.name) buf.name = payload.name;
      if (payload.args) buf.args += payload.args;
      this.toolCallBuffers.set(payload.id, buf);
    }
    if (eventType === 'done') {
      this.thinkingBuffer = '';
    }
    this.emit(eventType, { sessionId: this.sessionId, ...payload });
  }

  clear() {
    this.removeAllListeners();
    this.toolCallBuffers.clear();
    this.thinkingBuffer = '';
  }
}

/* ------------------------------------------------------------------ */
/* Provider adapter'ları: chunk -> channel.push                        */
/* ------------------------------------------------------------------ */

function openaiAdapter(channel) {
  return function onOpenAIChunk(chunk) {
    try {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return;
      if (typeof delta.content === 'string' && delta.content) {
        channel.push('token', { delta: delta.content });
      }
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
        channel.push('thinking', { delta: delta.reasoning_content });
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const id = tc.id || '__default';
          channel.push('tool-call', {
            id,
            name: tc.function?.name || '',
            args: typeof tc.function?.arguments === 'string' ? tc.function.arguments : '',
          });
        }
      }
      const finish = chunk.choices?.[0]?.finish_reason;
      if (finish === 'stop' || finish === 'tool_calls' || finish === 'length') {
        channel.push('done', { finish });
      }
    } catch {
      /* bozuk chunk sessizce atlanır */
    }
  };
}

function anthropicAdapter(channel) {
  return function onAnthropicChunk(chunk) {
    try {
      const type = chunk.type;
      if (type === 'content_block_delta' && chunk.delta) {
        if (chunk.delta.type === 'text_delta' && chunk.delta.text) {
          channel.push('token', { delta: chunk.delta.text });
        }
        if (chunk.delta.type === 'thinking_delta' && chunk.delta.thinking) {
          channel.push('thinking', { delta: chunk.delta.thinking });
        }
        if (chunk.delta.type === 'input_json_delta' && chunk.delta.partial_json) {
          // tool_use id'si content_block_start'ta gelir; id yoksa index kullan
          channel.push('tool-call', {
            id: `block_${chunk.index ?? 0}`,
            name: '',
            args: chunk.delta.partial_json,
          });
        }
      }
      if (type === 'content_block_start' && chunk.content_block) {
        const cb = chunk.content_block;
        if (cb.type === 'tool_use') {
          channel.push('tool-call', { id: cb.id || `block_${chunk.index ?? 0}`, name: cb.name || '', args: '' });
        }
        if (cb.type === 'thinking') {
          channel.push('thinking', { delta: '' });
        }
      }
      if (type === 'message_stop') {
        channel.push('done', { finish: 'stop' });
      }
      if (type === 'message_delta' && chunk.delta?.stop_reason) {
        channel.push('done', { finish: chunk.delta.stop_reason });
      }
      if (type === 'error') {
        channel.push('error', { msg: chunk.error?.message || 'Anthropic akış hatası' });
      }
    } catch {
      /* ignore */
    }
  };
}

function geminiAdapter(channel) {
  return function onGeminiChunk(chunk) {
    try {
      const cand = chunk.candidates?.[0];
      if (cand?.content?.parts) {
        for (const part of cand.content.parts) {
          if (typeof part.text === 'string' && part.text) {
            channel.push('token', { delta: part.text });
          }
          if (part.thought) {
            channel.push('thinking', { delta: '' });
          }
          if (part.functionCall) {
            channel.push('tool-call', {
              id: part.functionCall.name || '__gemini_fc',
              name: part.functionCall.name || '',
              args: JSON.stringify(part.functionCall.args || {}),
            });
          }
        }
      }
      if (cand?.finishReason && cand.finishReason !== 'STOP' === false) {
        // noop
      }
      const finish = cand?.finishReason;
      if (finish === 'STOP' || finish === 'MAX_TOKENS' || finish === 'SAFETY') {
        channel.push('done', { finish: finish === 'STOP' ? 'stop' : finish.toLowerCase() });
      }
    } catch {
      /* ignore */
    }
  };
}

function ollamaAdapter(channel) {
  return function onOllamaChunk(chunk) {
    try {
      if (typeof chunk.message?.content === 'string' && chunk.message.content) {
        channel.push('token', { delta: chunk.message.content });
      }
      if (chunk.done === true) {
        channel.push('done', { finish: 'stop' });
      }
      if (chunk.error) {
        channel.push('error', { msg: chunk.error });
      }
    } catch {
      /* ignore */
    }
  };
}

module.exports = {
  EventChannel,
  VALID_EVENTS,
  openaiAdapter,
  anthropicAdapter,
  geminiAdapter,
  ollamaAdapter,
};
