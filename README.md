# rush-voice-agent

**Human-sounding, real-time voice calls for any web app — free.**

- 🎙️ **Neural voices** (Microsoft's natural voices) in English (India) and 9 Indian languages — Hindi, Tamil, Malayalam, Kannada, Telugu, Bengali, Marathi, Gujarati, Urdu — female and male, plus an *expressive* English voice.
- 💬 **Emotion-aware delivery**: cheerful, excited, friendly, calm, empathetic, urgent, thinking — picked from what's being said (or by your AI), applied as tuned pitch/rate/volume.
- 🧑 **Human touch**: natural openers ("Good news!", "Heads up —"), spoken numbers, breath pauses, a "Hmm, let me check" filler when your brain is slow.
- ⚡ **Real-time**: replies stream sentence by sentence (next sentence synthesizes while the current one plays); ~0.5–1 s to first audio; repeated phrases are CDN-cached and instant.
- ✋ **Barge-in**: talk over the agent and it stops and listens, like a real call (energy VAD with an adaptive noise floor on an echo-cancelled mic stream).
- 🛟 **Never silent**: neural voice → browser voice fallback; mic denied → typed replies; flaky provider → cooldown and skip.
- 📞 Ringtone + earcons synthesized with Web Audio (no files).

**Live demo:** https://rush-voice-agent.vercel.app · **Used in:** [Rushcast](https://andringodson.github.io/Hackathon-Ick-A-Thon/) (Ick-a-thon 2026, Team Error404)

## Use it in your project

```html
<script type="module">
  import { VoiceAgent, createTTS } from 'https://cdn.jsdelivr.net/gh/andringodson/rush-voice-agent@1.0.2/src/index.js';

  const agent = new VoiceAgent({
    tts: createTTS({ endpoint: 'https://rush-voice-agent.vercel.app/api/tts' }), // or your own deployment
    lang: 'en',                         // en hi ta ml kn te bn mr gu ur
    brain: async (question, { history }) => {
      // Return a string or { text, emotion }. Call your own logic or LLM here.
      return { text: `You said: ${question}`, emotion: 'friendly' };
    },
  });
  agent.on('state', (s) => console.log(s));                     // speaking | listening | thinking | ended
  agent.on('caption', ({ who, text, interim, emotion }) => {});   // live transcript
  agent.on('typed-mode', () => {/* show a text box; call agent.reply(text) */});

  document.querySelector('#call').onclick = () => agent.start("Hi! How can I help?", { emotion: 'friendly' });
</script>
```

Just speak a line (alerts, notifications):

```js
import { createTTS, detectEmotion, humanize } from '…/src/index.js';
const tts = createTTS({ endpoint: '…/api/tts' });
const text = 'Heads up, the canteen is packed right now.';
const clip = await tts.prepare(humanize(text, 'urgent'), { lang: 'en', emotion: detectEmotion(text) });
await clip.play();
```

## API (deploy your own on Vercel's free Hobby plan)

`vercel deploy` this repo. Endpoints:

| Endpoint | What |
| --- | --- |
| `GET /api/tts?text=&lang=en&emotion=cheerful&gender=female` | MP3 stream, CDN-cacheable. `voice=xx-XX-NameNeural` to pick any of 300+ voices |
| `POST /api/chat {question, context?, lang?, persona?, history?}` | `{answer, emotion, provider}` — short spoken-style replies grounded in `context` |
| `GET /api/health` | Synthesizes a probe phrase; reports TTS latency and enabled chat providers |

Chat providers (set any env var; all have free tiers **without a credit card**): `GEMINI_API_KEY` (Google AI Studio), `GROQ_API_KEY`, `OPENROUTER_API_KEY`. Without a key it tries Pollinations' anonymous endpoint (best effort). `ALLOWED_ORIGINS` (comma-separated) restricts CORS; default `*`.

## How it sounds human (the tuning)

| Emotion | Rate | Pitch | Volume | Used for |
| --- | --- | --- | --- | --- |
| cheerful | +6% | +9 Hz | +2% | good news, quiet places |
| excited | +11% | +13 Hz | +4% | great news |
| friendly | +3% | +5 Hz | 0 | greetings, thanks |
| calm | −5% | −2 Hz | −2% | forecasts, facts |
| empathetic | −9% | −4 Hz | −4% | closed, sorry, errors |
| urgent | +10% | +3 Hz | +8% | rushes, packed, alerts |
| thinking | −4% | 0 | −6% | fillers |

Small moves read as feeling; big ones read as robotic. The English voice defaults to *Neerja Expressive*.

## Honest limits

- The neural voices come from Microsoft's public Read-Aloud service via the MIT-licensed [`msedge-tts`](https://github.com/Migushthe2nd/MsEdgeTTS); it's free and unofficial, so the browser-voice fallback is always on.
- Speech recognition is the browser's (Chrome, Edge, Safari). Firefox users get typed replies.
- This is not a telephone-network (PSTN) dialer; real phone numbers need a paid telecom API.

MIT © Team Error404
