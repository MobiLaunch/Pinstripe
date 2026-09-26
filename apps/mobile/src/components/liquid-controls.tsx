/**
 * The Liquid Glass versions of the app's controls. The components in
 * ios6.tsx and aqua.tsx hand over to these when the Glass look is on, so
 * screens don't need to know which look they're in.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Children, type ReactNode, useEffect, useState } from 'react';
import {
  Animated,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconTint } from '@/components/icon';
import { useReduceMotion, useSwell } from '@/components/glass-motion';
import { GlassSurface, glassFont, glassText, useGlassInk } from '@/components/liquid';

const font = { fontFamily: glassFont } as const;

/** A text box in the Glass look: a soft grey fill in place of iOS 6's sunken well. */
export const glassInput = {
  ...font,
  backgroundColor: glassText.fill,
  borderWidth: 0,
  borderRadius: 18,
  boxShadow: 'none',
  color: glassText.primary,
  outlineWidth: 0,
  // Web paints positioned layers (glass) over unpositioned ones; this keeps the field on top.
  position: 'relative',
} as const;

/** A white rounded group in the Glass look, for screens that build their own table. */
export const glassGroup = { borderWidth: 0, borderRadius: 26, boxShadow: 'none' } as const;

// Bars

/** The navigation bar: a centred title between floating glass buttons, over a lightly frosted strip. */
export function GlassNavBar({ title, left, right, children }: { title?: string; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
      <View style={styles.navRow}>
        {title ? (
          <View style={styles.navTitleWrap} pointerEvents="none">
            <Text style={styles.navTitle} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          </View>
        ) : null}
        <View style={styles.navSide}>{left}</View>
        <View style={[styles.navSide, styles.navSideRight]}>{right}</View>
      </View>
      {children ? <View style={styles.navExtra}>{children}</View> : null}
    </View>
  );
}

/** A glass button: a circle round an icon, a capsule round words; `done` is tinted blue. */
export function GlassBarButton({
  title,
  icon,
  done = false,
  disabled,
  style,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & { title?: string; icon?: ReactNode; done?: boolean; style?: StyleProp<ViewStyle> }) {
  const swell = useSwell(rest);
  const ink = useGlassInk();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      style={[{ opacity: disabled ? 0.4 : 1 }, style]}
      {...rest}
      {...swell.handlers}>
      {({ pressed }) => (
        <Animated.View style={{ transform: [{ scale: swell.scale }] }}>
          <GlassSurface radius={22} tint={done ? glassText.blue : undefined} interactive style={[styles.barButton, title ? styles.barButtonTitled : null]}>
            <IconTint.Provider value={done ? '#ffffff' : ink.primary}>{icon}</IconTint.Provider>
            {title ? <Text style={[styles.barButtonText, done && styles.onTint]}>{title}</Text> : null}
            {pressed ? <View style={styles.lit} pointerEvents="none" /> : null}
          </GlassSurface>
        </Animated.View>
      )}
    </Pressable>
  );
}

export function GlassBackButton({ title = 'Back', onPress }: { title?: string; onPress?: () => void }) {
  return (
    <GlassBarButton
      accessibilityLabel={title}
      icon={<Icon name="chevronLeft" size={20} strokeWidth={2.6} />}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
    />
  );
}

/** A bottom toolbar: its contents float in a glass capsule. */
export function GlassToolbar({ children, style, ...rest }: ViewProps) {
  const insets = useSafeAreaInsets();
  const ink = useGlassInk();
  return (
    <View style={[styles.toolbarWrap, { paddingBottom: Math.max(insets.bottom, 8) }]} {...rest}>
      <GlassSurface radius={26} style={[styles.toolbar, style]}>
        <IconTint.Provider value={ink.primary}>{children}</IconTint.Provider>
      </GlassSurface>
    </View>
  );
}

// Switch

const TRACK_W = 51;
const TRACK_H = 31;
const KNOB = 27;
/** How much wider the knob grows under a finger. */
const STRETCH = 8;

