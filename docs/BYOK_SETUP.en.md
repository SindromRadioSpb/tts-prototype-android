# API Key Setup (BYOK)

LinguistPro uses a **BYOK — Bring Your Own Key** model. You create keys yourself in your own Google account and enter them in this browser. The LinguistPro server does not store your keys and does not use shared owner keys — this protects quotas and gives you full control over costs.

This guide is in three languages. RU: `/docs/BYOK_SETUP.md`. HE: `/docs/BYOK_SETUP.he.md`.


## What works WITHOUT keys

Some features are available immediately, no setup needed:

- **Browser TTS (system_fallback)** — built-in OS voice. Quality is lower than Google Cloud TTS, but it works offline and for free. Hebrew support depends on platform.
- **Google Translate (free)** — the "Google Translate" provider in translation settings. Free, but has Google's hard rate limits and occasionally returns 429.
- **MADLAD (local)** — if you run the Python `ai-local` sidecar on 127.0.0.1:8765, local translation works without internet or quota.
- **Transliteration and niqqud (vowel pointing)** — local libraries, no key needed.
- **Library, SRS cards, notes, ZIP export** — entirely in the browser, no keys.

If this is enough for you, the rest can be skipped.


## Which keys you need for full functionality

| What the key unlocks                       | Key                  | Google service                  | Where to enter in UI                              |
|--------------------------------------------|----------------------|---------------------------------|---------------------------------------------------|
| Gemini AI translation (smart segmentation) | Gemini API Key       | Google AI Studio                | Translation settings → "🔑 Gemini API Key"         |
| Premium TTS (Google Cloud, WaveNet voices) | GCP TTS API Key      | Google Cloud Text-to-Speech     | TTS settings → "🔑 GCP TTS API Key"                |
| Premium translation (Cloud Translation)    | GCP Translate Key    | Google Cloud Translation        | Translation settings → "🔑 GCP Translate API Key"  |

All three keys have the format `AIzaSy…` and take 5–10 minutes to create.

**Can one key be used for all three services?** Technically yes, if you allow it for all three APIs. But that's poor security practice. Better to create a separate key per service and restrict it to one API — a leak of one key won't affect the others.

**Cost:** Google has generous free quotas:
- Gemini: ~50 requests per day on the flash model.
- Cloud Text-to-Speech: 1 million characters per month (Standard) / 4 million (WaveNet).
- Cloud Translation: 500,000 characters per month.

For individual language learning this is usually plenty. Quota overage shows as an error, not an automatic bill.


## Step 1: Gemini API Key

This key powers AI translation with segmentation and annotations.

1. Open `https://aistudio.google.com/app/apikey` and sign in to your Google account.
2. Click **"Create API key"**.
3. Pick a Google project from the list, or click "Create new project" — creating a project is free.
4. Copy the displayed key. It looks like `AIzaSy...` (about 40 characters).
5. In LinguistPro: open **"Translation Settings"** → provider **"Gemini (legacy)"** → the **"🔑 Gemini API Key"** field appears → paste the key → **"💾 Save"**.

Done. The key is stored only in this browser (localStorage) and is sent to the server over HTTPS only when you trigger a translation.


## Step 2: GCP TTS API Key (Google Cloud Text-to-Speech)

This key unlocks premium TTS (WaveNet, Standard voices). Without it, TTS falls back to the browser's built-in voice.

1. Open `https://console.cloud.google.com/` and sign in to your Google account.
2. Create a new project if you don't have one: project dropdown at the top → **"New Project"** → any name → **"Create"**.
3. In the left menu: **"APIs & Services"** → **"Library"**. Find **"Cloud Text-to-Speech API"** → open → **"Enable"**.
4. Left menu: **"APIs & Services"** → **"Credentials"**.
5. Top of page: **"+ Create credentials"** → **"API key"**.
6. A modal shows the key `AIzaSy...` — copy it.
7. Immediately click **"Edit API key"** (pencil icon on the key row) → **"API restrictions"** section → choose **"Restrict key"** → check only **"Cloud Text-to-Speech API"** → **"Save"**. This is critical: an unrestricted key can be used for all your Google Cloud services, which is dangerous if leaked.
8. In LinguistPro: open **"TTS Settings"** → provider **"Online TTS"** → the **"🔑 GCP TTS API Key"** field appears → paste → **"💾 Save"**.

