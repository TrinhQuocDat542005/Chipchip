"""Second-pass ASR for suspicious gaps left by the primary transcription."""
import json
import os
import re
import subprocess
import sys
import tempfile

from faster_whisper import WhisperModel


def main():
    media_path = sys.argv[1]
    language = None if sys.argv[2] in ("", "auto") else sys.argv[2]
    gaps = json.loads(sys.argv[3])
    model_name = os.getenv("WHISPER_MODEL", "small")
    model = WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        cpu_threads=max(1, (os.cpu_count() or 2) // 2),
    )
    recovered = []
    with tempfile.TemporaryDirectory(prefix="asr-gaps-") as directory:
        for index, gap in enumerate(gaps):
            start = float(gap["start"])
            end = float(gap["end"])
            clip = os.path.join(directory, f"gap-{index:03d}.wav")
            subprocess.run(
                ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}",
                 "-i", media_path, "-t", f"{end-start:.3f}", "-vn", "-ac", "1", "-ar", "16000", clip],
                check=True,
            )
            segments, _ = model.transcribe(
                clip,
                language=language,
                vad_filter=False,
                beam_size=5,
                condition_on_previous_text=False,
                word_timestamps=True,
                no_speech_threshold=0.55,
            )
            for segment in segments:
                text = segment.text.strip()
                # Common Whisper artefacts on music, watermarks and scene cards.
                if (not text or segment.no_speech_prob > 0.65 or
                        re.search(r"字幕|[感謝谢多謝]+.*(觀看|观看)|thanks for watching", text, re.I)):
                    continue
                local_start = max(0.0, float(segment.start))
                local_end = min(end - start, float(segment.end))
                if local_end - local_start < 0.12:
                    continue
                recovered.append({"start": start + local_start, "end": start + local_end, "text": text})
    print("ASR_GAPS:" + json.dumps(recovered, ensure_ascii=False))


if __name__ == "__main__":
    main()
