import { ImageGenerationProvider, ImageGenerationRequest } from './types';

export class PlaceholderImageProvider implements ImageGenerationProvider {
  readonly id = 'placeholder';

  async generate(request: ImageGenerationRequest) {
    return {
      url: createProceduralSceneArtwork(request.prompt, request.sceneNumber, request.topic,request.aspectRatio||'9:16'),
      provider: this.id,
      model: 'procedural-svg-v1',
    };
  }

  async healthCheck() {
    return { available: true, message: 'Local procedural placeholder is available.' };
  }
}

function createProceduralSceneArtwork(prompt: string, sceneNumber: number, topic: string,aspectRatio:'9:16'|'16:9'|'1:1'): string {
  const themes = [
    ['#0e0b16', '#2a1a4a', '#8B5CF6'], ['#05131e', '#0b2b40', '#3B82F6'],
    ['#190a16', '#4a1132', '#EC4899'], ['#0a1913', '#123e2c', '#4EDE00'],
  ];
  const [bg1, bg2, accent] = themes[(sceneNumber - 1) % themes.length];
  const title = escapeXml(topic.slice(0, 42));
  const detail = escapeXml(prompt.slice(0, 140));
  const landscape=aspectRatio==='16:9';const square=aspectRatio==='1:1';
  const width=landscape?960:square?720:540,height=landscape?540:square?720:960;
  const centerX=width/2,centerY=height*.42,titleY=height*.76,detailY=height*.81;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient><radialGradient id="g"><stop stop-color="${accent}" stop-opacity=".55"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#b)"/><circle cx="${centerX}" cy="${centerY}" r="${Math.min(width,height)*.42}" fill="url(#g)"/><circle cx="${centerX}" cy="${centerY}" r="105" fill="none" stroke="${accent}" stroke-width="3"/><text x="36" y="55" fill="${accent}" font-family="Arial" font-size="18">CONCEPT ${String(sceneNumber).padStart(2, '0')}</text><text x="${centerX}" y="${titleY}" fill="white" text-anchor="middle" font-family="Arial" font-size="25" font-weight="bold">${title}</text><foreignObject x="${width*.1}" y="${detailY}" width="${width*.8}" height="${height*.15}"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#ddd;font:15px Arial;text-align:center;line-height:1.5">${detail}</div></foreignObject></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
