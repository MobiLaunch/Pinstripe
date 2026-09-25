/**
 * Browser quirks react-native-web leaves to the app.
 *
 * When a focused control sits inside a container with `overflow: hidden`
 * (the Feed ← Videos → Account pager is one), browsers scroll that container
 * to keep the control in view, say when a sheet opens over it. Such
 * containers are never meant to scroll, so the page ends up shifted
 * sideways. Undo any scroll of an overflow-hidden element.
 */
import { Platform } from 'react-native';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener(
    'scroll',
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || (el.scrollLeft === 0 && el.scrollTop === 0)) return;
      const style = getComputedStyle(el);
      if (style.overflowX === 'hidden' && el.scrollLeft !== 0) el.scrollLeft = 0;
      if (style.overflowY === 'hidden' && el.scrollTop !== 0) el.scrollTop = 0;
    },
    true,
  );
}
