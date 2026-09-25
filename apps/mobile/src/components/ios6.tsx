/**
 * iOS 6 chrome: navigation bars and their buttons, toolbars, UISwitch,
 * grouped tables, the search bar and badges. Colours come from the theme
 * (Blue is UIBarStyleDefault, Graphite is UIBarStyleBlack).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Children, type ReactNode, useEffect, useId, useState } from 'react';
import {
  Animated,
  Easing,
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
import Svg, { Defs, G, LinearGradient as SvgGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { fontFamily, type Gradient } from '@/theme/aqua';
import { useAccent } from '@/theme/theme';

function Fill({ gradient, style }: { gradient: Gradient; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={gradient.colors} locations={gradient.locations} style={[StyleSheet.absoluteFill, style]} pointerEvents="none" />
  );
}

/** White text pressed into the bar: the iOS 6 engraved look. */
const embossed = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 0 } as const;

// Navigation bar

/**
 * UINavigationBar: the theme's bar gradient with an embossed title, and
 * slots for bar buttons. `children` go underneath, on the same bar (a
 * segmented control, say, like a UIToolbar under the bar).
 */
export function NavBar({ title, left, right, children }: { title?: string; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.navBar, { paddingTop: insets.top, borderBottomColor: accent.navBarEdge }]}>
      <Fill gradient={accent.navBar} />
      <View style={styles.navHighlight} pointerEvents="none" />
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

