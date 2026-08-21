import { GoogleGenAI, Type } from '@google/genai';
import { ScriptGenInput, ScriptPlanOutput } from '../types';

export async function generateScriptWithGemini(input: ScriptGenInput): Promise<ScriptPlanOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  const isVietnamese = /vietnamese|tiếng việt/i.test(input.language);

  // Fallback fallback output if API key is missing or calls fail
  const fallbackOutput: ScriptPlanOutput = {
    title: input.topic.length > 30 ? input.topic.substring(0, 30) + '...' : input.topic,
    hook: isVietnamese ? `Khám phá những bí mật chưa được kể về ${input.topic}.` : `Discover the untold secrets behind ${input.topic}.`,
    narration_body: isVietnamese
      ? `Chúng ta sẽ khám phá ${input.topic} qua những góc nhìn đầy cuốn hút, hé lộ các chi tiết đáng kinh ngạc trong từng cảnh.`
      : `We are exploring ${input.topic} in high detail. Every scene brings a new perspective to light, revealing incredible facts and visual spectacles.`,
    call_to_action: isVietnamese ? 'Theo dõi để khám phá thêm nhiều câu chuyện thú vị!' : 'Subscribe now for more extraordinary AI-generated visual journeys!',
    estimated_duration_seconds: input.duration === '30 seconds' ? 30 : input.duration === '60 seconds' ? 60 : 90,
    caption: isVietnamese ? `Khám phá ${input.topic} 🚀 #VideoAI #KhamPha` : `Unlocking ${input.topic} 🚀 #AIVideo #Shorts #Tech`,
    hashtags: isVietnamese ? ['#VideoAI', '#KhamPha', '#BiAn', '#Shorts'] : ['#AIVideo', '#Shorts', '#Viral', '#Exploration'],
    scenes: [
      {
        scene_number: 1,
        duration: 5,
        narration: isVietnamese ? `Khám phá những bí mật chưa được kể về ${input.topic}.` : `Discover the untold secrets behind ${input.topic}.`,
        subtitle: isVietnamese ? `Bí mật của ${input.topic}...` : `Discover the secrets of ${input.topic}...`,
        visual_description: `Dramatic aerial establishing shot introducing ${input.topic} with moody lighting.`,
        image_prompt: `High detailed 8k cinematic vertical frame of ${input.topic}, moody atmospheric lighting, ${input.visual_style_name} visual style, hyperrealistic, 9:16 aspect ratio`,
        video_prompt: `Slow camera pan down revealing ${input.topic}, atmospheric volumetric fog, high detail`,
      },
      {
        scene_number: 2,
        duration: 8,
        narration: isVietnamese ? `Đi sâu hơn vào lịch sử và những chi tiết khiến chủ đề này trở nên cuốn hút.` : `Delving deeper into the structure and history that makes this phenomenon so captivating.`,
        subtitle: isVietnamese ? `Đi sâu vào lịch sử...` : `Delving deeper into the history...`,
        visual_description: `Close-up shot of detailed architectural or natural elements related to ${input.topic}.`,
        image_prompt: `Extreme close up of ${input.topic} intricate details, glowing ambient light, ${input.visual_style_name} visual style, cinematic 8k resolution, 9:16 vertical frame`,
        video_prompt: `Micro camera zoom in on intricate surface textures, subtle particle movement`,
      },
      {
        scene_number: 3,
        duration: 10,
        narration: isVietnamese ? `Các nghiên cứu và mô phỏng hé lộ những phát hiện đáng kinh ngạc từng bị che giấu.` : `Experts and simulations reveal astonishing revelations previously hidden from view.`,
        subtitle: isVietnamese ? `Những phát hiện đáng kinh ngạc...` : `Astonishing revelations revealed...`,
        visual_description: `Wide panoramic view of ${input.topic} surrounded by cinematic environmental effects.`,
        image_prompt: `Wide angle epic vertical shot of ${input.topic}, volumetric lighting, highly detailed 8k cinematic art, 9:16 aspect ratio`,
        video_prompt: `Drone ascending camera movement over the vast landscape of ${input.topic}`,
      },
      {
        scene_number: 4,
        duration: 7,
        narration: isVietnamese ? `Theo dõi để khám phá thêm nhiều câu chuyện thú vị!` : `Subscribe now for more extraordinary AI-generated visual journeys!`,
        subtitle: isVietnamese ? `Theo dõi để xem thêm!` : `Subscribe for more visual journeys!`,
        visual_description: `Final impactful climax shot with dramatic lighting and call to action aura.`,
        image_prompt: `Climactic dramatic vertical artwork of ${input.topic}, epic lighting flare, 8k resolution, ${input.visual_style_name} visual style`,
        video_prompt: `Slow pull back camera motion, subtle lens flare and particle effects`,
      },
    ],
  };

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.log('[GeminiService] GEMINI_API_KEY missing or default placeholder, returning structured template');
    return fallbackOutput;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are a professional viral short-form video director and script writer specializing in 9:16 TikTok, YouTube Shorts, and Instagram Reels videos.
