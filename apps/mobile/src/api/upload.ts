/**
 * Uploading photos and videos: checking them against the limits before
 * sending, uploading with progress, and waiting for videos to process.
 */
import { checkImage, checkVideo, describeMediaProblem } from '@pinstripe/core';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

import { ApiError, type MastodonClient, type MastodonMedia } from './mastodon';

export type Picked = Pick<ImagePickerAsset, 'uri' | 'type' | 'mimeType' | 'fileSize' | 'width' | 'height' | 'duration' | 'fileName'>;

export function isVideo(asset: Picked) {
  return asset.type === 'video' || !!asset.mimeType?.startsWith('video/');
}

function mimeTypeOf(asset: Picked): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = (asset.fileName ?? asset.uri).split('?')[0]!.split('.').pop()?.toLowerCase();
  const byExt: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
  return byExt[ext ?? ''] ?? (isVideo(asset) ? 'video/mp4' : 'image/jpeg');
}

/**
 * The same rules the server applies (60 s, 1080p, 200 MB for video; 15 MB
 * for photos), checked before uploading so nobody waits on an upload that
 * will be refused. Returns a message, or null if it looks fine. Values the
 * picker didn't report are left for the server to check.
 */
export function checkPicked(asset: Picked): string | null {
  const mimeType = mimeTypeOf(asset);
  const problems = isVideo(asset)
    ? checkVideo({
        mimeType,
        bytes: asset.fileSize ?? 0,
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        // The picker reports milliseconds.
        durationSeconds: (asset.duration ?? 0) / 1000,
      })
    : checkImage({ mimeType, bytes: asset.fileSize ?? 0 });
  return problems[0] ? describeMediaProblem(problems[0]) : null;
}

/** A multipart file part: a Blob on web, React Native's {uri, name, type} elsewhere. */
async function filePart(asset: Picked): Promise<{ part: Blob | { uri: string; name: string; type: string }; name: string }> {
  const type = mimeTypeOf(asset);
  const name = asset.fileName ?? `upload.${type.split('/')[1] ?? 'bin'}`;
  if (Platform.OS === 'web') return { part: await (await fetch(asset.uri)).blob(), name };
  return { part: { uri: asset.uri, name, type }, name };
}

/** Sends multipart form data with upload progress (fetch has none), as XMLHttpRequest can. */
function send<T>(
  method: 'POST' | 'PATCH',
  url: string,
  token: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Not JSON; handled below.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve({ status: xhr.status, body: body as T });
      else {
        const message =
          (body as { error?: string } | null)?.error?.replace(/^Validation failed: /, '') ??
          (xhr.status === 413 ? 'That file is too large.' : `Upload failed (${xhr.status})`);
        reject(new ApiError(xhr.status, message));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection.'));
    xhr.send(form);
  });
}

export async function uploadMedia(
  client: MastodonClient,
  token: string,
  asset: Picked,
  options: { description?: string; onProgress?: (fraction: number) => void } = {},
): Promise<MastodonMedia> {
  const problem = checkPicked(asset);
  if (problem) throw new ApiError(422, problem);
  const form = new FormData();
  const { part, name } = await filePart(asset);
  form.append('file', part as Blob, name);
  if (options.description) form.append('description', options.description);
  const { body } = await send<MastodonMedia>('POST', `${client.server}/api/v2/media`, token, form, options.onProgress);
  return body;
}

/** Polls until a processing upload is ready (Mastodon answers 206 until then). */
export async function waitForMedia(client: MastodonClient, id: string, options: { timeoutMs?: number } = {}): Promise<MastodonMedia> {
  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60 * 1000);
  for (;;) {
    const media = await client.media(id);
    if (media.url) return media;
    if (Date.now() > deadline) throw new ApiError(0, 'Processing is taking too long. Please try again.');
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Replaces the avatar and/or banner (Mastodon's update_credentials, as multipart). */
export async function updateProfileImages(client: MastodonClient, token: string, images: { avatar?: Picked; header?: Picked }) {
  const form = new FormData();
  for (const kind of ['avatar', 'header'] as const) {
    const asset = images[kind];
    if (!asset) continue;
    const problem = checkPicked(asset);
    if (problem) throw new ApiError(422, problem);
    const { part, name } = await filePart(asset);
    form.append(kind, part as Blob, name);
  }
  const { body } = await send<import('./mastodon').MastodonCredentialAccount>(
    'PATCH',
    `${client.server}/api/v1/accounts/update_credentials`,
    token,
    form,
  );
  return body;
}
