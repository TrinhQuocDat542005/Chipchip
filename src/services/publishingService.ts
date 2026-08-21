import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { Publication, VideoProject } from '../types';
import { getStorageRoot, resolveMediaUrl } from './assetStorage';
import { projectStore } from './projectStore';

export async function publishProject(project: VideoProject, platform: Publication['platform']) {
  if (!project.final_video_url || !['REVIEW', 'COMPLETED'].includes(project.status)) throw new Error('Video must be rendered and reviewed before publishing');
  const now = new Date().toISOString();
  const item: Publication = { id: `pub-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, project_id: project.id, platform, status: 'PENDING', created_at: now, updated_at: now };
  projectStore.savePublication(item);
  try {
    // A portable export package is always available. Platform adapters can be connected with OAuth later.
    const safeId = project.id.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = path.join(getStorageRoot(), safeId, 'publish'); await mkdir(dir, { recursive: true });
    const videoPath = resolveMediaUrl(project.final_video_url); if (!videoPath) throw new Error('Final video is outside managed storage');
    await copyFile(videoPath, path.join(dir, 'video.mp4'));
    await writeFile(path.join(dir, 'metadata.json'), JSON.stringify({ title: project.title, caption: project.caption, hashtags: project.hashtags, platform, language: project.language }, null, 2));
    await writeFile(path.join(dir, 'caption.txt'), `${project.caption || project.title}\n\n${(project.hashtags || []).join(' ')}`);
    item.status = 'PACKAGE_READY'; item.package_url = `/media/${safeId}/publish/metadata.json`; item.updated_at = new Date().toISOString();
  } catch (error) { item.status = 'FAILED'; item.error_message = (error as Error).message; item.updated_at = new Date().toISOString(); }
  return projectStore.savePublication(item);
}
