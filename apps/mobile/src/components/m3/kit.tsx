/**
 * Material 3 Expressive components for the Android look. Each one takes the
 * same props as the iOS 6 control it stands in for (see ios6.tsx and
 * aqua.tsx), so every screen gets them without knowing.
 *
 * Expressive touches: buttons are round and square up a little while held
 * (the shape morph), the switch thumb grows and shows a tick, lists are
 * rounded groups with small gaps, and things move on springs.
 */
import { Image } from 'expo-image';
import { Children, type ReactNode, useEffect, useState } from 'react';
import {
  Animated,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconTint } from '@/components/icon';
import { alpha, shape, springTo, type, useM3 } from '@/theme/m3';
import { material } from '@/theme/startup';

import { M3Pressable } from './pressable';
import { Glyph } from './symbol';

// App bars

/**
 * The small top app bar: navigation icon, a left-aligned title, actions.
 * `children` go underneath (tabs, a button group).
 */
export function M3TopAppBar({ title, left, right, children }: { title?: string; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const { c } = useM3();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.surface }}>
      <IconTint.Provider value={c.onSurfaceVariant}>
        <View style={styles.appBar}>
          {left ? <View style={styles.appBarSide}>{left}</View> : <View style={styles.appBarGap} />}
          <Text style={[type.titleLarge, styles.appBarTitle, { color: c.onSurface }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <View style={[styles.appBarSide, styles.appBarRight]}>{right}</View>
        </View>
      </IconTint.Provider>
      {children ? <View style={styles.appBarExtra}>{children}</View> : null}
    </View>
  );
}

/**
 * A bar action: an icon button, or a text button with a title (a filled one
 * for "Done", the way Android puts Save and Post).
 */
export function M3BarButton({
  title,
  icon,
  done = false,
  disabled,
  style,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & { title?: string; icon?: ReactNode; done?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useM3();
  if (icon && !title) {
    return (
      <M3Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        content={c.onSurfaceVariant}
        borderless
        style={[styles.iconButton, { opacity: disabled ? 0.38 : 1 }, style]}
        {...rest}>
        <IconTint.Provider value={c.onSurfaceVariant}>{icon}</IconTint.Provider>
      </M3Pressable>
    );
  }
  return <M3Button title={title} tone={done ? 'blue' : 'text'} small disabled={disabled} icon={icon} style={style as ViewStyle} {...rest} />;
}

export function M3BackButton({ onPress }: { title?: string; onPress?: () => void }) {
  const { c } = useM3();
  return (
    <M3Pressable accessibilityRole="button" accessibilityLabel="Navigate up" content={c.onSurface} borderless onPress={onPress} style={styles.iconButton}>
      <Glyph name="arrow_back" color={c.onSurface} />
    </M3Pressable>
  );
}

/** Closes a full-screen dialog (where iOS has Cancel). */
export function M3CloseButton({ onPress }: { onPress?: () => void }) {
  const { c } = useM3();
  return (
    <M3Pressable accessibilityRole="button" accessibilityLabel="Close" content={c.onSurface} borderless onPress={onPress} style={styles.iconButton}>
      <Glyph name="close" color={c.onSurface} />
    </M3Pressable>
  );
}

/** A bottom bar of actions (the iOS toolbar's place). */
export function M3Toolbar({ children, style, ...rest }: ViewProps) {
  const { c } = useM3();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.toolbar, { backgroundColor: c.surfaceContainer, paddingBottom: 8 + insets.bottom }, style]} {...rest}>
      <IconTint.Provider value={c.onSurfaceVariant}>{children}</IconTint.Provider>
    </View>
  );
}

// Buttons

type Tone = 'blue' | 'gray' | 'red' | 'text' | 'outlined';

/**
 * A common button: filled (blue), tonal (gray), filled error (red), text
 * or outlined. Round, and a little squarer while pressed.
 */