/** The modern switch: a green capsule and a white knob that slides across, stretching while it's held. */
export function GlassSwitch({
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
  const [position] = useState(() => new Animated.Value(value ? 1 : 0));
  const [stretch] = useState(() => new Animated.Value(0));
  const reduce = useReduceMotion();
  useEffect(() => {
    Animated.spring(position, { toValue: value ? 1 : 0, speed: 16, bounciness: reduce ? 0 : 6, useNativeDriver: false }).start();
  }, [value, position, reduce]);
  const hold = (to: number) => !reduce && Animated.spring(stretch, { toValue: to, speed: 30, bounciness: 4, useNativeDriver: false }).start();
  const knob = Animated.add(KNOB, Animated.multiply(stretch, STRETCH));
  // Stretched, the knob grows away from the edge it's resting against.
  const left = Animated.subtract(
    Animated.add(2, Animated.multiply(position, TRACK_W - KNOB - 4)),
    Animated.multiply(position, Animated.multiply(stretch, STRETCH)),
  );
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
      onPressIn={() => hold(1)}
      onPressOut={() => hold(0)}
      hitSlop={8}
      style={{ opacity: disabled ? 0.4 : 1 }}>
      <Animated.View
        style={[styles.track, { backgroundColor: position.interpolate({ inputRange: [0, 1], outputRange: ['rgba(120,120,128,0.16)', glassText.green] }) }]}>
        <Animated.View style={[styles.knob, { width: knob, left }]} />
      </Animated.View>
    </Pressable>
  );
}

// Lists

export function GlassListBackground({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.listBackground, style]} {...rest}>
      {children}
    </View>
  );
}

export function GlassListGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

export function GlassListRow({
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
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && styles.danger]} numberOfLines={2}>
          {title}
        </Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      {right}
      {accessory === 'chevron' ? <Icon name="chevronRight" size={14} strokeWidth={3} color="#c4c4c7" /> : null}
      {accessory === 'check' ? <Icon name="check" size={18} strokeWidth={2.8} color={glassText.blue} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    // `style` goes last: Link (asChild) passes its own and would replace the row's.
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} {...rest} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {content}
    </Pressable>
  );
}

export function GlassListCell({ first, last, style, children, ...rest }: ViewProps & { first: boolean; last: boolean }) {
  return (
    <View style={[styles.cell, first && styles.cellFirst, last && styles.cellLast, style]} {...rest}>
      {!first ? <View style={styles.cellDivider} /> : null}
      {children}
    </View>
  );
}

export function GlassListTitle({ title }: { title: string }) {
  return <Text style={[styles.sectionTitle, styles.sectionTitleAlone]}>{title}</Text>;
}

export function GlassEmpty({ title, dark = false }: { title: string; dark?: boolean }) {
  return <Text style={[styles.empty, dark && styles.emptyDark]}>{title}</Text>;
}

/** A heading over the wallpaper, where iOS 6 had a linen section bar. */
export function GlassLinenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.wallHeader}>
      <Text style={styles.wallHeaderText} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

// Search, badges

export function GlassSearchBar({ style, ...props }: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const ink = useGlassInk();
  return (
    <View style={[styles.searchWrap, style]}>
      <GlassSurface radius={22} style={styles.search}>
        <Icon name="search" size={17} strokeWidth={2.4} color={ink.secondary} />
        <TextInput
          placeholderTextColor={glassText.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.searchInput}
          {...props}
        />
      </GlassSurface>
    </View>
  );
}

export function GlassBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, style]} pointerEvents="none">
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

// Buttons

