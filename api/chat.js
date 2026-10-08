// POST /api/chat { question, context?, lang?, persona?, history?: [{role, content}] }
// → { answer, emotion, provider }
// Short, grounded, spoken-style replies for voice calls.
//
// Providers are tried in order; set any of these env vars on Vercel to enable one
// (all have free tiers that need no credit card):
//   GEMINI_API_KEY      Google AI Studio            (model: GEMINI_MODEL, default gemini-2.5-flash)
//   GROQ_API_KEY        console.groq.com            (model: GROQ_MODEL,   default llama-3.3-70b-versatile)
//   OPENROUTER_API_KEY  openrouter.ai, ":free" models (model: OPENROUTER_MODEL)
// Without any key it falls back to Pollinations' anonymous endpoint (best effort).

import { cors, rateLimited, readJson } from './_lib.js';

export const config = { maxDuration: 30 };
const EMOTIONS = ['neutral', 'friendly', 'cheerful', 'excited', 'calm', 'empathetic', 'urgent'];

function systemPrompt({ lang = 'English', persona, context }) {
  return [
    persona || 'You are Rush, a warm, upbeat voice assistant on a phone call.',
    `Speak ${lang}. This is a VOICE call: reply in 1-3 short spoken sentences, no lists, no markdown, no emojis.`,
    'Sound human: contractions, a natural opener when it fits ("Sure!", "Hmm, let me see…"), but never ramble.',
    context ? 'Use ONLY the live data below for facts. If it does not answer the question, say so briefly. Never invent numbers or places.' : '',
    'End your reply with a tag on its own line: EMOTION=<one of neutral|friendly|cheerful|excited|calm|empathetic|urgent> matching how a caring human would sound.',
    context ? `\nLive data:\n${String(context).slice(0, 5000)}` : '',
  ].filter(Boolean).join('\n');
}

function parse(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/EMOTION\s*=\s*(\w+)/i);
  const emotion = m && EMOTIONS.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
  const answer = text.replace(/\n?\s*EMOTION\s*=\s*\w+\s*$/i, '').replace(/[*_#`]/g, '').trim();
  return { answer, emotion };
}

async function openAICompatible(url, key, model, messages, extraHeaders = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 220 }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 140)}`);
  return (await res.json()).choices?.[0]?.message?.content;
}

const PROVIDERS = [
  ['gemini', (m) => process.env.GEMINI_API_KEY && openAICompatible('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-2.5-flash', m)],
  ['groq', (m) => process.env.GROQ_API_KEY && openAICompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', m)],
  ['openrouter', (m) => process.env.OPENROUTER_API_KEY && openAICompatible('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free', m, { 'X-Title': 'rush-voice-agent' })],
  ['gateway', (m) => process.env.AI_GATEWAY_API_KEY && openAICompatible('https://ai-gateway.vercel.sh/v1/chat/completions', process.env.AI_GATEWAY_API_KEY, process.env.AI_MODEL || 'google/gemini-2.5-flash', m)],
  ['pollinations', async (m) => {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages: m, temperature: 0.5, private: true, referrer: 'rush-voice-agent' }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()).choices?.[0]?.message?.content;
  }],
];

export default async function handler(req, res) {
  if (!cors(req, res)) return;
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'POST only' }));
    return;
  }
  if (rateLimited(req, 30)) {
    res.statusCode = 429;
    res.end(JSON.stringify({ error: 'slow down' }));
    return;
  }
  const body = await readJson(req);
  const question = String(body.question || '').slice(0, 600).trim();
  if (!question) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'question required' }));
    return;
  }
  const history = Array.isArray(body.history) ? body.history.slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 600) })) : [];
  const messages = [{ role: 'system', content: systemPrompt({ lang: String(body.lang || 'English').slice(0, 40), persona: body.persona && String(body.persona).slice(0, 600), context: body.context }) }, ...history, { role: 'user', content: question }];

  const errors = [];
  for (const [name, fn] of PROVIDERS) {
    try {
      const raw = await fn(messages);
      if (!raw) continue;
      const { answer, emotion } = parse(raw);
      if (answer) {
        res.end(JSON.stringify({ answer, emotion, provider: name }));
        return;
      }
    } catch (err) {
      errors.push(`${name}: ${String(err.message || err).slice(0, 120)}`);
    }
  }
  res.statusCode = 503;
  res.end(JSON.stringify({ error: 'no_provider', detail: errors, hint: 'Set GEMINI_API_KEY (free, no card) on the Vercel project to enable open-ended answers.' }));
}
