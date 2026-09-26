/**
 * Writing a post: the text, up to four photos uploading as they're picked,
 * who can see it, and sending. Used by the Feed's composer and the Android
 * look's full-screen one.
 */
import { POST_MAX_LENGTH, type Visibility } from '@pinstripe/core';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import { type MastodonMedia, toMastodonVisibility, toPost } from '@/api/mastodon';
import { checkPicked, uploadMedia } from '@/api/upload';
import { useAuth, useSource } from '@/auth/session';
import { publishPostEvent } from '@/hooks/use-post-list';
import { play } from '@/sound/sounds';

export const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'followers', label: 'Followers only' },
  { value: 'direct', label: 'Mentioned only' },
];

/** A photo being attached: uploading until `media` is set. */
export interface Attachment {
  key: string;
  uri: string;
  progress: number;
  media?: MastodonMedia;
}

export function useComposer() {
  const { state, refreshAccount } = useAuth();
  const source = useSource();
  const [draft, setDraft] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(source.defaultVisibility);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const remaining = POST_MAX_LENGTH - [...draft].length;
  const uploading = attachments.some((a) => !a.media);
  const ready = attachments.filter((a) => a.media);
  const canPost = !posting && !uploading && (!!draft.trim() || ready.length > 0) && remaining >= 0;

  const pickPhotos = async () => {
    if (state.status !== 'signedIn') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4 - attachments.length,
      // JPEG rather than HEIC, so every server can show it.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.9,
    });
    if (result.canceled) return;
    setError(null);
    for (const asset of result.assets.slice(0, 4 - attachments.length)) {
      const problem = checkPicked(asset);
      if (problem) {
        setError(problem);
        continue;
      }
      const key = `${asset.uri}-${Date.now()}`;
      setAttachments((list) => [...list, { key, uri: asset.uri, progress: 0 }]);
      const update = (patch: Partial<Attachment>) => setAttachments((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
      uploadMedia(state.client, state.token, asset, { onProgress: (progress) => update({ progress }) })
        .then((media) => update({ media, progress: 1 }))
        .catch((e) => {
          setAttachments((list) => list.filter((a) => a.key !== key));
          setError(e instanceof Error ? e.message : 'Couldn’t upload that photo.');
        });
    }
  };

  const removeAttachment = (key: string) => setAttachments((list) => list.filter((a) => a.key !== key));

  /** Sends the post; resolves true once it's out. */
  const submit = async (): Promise<boolean> => {
    if (state.status !== 'signedIn') return false;
    setPosting(true);
    setError(null);
    try {
      const status = await state.client.postStatus({
        status: draft.trim(),
        visibility: toMastodonVisibility(visibility),
        media_ids: ready.map((a) => a.media!.id),
      });
      setDraft('');
      setAttachments([]);
      publishPostEvent({ type: 'created', post: toPost(status, state.server) });
      play('sent');
      refreshAccount();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t post. Please try again.');
      return false;
    } finally {
      setPosting(false);
    }
  };

  return {
    draft,
    setDraft,
    visibility,
    setVisibility,
    posting,
    error,
    attachments,
    removeAttachment,
    remaining,
    uploading,
    canPost,
    pickPhotos,
    submit,
  };
}
