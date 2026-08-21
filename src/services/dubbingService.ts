import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DubbingProject, DubbingSegment } from '../types';
import { getStorageRoot, resolveMediaUrl, saveProjectAsset } from './assetStorage';
import { getTTSProvider, TTSRequest } from './tts';
import { GoogleGenAI } from '@google/genai';
import { probeMedia } from './mediaProbeService';

const ffmpeg = () => process.env.FFMPEG_PATH || 'ffmpeg';

import { projectStore } from './projectStore';

export async function transcribeVideo(project: DubbingProject, onProgress?: (p: number, m: string) => void) {
  const input = resolveMediaUrl(project.source_video_url); if (!input) throw new Error('Invalid source video');
  // Split/import metadata can be based on an intended cut range while the
  // encoded stream is slightly longer. Trust the actual video stream so ASR,
  // timeline QA and the UI all use the same boundary.
  const mediaInfo=await probeMedia(input);
  project.duration=mediaInfo.video?.duration??mediaInfo.duration;
  const python = process.env.ASR_PYTHON_PATH || path.resolve('.venv-asr', 'Scripts', 'python.exe');
  const script = path.resolve('services', 'asr', 'transcribe.py');
  
  const hfToken = project.hf_token || projectStore.getSetting('hf_token') || process.env.HF_TOKEN || 'none';
  const glossary = project.glossary || 'none';
  
  onProgress?.(10, 'Trích xuất & khởi chạy ASR...');
  const raw = await run(python, [script, input, project.source_language || 'auto', hfToken, glossary], undefined, 30 * 60_000, (line)=>{
    const match=line.match(/^PROGRESS:(\d+):(.*)$/);
    if(match)onProgress?.(Number(match[1]),match[2].trim());
  });
  const jsonLine = raw.trim().split(/\r?\n/).reverse().find(line => line.startsWith('ASR_JSON:'))?.slice('ASR_JSON:'.length);
  if (!jsonLine) throw new Error('ASR did not return JSON output');
  const parsed = JSON.parse(jsonLine) as { language: string; engine?: string; alignment_warning?: string; segments: Array<{ start: number; end: number; text: string; speaker?: string }> };
  
  project.source_language = parsed.language || project.source_language;
  project.asr_engine = parsed.engine === 'whisperx' ? 'whisperx' : 'faster-whisper';
  project.alignment_warning = parsed.alignment_warning;
  const recovered = await recoverMissedSpeechGaps(input, parsed.segments, parsed.language || project.source_language, python, onProgress);
  const merged = mergeSpeechSegments([...parsed.segments, ...recovered].sort((a,b)=>a.start-b.start));
  project.segments = merged.map((item, index) => ({
    id: `seg-${index + 1}`,
    start: item.start,
    end: item.end,
    source_text: item.text,
    translated_text: item.text,
    speaker: item.speaker,
    enabled: true,
    voice_start: item.start,
    voice_speed: 1,
    voice_timing_mode: 'AUTO' as const,
    voice_outdated: false,
  }));
  return project;
}

async function recoverMissedSpeechGaps(
  input:string,
  segments:Array<{start:number;end:number;text:string;speaker?:string}>,
  language:string,
  python:string,
  onProgress?: (p:number,m:string)=>void,
){
  const gaps:Array<{start:number;end:number}>=[];
  for(let index=1;index<segments.length;index++){
    const start=segments[index-1].end;
    const end=segments[index].start;
    // Short pauses are normal. Long gaps are checked again without VAD because
    // brief/emotional dialogue is where the primary pass most often misses speech.
    if(end-start>=1.1&&end-start<=15)gaps.push({start,end});
  }
  if(!gaps.length)return [];
  onProgress?.(88,`Rà soát ${gaps.length} khoảng trống có thể bị sót thoại...`);
  const script=path.resolve('services','asr','refine_gaps.py');
  try{
    const raw=await run(python,[script,input,language||'auto',JSON.stringify(gaps)],undefined,30*60_000);
    const jsonLine=raw.trim().split(/\r?\n/).reverse().find(line=>line.startsWith('ASR_GAPS:'))?.slice('ASR_GAPS:'.length);
    if(!jsonLine)return [];
    const rows=JSON.parse(jsonLine) as Array<{start:number;end:number;text:string}>;
    return rows.filter(row=>row.text.trim()&&row.end>row.start);
  }catch(error){
    projectStore.setSetting('last_asr_gap_warning',(error as Error).message.slice(0,500));
    return [];
  }
}

function mergeSpeechSegments(input:Array<{start:number;end:number;text:string;speaker?:string}>){
  const output:Array<{start:number;end:number;text:string;speaker?:string}>=[];
  for(const item of input){
    const previous=output.at(-1); const gap=previous?item.start-previous.end:99; const combinedDuration=previous?item.end-previous.start:0;
    const previousComplete=previous?/[。！？!?…]$/.test(previous.text.trim()):true;
    // Cap merged segments at 6.0s max to prevent huge 24-second paragraphs that desync over long videos
    if(previous && previous.speaker===item.speaker && gap<.45 && combinedDuration<=6.0 && !previousComplete){
      const joiner=/^[,.。，！？!?]/.test(item.text)?'':gap>=.12?'，':' ';
      previous.end=item.end; previous.text=`${previous.text}${joiner}${item.text}`.trim();
    }else output.push({...item});
  }
  return output;
}

