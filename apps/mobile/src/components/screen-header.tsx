import type { ReactNode } from 'react';

import { router } from 'expo-router';

import { BackButton, BarButton, NavBar } from '@/components/ios6';

const dismiss = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** An iOS 6 navigation bar with an optional back button (left) and action (right). */
export function ScreenHeader({ title, back, right, children }: { title: string; back?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <NavBar
      title={title}
      // A modal's "Cancel" is a plain bordered button; going back is the pointed one.
      left={back === 'Cancel' ? <BarButton title="Cancel" onPress={dismiss} /> : back ? <BackButton title={back} /> : null}
      right={right}>
      {children}
    </NavBar>
  );
}
