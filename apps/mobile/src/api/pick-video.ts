import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import { checkPicked, type Picked } from '@/api/upload';

/** Opens the post screen for a clip; `replace` swaps out the camera behind it. */
export function openNewVideo(asset: Picked, replace = false) {
  const { uri, type, mimeType, fileSize, width, height, duration, fileName } = asset;
  const to = { pathname: '/new-video' as const, params: { asset: JSON.stringify({ uri, type, mimeType, fileSize, width, height, duration, fileName }) } };
  if (replace) router.replace(to);
  else router.push(to);
}

/** Picks a video from the library and opens the post screen. Answers a problem to show, if any. */
export async function pickVideoFromLibrary(replace = false): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: 60,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const problem = checkPicked(asset);
  if (problem) return problem;
  openNewVideo(asset, replace);
  return null;
}