Create an engaging, hook-driven video script broken into sequential scenes based on the user topic.

Language rule: Write title, hook, narration, subtitles, ending, caption, and hashtags in ${input.language}. Keep image_prompt and video_prompt in English for best media-provider compatibility.

Required format constraints:
- Hook (first 3-5 seconds): High impact, curiosity-driven opening sentence.
- Narration Body: Engaging factual or narrative storytelling.
- Call to Action: Clear closing engagement prompt.
- Scenes breakdown: Split into 4-7 distinct scenes matching the requested video duration (${input.duration}).
- Each scene MUST contain: scene_number, duration (seconds), narration, subtitle (short text snippet), visual_description, image_prompt (50-80 words detailed prompt for AI image generator in 9:16 format with style ${input.visual_style_name}), and video_prompt (camera movement instructions like 'pan up', 'zoom in', 'tracking shot').`;

    const prompt = `Topic: ${input.topic}
Platform: ${input.platform}
Requested Duration: ${input.duration}
Language: ${input.language}
Tone: ${input.tone}
Visual Style: ${input.visual_style_name}

Generate the complete video script breakdown in strict JSON schema format.`;

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite',
          contents: attempt === 1 ? prompt : `${prompt}\n\nPrevious output was invalid. Return ONLY valid JSON matching every required field and scene constraint.`,
          config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            hook: { type: Type.STRING },
            narration_body: { type: Type.STRING },
            call_to_action: { type: Type.STRING },
            estimated_duration_seconds: { type: Type.INTEGER },
            caption: { type: Type.STRING },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  scene_number: { type: Type.INTEGER },
                  duration: { type: Type.INTEGER },
                  narration: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  visual_description: { type: Type.STRING },
                  image_prompt: { type: Type.STRING },
                  video_prompt: { type: Type.STRING },
                },
                required: [
                  'scene_number',
                  'duration',
                  'narration',
                  'subtitle',
                  'visual_description',
                  'image_prompt',
                  'video_prompt',
                ],
              },
            },
          },
          required: [
            'title',
            'hook',
            'narration_body',
            'call_to_action',
            'estimated_duration_seconds',
            'caption',
            'hashtags',
            'scenes',
          ],
        },
          },
        });
        if (!response.text) throw new Error('Gemini returned an empty response');
        const parsed = JSON.parse(response.text) as ScriptPlanOutput;
        validateScriptPlan(parsed);
        return parsed;
      } catch (error) {
        lastError = error;
        console.warn(`[GeminiService] Attempt ${attempt} returned invalid script output:`, error);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Gemini script validation failed');
  } catch (error) {
    console.error('[GeminiService] Error generating script with Gemini:', error);
    return fallbackOutput;
  }
}

function validateScriptPlan(value: ScriptPlanOutput) {
  if (!value || typeof value !== 'object') throw new Error('Script plan must be an object');
  for (const field of ['title', 'hook', 'narration_body', 'call_to_action', 'caption'] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`Missing required field: ${field}`);
  }
  if (!Array.isArray(value.hashtags)) throw new Error('hashtags must be an array');
  if (!Array.isArray(value.scenes) || value.scenes.length < 2 || value.scenes.length > 10) {
    throw new Error('scenes must contain between 2 and 10 items');
  }
  value.scenes.forEach((scene, index) => {
    if (!Number.isFinite(scene.duration) || scene.duration <= 0 || scene.duration > 60) throw new Error(`Invalid duration in scene ${index + 1}`);
    for (const field of ['narration', 'subtitle', 'visual_description', 'image_prompt', 'video_prompt'] as const) {
      if (typeof scene[field] !== 'string' || !scene[field].trim()) throw new Error(`Missing ${field} in scene ${index + 1}`);
    }
  });
}
