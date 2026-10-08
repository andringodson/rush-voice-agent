// GET  /api/tts?text=…&lang=en&emotion=cheerful[&gender=male][&voice=xx-XX-NameNeural]
// POST /api/tts { text, lang, emotion, gender, voice }
// Streams MP3 (24 kHz mono) from Microsoft's neural voices with emotion prosody.
// GET responses are CDN-cacheable, so repeated phrases (alerts, greetings) are instant.

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { EMOTIONS, cors, pickVoices, rateLimited, readJson } from './_lib.js';

export const config = { maxDuration: 30 };
const MAX_CHARS = 700;

async function synthesize(voice, text, prosody) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, prosody);
  return { tts, audioStream };
}

export default async function handler(req, res) {
  if (!cors(req, res)) return;
  if (rateLimited(req, 90)) {
    res.statusCode = 429;
    res.end('slow down');
    return;
  }
  const q = req.method === 'POST' ? await readJson(req) : Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const text = String(q.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!text) {
    res.statusCode = 400;
    res.end('text required');
    return;
  }
  const prosody = EMOTIONS[q.emotion] || EMOTIONS.neutral;
  const voices = pickVoices({ lang: String(q.lang || 'en').slice(0, 2), gender: q.gender === 'male' ? 'male' : 'female', voice: q.voice });

  let lastErr;
  for (const voice of voices) {
    try {
      const { tts, audioStream } = await synthesize(voice, text, prosody);
      let started = false;
      for await (const chunk of audioStream) {
        if (!started) {
          started = true;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('X-Voice', voice);
          res.setHeader('Cache-Control', req.method === 'GET' ? 'public, max-age=86400, s-maxage=2592000, immutable' : 'no-store');
        }
        res.write(chunk);
      }
      tts.close();
      if (started) {
        res.end();
        return;
      }
      lastErr = new Error('empty audio');
    } catch (err) {
      lastErr = err;
      if (res.headersSent) {
        res.end();
        return;
      }
    }
  }
  res.statusCode = 502;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'tts_unavailable', detail: String(lastErr?.message || lastErr) }));
}
