/**
 * Aqua primitives. Every screen is built from these so the look stays in one
 * place; see src/theme/aqua.ts for the tokens.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
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
import { Switch as Ios6Switch } from '@/components/ios6';
import { useAccent } from '@/theme/theme';

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
  rect = false,
  icon,
  style,
  disabled,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  title?: string;
  tone?: GelTone;
  small?: boolean;
  /** The iOS 6 rounded-rectangle "big button" (Sign Out, Delete Account…) instead of the pill. */
  rect?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const accent = useAccent();
  const t = tone === 'blue' ? { gradient: accent.gel, border: accent.gelBorder, text: '#ffffff' } : GEL[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.gel,
        small && styles.gelSmall,
        rect && styles.gelRect,
        { borderColor: t.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
      {...rest}>
      <Fill gradient={t.gradient} />
      <Fill gradient={gradients.gloss} style={rect ? styles.glossRect : styles.gloss} />
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
  const accent = useAccent();
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.orb, { width: size, height: size, borderColor: active ? accent.orbActiveBorder : 'rgba(0,0,0,0.6)' }, style]}
      {...rest}>
      <Fill gradient={active ? accent.orbActive : gradients.orb} />
      <Fill gradient={gradients.gloss} style={styles.orbGloss} />
      {children}
    </Pressable>
  );
}

/**
 * Segmented control. `bar` is the compact style that sits on a navigation
 * bar or toolbar, tinted like the bar (UISegmentedControlStyleBar).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  variant = 'plain',
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  variant?: 'plain' | 'bar';
}) {
  const accent = useAccent();
  const bar = variant === 'bar';
  return (
    <View style={[styles.seg, bar && [styles.segBar, { borderColor: accent.barButtonBorder }], style]} accessibilityRole="tablist">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, bar && styles.segItemBar, i > 0 && (bar ? { borderLeftWidth: 1, borderLeftColor: accent.barButtonBorder } : styles.segDivider)]}>
            <Fill gradient={bar ? (on ? accent.barButtonPressed : accent.barButton) : on ? accent.segmentOn : gradients.segment} />
            {bar && on ? <View style={styles.segBarPressed} pointerEvents="none" /> : null}
            <Text style={[styles.segText, (on || bar) && styles.segTextOn, bar && styles.segTextBar]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A profile picture in the iOS 6 photo well: a rounded square with a fine
 * dark rim, a soft drop shadow and a touch of glass across the top. Big ones
 * can be `framed` in a white mount, as on a Contacts card.
 */
export function Avatar({ initials, size = 40, uri, framed = false }: { initials: string; size?: number; uri?: string | null; framed?: boolean }) {
  const accent = useAccent();
  const radius = Math.max(4, Math.round(size * 0.14));
  if (framed) {
    return (
      <View style={[styles.avatarFrame, { borderRadius: radius + 4 }]} accessibilityElementsHidden>
        <Avatar initials={initials} size={size} uri={uri} />
      </View>
    );
  }
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: radius }]} accessibilityElementsHidden>
      <View style={[styles.avatarClip, { borderRadius: radius }]}>
        <Fill gradient={accent.avatar} />
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials}</Text>
        )}
        <Fill gradient={AVATAR_GLASS} style={{ bottom: '50%' }} />
      </View>
      <View style={[styles.avatarRim, { borderRadius: radius }]} pointerEvents="none" />
    </View>
  );
}

const AVATAR_GLASS: Gradient = { colors: ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.06)'], locations: [0, 1] };

/** The iOS 6 ON/OFF switch (see ios6.tsx). */
export function AquaSwitch(props: { value: boolean; onValueChange?: (value: boolean) => void; disabled?: boolean; accessibilityLabel?: string }) {
  return <Ios6Switch {...props} />;
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

/** A labelled iOS 6 rounded text field, recessed into the page. */
export function Field({ label, ...rest }: TextInputProps & { label: string }) {
  // Never capitalise or autocorrect a password.
  const secret = rest.secureTextEntry ? { autoCapitalize: 'none' as const, autoCorrect: false } : {};
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#9a9a9a"
        clearButtonMode="while-editing"
        style={[styles.field, rest.multiline && styles.fieldMultiline]}
        {...secret}
        {...rest}
      />
    </View>
  );
}

/**
 * A text field inside a grouped-table cell: the label on the left in bold,
 * the entry on the right, as in iOS 6's account forms.
 */
export function TableField({ label, ...rest }: TextInputProps & { label: string }) {
  const secret = rest.secureTextEntry ? { autoCapitalize: 'none' as const, autoCorrect: false } : {};
  return (
    <View style={[styles.tableField, rest.multiline && styles.tableFieldTall]}>
      <Text style={styles.tableFieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#b3b3b3"
        clearButtonMode="while-editing"
        style={[styles.tableFieldInput, rest.multiline && styles.tableFieldInputTall]}
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
  gelRect: { borderRadius: 10, boxShadow: '0 1px 0 rgba(255,255,255,0.7)' },
  glossRect: { left: 1, right: 1, top: 1, bottom: '50%', borderTopLeftRadius: 9, borderTopRightRadius: 9, opacity: 0.55 },
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
  segBar: { borderRadius: 5, boxShadow: '0 1px 0 rgba(255,255,255,0.3)' },
  segItemBar: { minHeight: 30 },
  segBarPressed: { ...StyleSheet.absoluteFill, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.75)' },
  segTextBar: { fontSize: 12, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 0 },
  avatarFrame: { padding: 4, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#a6adb6', boxShadow: '0 2px 4px rgba(0,0,0,0.35)' },
  avatar: { backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.45)' },
  avatarClip: { ...StyleSheet.absoluteFill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarRim: { ...StyleSheet.absoluteFill, borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)' },
  avatarText: { fontFamily, color: '#ffffff', fontWeight: '700' },
  // An iOS 6 grouped-table cell: white, rounded, a fine grey rim and a white
  // highlight underneath.
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#aaaeb3',
    borderRadius: 10,
    padding: 12,
    boxShadow: '0 1px 0 rgba(255,255,255,0.8)',
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
  label: { fontFamily, fontSize: 13, fontWeight: '700', color: '#4c566c', marginLeft: 4, textShadowColor: 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  field: {
    fontFamily,
    minHeight: touchTarget,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111111',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#a2a2a2',
    borderTopColor: '#7b7b7b',
    borderRadius: 8,
    boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.8)',
  },
  fieldMultiline: { minHeight: 90, textAlignVertical: 'top' },
  tableField: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  tableFieldTall: { alignItems: 'flex-start', paddingVertical: 10 },
  tableFieldLabel: { fontFamily, width: 104, fontSize: 16, fontWeight: '700', color: '#000000' },
  tableFieldInput: { flex: 1, minHeight: 44, fontFamily, fontSize: 16, color: '#385487', paddingVertical: 10, outlineWidth: 0 },
  tableFieldInputTall: { minHeight: 80, paddingVertical: 0, textAlignVertical: 'top' },
});
