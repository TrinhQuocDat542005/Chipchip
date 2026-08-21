import json
import os
import re
import sys


def compact_segments(segments):
    """Create short dubbing turns from word timestamps without cutting mid-phrase."""
    words = []
    for segment in segments:
        for word in segment.get("words", []):
            if word.get("start") is not None and word.get("end") is not None and word.get("word", "").strip():
                if word.get("speaker") is None and segment.get("speaker") is not None:
                    word["speaker"] = segment["speaker"]
                words.append(word)
    if not words:
        return [
            {"start": round(float(s["start"]), 3), "end": round(float(s["end"]), 3), "text": s["text"].strip()}
            for s in segments if s.get("text", "").strip()
        ]

    output, current = [], []
    for word in words:
        # A real pause is a safer boundary than Whisper's arbitrary chunk edge.
        if current and float(word["start"]) - float(current[-1]["end"]) > 0.55:
            output.append(make_segment(current))
            current = []
        if current and word.get("speaker") and current[-1].get("speaker") and word["speaker"] != current[-1]["speaker"]:
            output.append(make_segment(current))
            current = []
        current.append(word)
        duration = float(word["end"]) - float(current[0]["start"])
        token = word["word"].strip()
        sentence_break = re.search(r"[。！？!?…]$", token) is not None
        phrase_break = re.search(r"[，,；;：:]$", token) is not None
        # End at complete sentences. For long speech, a comma/semicolon is an
        # acceptable breath point. Only force-cut at 12s as a final safeguard.
        if (duration >= 1.2 and sentence_break) or (duration >= 6.5 and phrase_break) or duration >= 12:
            output.append(make_segment(current))
            current = []
    if current:
        if output and current[-1]["end"] - current[0]["start"] < 1.0:
            previous = output.pop()
            current.insert(0, {"start": previous["start"], "end": previous["end"], "word": previous["text"]})
        output.append(make_segment(current))
    return split_long_segments(output, max_seconds=12)


def make_segment(words):
    text = "".join(w["word"] for w in words).strip()
    result = {"start": round(float(words[0]["start"]), 3), "end": round(float(words[-1]["end"]), 3), "text": text}
    if words[0].get("speaker"):
        result["speaker"] = words[0]["speaker"]
    return result


def split_long_segments(segments, max_seconds=12):
    output = []
    for segment in segments:
        duration = segment["end"] - segment["start"]
        if duration <= max_seconds or len(segment["text"]) < 2:
            output.append(segment)
            continue

        text = segment["text"]
        # Look for semantic punctuation split points (Chinese & Latin punctuation)
        punct_matches = list(re.finditer(r"[，,；;。！？!?\s]", text))
        if punct_matches:
            # Find a punctuation close to the middle of duration
            target_char = len(text) / 2
            best_match = min(punct_matches, key=lambda m: abs(m.start() - target_char))
            split_idx = best_match.end()

            if 1 <= split_idx < len(text):
                ratio = split_idx / len(text)
                split_time = segment["start"] + duration * ratio
                seg1 = {"start": round(segment["start"], 3), "end": round(split_time, 3), "text": text[:split_idx].strip()}
                seg2 = {"start": round(split_time, 3), "end": round(segment["end"], 3), "text": text[split_idx:].strip()}
                if segment.get("speaker"):
                    seg1["speaker"] = segment["speaker"]
                    seg2["speaker"] = segment["speaker"]

                output.extend(split_long_segments([seg1], max_seconds))
                output.extend(split_long_segments([seg2], max_seconds))
                continue

        # Fallback if no punctuation: split into parts proportionally
        parts = max(2, int(duration / max_seconds) + 1)
        total = len(text)
        for index in range(parts):
            char_start = round(total * index / parts)
            char_end = round(total * (index + 1) / parts)
            start = segment["start"] + duration * index / parts
            end = segment["start"] + duration * (index + 1) / parts
            piece = {"start": round(start, 3), "end": round(end, 3), "text": text[char_start:char_end].strip()}
            if segment.get("speaker"):
                piece["speaker"] = segment["speaker"]
            if piece["text"]:
                output.append(piece)
    return output


def transcribe_whisperx(media_path, language, model_name, hf_token=None, initial_prompt=None):
    import whisperx

    print("PROGRESS:20:Loading Whisper model...", flush=True)
    device = os.getenv("WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8" if device == "cpu" else "float16")
    audio = whisperx.load_audio(media_path)
    model = whisperx.load_model(model_name, device, compute_type=compute_type, language=language)
    
    print("PROGRESS:40:Transcribing audio...", flush=True)
    transcribe_options = {"batch_size": int(os.getenv("WHISPER_BATCH_SIZE", "4"))}
    if initial_prompt:
        transcribe_options["initial_prompt"] = initial_prompt
    result = model.transcribe(audio, **transcribe_options)
    detected = result.get("language") or language or "auto"
    
    print("PROGRESS:65:Aligning timestamps...", flush=True)
    align_model, metadata = whisperx.load_align_model(language_code=detected, device=device)
    aligned = whisperx.align(result["segments"], align_model, metadata, audio, device, return_char_alignments=False)
    
    token = hf_token or os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
    if token:
        print("PROGRESS:85:Running Pyannote speaker diarization...", flush=True)
        try:
            from whisperx.diarize import DiarizationPipeline
            diarizer = DiarizationPipeline(token=token, device=device)
            diarized_segments = diarizer(audio)
            aligned = whisperx.assign_word_speakers(diarized_segments, aligned)
        except Exception as error:
            aligned["diarization_warning"] = str(error)[:500]
            
    print("PROGRESS:95:Compacting segments...", flush=True)
    return {"language": detected, "engine": "whisperx", "segments": compact_segments(aligned["segments"])}


def transcribe_fallback(media_path, language, model_name, error=None, initial_prompt=None):
    from faster_whisper import WhisperModel

    print("PROGRESS:40:Transcribing with faster-whisper fallback...", flush=True)
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=max(1, (os.cpu_count() or 2) // 2))
    segments, info = model.transcribe(
        media_path,
        language=language,
        vad_filter=True,
        beam_size=3,
        condition_on_previous_text=False,
        word_timestamps=True,
        initial_prompt=initial_prompt,
    )
    rows = []
    for segment in segments:
        rows.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
            "words": [{"start": w.start, "end": w.end, "word": w.word} for w in (segment.words or []) if w.start is not None and w.end is not None],
        })
    output = {"language": info.language, "language_probability": info.language_probability, "engine": "faster-whisper", "segments": compact_segments(rows)}
    if error:
        output["alignment_warning"] = str(error)[:500]
    return output


def main():
    media_path = sys.argv[1]
    language = None if len(sys.argv) < 3 or sys.argv[2] in ("", "auto") else sys.argv[2]
    hf_token = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "none" else os.getenv("HF_TOKEN")
    initial_prompt = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != "none" else os.getenv("ASR_INITIAL_PROMPT")
    model_name = os.getenv("WHISPER_MODEL", "small")

    try:
        output = transcribe_whisperx(media_path, language, model_name, hf_token=hf_token, initial_prompt=initial_prompt)
    except Exception as error:
        output = transcribe_fallback(media_path, language, model_name, error=error, initial_prompt=initial_prompt)
    print("ASR_JSON:" + json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
