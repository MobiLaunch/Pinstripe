/**
 * Aqua primitives. Every screen is built from these so the look stays in one
 * place; see src/theme/aqua.ts for the tokens.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { colors, fontFamily, type Gradient, gelBorders, gradients, radii, touchTarget } from '@/theme/aqua';

function Fill({ gradient, style }: { gradient: Gradient; style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={gradient.colors}
      locations={gradient.locations}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    />
  );
}

/** The horizontal pinstripe backdrop behind every non-video screen. */
export function Pinstripes({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.pinstripeBase, style]} {...rest}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Pattern id="pin" width={4} height={4} patternUnits="userSpaceOnUse">
            <Rect width={4} height={2} fill={colors.pinstripeLight} />
            <Rect y={2} width={4} height={2} fill={colors.pinstripeDark} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#pin)" />
      </Svg>
      {children}
    </View>
  );
}

/** Brushed-metal bar used for headers and the tab bar. */
export function Metal({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.metal, style]} {...rest}>
      <Fill gradient={gradients.metal} />
      {children}
    </View>
  );
}

type GelTone = 'blue' | 'gray' | 'red';
const GEL: Record<GelTone, { gradient: Gradient; border: string; text: string }> = {
  blue: { gradient: gradients.gelBlue, border: gelBorders.blue, text: '#ffffff' },
  gray: { gradient: gradients.gelGray, border: gelBorders.gray, text: colors.text },
  red: { gradient: gradients.gelRed, border: gelBorders.red, text: '#ffffff' },
};

/** The glossy "lickable" pill button. */
export function GelButton({
  title,
  tone = 'blue',
  small = false,
  icon,
  style,
  disabled,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  title?: string;
  tone?: GelTone;
  small?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const t = GEL[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.gel,
        small && styles.gelSmall,
        { borderColor: t.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
      {...rest}>
      <Fill gradient={t.gradient} />
      <Fill gradient={gradients.gloss} style={styles.gloss} />
      {icon}
      {title ? (
        <Text style={[styles.gelText, small && styles.gelTextSmall, { color: t.text }]}>{title}</Text>
      ) : null}
    </Pressable>
  );
}

/** Round glass orb used for the video action rail. */
export function Orb({
  children,
  active = false,
  size = 52,
  style,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  active?: boolean;
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.orb, { width: size, height: size, borderColor: active ? '#0a3a80' : 'rgba(0,0,0,0.6)' }, style]}
      {...rest}>
      <Fill gradient={active ? gradients.orbBlue : gradients.orb} />
      <Fill gradient={gradients.gloss} style={styles.orbGloss} />
      {children}
    </Pressable>
  );
}

/** Aqua segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.seg, style]} accessibilityRole="tablist">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, i > 0 && styles.segDivider]}>
            <Fill gradient={on ? gradients.segmentOn : gradients.segment} />
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ initials, size = 40 }: { initials: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} accessibilityElementsHidden>
      <Fill gradient={gradients.avatar} />
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

/** Inset group box, as on the Settings screen. */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

export function Field({ label, ...rest }: TextInputProps & { label: string }) {
  // Never capitalise or autocorrect a password.
  const secret = rest.secureTextEntry ? { autoCapitalize: 'none' as const, autoCorrect: false } : {};
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#767676"
        style={styles.field}
        {...secret}
        {...rest}
      />
    </View>
  );
}

export const aquaText = StyleSheet.create({
  body: { fontFamily, fontSize: 14, lineHeight: 20, color: colors.text },
  handle: { fontFamily, fontSize: 12, color: colors.textMuted },
  title: { fontFamily, fontSize: 17, fontWeight: '700', color: colors.text },
  link: { fontFamily, fontWeight: '700', color: colors.link },
});

const styles = StyleSheet.create({
  pinstripeBase: { flex: 1, backgroundColor: '#ececec' },
  metal: { overflow: 'hidden', borderColor: '#7a7a7a' },
  gel: {
    minHeight: touchTarget,
    paddingHorizontal: 22,
    borderRadius: radii.pill,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  gelSmall: { minHeight: 34, paddingHorizontal: 14 },
  gloss: { left: '9%', right: '9%', top: 2, bottom: '56%', borderRadius: radii.pill },
  gelText: {
    fontFamily,
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: -1 },
    textShadowRadius: 0,
  },
  gelTextSmall: { fontSize: 13 },
  orb: {
    borderRadius: radii.pill,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbGloss: { left: '14%', right: '14%', top: 3, bottom: '56%', borderRadius: radii.pill },
  seg: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.segment,
    overflow: 'hidden',
  },
  segItem: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  segDivider: { borderLeftWidth: 1, borderLeftColor: '#8a8a8a' },
  segText: { fontFamily, fontSize: 12, fontWeight: '700', color: '#222222' },
  segTextOn: { color: '#ffffff' },
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0e3f86',
  },
  avatarText: { fontFamily, color: '#ffffff', fontWeight: '700' },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: 12,
  },
  groupTitle: { fontFamily, fontSize: 12, fontWeight: '700', color: '#3a3a3a', marginTop: 20, marginBottom: 6, marginLeft: 6 },
  group: {
    backgroundColor: colors.groupFill,
    borderWidth: 1,
    borderColor: '#a9a9a9',
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  fieldWrap: { gap: 5 },
  label: { fontFamily, fontSize: 12, fontWeight: '700', color: '#333333', marginLeft: 2 },
  field: {
    fontFamily,
    minHeight: touchTarget,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111111',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#8c8c8c',
    borderTopColor: '#5e5e5e',
    borderRadius: radii.field,
  },
});
