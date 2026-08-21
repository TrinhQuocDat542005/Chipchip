import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export function getStorageRoot() {
  return path.resolve(process.env.ASSET_ROOT || 'storage');
}

export function resolveMediaUrl(url: string): string | null {
  if (!url.startsWith('/media/')) return null;
  // Generated assets may carry a cache-busting query string. It belongs to
  // the browser URL and must never become part of the local file path.
  const relative = decodeURIComponent(url.slice('/media/'.length).split(/[?#]/,1)[0]);
  const resolved = path.resolve(getStorageRoot(), relative);
  const root = path.resolve(getStorageRoot()) + path.sep;
  return resolved.startsWith(root) ? resolved : null;
}

export async function saveProjectAsset(
  projectId: string,
  fileName: string,
  contents: Buffer
): Promise<string> {
  const safeProjectId = sanitizeSegment(projectId);
  const safeFileName = sanitizeSegment(fileName);
  const directory = path.join(getStorageRoot(), safeProjectId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, safeFileName), contents);
  return `/media/${safeProjectId}/${safeFileName}`;
}

function sanitizeSegment(value: string) {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe || safe === '.' || safe === '..') throw new Error('Invalid asset path segment');
  return safe;
}
