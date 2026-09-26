import { M3Home } from '@/components/m3/screens/home';
import { VideosScreen } from '@/components/videos-screen';
import { material } from '@/theme/startup';

/**
 * The screen the app opens on: the videos on iPhone; on Android, where the
 * timeline comes first, Home (the videos are the Watch tab, feed.tsx).
 */
export default function IndexTab() {
  return material ? <M3Home /> : <VideosScreen />;
}