**New to Google Cloud?** Google may require you to confirm a billing account. Inside the free quota you won't be charged; the billing account is required for "trust" only.


## Step 3: GCP Translate API Key (Google Cloud Translation)

This key powers the **"GCP Translate (API)"** provider in translation settings. If "Google Translate (free)" or local MADLAD is enough, you can skip this step.

1. Open `https://console.cloud.google.com/` (same project as for TTS).
2. **"APIs & Services"** → **"Library"** → find **"Cloud Translation API"** → **"Enable"**.
3. **"APIs & Services"** → **"Credentials"** → **"+ Create credentials"** → **"API key"**.
4. Copy the new key.
5. **"Edit API key"** → **"API restrictions"** → **"Restrict key"** → check only **"Cloud Translation API"** → **"Save"**.
6. In LinguistPro: **"Translation Settings"** → provider **"GCP Translate (API)"** → field **"🔑 GCP Translate API Key"** → paste → **"💾 Save"**.


## Key security: recommendations

- **Restrict each key to one API.** In "Edit API key" → "API restrictions" → "Restrict key". If a key is locked to Cloud TTS only, its theft doesn't grant access to other services.
- **Don't publish the key.** No screenshots, no open chats, no git commits.
- **One key per device.** localStorage stores the key only in this browser. On another device or browser you re-enter it. This isn't a bug — it's how BYOK protects you when one session is compromised.
- **Monitor usage.** Google Cloud Console: **"APIs & Services"** → **"Dashboard"** → pick an API → see real request counts and remaining quota.
- **Rotate if suspicious.** If you suspect a key leak, delete it in Credentials and create a new one. The old one stops working immediately.


## What happens without keys

- **TTS without a key** → online TTS auto-switches to the browser voice (`speechSynthesis`). Once per session you get the hint "Add a GCP TTS key for premium quality". Lower quality, but it works.
- **Gemini translation without a key** → you see "Gemini API Key required" and the key panel is highlighted. "Google Translate (free)" and "MADLAD" still work independently.
- **GCP Translate without a key** → if the provider is set to "GCP Translate (API)" but no key, you get "GCP Translate API key required". Switch to another provider or enter the key.


## Troubleshooting

**"Invalid key format. Key must start with AIza…"**
You copied the wrong thing. A Google API Key always starts with `AIza` and is about 39 characters long. If you have a multi-line JSON, that's a service account, which is not supported here — use an API Key from the Credentials section.

**"Quota exceeded" / 429**
Free quota exhausted. Wait until the next day (Gemini) or next month (GCP). The Google Cloud Console shows exact quota and current usage.

**Key is entered but translations don't work**
- Make sure the API is enabled in your project (Library → check that the API shows "API Enabled").
- Verify that in "Edit API key" → "API restrictions" the right API is checked (or pick "Don't restrict key" for testing).
- Clear the browser cache and reload — sometimes the service worker serves stale code.

**Hebrew sounds odd via browser TTS**
On some platforms (iOS, old Android) there's no decent Hebrew voice. Add a GCP TTS Key — `he-IL-Wavenet-*` voices sound natural.

**Library/SRS/notes don't sync across devices**
Expected behavior: your texts, cards and notes live in the browser (OPFS), not on the server. Use ZIP export/import to move between devices.


## Related documents

- Privacy and data handling: `/docs/PRIVACY.md`
- Browser-side data storage (OPFS): `/docs/OPFS_USER_GUIDE.md`

If something doesn't work or is unclear — open an issue in the project repository.