export async function translateTranscript(project: DubbingProject) {
  if (project.source_language === project.target_language) {
    for (const s of project.segments) {
      s.translated_text = s.source_text;
      s.voice_outdated = false;
    }
    return project;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') throw new Error('Cần GEMINI_API_KEY để dịch tự động. Transcription local vẫn dùng được và ông có thể sửa cột bản dịch thủ công.');
  const ai = new GoogleGenAI({ apiKey: key });

  const characterContext = project.characters?.length
    ? `Character roles & pronouns guide: ${JSON.stringify(project.characters.map(c => ({ name: c.name, speaker: c.speaker_id, gender: c.gender })))}.`
    : '';

  const input = project.segments.map((s, i) => ({
    index: i,
    speaker: s.speaker || 'Unknown',
    max_spoken_seconds: Number(Math.max(0.5, s.end - s.start).toFixed(2)),
    text: s.source_text,
  }));

  const systemPrompt = `You are a professional movie/dubbing translator into ${project.target_language}.
Translate the dialogue while maintaining consistent speaker pronouns (tôi/tớ/cậu/anh/em/ông/bà) across the whole episode.
${characterContext}
${project.story_context ? `Episode and series context:\n${project.story_context}` : ''}
Rules:
1. Preserve meaning, character tone, and proper names accurately.
2. Ensure the translation can be spoken naturally within max_spoken_seconds.
3. Keep exact 1-to-1 index matching. Never merge or skip items.
4. Always end every translated sentence with proper terminal punctuation (., !, ? or …). Never omit terminal punctuation.
Return ONLY a valid JSON array: [{"index":0,"text":"..."}].`;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite',
    contents: `${systemPrompt}\n\nDialogue to translate:\n${JSON.stringify(input)}`,
    config: { responseMimeType: 'application/json' },
  });

  const translated = JSON.parse(response.text || '[]') as Array<{ index: number; text: string }>;
  for (const row of translated) {
    if (project.segments[row.index] && row.text) {
      if (project.segments[row.index].translated_text !== row.text.trim()) {
        project.segments[row.index].translated_text = row.text.trim();
        project.segments[row.index].voice_outdated = true;
      }
    }
  }
  repairBrokenTranslationSegments(project);
  return project;
}

export async function translateMissingTranscript(project: DubbingProject) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') throw new Error('Cần GEMINI_API_KEY để sửa các đoạn còn nguyên tiếng Trung.');
  const ai = new GoogleGenAI({ apiKey: key });
  for(let attempt=1;attempt<=3;attempt++){
    const missing = project.segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => isInvalidTranslationSegment(segment));
    if(!missing.length)return project;
    for (let offset = 0; offset < missing.length; offset += 20) {
      const batch = missing.slice(offset, offset + 20);
      const input = batch.map(({ segment, index }) => ({
        index,
        speaker: segment.speaker || 'Unknown',
        max_spoken_seconds: Number(Math.max(.5, segment.end - segment.start).toFixed(2)),
        source_text: segment.source_text,
        failed_translation: segment.translated_text,
      }));
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite',
        contents: `Translate every item into natural spoken Vietnamese for movie voice-over. Preserve names by Vietnamese transliteration. Keep the exact index and return every item once. The output text must contain ZERO Chinese/CJK characters, including inside names. This is repair attempt ${attempt}/3. Fit each max_spoken_seconds when practical. Return only JSON [{"index":1,"text":"..."}].\n${JSON.stringify(input)}`,
        config: { responseMimeType: 'application/json' },
      });
      const rows = JSON.parse(response.text || '[]') as Array<{ index:number; text:string }>;
      for (const row of rows) {
        const segment = project.segments[row.index];
        const text = row.text?.trim();
        if (!segment || !text || /[\u3400-\u9fff]/u.test(text) || !hasSpokenContent(text)) continue;
        segment.translated_text = text;
        segment.voice_url = undefined;
        segment.voice_duration = undefined;
        segment.voice_signature = undefined;
        segment.compressed_text = undefined;
        segment.voice_outdated = true;
      }
    }
  }
  const remaining = project.segments.filter(isInvalidTranslationSegment);
  if (remaining.length) throw new Error(`Còn ${remaining.length} đoạn chưa dịch được sang tiếng Việt. Hãy thử lại.`);
  return project;
}

