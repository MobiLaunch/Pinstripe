import type { ReactNode } from 'react';

import { router } from 'expo-router';

import { BackButton, BarButton, NavBar } from '@/components/ios6';
import { M3CloseButton } from '@/components/m3/kit';
import { material } from '@/theme/startup';

const dismiss = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** An iOS 6 navigation bar with an optional back button (left) and action (right). */
export function ScreenHeader({ title, back, right, children }: { title: string; back?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <NavBar
      title={title}
      // A modal's "Cancel" is a plain bordered button; going back is the pointed one.
      left={
        back === 'Cancel' ? (
          // Android closes a full-screen dialog with an ✕.
          material ? (
            <M3CloseButton onPress={dismiss} />
          ) : (
            <BarButton title="Cancel" onPress={dismiss} />
          )
        ) : back ? (
          <BackButton title={back} />
        ) : null
      }
      right={right}>
      {children}
    </NavBar>
  );
}
