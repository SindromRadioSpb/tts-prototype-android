# TTS Hebrew Sidecar

Дата: 2026-04-22

## Endpoints

- `GET /healthz`
- `GET /tts/hebrew/phonikud-piper/health`
- `POST /tts/hebrew/phonikud-piper`

## Request

```json
{
  "text": "שלום עולם",
  "voice": "shaul",
  "speed": 1.0,
  "pitch": 0.0,
  "format": "wav"
}
```

## Response

- audio: `audio/wav`
- diagnostics: `X-TTS-Diagnostics`

Diagnostics include:

- `provider`
- `runtime`
- `voice`
- `g2pMs`
- `ttsMs`
- `totalMs`
- `textChars`
- `licenseMode`
- `licenseStatus`
- `qualityTier`
- `speedSupported`
- `pitchSupported`
- `modelVersion`
- `phonikudVersion`
- `piperModelVersion`
- `cacheHit`

## Health Contract

`GET /tts/hebrew/phonikud-piper/health` returns:

- `status`
- `provider`
- `licenseMode`
- `voices`
- `modelLoaded`
- `phonikudReady`
- `piperReady`

## Cache

The sidecar caches successful WAV outputs only.

Cache key includes:

```text
provider + voice + normalizedText + speed + pitch + modelVersion + phonikudVersion + piperModelVersion
```

Errors are not cached.

## License Gate

The sidecar is enabled only when:

```text
TTS_HEBREW_LOCAL_EXPERIMENTAL=true
TTS_HEBREW_LOCAL_LICENSE_MODE=research_only|noncommercial
```

Blocked modes:

- `commercial`
- `premium_commercial`