export function repairBrokenTranslationSegments(project:DubbingProject){
  const repaired:DubbingSegment[]=[];
  for(const original of project.segments){
    const segment={...original};
    const previous=repaired.at(-1);
    const previousText=previous?.translated_text.trim()??'';
    const nextText=segment.translated_text.trim();
    const incomplete=previousText!==''&&!/[.!?…]["'”’)]?$/.test(previousText);
    const continuation=/^[\p{Ll}]/u.test(nextText);
    const closeEnough=previous&&segment.start-previous.end<.8&&segment.end-previous.start<=26;
    if(previous&&closeEnough&&(incomplete||continuation)){
      previous.end=segment.end;
      previous.source_text=`${previous.source_text} ${segment.source_text}`.trim();
      previous.translated_text=`${previousText} ${nextText}`.replace(/\s+/g,' ').trim();
      previous.voice_url=undefined;previous.voice_duration=undefined;previous.voice_signature=undefined;
      previous.compressed_text=undefined;previous.voice_outdated=true;previous.voice_start=previous.start;previous.voice_speed=1;
    }else repaired.push(segment);
  }
  project.segments=repaired.map((segment,index)=>({...segment,id:`seg-${index+1}`}));
  return project;
}

export async function renderDub(project: DubbingProject, onProgress?: (p:number,m:string)=>void) {
  const input = resolveMediaUrl(project.source_video_url); if (!input) throw new Error('Invalid source video');
  project.render_warning=undefined;
  const mediaInfo = await probeMedia(input);
  const targetMediaDuration=mediaInfo.video?.duration??mediaInfo.duration;
  const dir = path.join(getStorageRoot(), project.id.replace(/[^a-zA-Z0-9._-]/g, '_'), 'dub-work'); await mkdir(dir,{recursive:true});
  // Translation models occasionally return punctuation-only fragments such as
  // ".". They are not speakable and VieNeu correctly rejects them with
  // "No valid speech tokens", so exclude them from both TTS and subtitle muxing.
  const enabled = project.segments.filter(s=>s.enabled && hasSpokenContent(s.translated_text));
  if (!enabled.length) throw new Error('Transcript has no enabled segments');
  const untranslated=project.segments.filter(s=>s.enabled&&isInvalidTranslationSegment(s));
  if(untranslated.length)throw new Error(`Còn ${untranslated.length} đoạn tiếng Trung chưa được dịch. Hãy bấm Dịch các đoạn còn thiếu trước khi xuất.`);
  const srt = buildReadableSrt(enabled);
  const srtPath=path.join(dir,'translated.srt'); await writeFile(srtPath,srt,'utf8');
  let voiceSegments=enabled;
  if (project.mode !== 'SUBTITLES') {
    for(let i=0;i<enabled.length;i++){
      const seg=enabled[i]; onProgress?.(10+Math.round(i/enabled.length*55),`Tạo giọng ${i+1}/${enabled.length}`);
      if(!seg.voice_url || seg.voice_outdated || seg.voice_signature!==voiceSignature(project,seg)) {
        await generateSegmentPreview(project,seg,project.segments.indexOf(seg)+1);
      }
    }
    reflowVoiceTimeline(project);
    voiceSegments=await fitVoiceTailInsideVideo(project,enabled,targetMediaDuration,dir);
    if(!voiceSegments.length)throw new Error('Không còn đoạn giọng hợp lệ nằm trong thời lượng video.');
  }
  onProgress?.(70,project.blur_source_text!==false?'Đang che chữ gốc, trộn âm thanh và phụ đề':'Đang trộn âm thanh và phụ đề');
  const out=path.join(getStorageRoot(),project.id.replace(/[^a-zA-Z0-9._-]/g,'_'),'dubbed.mp4');
  const args=['-y','-i',input];
  const filters:string[]=[]; const maps:string[]=[];
  if(project.mode!=='SUBTITLES'){
    for(const seg of voiceSegments) args.push('-i',resolveMediaUrl(seg.voice_url!)!);
    const delayed=voiceSegments.map((seg,i)=>{const delay=Math.max(0,Math.round((seg.voice_start??seg.start)*1000));return `[${i+1}:a]adelay=${delay}|${delay},volume=${project.voice_volume}[v${i}]`}).join(';');
    const baseVol = Math.max(0, Math.min(1, project.original_audio_volume));
    // Mix voices in small groups. A single 142-input amix plus a 142-term
    // volume expression exhausts FFmpeg's filter parser/memory on Windows.
    const mixStages:string[]=[];
    let labels=voiceSegments.map((_,i)=>`v${i}`);
    let level=0;
    while(labels.length>1){
      const next:string[]=[];
      for(let i=0;i<labels.length;i+=16){
        const group=labels.slice(i,i+16);
        if(group.length===1){next.push(group[0]);continue;}
        const outLabel=`vm${level}_${Math.floor(i/16)}`;
        mixStages.push(`${group.map(label=>`[${label}]`).join('')}amix=inputs=${group.length}:duration=longest:normalize=0[${outLabel}]`);
        next.push(outLabel);
      }
      labels=next;level++;
    }
    const voiceBus=labels[0];
    const wholeDuration=targetMediaDuration.toFixed(3);
    const origFilter = project.keep_original_bgm !== false ? `volume=${baseVol},bandreject=f=1000:w=1200` : `volume=${baseVol}`;
    filters.push(`${delayed};${mixStages.join(';')};[${voiceBus}]apad=whole_dur=${wholeDuration},asplit=2[voicekey][voiceout];[0:a]${origFilter},apad=whole_dur=${wholeDuration}[orig];[orig][voicekey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=250[ducked];[ducked][voiceout]amix=inputs=2:duration=first:normalize=0[aout]`);
    maps.push('-map','0:v','-map','[aout]');
  } else maps.push('-map','0:v','-map','0:a?');
  let videoInput='[0:v]';
  if(project.blur_source_text!==false){
    const x=Math.max(0,Math.min(99,project.source_text_blur_x??0));
    const y=Math.max(0,Math.min(99,project.source_text_blur_y??70));
    const width=Math.max(1,Math.min(100-x,project.source_text_blur_width??100));
    const configuredHeight=project.source_text_blur_height??(100-y);
    // Migrate the old 72% + 24% default which left the bottom 4% exposed.
    const height=Math.max(1,Math.min(100-y,(y===72&&configuredHeight===24)?100-y:configuredHeight));
    const strength=Math.max(2,Math.min(30,Math.round(project.source_text_blur_strength??12)));
    const videoWidth=mediaInfo.video?.width||1280; const videoHeight=mediaInfo.video?.height||720;
    const even=(value:number)=>Math.max(0,Math.floor(value/2)*2);
    const cropX=even(videoWidth*x/100); const cropY=even(videoHeight*y/100);
    const cropW=Math.max(2,even(Math.min(videoWidth-cropX,videoWidth*width/100)));
    const cropH=Math.max(2,even(Math.min(videoHeight-cropY,videoHeight*height/100)));
    filters.push(`${videoInput}split=2[vbase][vtext];[vtext]crop=w=${cropW}:h=${cropH}:x=${cropX}:y=${cropY},boxblur=luma_radius=${strength}:luma_power=2:chroma_radius=${Math.max(1,Math.round(strength/2))}:chroma_power=1[vblur];[vbase][vblur]overlay=x=${cropX}:y=${cropY}[vclean]`);
    videoInput='[vclean]';
  }
  if(project.blur_source_logo!==false){
    const lx=Math.max(0,Math.min(99,project.source_logo_blur_x??0));
    const ly=Math.max(0,Math.min(99,project.source_logo_blur_y??0));
    const lwidth=Math.max(1,Math.min(100-lx,project.source_logo_blur_width??34));
    const lheight=Math.max(1,Math.min(100-ly,project.source_logo_blur_height??20));
    const lstrength=Math.max(2,Math.min(40,Math.round(project.source_logo_blur_strength??24)));
    const videoWidth=mediaInfo.video?.width||1280; const videoHeight=mediaInfo.video?.height||720;
    const even=(value:number)=>Math.max(0,Math.floor(value/2)*2);
    const lcropX=even(videoWidth*lx/100); const lcropY=even(videoHeight*ly/100);
    const lcropW=Math.max(2,even(Math.min(videoWidth-lcropX,videoWidth*lwidth/100)));
    const lcropH=Math.max(2,even(Math.min(videoHeight-lcropY,videoHeight*lheight/100)));
    filters.push(`${videoInput}split=2[vbase_logo][vlogo];[vlogo]crop=w=${lcropW}:h=${lcropH}:x=${lcropX}:y=${lcropY},boxblur=luma_radius=${lstrength}:luma_power=3:chroma_radius=${Math.max(1,Math.round(lstrength/2))}:chroma_power=2[vlogo_blur];[vbase_logo][vlogo_blur]overlay=x=${lcropX}:y=${lcropY}[vclean_logo]`);
    videoInput='[vclean_logo]';
  }
  if(project.burn_subtitles){
    const position=Math.max(50,Math.min(94,project.subtitle_position??78));
    // SRT rendered by libass uses the default ASS PlayResY=288. MarginV is in
    // that coordinate system, not output-video pixels. Passing a 720p pixel
    // margin made 78% preview render around the middle of the final video.
    const assPlayResY=288;
    const margin=Math.max(8,Math.round(assPlayResY*(1-position/100)));
    const sub=`subtitles=translated.srt:force_style='FontName=Arial,FontSize=12,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=${margin}'`;
    filters.push(`${videoInput}${sub}[vout]`); videoInput='[vout]';
  }
  if(videoInput!=='[0:v]') maps[1]=videoInput;
  const filter=filters.join(';');
  args.push(filter?'-filter_complex':'-vf',filter || 'null',...maps,'-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k','-movflags','+faststart',out);
  await run(ffmpeg(),args,dir,20*60_000);
  const renderedInfo=await probeMedia(out);
  const videoDuration=renderedInfo.video?.duration??renderedInfo.duration;
  const audioDuration=renderedInfo.audio?.duration??renderedInfo.duration;
  const durationDelta=Math.abs(videoDuration-audioDuration);
  const warnings=[project.render_warning];
  if(durationDelta>.5)warnings.push(`Cảnh báo QA: audio/video lệch ${durationDelta.toFixed(2)} giây.`);
  project.render_warning=warnings.filter(Boolean).join(' ')||undefined;
  onProgress?.(100,project.render_warning||'Hoàn tất');
  return `/media/${project.id.replace(/[^a-zA-Z0-9._-]/g,'_')}/dubbed.mp4?v=${Date.now()}`;
}

export async function generateSegmentPreview(project:DubbingProject,segment:DubbingSegment,index?:number,cadenceAttempt=0){
  const voiceProfile=project.voice_profile && project.voice_profile!=='default' ? project.voice_profile : undefined;
  segment.compressed_text=undefined;
  let synthesisText=normalizeDubbingText(segment.translated_text);
  if(!hasSpokenContent(synthesisText)) throw new Error('Đoạn này chỉ có dấu câu hoặc ký hiệu nên không cần tạo giọng.');
  let voice=await synthesizeWithRetry({text:synthesisText,language:project.target_language,voice:voiceProfile});
  const automatic=(segment.voice_timing_mode??'AUTO')==='AUTO';
  const segmentIndex=project.segments.indexOf(segment);
  const nextEnabled=project.segments.slice(segmentIndex+1).find(item=>item.enabled&&item.translated_text.trim());
  // Silence after a source line is safe dubbing room. Use it before speeding up
  // the Vietnamese voice, but never let this segment overlap the next voice.
  const available=Math.max(.25,(nextEnabled?.start??segment.end)-segment.start,segment.end-segment.start);
  let fitSpeed=voice.durationSeconds/available;
  // Prefer keeping the complete translation at a moderate speed. Earlier we
  // shortened above 1.25x, which made later dense scenes sound as if dialogue
  // had been omitted. Concision is now the last resort beyond 1.35x.
  if(automatic && fitSpeed>1.35){
    const concise=await shortenForDuration(project,synthesisText,available);
    const originalWords=countSpokenWords(synthesisText);
    const retainedWords=concise?countSpokenWords(concise):0;
    const namesPreserved=likelyProperNames(synthesisText).every(name=>concise?.includes(name));
    // Reject destructive summaries. Timing must not silently discard most of
    // a line merely to make the timeline turn green.
    if(concise && concise!==synthesisText&&namesPreserved&&retainedWords>=Math.ceil(originalWords*.62)){
      synthesisText=normalizeDubbingText(concise);segment.compressed_text=synthesisText;
      voice=await synthesizeWithRetry({text:synthesisText,language:project.target_language,voice:voiceProfile});
      fitSpeed=voice.durationSeconds/available;
    }
  }
  const wordCount=countSpokenWords(synthesisText);
  const rawWordsPerSecond=wordCount/Math.max(.25,voice.durationSeconds);
  const targetWordsPerSecond=wordCount<=5?2.9:3.35;
  const cadenceSpeed=targetWordsPerSecond/Math.max(1.5,rawWordsPerSecond);
  const origDuration = Math.max(0.1, segment.end - segment.start);
  const targetMin = origDuration * 0.92;
  const targetMax = origDuration * 1.05;
  let speed = 1.0;
  if (automatic) {
    if (voice.durationSeconds > targetMax) {
      // Auto Speed Fit with Hard Overflow Guard: trần tối đa 1.18x để bảo toàn ngữ điệu tự nhiên, tránh nuốt chữ
      speed = Math.min(1.18, voice.durationSeconds / (origDuration * 0.98));
    } else if (voice.durationSeconds < targetMin) {
      speed = Math.max(0.88, voice.durationSeconds / (origDuration * 0.96));
    }
  } else {
    speed = Math.max(0.7, Math.min(1.8, segment.voice_speed ?? 1));
  }
  if(automatic){segment.voice_timing_mode='AUTO';segment.voice_start=segment.start;segment.voice_speed=Number(speed.toFixed(2));}
  const dir=path.join(getStorageRoot(),project.id.replace(/[^a-zA-Z0-9._-]/g,'_'),'dub-work');await mkdir(dir,{recursive:true});
  // Segment IDs remain stable when rows are merged/deleted; array indexes do
  // not. Index-based names could overwrite another segment's cached voice.
  const stableId=segment.id.replace(/[^a-zA-Z0-9_-]/g,'_');
  const suffix=stableId||String(index??project.segments.indexOf(segment)+1).padStart(3,'0');
  const raw=path.join(dir,`preview-raw-${suffix}.wav`);const adjusted=path.join(dir,`preview-${suffix}.wav`);await writeFile(raw,voice.audio);
  // VieNeu occasionally emits digital silence before speech or after EOS.
  // Trim leading silence and trailing silence (via areverse) while preserving 100%
  // of internal pauses between spoken words, then append a 0.18s natural cushion.
  const silenceCleanup='silenceremove=start_periods=1:start_duration=0.05:start_threshold=-38dB,areverse,silenceremove=start_periods=1:start_duration=0.05:start_threshold=-38dB,areverse,apad=pad_dur=0.18';
  await run(ffmpeg(),['-y','-i',raw,'-filter:a',`${silenceCleanup},atempo=${speed}`,adjusted]);
  const {readFile}=await import('node:fs/promises');segment.voice_url=await saveProjectAsset(project.id,`segment-${suffix}-voice.wav`,await readFile(adjusted));
  const adjustedInfo=await probeMedia(adjusted);
  segment.voice_duration=adjustedInfo.audio?.duration??adjustedInfo.duration;
  segment.voice_overflow=Math.max(0,segment.voice_duration-available);
  segment.voice_words_per_second=wordCount/Math.max(.25,segment.voice_duration);
  // VieNeu is stochastic and occasionally produces a genuinely rushed or
  // lethargic take even at 1.0x. Reject those takes and synthesize again; never
  // use atempo<1 (artificial slowing remains disabled).
  if(cadenceAttempt<2&&(segment.voice_words_per_second<2.9||segment.voice_words_per_second>5.15)){
    return generateSegmentPreview(project,segment,index,cadenceAttempt+1);
  }
  segment.timing_quality=segment.voice_overflow>.08?'NEEDS_REVIEW':Math.abs(speed-1)>.12?'ADJUSTED':'NATURAL';
  reflowVoiceTimeline(project);
  segment.voice_outdated=false;
  segment.voice_signature=voiceSignature(project,segment);return segment;
}

async function synthesizeWithRetry(request:TTSRequest){
  let lastError: unknown;
  for(let attempt=1;attempt<=3;attempt++){
    try{return await getTTSProvider(request.voice).synthesize(request);}catch(error){lastError=error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,750));}
  }
  throw lastError;
}

