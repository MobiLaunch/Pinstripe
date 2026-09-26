import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

/**
 * Saves a video the author allows people to keep. On phones it's downloaded
 * and handed to the share sheet (which has "Save Video"); on web it opens
 * in a new tab to save from there.
 */
export async function saveVideo(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Linking.openURL(url);
    return;
  }
  const folder = new Directory(Paths.cache, 'saved-videos');
  if (!folder.exists) folder.create();
  const file = await File.downloadFileAsync(url, folder, { idempotent: true });
  await Sharing.shareAsync(file.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4', dialogTitle: 'Save video' });
}
