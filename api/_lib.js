// Shared helpers for the serverless API: voices, emotion prosody, CORS, rate limiting.

export const VOICES = {
  en: { female: ['en-IN-NeerjaExpressiveNeural', 'en-IN-NeerjaNeural', 'en-US-AvaMultilingualNeural'], male: ['en-IN-PrabhatNeural', 'en-US-AndrewMultilingualNeural'] },
  hi: { female: ['hi-IN-SwaraNeural'], male: ['hi-IN-MadhurNeural'] },
  ta: { female: ['ta-IN-PallaviNeural'], male: ['ta-IN-ValluvarNeural'] },
  ml: { female: ['ml-IN-SobhanaNeural'], male: ['ml-IN-MidhunNeural'] },
  kn: { female: ['kn-IN-SapnaNeural'], male: ['kn-IN-GaganNeural'] },
  te: { female: ['te-IN-ShrutiNeural'], male: ['te-IN-MohanNeural'] },
  bn: { female: ['bn-IN-TanishaaNeural'], male: ['bn-IN-BashkarNeural'] },
  mr: { female: ['mr-IN-AarohiNeural'], male: ['mr-IN-ManoharNeural'] },
  gu: { female: ['gu-IN-DhwaniNeural'], male: ['gu-IN-NiranjanNeural'] },
  ur: { female: ['ur-IN-GulNeural'], male: ['ur-IN-SalmanNeural'] },
};

// Emotion → prosody. Tuned by ear on the Indian neural voices: small pitch and
// rate moves read as feeling; big ones read as robotic.
export const EMOTIONS = {
  neutral: { rate: '+0%', pitch: '+0Hz', volume: '+0%' },
  friendly: { rate: '+3%', pitch: '+5Hz', volume: '+0%' },
  cheerful: { rate: '+6%', pitch: '+9Hz', volume: '+2%' },
  excited: { rate: '+11%', pitch: '+13Hz', volume: '+4%' },
  calm: { rate: '-5%', pitch: '-2Hz', volume: '-2%' },
  empathetic: { rate: '-9%', pitch: '-4Hz', volume: '-4%' },
  urgent: { rate: '+10%', pitch: '+3Hz', volume: '+8%' },
  thinking: { rate: '-4%', pitch: '+0Hz', volume: '-6%' },
};

export function pickVoices({ lang = 'en', gender = 'female', voice }) {
  if (voice && /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/.test(voice)) return [voice];
  const set = VOICES[lang] || VOICES.en;
  return [...(set[gender] || set.female), ...(VOICES.en.female.slice(1))];
}

export function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = req.headers.origin || '';
  const ok = allowed.includes('*') || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  res.setHeader('Access-Control-Allow-Origin', ok ? origin || '*' : allowed[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return false;
  }
  if (!ok) {
    res.statusCode = 403;
    res.end('origin not allowed');
    return false;
  }
  return true;
}

// Best-effort per-instance limiter (serverless instances are short-lived; this
// stops runaway loops from one client, not a determined attacker).
const hits = new Map();
export function rateLimited(req, limit = 60, windowMs = 60000) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > windowMs) { h.n = 0; h.t = now; }
  h.n += 1;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.n > limit;
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