async function fitVoiceTailInsideVideo(project:DubbingProject,segments:DubbingSegment[],mediaDuration:number,dir:string){
  const safeEnd=Math.max(.25,mediaDuration-.08);
  const usable:DubbingSegment[]=[];
  let skipped=0;
  for(const segment of segments){
    if(!segment.voice_url||!segment.voice_duration)continue;
    const start=segment.voice_start??segment.start;
    const overflow=start+segment.voice_duration-safeEnd;
    if(overflow<=.03){usable.push(segment);continue;}
    const available=safeEnd-start;
    if(available<=.2){segment.timing_quality='NEEDS_REVIEW';skipped++;continue;}
    const extraSpeed=segment.voice_duration/available;
    if(extraSpeed>2.5){segment.timing_quality='NEEDS_REVIEW';skipped++;continue;}
    const input=resolveMediaUrl(segment.voice_url);
    if(!input){segment.timing_quality='NEEDS_REVIEW';skipped++;continue;}
    const suffix=(segment.id.match(/\d+$/)?.[0]??String(project.segments.indexOf(segment)+1)).padStart(3,'0');
    const adjusted=path.join(dir,`preview-tail-${suffix}.wav`);
    try{
      await run(ffmpeg(),['-y','-i',input,'-filter:a',`atempo=${extraSpeed.toFixed(6)}`,adjusted]);
      const {readFile}=await import('node:fs/promises');
      segment.voice_url=await saveProjectAsset(project.id,`segment-${suffix}-voice.wav`,await readFile(adjusted));
      segment.voice_duration=available;
      segment.voice_speed=Math.min(2.5,(segment.voice_speed??1)*extraSpeed);
      segment.timing_quality='ADJUSTED';
      segment.voice_signature=voiceSignature(project,segment);
      usable.push(segment);
    }catch{segment.timing_quality='NEEDS_REVIEW';skipped++;}
  }
  if(skipped)project.render_warning=`Đã bỏ qua ${skipped} đoạn giọng nằm ngoài thời lượng video; MP4 vẫn được xuất.`;
  return usable;
}

