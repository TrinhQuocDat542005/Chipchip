import json
import os
import tempfile
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from vieneu import Vieneu


HOST = os.getenv("VIENEU_HOST", "127.0.0.1")
PORT = int(os.getenv("VIENEU_PORT", "8787"))
MODEL = os.getenv("VIENEU_MODEL", "pnnbao-ump/VieNeu-TTS-v2")
CODEC_MODEL = os.getenv("VIENEU_CODEC_MODEL", "neuphonic/distill-neucodec")
BACKBONE_DEVICE = os.getenv("VIENEU_BACKBONE_DEVICE", "cpu")
CODEC_DEVICE = os.getenv("VIENEU_CODEC_DEVICE", "cpu")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
VOICE_PROFILE_ROOT = Path(
    os.getenv("VIENEU_VOICE_PROFILE_ROOT", PROJECT_ROOT / "storage" / "voice-profiles")
).resolve()

engine = None
engine_error = None
engine_lock = threading.Lock()


def load_voice_profiles() -> dict:
    profiles = {}
    if not VOICE_PROFILE_ROOT.exists():
        return profiles
    for profile_path in VOICE_PROFILE_ROOT.glob("*/profile.json"):
        try:
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            profile_id = str(profile.get("id", "")).strip()
            ref_audio = (profile_path.parent / str(profile.get("ref_audio", "reference.wav"))).resolve()
            ref_text = str(profile.get("ref_text", "")).strip()
            if profile_id and ref_audio.is_file() and ref_text:
                profile["ref_audio_path"] = str(ref_audio)
                profiles[profile_id] = profile
        except Exception as exc:
            print(f"[VieNeu] Could not load voice profile {profile_path}: {exc}")
    return profiles


voice_profiles = load_voice_profiles()


def load_engine():
    global engine, engine_error
    try:
        engine = Vieneu(
            backbone_repo=MODEL,
            backbone_device=BACKBONE_DEVICE,
            codec_repo=CODEC_MODEL,
            codec_device=CODEC_DEVICE,
        )
        # Reference encoding is deterministic and relatively expensive on CPU.
        # Cache it once so every segment uses the exact same speaker embedding.
        for profile in voice_profiles.values():
            profile["ref_codes"] = engine.encode_reference(profile["ref_audio_path"])
    except Exception as exc:
        engine_error = str(exc)


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wav_file:
        return wav_file.getnframes() / float(wav_file.getframerate())


class Handler(BaseHTTPRequestHandler):
    server_version = "VieNeuLocal/1.0"

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return

        status = 200 if engine is not None else 503
        self.send_json(status, {
            "ready": engine is not None,
            "model": MODEL,
            "device": BACKBONE_DEVICE,
            "codec": CODEC_MODEL,
            "error": engine_error,
            "voice_profiles": [
                {"id": profile_id, "name": profile.get("name", profile_id)}
                for profile_id, profile in voice_profiles.items()
            ],
        })

    def do_POST(self):
        if self.path != "/synthesize":
            self.send_error(404)
            return
        if engine is None:
            self.send_json(503, {"error": engine_error or "VieNeu model is still loading"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            text = str(payload.get("text", "")).strip()
            voice_id = str(payload.get("voice", "")).strip()
            profile = voice_profiles.get(voice_id)
            if not text or len(text) > 5000:
                self.send_json(400, {"error": "text must contain between 1 and 5000 characters"})
                return

            with engine_lock, tempfile.TemporaryDirectory(prefix="vieneu-") as temp_dir:
                output_path = Path(temp_dir) / "voice.wav"
                infer_options = {"text": text}
                if profile:
                    infer_options.update({
                        "ref_codes": profile["ref_codes"],
                        "ref_text": profile["ref_text"],
                        "temperature": float(profile.get("temperature", 0.8)),
                        "top_k": int(profile.get("top_k", 40)),
                        # Keep pauses/cadence consistent between hundreds of
                        # independently generated dubbing segments.
                        "silence_p": float(profile.get("silence_p", 0.06)),
                    })
                    if profile.get("emotion_tag"):
                        infer_options["emotion_tag"] = profile["emotion_tag"]
                audio = engine.infer(**infer_options)
                engine.save(audio, str(output_path))
                duration = wav_duration(output_path)
                contents = output_path.read_bytes()

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(contents)))
            self.send_header("X-Audio-Duration", f"{duration:.3f}")
            self.send_header("X-Voice-Profile", voice_id if profile else "default")
            self.end_headers()
            self.wfile.write(contents)
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def send_json(self, status: int, payload: dict):
        contents = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(contents)))
        self.end_headers()
        self.wfile.write(contents)

    def log_message(self, fmt, *args):
        print(f"[VieNeu] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    load_engine()
    if engine is None:
        raise RuntimeError(f"Could not load VieNeu: {engine_error}")
    print(f"VieNeu service ready at http://{HOST}:{PORT} using {MODEL} on {BACKBONE_DEVICE}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