/** A filled glass capsule (blue or red tinted, or clear), or a large rounded rectangle. */
export function GlassButton({
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
  tone?: 'blue' | 'gray' | 'red';
  small?: boolean;
  rect?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const tint = disabled ? undefined : tone === 'blue' ? glassText.blue : tone === 'red' ? glassText.red : undefined;
  const height = small ? 36 : 50;
  const swell = useSwell({ ...rest, to: rect ? 1.03 : 1.06 });
  const ink = useGlassInk();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} style={style} {...rest} {...swell.handlers}>
      {({ pressed }) => (
        <Animated.View style={{ transform: [{ scale: swell.scale }] }}>
          <GlassSurface
            radius={rect ? 16 : height / 2}
            tint={tint}
            interactive
            style={[styles.button, { minHeight: height, paddingHorizontal: small ? 14 : 22 }]}>
            {pressed ? <View style={styles.lit} pointerEvents="none" /> : null}
            <IconTint.Provider value={tint ? '#ffffff' : ink.primary}>{icon}</IconTint.Provider>
            {title ? <Text style={[styles.buttonText, small && styles.buttonTextSmall, tint && styles.onTint, disabled && styles.disabledText]}>{title}</Text> : null}
          </GlassSurface>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** A round glass button floating over video. */
export function GlassOrb({
  children,
  active = false,
  size = 52,
  style,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & { children: ReactNode; active?: boolean; size?: number; style?: ViewStyle }) {
  const swell = useSwell({ ...rest, to: 1.1 });
  return (
    <Pressable accessibilityRole="button" style={style} {...rest} {...swell.handlers}>
      {({ pressed }) => (
        <Animated.View style={{ transform: [{ scale: swell.scale }] }}>
          <GlassSurface radius={size / 2} dark tint={active ? glassText.blue : undefined} interactive style={[{ width: size, height: size }, styles.center]}>
            {children}
            {pressed ? <View style={styles.lit} pointerEvents="none" /> : null}
          </GlassSurface>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** The segmented control: a glass track, and a white capsule that slides to the choice. */
export function GlassSegmented<T extends string>({
  options,
  value,
  onChange,
  style,
  dark = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(index));
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) x.setValue(index);
    else Animated.spring(x, { toValue: index, speed: 14, bounciness: 7, useNativeDriver: true }).start();
  }, [index, x, reduce]);
  // The track's padding is 3 on each side; the items share the rest.
  const item = width ? (width - 6) / options.length : 0;
  return (
    <GlassSurface radius={20} dark={dark} style={[styles.segTrack, style]} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {item ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.segThumb, { width: item, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, item] }) }] }]}
        />
      ) : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={styles.segItem}>
            <Text style={[styles.segText, dark && !on && styles.segTextDark]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </GlassSurface>
  );
}

// Surfaces

/** A round photo with a hairline edge; `framed` adds a white ring and a lift. */
export function GlassAvatar({ initials, size = 40, uri, framed = false }: { initials: string; size?: number; uri?: string | null; framed?: boolean }) {
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, framed && styles.avatarFramed]}
      accessibilityElementsHidden>
      {uri ? (
        <Image source={{ uri }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} contentFit="cover" transition={150} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
      )}
    </View>
  );
}