export function M3Button({
  title,
  tone = 'blue',
  small = false,
  rect = false,
  icon,
  style,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  title?: string;
  tone?: Tone;
  small?: boolean;
  rect?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const { c } = useM3();
  const height = small ? 40 : rect ? 56 : 48;
  const [press] = useState(() => new Animated.Value(0));
  const face = {
    blue: { bg: c.primary, fg: c.onPrimary, border: 'transparent' },
    gray: { bg: c.secondaryContainer, fg: c.onSecondaryContainer, border: 'transparent' },
    red: { bg: c.error, fg: c.onError, border: 'transparent' },
    text: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    outlined: { bg: 'transparent', fg: c.onSurfaceVariant, border: c.outlineVariant },
  }[tone];
  const bg = disabled && tone !== 'text' ? alpha(c.onSurface, 0.1) : face.bg;
  const fg = disabled ? alpha(c.onSurface, 0.38) : face.fg;
  const iconOnly = !!icon && !title;
  return (
    <Animated.View
      style={[
        { borderRadius: press.interpolate({ inputRange: [0, 1], outputRange: [height / 2, rect ? 16 : 12] }), overflow: 'hidden', alignSelf: rect ? 'stretch' : undefined },
        style,
      ]}>
      <M3Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        content={fg}
        onPressIn={(e) => {
          springTo(press, 1, 'fastSpatial', false).start();
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          springTo(press, 0, 'fastSpatial', false).start();
          onPressOut?.(e);
        }}
        style={[
          styles.button,
          { height, backgroundColor: bg, borderColor: face.border, borderWidth: tone === 'outlined' ? 1 : 0 },
          iconOnly ? { width: height, paddingHorizontal: 0 } : { paddingHorizontal: small ? 16 : 24 },
        ]}
        {...rest}>
        <IconTint.Provider value={fg}>{icon}</IconTint.Provider>
        {title ? <Text style={[small ? type.labelLarge : styles.buttonLabel, { color: fg }]}>{title}</Text> : null}
      </M3Pressable>
    </Animated.View>
  );
}

/** Round icon buttons over video (the rail) and in the camera. */
export function M3Orb({
  children,
  active = false,
  size = 52,
  style,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & { children: ReactNode; active?: boolean; size?: number; style?: ViewStyle }) {
  const { c } = useM3();
  return (
    <M3Pressable
      accessibilityRole="button"
      content="#ffffff"
      style={[
        { width: size, height: size, borderRadius: active ? size * 0.32 : size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.primaryContainer : 'rgba(0,0,0,0.32)' },
        style,
      ]}
      {...rest}>
      <IconTint.Provider value={active ? c.onPrimaryContainer : null}>{children}</IconTint.Provider>
    </M3Pressable>
  );
}

// Switch

const TRACK_W = 52;
const TRACK_H = 32;

/** The M3 switch: a small outlined thumb when off, a big one with a tick when on, bigger still while held. */
export function M3Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { c } = useM3();
  const [on] = useState(() => new Animated.Value(value ? 1 : 0));
  const [held] = useState(() => new Animated.Value(0));
  useEffect(() => {
    springTo(on, value ? 1 : 0, 'fastSpatial', false).start();
  }, [value, on]);
  const size = Animated.add(on.interpolate({ inputRange: [0, 1], outputRange: [16, 24] }), held.interpolate({ inputRange: [0, 1], outputRange: [0, 28 - 24] }));
  // Positions inside the 2px outline: the thumb's centre moves from 14 to 34.
  const centre = on.interpolate({ inputRange: [0, 1], outputRange: [14, TRACK_W - 4 - 14] });
  const left = Animated.subtract(centre, Animated.multiply(size, 0.5));
  const top = Animated.multiply(Animated.subtract(TRACK_H - 4, size), 0.5);
  return (
    <M3Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      content={c.onSurface}
      borderless
      onPress={() => onValueChange?.(!value)}
      onPressIn={() => springTo(held, 1, 'fastSpatial', false).start()}
      onPressOut={() => springTo(held, 0, 'fastSpatial', false).start()}
      hitSlop={8}
      style={[
        styles.track,
        {
          backgroundColor: value ? c.primary : c.surfaceContainerHighest,
          borderColor: value ? c.primary : c.outline,
          opacity: disabled ? 0.38 : 1,
        },
      ]}>
      <Animated.View
        style={[
          styles.thumb,
          {
            width: size,
            height: size,
            left,
            top,
            backgroundColor: value ? c.onPrimary : c.outline,
          },
        ]}>
        {value ? <Glyph name="check" size={16} color={c.primary} /> : null}
      </Animated.View>
    </M3Pressable>
  );
}

// Lists (Android 16 settings style: rounded groups with small gaps)

export function M3ListBackground({ children, style, ...rest }: ViewProps) {
  const { c, dark } = useM3();
  return (
    <View style={[{ flex: 1, backgroundColor: dark ? c.surface : c.surfaceContainer }, style]} {...rest}>
      {children}
    </View>
  );
}

/** A plain page in the surface colour (timelines, profiles, threads). */
export function M3Surface({ children, style, ...rest }: ViewProps) {
  const { c } = useM3();
  return (
    <View style={[{ flex: 1, backgroundColor: c.surface }, style]} {...rest}>
      {children}
    </View>
  );
}

function useCellColor() {
  const { c, dark } = useM3();
  return dark ? c.surfaceContainerHigh : c.surfaceBright;
}

export function M3ListGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const { c } = useM3();
  const cell = useCellColor();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title ? <Text style={[type.titleSmall, styles.sectionTitle, { color: c.primary }]}>{title}</Text> : null}
      <View style={styles.sectionRows}>
        {rows.map((row, i) => (
          <View key={i} style={[styles.sectionRow, { backgroundColor: cell }, i === 0 && styles.cellFirst, i === rows.length - 1 && styles.cellLast]}>
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text style={[type.bodySmall, styles.sectionFooter, { color: c.onSurfaceVariant }]}>{footer}</Text> : null}
    </View>
  );
}

