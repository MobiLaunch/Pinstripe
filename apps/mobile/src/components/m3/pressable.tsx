/**
 * Touch feedback the Material way: a ripple on Android (the platform's
 * own), and a state layer (the content colour at 10%) on the web preview.
 */
import { forwardRef, type ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, StyleSheet, View, type View as ViewType, type ViewStyle } from 'react-native';

import { alpha } from '@/theme/m3';

export type M3PressableProps = Omit<PressableProps, 'children' | 'style'> & {
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** The colour of what's on it: the ripple and state layer are this colour, faint. */
  content: string;
  /** Clip the ripple to a circle this size (icon buttons). */
  borderless?: boolean;
};

export const M3Pressable = forwardRef<ViewType, M3PressableProps>(function M3Pressable({ children, style, content, borderless = false, ...rest }, ref) {
  return (
    <Pressable
      ref={ref}
      android_ripple={{ color: alpha(content, 0.14), borderless, foreground: true }}
      style={(state) => [{ overflow: borderless ? 'visible' : 'hidden' }, typeof style === 'function' ? style(state) : style]}
      {...rest}>
      {(state) => (
        <>
          {/* react-native-web also reports hovering. */}
          {Platform.OS !== 'android' && (state.pressed || (state as { hovered?: boolean }).hovered) ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(content, state.pressed ? 0.12 : 0.08) }]} pointerEvents="none" />
          ) : null}
          {typeof children === 'function' ? children(state) : children}
        </>
      )}
    </Pressable>
  );
});