export function reflowVoiceTimeline(project:DubbingProject){
  const ordered=project.segments.filter(s=>s.enabled&&s.voice_url&&s.voice_duration).sort((a,b)=>a.start-b.start);
  const globalOffsetSeconds = Math.max(0, (project.voice_delay_ms ?? 50) / 1000);

  for(const segment of ordered){
    // AUTO voices are anchored independently to their detected speech cue.
    // Chaining every cue after the previous voice caused tiny gaps to compound
    // into 10-20 second drift near the end of longer episodes.
    const minStart = segment.start + globalOffsetSeconds;
    if (segment.voice_timing_mode !== 'MANUAL') {
      segment.voice_start = minStart;
    } else {
      segment.voice_start = Math.max(segment.start, segment.voice_start ?? segment.start);
    }
    segment.voice_timeline_shift = Math.max(0, (segment.voice_start ?? minStart) - segment.start);
  }
  return project;
}

export function splitOverlongSegments(project: DubbingProject, maxSeconds = 6.5): DubbingProject {
  const result: DubbingSegment[] = [];
  for (const seg of project.segments) {
    const duration = seg.end - seg.start;
    if (duration <= maxSeconds || seg.translated_text.length < 15) {
      result.push({ ...seg });
      continue;
    }

    // Never create timeline placeholders containing only '.', quotes or other
    // punctuation. They used to become silent holes that render silently skipped.
    const sentences = seg.translated_text.split(/(?<=[.!?；;。！？\n])\s*/).filter(hasSpokenContent);
    const sourceSentences = seg.source_text.split(/(?<=[.!?；;。！？\n])\s*/).filter(hasSpokenContent);

    if (sentences.length >= 2) {
      const parts = sentences.length;
      const weights=sentences.map(countSpokenWords);
      const totalWeight=weights.reduce((sum,value)=>sum+value,0);
      let curStart = seg.start;
      let curSrcPos = 0;
      for (let i = 0; i < parts; i++) {
        const segDur = duration * weights[i] / totalWeight;
        const curEnd = i === parts - 1 ? seg.end : Number((curStart + segDur).toFixed(3));
        let srcTxt = '';
        if (sourceSentences.length === parts) {
          srcTxt = sourceSentences[i];
        } else {
          const nextSrcPos = i === parts - 1 ? seg.source_text.length : Math.round(curSrcPos + seg.source_text.length * (weights[i] / totalWeight));
          srcTxt = seg.source_text.slice(curSrcPos, nextSrcPos).trim();
          curSrcPos = nextSrcPos;
        }
        result.push({
          ...seg,
          id: `seg-${result.length + 1}`,
          start: curStart,
          end: curEnd,
          source_text: srcTxt || seg.source_text,
          translated_text: sentences[i],
          voice_url: undefined,
          voice_duration: undefined,
          voice_signature: undefined,
          voice_outdated: true,
          voice_start: curStart,
          voice_speed: 1,
        });
        curStart = curEnd;
      }
    } else {
      const mid = Math.floor(seg.translated_text.length / 2);
      const spaceIdx = seg.translated_text.indexOf(' ', mid);
      const splitPos = spaceIdx !== -1 ? spaceIdx : mid;

      const t1 = seg.translated_text.slice(0, splitPos).trim();
      const t2 = seg.translated_text.slice(splitPos).trim();
      const midTime = Number((seg.start + duration / 2).toFixed(3));
      
      const srcSplitPos = Math.round(seg.source_text.length * (t1.length / Math.max(1, seg.translated_text.length)));
      const s1 = seg.source_text.slice(0, srcSplitPos).trim();
      const s2 = seg.source_text.slice(srcSplitPos).trim();

      result.push(
        {
          ...seg,
          id: `seg-${result.length + 1}`,
          start: seg.start,
          end: midTime,
          source_text: s1 || seg.source_text,
          translated_text: t1,
          voice_url: undefined,
          voice_duration: undefined,
          voice_signature: undefined,
          voice_outdated: true,
          voice_start: seg.start,
          voice_speed: 1,
        },
        {
          ...seg,
          id: `seg-${result.length + 1}`,
          start: midTime,
          end: seg.end,
          source_text: s2 || seg.source_text,
          translated_text: t2,
          voice_url: undefined,
          voice_duration: undefined,
          voice_signature: undefined,
          voice_outdated: true,
          voice_start: midTime,
          voice_speed: 1,
        }
      );
    }
  }

  project.segments = result.map((s, idx) => ({ ...s, id: `seg-${idx + 1}` }));
  return project;
}