export function M3ListRow({
  title,
  sub,
  detail,
  accessory = 'none',
  right,
  destructive,
  onPress,
  disabled,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  sub?: string;
  detail?: string;
  accessory?: 'chevron' | 'check' | 'none';
  right?: ReactNode;
  destructive?: boolean;
}) {
  const { c } = useM3();
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={[type.bodyLarge, { color: destructive ? c.error : c.onSurface }]} numberOfLines={2}>
          {title}
        </Text>
        {sub || detail ? (
          <Text style={[type.bodyMedium, { color: c.onSurfaceVariant }]} numberOfLines={2}>
            {sub ?? detail}
          </Text>
        ) : null}
      </View>
      {sub && detail ? <Text style={[type.bodyMedium, { color: c.onSurfaceVariant }]}>{detail}</Text> : null}
      <IconTint.Provider value={c.onSurfaceVariant}>{right}</IconTint.Provider>
      {accessory === 'check' ? <Glyph name="check" color={c.primary} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <M3Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} content={c.onSurface} {...rest} style={[styles.row, disabled && { opacity: 0.38 }]}>
      {content}
    </M3Pressable>
  );
}

export function M3ListCell({ first, last, style, ...rest }: ViewProps & { first: boolean; last: boolean }) {
  const cell = useCellColor();
  return <View style={[styles.cell, { backgroundColor: cell }, first && styles.cellFirst, last && styles.cellLast, !last && styles.cellGap, style]} {...rest} />;
}

export function M3ListTitle({ title }: { title: string }) {
  const { c } = useM3();
  return <Text style={[type.titleSmall, styles.sectionTitle, styles.sectionTitleAlone, { color: c.primary }]}>{title}</Text>;
}

/** `dark` was for iOS 6 linen; Material screens are the surface colour either way. */
export function M3Empty({ title }: { title: string; dark?: boolean }) {
  const { c } = useM3();
  return <Text style={[type.bodyLarge, styles.empty, { color: c.onSurfaceVariant }]}>{title}</Text>;
}

