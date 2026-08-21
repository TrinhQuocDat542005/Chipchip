<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# AI Video Factory

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/abd3367e-e526-423a-9a0f-27bb4934f5c2

## Phase 3 operations

- Persistent schedules run complete generation pipelines and stop at human review.
- Monthly provider usage and estimated costs are stored in SQLite and protected by a configurable budget.
- Reviewed renders can produce a publishing package with `video.mp4`, `caption.txt`, and `metadata.json`.
- Production probes: `GET /api/health` and `GET /api/ready`.
- The Docker production image includes FFmpeg and serves frontend/backend on port 3000.

Direct TikTok, YouTube, and Instagram publishing requires OAuth application credentials. Until configured, the export-package adapter is the safe default.

## Local video dubbing

The **Dịch & lồng tiếng** workspace accepts MP4 files up to 500 MB and supports subtitle-only, Vietnamese voice-over, and dubbing modes. Transcription runs locally with faster-whisper; narration uses VieNeu; timing, audio mixing, subtitle burning, and MP4 output use FFmpeg.

```powershell
py -3.10 -m venv .venv-asr
.\.venv-asr\Scripts\python.exe -m pip install -r services\asr\requirements.txt
```

`WHISPER_MODEL=small` downloads once and is cached. Automatic translation uses Gemini Flash when `GEMINI_API_KEY` is configured; without a key, transcription and manual transcript editing remain local.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