export async function analyzeStoryContext(project:DubbingProject,previousEpisodeSummaries:string[]=[]){
  const key=process.env.GEMINI_API_KEY;
  if(!key||key==='MY_GEMINI_API_KEY')throw new Error('Cần GEMINI_API_KEY để phân tích cốt truyện.');
  const ai=new GoogleGenAI({apiKey:key});
  const transcript=project.segments.map((s,i)=>`[${i+1}] ${s.speaker?`${s.speaker}: `:''}${s.source_text}`).join('\n');
  const response=await ai.models.generateContent({
    model:process.env.GEMINI_TEXT_MODEL||'gemini-3.5-flash-lite',
    contents:`Analyze this episode before Vietnamese translation. Use prior episode summaries to preserve plot, names, relationships, pronouns, terminology and tone. Return JSON with keys summary, characters, glossary, translation_guidance. Do not invent facts.\n\nSeries: ${project.series_name||'Unassigned'}\nEpisode: ${project.episode_number||'Unknown'}\nPrior summaries:\n${previousEpisodeSummaries.join('\n')||'None'}\n\nFull transcript:\n${transcript}`,
    config:{responseMimeType:'application/json'},
  });
  const parsed=JSON.parse(response.text||'{}') as {summary?:string;characters?:unknown;glossary?:unknown;translation_guidance?:unknown};
  project.story_summary=String(parsed.summary||'').trim();
  project.story_context=JSON.stringify(parsed,null,2);
  project.story_analyzed_at=new Date().toISOString();
  return project;
}