/** A headline over a section (where iOS 6 drew linen). */
export function M3Header({ title, right }: { title: string; right?: ReactNode }) {
  const { c } = useM3();
  return (
    <View style={styles.header}>
      <Text style={[type.headlineEmphasized, { color: c.onSurface, flex: 1 }]} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

// Search, badges

export function M3SearchBar({ style, ...props }: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const { c } = useM3();
  return (
    <View style={[styles.searchWrap, style]}>
      <View style={[styles.search, { backgroundColor: c.surfaceContainerHigh }]}>
        <Glyph name="search" color={c.onSurfaceVariant} />
        <TextInput
          placeholderTextColor={c.onSurfaceVariant}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[type.bodyLarge, styles.searchInput, { color: c.onSurface }]}
          {...props}
        />
      </View>
    </View>
  );
}

export function M3Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useM3();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: c.error }, style]} pointerEvents="none">
      <Text style={[type.labelSmall, { color: c.onError }]}>{count > 999 ? '999+' : count}</Text>
    </View>
  );
}

// Avatars, cards, groups, fields

export function M3Avatar({ initials, size = 40, uri, framed = false }: { initials: string; size?: number; uri?: string | null; framed?: boolean }) {
  const { c } = useM3();
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center' },
        framed && { borderWidth: 4, borderColor: c.surface, width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 },
      ]}
      accessibilityElementsHidden>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <Text style={{ fontFamily: type.titleMedium.fontFamily, fontWeight: '700', fontSize: size * 0.38, color: c.onPrimaryContainer }}>{initials}</Text>
      )}
    </View>
  );
}

export function M3Card({ style, ...rest }: ViewProps) {
  const { c } = useM3();
  return <View style={[styles.card, { backgroundColor: c.surfaceContainerLow }, style]} {...rest} />;
}

export function M3Group({ title, children }: { title?: string; children: ReactNode }) {
  const { c } = useM3();
  return (
    <View>
      {title ? <Text style={[type.titleSmall, styles.sectionTitle, { color: c.primary }]}>{title}</Text> : null}
      <View style={[styles.group, { backgroundColor: c.surfaceContainerLow }]}>{children}</View>
    </View>
  );
}

