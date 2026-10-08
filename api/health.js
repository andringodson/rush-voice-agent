// GET /api/health → { ok, tts, chatConfigured, voices }
// Used by uptime checks: synthesizes one tiny phrase to prove the voice path works.

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { VOICES, cors } from './_lib.js';

export default async function handler(req, res) {
  if (!cors(req, res)) return;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const started = Date.now();
  let tts = false;
  try {
    const t = new MsEdgeTTS();
    await t.setMetadata('en-IN-NeerjaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = t.toStream('ok');
    let bytes = 0;
    for await (const c of audioStream) bytes += c.length;
    t.close();
    tts = bytes > 500;
  } catch {
    tts = false;
  }
  res.statusCode = tts ? 200 : 503;
  res.end(JSON.stringify({ ok: tts, tts, ttsMs: Date.now() - started, chat: ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'AI_GATEWAY_API_KEY'].filter((k) => process.env[k]).map((k) => k.split('_')[0].toLowerCase()).concat('pollinations'), languages: Object.keys(VOICES) }));
}