/** A bordered bar button (UIBarButtonItemStyleBordered), with a title or an icon. */
export function BarButton({
  title,
  icon,
  done = false,
  disabled,
  style,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & { title?: string; icon?: ReactNode; done?: boolean; style?: StyleProp<ViewStyle> }) {
  const accent = useAccent();
  // "Done" buttons were the bright blue ones.
  const face = done ? DONE : { normal: accent.barButton, pressed: accent.barButtonPressed, border: accent.barButtonBorder };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      style={[styles.barButton, { borderColor: face.border, opacity: disabled ? 0.5 : 1 }, style]}
      {...rest}>
      {({ pressed }) => (
        <>
          <Fill gradient={pressed ? face.pressed : face.normal} />
          <View style={styles.barButtonShine} pointerEvents="none" />
          {icon}
          {title ? <Text style={styles.barButtonText}>{title}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

const DONE = {
  normal: { colors: ['#7fb2f7', '#3d85ec', '#1b69e0', '#2273e8'], locations: [0, 0.49, 0.5, 1] } as Gradient,
  pressed: { colors: ['#4f8fe6', '#2466c9', '#0f52bb', '#155bc4'], locations: [0, 0.49, 0.5, 1] } as Gradient,
  border: '#1f3f78',
};

const BACK_HEIGHT = 30;

/** The back button with the pointed left edge. */
export function BackButton({ title = 'Back', onPress }: { title?: string; onPress?: () => void }) {
  const accent = useAccent();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(0);
  const h = BACK_HEIGHT;
  const shape = (w: number) =>
    `M12 0.5 H${w - 5.5} Q${w - 0.5} 0.5 ${w - 0.5} 5.5 V${h - 5.5} Q${w - 0.5} ${h - 0.5} ${w - 5.5} ${h - 0.5} H12 Q10 ${h - 0.5} 8.8 ${h - 2} L1.2 ${h / 2 + 1.2} Q0.3 ${h / 2} 1.2 ${h / 2 - 1.2} L8.8 2 Q10 0.5 12 0.5 Z`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      hitSlop={6}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={styles.back}>
      {({ pressed }) => (
        <>
          {width ? (
            <Svg width={width} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <SvgGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
                  {gradientStops(pressed ? accent.barButtonPressed : accent.barButton)}
                </SvgGradient>
              </Defs>
              <Path d={shape(width)} fill={`url(#b${id})`} stroke={accent.barButtonBorder} strokeWidth={1} />
            </Svg>
          ) : null}
          <Text style={styles.barButtonText} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function gradientStops(g: Gradient) {
  return g.colors.map((c, i) => <Stop key={i} offset={g.locations?.[i] ?? i / (g.colors.length - 1)} stopColor={c} />);
}

/** A bottom toolbar (UIToolbar) in the bar's colours. */
export function Toolbar({ children, style, ...rest }: ViewProps) {
  const accent = useAccent();
  return (
    <View style={[styles.toolbar, { borderTopColor: accent.navBarEdge }, style]} {...rest}>
      <Fill gradient={accent.navBar} />
      <View style={styles.navHighlight} pointerEvents="none" />
      {children}
    </View>
  );
}

// UISwitch

const SWITCH_W = 77;
const SWITCH_H = 28;
const KNOB = 28;
const TRAVEL = SWITCH_W - KNOB;

/** The iOS 6 switch: ON / OFF written on the track, and a glossy knob that slides. */
export function Switch({
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
  const accent = useAccent();
  const [position] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(position, { toValue: value ? 1 : 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [value, position]);
  const shift = position.interpolate({ inputRange: [0, 1], outputRange: [-TRAVEL, 0] });
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
      hitSlop={8}
      style={[styles.switch, { borderColor: value ? accent.switchOnBorder : '#a6a6a6', opacity: disabled ? 0.5 : 1 }]}>
      <Animated.View style={[styles.switchRail, { transform: [{ translateX: shift }] }]}>
        <View style={styles.switchSide}>
          <Fill gradient={accent.switchOn} />
          <Text style={[styles.switchText, styles.switchOn]}>ON</Text>
        </View>
        <View style={styles.switchSide}>
          <Fill gradient={SWITCH_OFF} />
          <Text style={[styles.switchText, styles.switchOff]}>OFF</Text>
        </View>
      </Animated.View>
      <View style={styles.switchInset} pointerEvents="none" />
      <Animated.View style={[styles.knob, { transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] }]}>
        <Fill gradient={KNOB_FACE} style={styles.knobFace} />
      </Animated.View>
    </Pressable>
  );
}

const SWITCH_OFF: Gradient = { colors: ['#dcdcdc', '#f3f3f3', '#fdfdfd'], locations: [0, 0.5, 1] };
const KNOB_FACE: Gradient = { colors: ['#d5d5d5', '#f4f4f4', '#ffffff'], locations: [0, 0.6, 1] };

// Grouped tables

/** The vertically striped backdrop of grouped tables (groupTableViewBackgroundColor). */
export function TableBackground({ children, style, ...rest }: ViewProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View style={[styles.tableBase, style]} {...rest}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Pattern id={`t${id}`} width={7} height={7} patternUnits="userSpaceOnUse">
            <Rect width={5} height={7} fill="#c5ccd4" />
            <Rect x={5} width={2} height={7} fill="#ccd3d9" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#t${id})`} />
      </Svg>
      {children}
    </View>
  );
}

/** A section of a grouped table: an embossed title, rounded white cells, a footnote. */
export function TableGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.tableSection}>
      {title ? <Text style={styles.tableTitle}>{title}</Text> : null}
      <View style={styles.tableGroup}>
        {rows.map((row, i) => (
          <View key={i} style={i > 0 ? styles.tableDivider : undefined}>
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.tableFooter}>{footer}</Text> : null}
    </View>
  );
}

/**
 * A cell: a bold title, an optional subtitle and blue-grey detail value, and
 * a chevron, check or control on the right. Pressing turns it the classic
 * selection blue.
 */
export function TableRow({
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
  const accent = useAccent();
  const content = (pressed: boolean) => (
    <>
      {pressed ? <Fill gradient={accent.selection} /> : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && styles.rowDanger, pressed && styles.rowPressedText]} numberOfLines={2}>
          {title}
        </Text>
        {sub ? <Text style={[styles.rowSub, pressed && styles.rowPressedText]}>{sub}</Text> : null}
      </View>
      {detail ? <Text style={[styles.rowDetail, pressed && styles.rowPressedText]}>{detail}</Text> : null}
      {right}
      {accessory === 'chevron' ? <Icon name="chevronRight" size={16} strokeWidth={3} color={pressed ? '#fff' : '#8b8b8b'} /> : null}
      {accessory === 'check' ? <Icon name="check" size={18} strokeWidth={3} color={pressed ? '#fff' : '#385487'} /> : null}
    </>
  );
  // Link (asChild) hands the row its onPress; without one it is a plain cell.
  if (!onPress) {
    return <View style={styles.row}>{content(false)}</View>;
  }
  return (
    // `style` goes last: Link (asChild) passes its own and would replace the row's.
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} {...rest} style={styles.row}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

/**
 * One cell of a grouped table drawn row by row (a FlatList's items): the
 * first and last are rounded, the others get a divider on top.
 */
export function TableCell({ first, last, style, ...rest }: ViewProps & { first: boolean; last: boolean }) {
  return <View style={[styles.cell, first ? styles.cellFirst : styles.tableDivider, last && styles.cellLast, style]} {...rest} />;
}

/** A section title on its own, for tables drawn row by row. */
export function TableTitle({ title }: { title: string }) {
  return <Text style={[styles.tableTitle, styles.tableTitleAlone]}>{title}</Text>;
}

/** The grey, embossed words a table shows when it has nothing in it ("No Notifications"). */
export function TableEmpty({ title, dark = false }: { title: string; dark?: boolean }) {
  return <Text style={[styles.tableEmpty, dark && styles.tableEmptyDark]}>{title}</Text>;
}

// UIActivityIndicatorView

const SPOKES = 12;

/**
 * The iOS 6 spinner: twelve rounded spokes fading round the circle, turning
 * a spoke at a time. `size` is 'small' (20), 'large' (37) or a number;
 * `color` defaults to the grey style.
 */
export function Spinner({
  size = 'small',
  color = '#8a8a8a',
  style,
  accessibilityLabel = 'Loading',
}: {
  size?: 'small' | 'large' | number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const px = size === 'small' ? 20 : size === 'large' ? 37 : size;
  const [turn] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      // Stepped, one spoke per tick, as the original did.
      Animated.timing(turn, { toValue: 1, duration: 1000, easing: (t) => Math.floor(t * SPOKES) / SPOKES, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const c = px / 2;
  const w = px * 0.09;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} style={[{ width: px, height: px, alignSelf: 'center' }, style]}>
      <Animated.View style={{ width: px, height: px, transform: [{ rotate }] }}>
        <Svg width={px} height={px}>
          {Array.from({ length: SPOKES }, (_, i) => (
            <G key={i} rotation={-i * (360 / SPOKES)} origin={`${c}, ${c}`}>
              <Rect x={c - w / 2} y={px * 0.02} width={w} height={px * 0.27} rx={w / 2} fill={color} opacity={1 - (i / SPOKES) * 0.8} />
            </G>
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * The dark linen of iOS 6's Notification Center: a fine weave of light and
 * dark threads (two overlapping patterns so it doesn't look tiled), with a
 * soft shadow falling from the top.
 */
export function Linen({ children, style, ...rest }: ViewProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View style={[styles.linenBase, style]} {...rest}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Pattern id={`a${id}`} width={6} height={6} patternUnits="userSpaceOnUse">
            <Rect width={6} height={1} fill="rgba(255,255,255,0.045)" />
            <Rect y={3} width={6} height={1} fill="rgba(0,0,0,0.16)" />
            <Rect x={1} width={1} height={6} fill="rgba(255,255,255,0.03)" />
            <Rect x={4} width={1} height={6} fill="rgba(0,0,0,0.12)" />
          </Pattern>
          <Pattern id={`b${id}`} width={11} height={13} patternUnits="userSpaceOnUse">
            <Rect y={5} width={11} height={1} fill="rgba(255,255,255,0.03)" />
            <Rect x={7} width={1} height={13} fill="rgba(0,0,0,0.08)" />
            <Rect x={2} y={9} width={3} height={1} fill="rgba(255,255,255,0.05)" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#a${id})`} />
        <Rect width="100%" height="100%" fill={`url(#b${id})`} />
      </Svg>
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={styles.linenShade} pointerEvents="none" />
      {children}
    </View>
  );
}

/** A Notification Center section header: a dark bar with embossed white text. */
export function LinenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.linenHeader}>
      <LinearGradient colors={['#5a5e66', '#3a3d44', '#2c2f35']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <Text style={styles.linenHeaderText}>{title}</Text>
      {right}
    </View>
  );
}

// UISearchBar

/** The search bar: a capsule field with a magnifier on the bar's gradient. */
export function SearchBar({ style, ...props }: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const accent = useAccent();
  return (
    <View style={[styles.searchBar, style]}>
      <Fill gradient={accent.searchBar} />
      <View style={styles.searchField}>
        <Icon name="search" size={15} strokeWidth={2.5} color="#8e8e8e" />
        <TextInput
          placeholderTextColor="#8e8e8e"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.searchInput}
          {...props}
        />
      </View>
    </View>
  );
}

// Badges

/** The glossy red badge with a white rim, as on app icons and tab bars. */
export function Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, style]} pointerEvents="none">
      <Fill gradient={BADGE} style={styles.badgeFace} />
      <View style={styles.badgeShine} />
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const BADGE: Gradient = { colors: ['#f7968e', '#e2352a', '#cc1a0f', '#b8120a'], locations: [0, 0.49, 0.5, 1] };

const styles = StyleSheet.create({
  navBar: { overflow: 'hidden', borderBottomWidth: 1 },
  navHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  navRow: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  navTitleWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 96 },
  navTitle: { fontFamily, fontSize: 20, fontWeight: '700', color: '#ffffff', ...embossed },
  navSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  navSideRight: { justifyContent: 'flex-end' },
  navExtra: { paddingHorizontal: 8, paddingBottom: 7 },
  barButton: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    boxShadow: '0 1px 0 rgba(255,255,255,0.3)',
  },
  barButtonShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  barButtonText: { fontFamily, fontSize: 12, fontWeight: '700', color: '#ffffff', ...embossed },
  back: { height: BACK_HEIGHT, paddingLeft: 17, paddingRight: 10, justifyContent: 'center', maxWidth: 120 },
  toolbar: { overflow: 'hidden', borderTopWidth: 1, paddingHorizontal: 8, paddingTop: 8 },
  switch: {
    width: SWITCH_W,
    height: SWITCH_H,
    borderRadius: SWITCH_H / 2,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  switchRail: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SWITCH_W * 2 - KNOB, flexDirection: 'row' },
  switchSide: { width: TRAVEL + KNOB / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  switchText: { fontFamily, fontSize: 15, fontWeight: '700', marginHorizontal: 0 },
  switchOn: { color: '#ffffff', marginRight: KNOB / 2, ...embossed },
  switchOff: { color: '#7f7f7f', marginLeft: KNOB / 2, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  switchInset: { ...StyleSheet.absoluteFill, borderRadius: SWITCH_H / 2, boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.3)' },
  knob: {
    position: 'absolute',
    top: -1,
    left: -1,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 1,
    borderColor: '#a3a3a3',
    backgroundColor: '#f4f4f4',
    boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
  },
  knobFace: { borderRadius: KNOB / 2 },
  tableBase: { flex: 1, backgroundColor: '#c5ccd4' },
  tableSection: { marginHorizontal: 10, marginTop: 18 },
  tableTitle: {
    fontFamily,
    fontSize: 17,
    fontWeight: '700',
    color: '#4c566c',
    marginLeft: 10,
    marginBottom: 7,
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  tableGroup: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#aaaeb3',
    overflow: 'hidden',
    boxShadow: '0 1px 0 rgba(255,255,255,0.7)',
  },
  tableDivider: { borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  tableTitleAlone: { marginHorizontal: 20, marginTop: 18 },
  cell: { marginHorizontal: 10, backgroundColor: '#ffffff', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#aaaeb3', overflow: 'hidden' },
  cellFirst: { borderTopWidth: 1, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  cellLast: { borderBottomWidth: 1, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, boxShadow: '0 1px 0 rgba(255,255,255,0.7)' },
  tableEmpty: {
    fontFamily,
    fontSize: 17,
    fontWeight: '700',
    color: '#8a939f',
    textAlign: 'center',
    marginTop: 40,
    marginHorizontal: 20,
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  tableEmptyDark: { color: '#7c828b', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: -1 } },

  tableFooter: {
    fontFamily,
    fontSize: 15,
    color: '#4c566c',
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 14,
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily, fontSize: 17, fontWeight: '700', color: '#000000' },
  rowSub: { fontFamily, fontSize: 13, color: '#7a7a7a' },
  rowDetail: { fontFamily, fontSize: 17, color: '#385487' },
  rowDanger: { color: '#c0190e' },
  rowPressedText: { color: '#ffffff' },
  linenBase: { flex: 1, backgroundColor: '#393c42' },
  linenShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 14 },
  linenHeader: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderBottomWidth: 1,
    borderBottomColor: '#15171a',
  },
  linenHeaderText: { flex: 1, fontFamily, fontSize: 15, fontWeight: '700', color: '#ffffff', ...embossed },
  searchBar: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#8e99a8' },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 31,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#8c97a4',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
  },
  // The capsule shows focus; no browser outline inside it.
  searchInput: { flex: 1, fontFamily, fontSize: 15, color: '#000000', paddingVertical: 0, outlineWidth: 0 },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.55)',
  },
  badgeFace: { borderRadius: 12 },
  badgeShine: { position: 'absolute', top: 1, left: 3, right: 3, height: '45%', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.28)' },
  badgeText: { fontFamily, fontSize: 13, fontWeight: '700', color: '#ffffff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 0 },
});