const VOICE_PIPELINE_VERSION='v3-cadence-content';
function voiceSignature(project:DubbingProject,segment:DubbingSegment){return `${VOICE_PIPELINE_VERSION}|${segment.translated_text.trim()}|${segment.compressed_text??''}|${project.voice_profile??'default'}|${segment.voice_timing_mode??'AUTO'}|${Math.max(.7,Math.min(1.8,segment.voice_speed??1)).toFixed(2)}`;}

function normalizeDubbingText(text:string){
  return text.trim().replace(/\bng\s+ta\b/giu,'người ta').replace(/\s+/g,' ').replace(/[.…]{2,}/g,'').replace(/\s*[-–—]\s*/g,', ').replace(/([!?]){2,}/g,'$1');
}

export function hasSpokenContent(text:string){return /[\p{L}\p{N}]/u.test(normalizeDubbingText(text));}

export function isInvalidTranslationSegment(segment:DubbingSegment){
  return hasSpokenContent(segment.source_text)&&(!hasSpokenContent(segment.translated_text)||/[\u3400-\u9fff]/u.test(segment.translated_text));
}

function countSpokenWords(text:string){return Math.max(1,text.match(/[\p{L}\p{N}]+/gu)?.length??1);}

function buildReadableSrt(segments:DubbingSegment[]){
  const rawCues:Array<{start:number;end:number;text:string}>=[];
  for(const segment of segments){
    const text=segment.translated_text.trim();
    if(!text)continue;
    const duration=Math.max(.6,segment.end-segment.start);
    const maxChars=Math.max(16,Math.floor(duration*15));
    const chunks=splitSubtitleText(text,maxChars);
    const weights=chunks.map(chunk=>Math.max(1,countSpokenWords(chunk)));
    const total=weights.reduce((sum,value)=>sum+value,0);
    let cursor=segment.start;
    chunks.forEach((chunkText,index)=>{
      const cueEnd=index===chunks.length-1?segment.end:cursor+duration*weights[index]/total;
      rawCues.push({start:cursor,end:cueEnd,text:chunkText});
      cursor=cueEnd;
    });
  }

  const GAP_SEC=0.09;
  const adjustedCues:Array<{start:number;end:number;text:string}>=[];

  for(let i=0;i<rawCues.length;i++){
    const current={...rawCues[i]};
    const next=rawCues[i+1];
    if(next){
      const maxAllowedEnd=next.start-GAP_SEC;
      if(current.end>maxAllowedEnd){
        current.end=Math.max(current.start+.1,maxAllowedEnd);
      }
    }
    adjustedCues.push(current);
  }

  for(let i=0;i<adjustedCues.length;i++){
    const cur=adjustedCues[i];
    const cLen=cur.text.replace(/\s+/g,'').length;
    let cDur=Math.max(.1,cur.end-cur.start);
    let cps=cLen/cDur;

    if(cps>19.0){
      const targetDur=cLen/18.0;
      const diff=targetDur-cDur;
      const nxt=adjustedCues[i+1];
      const prev=i>0?adjustedCues[i-1]:undefined;

      if(nxt){
        const nLen=nxt.text.replace(/\s+/g,'').length;
        const nDur=Math.max(.1,nxt.end-nxt.start);
        const nCps=nLen/nDur;
        if(nCps<17.5){
          const shift=Math.min(diff,(nxt.end-nxt.start)*0.4);
          cur.end+=shift;
          nxt.start+=shift;
        }
      }

      cDur=Math.max(.1,cur.end-cur.start);
      cps=cLen/cDur;

      if(cps>19.0&&prev){
        const pLen=prev.text.replace(/\s+/g,'').length;
        const pDur=Math.max(.1,prev.end-prev.start);
        const pCps=pLen/pDur;
        if(pCps<17.5){
          const shift=Math.min(diff,(prev.end-prev.start)*0.3);
          prev.end-=shift;
          cur.start-=shift;
        }
      }
    }
  }

  for(let i=0;i<adjustedCues.length-1;i++){
    if(adjustedCues[i].end>adjustedCues[i+1].start-GAP_SEC){
      adjustedCues[i].end=adjustedCues[i+1].start-GAP_SEC;
    }
  }

  return adjustedCues.map((cue,index)=>`${index+1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${wrapSubtitle(cue.text,36)}\n`).join('\n');
}