/** The filled text field: a label that floats up, an indicator line that thickens in the primary colour on focus. */
export function M3Field({ label, style, onFocus, onBlur, ...rest }: TextInputProps & { label: string }) {
  const { c } = useM3();
  const [focused, setFocused] = useState(false);
  const secret = rest.secureTextEntry ? { autoCapitalize: 'none' as const, autoCorrect: false } : {};
  return (
    <View style={[styles.field, { backgroundColor: c.surfaceContainerHighest, borderBottomColor: focused ? c.primary : c.onSurfaceVariant, borderBottomWidth: focused ? 2 : 1 }]}>
      <Text style={[type.bodySmall, { color: focused ? c.primary : c.onSurfaceVariant }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={alpha(c.onSurfaceVariant, 0.7)}
        cursorColor={c.primary}
        selectionColor={alpha(c.primary, 0.4)}
        style={[type.bodyLarge, styles.fieldInput, { color: c.onSurface }, rest.multiline && styles.fieldMultiline, style]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...secret}
        {...rest}
      />
    </View>
  );
}

export function M3ListField(props: TextInputProps & { label: string }) {
  return (
    <View style={styles.listField}>
      <M3Field {...props} />
    </View>
  );
}

/**
 * The connected button group (M3 Expressive's segmented control): the
 * chosen one fills with the primary colour and rounds right out, the others
 * keep squarer inner corners.
 */
export function M3Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  variant?: 'plain' | 'bar';
}) {
  const { c } = useM3();
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((o, i) => {
        const on = o.value === value;
        const first = i === 0;
        const last = i === options.length - 1;
        const outer = 20;
        const inner = on ? 20 : 8;
        return (
          <M3Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            content={on ? c.onPrimary : c.onSecondaryContainer}
            style={[
              styles.segment,
              {
                backgroundColor: on ? c.primary : c.secondaryContainer,
                borderTopLeftRadius: first ? outer : inner,
                borderBottomLeftRadius: first ? outer : inner,
                borderTopRightRadius: last ? outer : inner,
                borderBottomRightRadius: last ? outer : inner,
              },
            ]}>
            {on ? <Glyph name="check" size={18} color={c.onPrimary} /> : null}
            <Text style={[type.labelLarge, { color: on ? c.onPrimary : c.onSecondaryContainer }]} numberOfLines={1}>
              {o.label}
            </Text>
          </M3Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  appBar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 4 },
  appBarSide: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 48 },
  appBarGap: { width: 12 },
  appBarRight: { justifyContent: 'flex-end', paddingRight: 4 },
  appBarTitle: { flex: 1, marginLeft: 4 },
  appBarExtra: { paddingHorizontal: 16, paddingBottom: 12 },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonLabel: { ...type.titleMedium, fontWeight: '600' },
  track: { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, borderWidth: 2, justifyContent: 'center' },
  thumb: { position: 'absolute', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  section: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { marginHorizontal: 16, marginBottom: 8 },
  sectionTitleAlone: { marginTop: 20, marginHorizontal: 32 },
  sectionRows: { gap: 2 },
  sectionRow: { borderRadius: 4, overflow: 'hidden' },
  sectionFooter: { marginHorizontal: 16, marginTop: 8 },
  cellFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  cellLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  cell: { marginHorizontal: 16, borderRadius: 4, overflow: 'hidden' },
  cellGap: { marginBottom: 2 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 16 },
  rowText: { flex: 1, gap: 2 },
  empty: { textAlign: 'center', marginTop: 48, marginHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 8 },
  search: { height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  searchInput: { flex: 1, paddingVertical: 0, outlineWidth: 0 },
  badge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: shape.lgInc, padding: 16 },
  group: { borderRadius: shape.lgInc, overflow: 'hidden' },
  field: { borderTopLeftRadius: shape.xs, borderTopRightRadius: shape.xs, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 2 },
  fieldInput: { paddingVertical: 2, outlineWidth: 0, minHeight: 28 },
  fieldMultiline: { minHeight: 88, textAlignVertical: 'top' },
  listField: { padding: 12 },
  segmented: { flexDirection: 'row', gap: 2 },
  segment: { flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
});

/**
 * Primary tabs, under a top app bar: equal widths, the chosen label in the
 * primary colour over a rounded indicator that springs across to it.
 */
export function M3Tabs<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const { c } = useM3();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const [width, setWidth] = useState(0);
  const [slide] = useState(() => new Animated.Value(index));
  useEffect(() => {
    springTo(slide, index, 'defaultSpatial').start();
  }, [index, slide]);
  const tab = width / options.length;
  const indicator = Math.min(64, tab - 24);
  return (
    <View style={[tabStyles.tabs, { borderBottomColor: c.surfaceContainerHighest }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <M3Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} content={c.primary} onPress={() => onChange(o.value)} style={tabStyles.tab}>
            <Text style={[type.titleSmall, { color: on ? c.primary : c.onSurfaceVariant }]}>{o.label}</Text>
          </M3Pressable>
        );
      })}
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            tabStyles.indicator,
            { width: indicator, backgroundColor: c.primary, transform: [{ translateX: Animated.add(Animated.multiply(slide, tab), (tab - indicator) / 2) }] },
          ]}
        />
      ) : null}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', left: 0, bottom: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
});

/**
 * For screens that draw their own text boxes and grouped boxes (styled for
 * iOS): the Material look to lay over them, filled and borderless. Empty
 * outside the Android look.
 */
export function useM3Surfaces() {
  const { c } = useM3();
  if (!material) return { input: null, group: null };
  return {
    input: {
      backgroundColor: c.surfaceContainerHighest,
      color: c.onSurface,
      borderWidth: 0,
      borderRadius: 16,
      boxShadow: 'none',
      outlineWidth: 0,
    } as const,
    group: { borderWidth: 0, borderRadius: 24, boxShadow: 'none', backgroundColor: c.surfaceContainerLow } as const,
  };
}