export function GlassCard({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

export function GlassGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

// Fields

export function GlassField({ label, ...rest }: TextInputProps & { label: string }) {
  const secret = rest.secureTextEntry ? { autoCapitalize: 'none' as const, autoCorrect: false } : {};
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={glassText.tertiary}
        clearButtonMode="while-editing"
        style={[styles.field, rest.multiline && styles.fieldMultiline]}
        {...secret}
        {...rest}
      />
    </View>
  );
}

export function GlassListField({ label, ...rest }: TextInputProps & { label: string }) {
  const secret = rest.secureTextEntry ? { autoCapitalize: 'none' as const, autoCorrect: false } : {};
  return (
    <View style={[styles.listField, rest.multiline && styles.listFieldTall]}>
      <Text style={styles.listFieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={glassText.tertiary}
        clearButtonMode="while-editing"
        style={[styles.listFieldInput, rest.multiline && styles.listFieldInputTall]}
        {...secret}
        {...rest}
      />
    </View>
  );
}

// Progress

export function GlassProgress({ progress, label }: { progress: number | null; label: string }) {
  const pct = progress === null ? 100 : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View
      style={styles.progressTrack}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={progress === null ? undefined : { min: 0, max: 100, now: pct }}>
      <View style={[styles.progressFill, { width: `${pct}%` }, progress === null && styles.progressBusy]} />
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: { backgroundColor: glassText.bar, zIndex: 2 },
  navRow: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  navTitleWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 110 },
  navTitle: { ...font, fontSize: 17, fontWeight: '600', color: glassText.primary },
  navSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  navSideRight: { justifyContent: 'flex-end' },
  navExtra: { paddingHorizontal: 16, paddingBottom: 10 },
  barButton: { minWidth: 44, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  barButtonTitled: { paddingHorizontal: 16 },
  barButtonText: { ...font, fontSize: 17, fontWeight: '500', color: glassText.primary },
  onTint: { color: '#ffffff' },
  // Touched glass brightens.
  lit: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.18)' },
  toolbarWrap: { paddingHorizontal: 12, paddingTop: 6 },
  toolbar: { padding: 8 },
  track: { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, justifyContent: 'center' },
  knob: { position: 'absolute', top: 2, height: KNOB, borderRadius: 14, backgroundColor: '#ffffff', boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)' },
  listBackground: { flex: 1, backgroundColor: glassText.groupedBackground },
  section: { marginHorizontal: 16, marginTop: 22 },
  sectionTitle: { ...font, fontSize: 13, color: glassText.secondary, textTransform: 'uppercase', marginLeft: 16, marginBottom: 7 },
  sectionTitleAlone: { marginHorizontal: 32, marginTop: 22 },
  group: { backgroundColor: glassText.surface, borderRadius: 26, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: glassText.separator, marginLeft: 16 },
  sectionFooter: { ...font, fontSize: 13, color: glassText.secondary, marginTop: 7, marginHorizontal: 16 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  rowPressed: { backgroundColor: glassText.surfacePressed },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...font, fontSize: 17, color: glassText.primary },
  rowSub: { ...font, fontSize: 13, color: glassText.secondary },
  rowDetail: { ...font, fontSize: 17, color: glassText.secondary },
  danger: { color: glassText.red },
  cell: { marginHorizontal: 16, backgroundColor: glassText.surface, overflow: 'hidden' },
  cellFirst: { borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: 4 },
  cellLast: { borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  cellDivider: { position: 'absolute', top: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: glassText.separator },
  empty: { ...font, fontSize: 17, fontWeight: '600', color: glassText.secondary, textAlign: 'center', marginTop: 40, marginHorizontal: 20 },
  emptyDark: { color: 'rgba(255,255,255,0.7)' },
  wallHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  wallHeaderText: { ...font, flex: 1, fontSize: 28, fontWeight: '700', color: '#ffffff', textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 8 },
  search: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  // position: web paints positioned layers (the glass) over unpositioned ones, so the field needs it to sit on top.
  searchInput: { ...font, flex: 1, fontSize: 17, color: glassText.primary, paddingVertical: 0, outlineWidth: 0, position: 'relative' },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: glassText.red, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...font, fontSize: 13, fontWeight: '600', color: '#ffffff' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  buttonText: { ...font, fontSize: 17, fontWeight: '600', color: glassText.primary },
  buttonTextSmall: { fontSize: 15 },
  disabledText: { color: glassText.tertiary },
  center: { alignItems: 'center', justifyContent: 'center' },
  segTrack: { flexDirection: 'row', padding: 3 },
  segItem: { flex: 1, minHeight: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  segThumb: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 17, backgroundColor: glassText.thumb, boxShadow: '0 2px 6px rgba(0,0,0,0.14)' },
  segText: { ...font, fontSize: 14, fontWeight: '600', color: glassText.primary },
  segTextDark: { color: '#ffffff' },
  avatar: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#8e9fb8', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
  avatarFramed: { borderWidth: 3, borderColor: '#ffffff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
  avatarText: { ...font, color: '#ffffff', fontWeight: '600' },
  card: { backgroundColor: glassText.surface, borderRadius: 22, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  fieldWrap: { gap: 6 },
  fieldLabel: { ...font, fontSize: 13, color: glassText.secondary, marginLeft: 4 },
  field: { ...font, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: glassText.primary, backgroundColor: glassText.fill, borderRadius: 14, outlineWidth: 0 },
  fieldMultiline: { minHeight: 96, textAlignVertical: 'top' },
  listField: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  listFieldTall: { alignItems: 'flex-start', paddingVertical: 12 },
  listFieldLabel: { ...font, width: 104, fontSize: 17, color: glassText.primary },
  listFieldInput: { ...font, flex: 1, minHeight: 52, fontSize: 17, color: glassText.primary, paddingVertical: 12, outlineWidth: 0 },
  listFieldInputTall: { minHeight: 80, paddingVertical: 0, textAlignVertical: 'top' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(120,120,128,0.2)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: glassText.blue },
  progressBusy: { opacity: 0.55 },
});