function splitSubtitleText(text:string,maxChars:number){
  const sentences=text.match(/[^.!?…]+[.!?…]?/g)?.map(value=>value.trim()).filter(Boolean)??[text];
  const chunks:string[]=[];
  for(const sentence of sentences){
    if(sentence.length<=maxChars){chunks.push(sentence);continue;}
    const semanticBreaks=[...sentence.matchAll(/,|;|:|\b(?:nhưng|và|mà|rồi|nên|vì)\b/giu)]
      .filter(match=>(match.index??0)>=Math.max(12,sentence.length*.25)&&(match.index??0)<=sentence.length*.75)
      .sort((a,b)=>Math.abs((a.index??0)-sentence.length/2)-Math.abs((b.index??0)-sentence.length/2));
    const best=semanticBreaks[0];
    if(best?.index!==undefined){
      const cut=best.index+best[0].length;
      chunks.push(...splitSubtitleText(sentence.slice(0,cut).trim(),maxChars));
      chunks.push(...splitSubtitleText(sentence.slice(cut).trim(),maxChars));
      continue;
    }
    const words=sentence.split(/\s+/);const partCount=Math.ceil(sentence.length/maxChars);let cursor=0;
    for(let part=0;part<partCount;part++){
      const partsLeft=partCount-part;const remaining=words.slice(cursor).join(' ');
      const target=Math.ceil(remaining.length/partsLeft);let current='';
      while(cursor<words.length){
        const candidate=current?`${current} ${words[cursor]}`:words[cursor];
        if(partsLeft>1&&current&&candidate.length>target&&words.length-cursor>=partsLeft-1)break;
        current=candidate;cursor++;
      }
      if(current)chunks.push(current);
    }
  }
  return chunks.length?chunks:[text];
}

function pauseGapFor(text:string){
  const value=text.trim();
  if(/[.!?…]$/u.test(value))return .24;
  if(/[,;:]$/u.test(value))return .12;
  return .06;
}

function wrapSubtitle(text:string,lineLength:number){
  const words=text.split(/\s+/);const lines:string[]=[];let current='';
  for(const word of words){const candidate=current?`${current} ${word}`:word;if(candidate.length>lineLength&&current){lines.push(current);current=word;}else current=candidate;}
  if(current)lines.push(current);return lines.join('\n');
}

async function shortenForDuration(project:DubbingProject,text:string,seconds:number){
  const key=process.env.GEMINI_API_KEY;if(!key||key==='MY_GEMINI_API_KEY')return text;
  const ai=new GoogleGenAI({apiKey:key});
  const maxWords=Math.max(3,Math.floor(seconds*3.5));
  const requiredNames=likelyProperNames(text);
  const response=await ai.models.generateContent({model:process.env.GEMINI_TEXT_MODEL||'gemini-3.5-flash-lite',contents:`Rewrite this ${project.target_language} dubbing line as natural spoken narration in STRICTLY at most ${maxWords} words so it fits ${seconds.toFixed(2)} seconds. Preserve every plot fact, action, proper name and change of speaker; only remove redundant wording and filler. Never summarize away an event. These name tokens MUST remain verbatim: ${requiredNames.join(', ')||'none'}. Return only the rewritten line, with no explanation.\n${text}`});
  return (response.text||text).trim().replace(/^['"“”]|['"“”]$/g,'');
}

function likelyProperNames(text:string){
  const names=new Set<string>();
  for(const match of text.matchAll(/\p{Lu}[\p{L}\p{M}]{2,}/gu)){
    const index=match.index??0;
    // Ignore an ordinary capitalized first word, but retain later capitalized
    // tokens: Vietnamese multi-word character/place names depend on them.
    if(index===0)continue;
    const before=text.slice(0,index).trimEnd().at(-1);
    if(before&&/[.!?…]/u.test(before))continue;
    names.add(match[0]);
  }
  return [...names];
}

function srtTime(seconds:number){const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms%3600000/60000)).padStart(2,'0')}:${String(Math.floor(ms%60000/1000)).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;}
function run(command:string,args:string[],cwd?:string,timeout=10*60_000,onStdoutLine?:(line:string)=>void){return new Promise<string>((resolve,reject)=>{const child=spawn(command,args,{cwd,windowsHide:true,env:process.env});let stdout='',stderr='',lineBuffer='';const timer=setTimeout(()=>{child.kill();reject(new Error('Process timed out'));},timeout);child.stdout.on('data',chunk=>{const text=String(chunk);stdout+=text;if(onStdoutLine){lineBuffer+=text;const lines=lineBuffer.split(/\r?\n/);lineBuffer=lines.pop()??'';for(const line of lines)onStdoutLine(line);}});child.stderr.on('data',c=>stderr=(stderr+c).slice(-12000));child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);if(onStdoutLine&&lineBuffer)onStdoutLine(lineBuffer);code===0?resolve(stdout):reject(new Error(`${path.basename(command)} exited ${code}: ${stderr}`))});});}
