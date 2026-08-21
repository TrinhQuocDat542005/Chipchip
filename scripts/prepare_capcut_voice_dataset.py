import csv
import json
import math
import os
import re
import shutil
import subprocess
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from faster_whisper import WhisperModel
from scipy.optimize import linear_sum_assignment

ROOT = Path.cwd()
SOURCE = Path(r'D:\Youtube\model_train_cogaihoatngon')
TRANSCRIPTS = ROOT / 'artifacts' / 'capcut-batches-250-ky-tu'
OUTPUT = ROOT / 'artifacts' / 'cogai-hoatngon-dataset'
FFMPEG = ROOT / 'tools' / 'ffmpeg' / 'ffmpeg.exe'
FFPROBE = ROOT / 'tools' / 'ffmpeg' / 'ffprobe.exe'


def source_ranges():
    result = []
    for path in SOURCE.glob('*.WAV'):
        numbers = [int(x) for x in re.findall(r'\d+', path.stem)]
        if not numbers:
            continue
        start, end = (numbers[0], numbers[-1]) if len(numbers) > 1 else (numbers[0], numbers[0])
        result.append((start, end, path))
    return sorted(result)


def duration(path):
    proc = subprocess.run([str(FFPROBE), '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(path)], capture_output=True, text=True, check=True)
    return float(proc.stdout.strip())


def silences(path, minimum, threshold='-42dB'):
    proc = subprocess.run([str(FFMPEG), '-hide_banner', '-i', str(path), '-af', f'silencedetect=noise={threshold}:d={minimum}', '-f', 'null', 'NUL'], capture_output=True, text=True)
    starts, intervals = [], []
    for line in proc.stderr.splitlines():
        start = re.search(r'silence_start:\s*([\d.]+)', line)
        end = re.search(r'silence_end:\s*([\d.]+)', line)
        if start:
            starts.append(float(start.group(1)))
        if end and starts:
            intervals.append((starts.pop(0), float(end.group(1))))
    return intervals


def split_combined(path, expected):
    total = duration(path)
    if expected == 1:
        return [(0.0, total)]
    candidates = [(a, b) for a, b in silences(path, 1.0) if a > .1 and b < total - .1]
    if len(candidates) < expected - 1:
        raise RuntimeError(f'{path.name}: need {expected-1} long gaps, found {len(candidates)}')
    # CapCut gaps between batches are much longer than speech pauses. Keep the
    # strongest expected-1 gaps, then restore chronological order.
    chosen = sorted(sorted(candidates, key=lambda x: x[1] - x[0], reverse=True)[:expected - 1])
    cuts = [(a + b) / 2 for a, b in chosen]
    points = [0.0] + cuts + [total]
    return [(points[i], points[i + 1]) for i in range(len(points) - 1)]


def choose_sentence_cuts(path, batch_start, batch_end, texts):
    if len(texts) == 1:
        return []
    span = batch_end - batch_start
    expected = []
    cumulative = 0
    total_chars = sum(len(t) for t in texts)
    for text in texts[:-1]:
        cumulative += len(text)
        expected.append(batch_start + span * cumulative / total_chars)
    candidates = []
    for a, b in silences(path, .18, '-45dB'):
        mid = (a + b) / 2
        if batch_start + .25 < mid < batch_end - .25 and b - a < 1.2:
            candidates.append(mid)
    if len(candidates) < len(expected):
        return expected
    chosen, lower = [], batch_start
    for index, target in enumerate(expected):
        remaining = len(expected) - index - 1
        valid = [x for x in candidates if x > lower + .2 and sum(1 for y in candidates if y > x + .2) >= remaining]
        nearest = min(valid, key=lambda x: abs(x - target)) if valid else target
        # A comma pause far from the expected textual boundary is worse than
        # a proportional cut. Only snap when the pause is reasonably close.
        tolerance = max(.55, span * .12)
        cut = nearest if abs(nearest - target) <= tolerance else target
        chosen.append(cut)
        lower = cut
    return chosen


def trim_batch_span(path, batch_start, batch_end):
    """Move midpoint gap boundaries onto the actual speech edges."""
    intervals = silences(path, .12, '-45dB')
    start, end = batch_start, batch_end
    for a, b in intervals:
        if a - .02 <= batch_start <= b + .02:
            start = b
        if a - .02 <= batch_end <= b + .02:
            end = a
    return (max(batch_start, start), min(batch_end, end))


def render_clip(source, start, end, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    # Keep 80 ms around detected boundaries so plosives are not clipped.
    start = max(0, start - .08)
    end = max(start + .25, end + .08)
    subprocess.run([
        str(FFMPEG), '-y', '-hide_banner', '-loglevel', 'error', '-ss', f'{start:.3f}', '-to', f'{end:.3f}',
        '-i', str(source), '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', str(target)
    ], check=True)


def normalized(text):
    text = unicodedata.normalize('NFD', text.lower())
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    return ''.join(ch for ch in text if ch.isalnum())


def transcribe_clip(model, path):
    segments, _ = model.transcribe(str(path), language='vi', vad_filter=True, beam_size=1, condition_on_previous_text=False)
    return ' '.join(segment.text.strip() for segment in segments if segment.text.strip())


def match_spans_to_batches(model, source, range_start, range_end, spans, temp_dir):
    actual = []
    for index, (start, end) in enumerate(spans):
        temp = temp_dir / f'{source.stem}-{index:02d}.wav'
        render_clip(source, start, end, temp)
        actual.append(transcribe_clip(model, temp))
    expected_numbers = list(range(range_start, range_end + 1))
    expected = [' '.join(line.strip() for line in (TRANSCRIPTS / f'batch-{number:03d}.txt').read_text(encoding='utf-8').splitlines() if line.strip()) for number in expected_numbers]
    scores = [[SequenceMatcher(None, normalized(a), normalized(e)).ratio() for e in expected] for a in actual]
    rows, cols = linear_sum_assignment([[-score for score in row] for row in scores])
    mapping, matches = {}, []
    for row, col in zip(rows, cols):
        number = int(expected_numbers[col])
        mapping[number] = spans[row]
        matches.append({'batch': number, 'timeline_position': int(row) + 1, 'match_score': round(float(scores[row][col]), 3), 'recognized': actual[row]})
    return mapping, sorted(matches, key=lambda item: item['batch'])


def main():
    if os.getenv('CAPCUT_FINALIZE_ONLY') == '1':
        report = json.loads((OUTPUT / 'manifest.json').read_text(encoding='utf-8'))
        durations = [row['duration'] for row in report]
        rates = [row['characters_per_second'] for row in report]
        summary = {
            'clips': len(report), 'batches': len(set(row['batch'] for row in report)),
            'sample_rate': 24000, 'channels': 1, 'total_minutes': round(sum(durations) / 60, 2),
            'min_duration': min(durations), 'max_duration': max(durations),
            'average_duration': round(sum(durations) / len(durations), 3),
            'rate_min': min(rates), 'rate_max': max(rates),
            'clips_under_1s': sum(x < 1 for x in durations), 'clips_over_15s': sum(x > 15 for x in durations),
        }
        (OUTPUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
        temp_dir = OUTPUT / '.batch-temp'
        if temp_dir.exists(): shutil.rmtree(temp_dir)
        shutil.make_archive(str(OUTPUT), 'zip', OUTPUT)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    ranges = source_ranges()
    covered = [number for start, end, _ in ranges for number in range(start, end + 1)]
    if covered != list(range(1, 92)):
        raise RuntimeError(f'Audio ranges do not cover 001-091 exactly: {covered}')
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    wav_dir = OUTPUT / 'wavs'
    wav_dir.mkdir(parents=True)
    temp_dir = OUTPUT / '.batch-temp'
    temp_dir.mkdir()
    model = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=max(1, (os.cpu_count() or 2) // 2))
    rows, report, match_report, sentence_index = [], [], [], 1
    for range_start, range_end, source in ranges:
        raw_spans = split_combined(source, range_end - range_start + 1)
        active_spans = [trim_batch_span(source, *span) for span in raw_spans]
        span_by_batch, matches = match_spans_to_batches(model, source, range_start, range_end, active_spans, temp_dir)
        match_report.extend(matches)
        for batch_number in range(range_start, range_end + 1):
            transcript_path = TRANSCRIPTS / f'batch-{batch_number:03d}.txt'
            texts = [line.strip() for line in transcript_path.read_text(encoding='utf-8').splitlines() if line.strip()]
            batch_start, batch_end = span_by_batch[batch_number]
            sentence_cuts = choose_sentence_cuts(source, batch_start, batch_end, texts)
            points = [batch_start] + sentence_cuts + [batch_end]
            for local_index, text in enumerate(texts):
                clip_id = f'cg_hn_{sentence_index:04d}'
                target = wav_dir / f'{clip_id}.wav'
                render_clip(source, points[local_index], points[local_index + 1], target)
                clip_duration = duration(target)
                rows.append((clip_id, text))
                report.append({
                    'id': clip_id, 'batch': batch_number, 'sentence_in_batch': local_index + 1,
                    'text': text, 'characters': len(text), 'duration': round(clip_duration, 3),
                    'characters_per_second': round(len(text) / max(.01, clip_duration), 2),
                    'source_file': source.name, 'source_start': round(points[local_index], 3),
                    'source_end': round(points[local_index + 1], 3),
                })
                sentence_index += 1
    with (OUTPUT / 'metadata.csv').open('w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle, delimiter='|', lineterminator='\n')
        writer.writerows(rows)
    (OUTPUT / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUTPUT / 'batch-matches.json').write_text(json.dumps(match_report, ensure_ascii=False, indent=2), encoding='utf-8')
    durations = [row['duration'] for row in report]
    rates = [row['characters_per_second'] for row in report]
    summary = {
        'clips': len(report), 'batches': 91, 'sample_rate': 24000, 'channels': 1,
        'total_minutes': round(sum(durations) / 60, 2), 'min_duration': min(durations),
        'max_duration': max(durations), 'average_duration': round(sum(durations) / len(durations), 3),
        'rate_min': min(rates), 'rate_max': max(rates), 'minimum_batch_match': min(row['match_score'] for row in match_report),
        'clips_under_1s': sum(x < 1 for x in durations), 'clips_over_15s': sum(x > 15 for x in durations),
    }
    (OUTPUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    shutil.rmtree(temp_dir)
    shutil.make_archive(str(OUTPUT), 'zip', OUTPUT)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
