/**
 * iOS 6 chrome: navigation bars and their buttons, toolbars, UISwitch,
 * grouped tables, the search bar and badges. Colours come from the theme
 * (Blue is UIBarStyleDefault, Graphite is UIBarStyleBlack).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Children, type ComponentProps, type ReactNode, useEffect, useId, useState } from 'react';
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

import { FitGloss } from '@/components/glass';
import {
  M3Badge,
  M3BackButton,
  M3BarButton,
  M3Empty,
  M3Header,
  M3ListBackground,
  M3ListCell,
  M3ListGroup,
  M3ListRow,
  M3ListTitle,
  M3SearchBar,
  M3Surface,
  M3Switch,
  M3Toolbar,
  M3TopAppBar,
} from '@/components/m3/kit';
import { LoadingIndicator } from '@/components/m3/loaders';
import { Icon } from '@/components/icon';
import { Texture } from '@/components/texture';
import {
  GlassBackButton,
  GlassBadge,
  GlassBarButton,
  GlassEmpty,
  GlassLinenHeader,
  GlassListBackground,
  GlassListCell,
  GlassListGroup,
  GlassListRow,
  GlassListTitle,
  GlassNavBar,
  GlassSearchBar,
  GlassSwitch,
  GlassToolbar,
} from '@/components/liquid-controls';
import { Wallpaper } from '@/components/liquid';
import { fontFamily, type Gradient } from '@/theme/aqua';
import { material } from '@/theme/startup';
import { useAccent, useGlass } from '@/theme/theme';

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
function Ios6NavBar({ title, left, right, children }: { title?: string; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.navBar, { paddingTop: insets.top, borderBottomColor: accent.navBarEdge }]}>
      <Fill gradient={accent.navBar} />
      {/* Glass: a soft sheen over the upper half of the bar. */}
      <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.06)']} style={[styles.navGloss, { top: insets.top }]} pointerEvents="none" />
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
function Ios6BarButton({
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
function Ios6BackButton({ title = 'Back', onPress }: { title?: string; onPress?: () => void }) {
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
function Ios6Toolbar({ children, style, ...rest }: ViewProps) {
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
function Ios6Switch({
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
function Ios6TableBackground({ children, style, ...rest }: ViewProps) {
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
function Ios6TableGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
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
function Ios6TableRow({
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
function Ios6TableCell({ first, last, style, ...rest }: ViewProps & { first: boolean; last: boolean }) {
  return <View style={[styles.cell, first ? styles.cellFirst : styles.tableDivider, last && styles.cellLast, style]} {...rest} />;
}

/** A section title on its own, for tables drawn row by row. */
function Ios6TableTitle({ title }: { title: string }) {
  return <Text style={[styles.tableTitle, styles.tableTitleAlone]}>{title}</Text>;
}

/** The grey, embossed words a table shows when it has nothing in it ("No Notifications"). */
function Ios6TableEmpty({ title, dark = false }: { title: string; dark?: boolean }) {
  return <Text style={[styles.tableEmpty, dark && styles.tableEmptyDark]}>{title}</Text>;
}

// UIActivityIndicatorView

const SPOKES = 12;

/**
 * The iOS 6 spinner: twelve rounded spokes fading round the circle, turning
 * a spoke at a time. `size` is 'small' (20), 'large' (37) or a number;
 * `color` defaults to the grey style.
 */
function Ios6Spinner({
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
  // Today's spinner: eight thicker spokes, grey, turning the same way.
  const glass = useGlass();
  const spokes = glass ? 8 : SPOKES;
  const [turn] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      // Stepped, one spoke per tick, as the original did.
      Animated.timing(turn, { toValue: 1, duration: 1000, easing: (t) => Math.floor(t * spokes) / spokes, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn, spokes]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const c = px / 2;
  const w = px * (glass ? 0.13 : 0.09);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} style={[{ width: px, height: px, alignSelf: 'center' }, style]}>
      <Animated.View style={{ width: px, height: px, transform: [{ rotate }] }}>
        <Svg width={px} height={px}>
          {Array.from({ length: spokes }, (_, i) => (
            <G key={i} transform={`rotate(${-i * (360 / spokes)} ${c} ${c})`}>
              <Rect x={c - w / 2} y={px * 0.04} width={w} height={px * 0.26} rx={w / 2} fill={glass && color === '#8a8a8a' ? '#8e8e93' : color} opacity={1 - (i / spokes) * 0.75} />
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
function Ios6Linen({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.linenBase, style]} {...rest}>
      <Texture source={LINEN} tile={{ width: 256, height: 256 }} />
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={styles.linenShade} pointerEvents="none" />
      {children}
    </View>
  );
}

const LINEN = require('../../assets/textures/linen.png');
const METAL = require('../../assets/textures/metal.png');

/** Brushed aluminium, for toolbars and trays; `children` sit on the metal. */
export function BrushedMetal({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.metal, style]} {...rest}>
      <Texture source={METAL} tile={{ width: 512, height: 128 }} />
      {/* Light falls from above: brighter at the top, a little shadow below. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.22)']}
        locations={[0, 0.1, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

/** A Notification Center section header: a dark bar with embossed white text. */
function Ios6LinenHeader({ title, right }: { title: string; right?: ReactNode }) {
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
function Ios6SearchBar({ style, ...props }: TextInputProps & { style?: StyleProp<ViewStyle> }) {
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
function Ios6Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, style]} pointerEvents="none">
      <Fill gradient={BADGE} style={styles.badgeFace} />
      <FitGloss radius="pill" strength={0.6} />
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const BADGE: Gradient = { colors: ['#f7968e', '#e2352a', '#cc1a0f', '#b8120a'], locations: [0, 0.49, 0.5, 1] };

const styles = StyleSheet.create({
  // The bar casts a soft shadow down onto the page, as iOS 6's did.
  navBar: { overflow: 'hidden', borderBottomWidth: 1, zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.45)' },
  navGloss: { position: 'absolute', left: 0, right: 0, height: 22 },
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
  linenBase: { flex: 1, backgroundColor: '#3b3e44' },
  metal: { overflow: 'hidden', backgroundColor: '#b9bdc3', borderTopWidth: 1, borderTopColor: '#5b5e63' },
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

// Each control draws Material 3 in the Android look, Liquid Glass when that look is on, iOS 6 otherwise.

export function Spinner(props: ComponentProps<typeof Ios6Spinner>) {
  if (material) {
    const px = props.size === 'small' || props.size === undefined ? 32 : props.size === 'large' ? 48 : props.size;
    // The grey default was iOS 6's; Material uses the primary colour.
    return <LoadingIndicator size={px} color={props.color === '#fff' || props.color === '#ffffff' ? '#ffffff' : undefined} style={props.style} accessibilityLabel={props.accessibilityLabel} />;
  }
  return <Ios6Spinner {...props} />;
}

export function NavBar(props: ComponentProps<typeof Ios6NavBar>) {
  return useGlass() ? <GlassNavBar {...props} /> : material ? <M3TopAppBar {...props} /> : <Ios6NavBar {...props} />;
}

export function BarButton(props: ComponentProps<typeof Ios6BarButton>) {
  return useGlass() ? <GlassBarButton {...props} /> : material ? <M3BarButton {...props} /> : <Ios6BarButton {...props} />;
}

export function BackButton(props: ComponentProps<typeof Ios6BackButton>) {
  return useGlass() ? <GlassBackButton {...props} /> : material ? <M3BackButton {...props} /> : <Ios6BackButton {...props} />;
}

export function Toolbar(props: ComponentProps<typeof Ios6Toolbar>) {
  return useGlass() ? <GlassToolbar {...props} /> : material ? <M3Toolbar {...props} /> : <Ios6Toolbar {...props} />;
}

export function Switch(props: ComponentProps<typeof Ios6Switch>) {
  return useGlass() ? <GlassSwitch {...props} /> : material ? <M3Switch {...props} /> : <Ios6Switch {...props} />;
}

export function TableBackground(props: ComponentProps<typeof Ios6TableBackground>) {
  return useGlass() ? <GlassListBackground {...props} /> : material ? <M3ListBackground {...props} /> : <Ios6TableBackground {...props} />;
}

export function TableGroup(props: ComponentProps<typeof Ios6TableGroup>) {
  return useGlass() ? <GlassListGroup {...props} /> : material ? <M3ListGroup {...props} /> : <Ios6TableGroup {...props} />;
}

export function TableRow(props: ComponentProps<typeof Ios6TableRow>) {
  return useGlass() ? <GlassListRow {...props} /> : material ? <M3ListRow {...props} /> : <Ios6TableRow {...props} />;
}

export function TableCell(props: ComponentProps<typeof Ios6TableCell>) {
  return useGlass() ? <GlassListCell {...props} /> : material ? <M3ListCell {...props} /> : <Ios6TableCell {...props} />;
}

export function TableTitle(props: ComponentProps<typeof Ios6TableTitle>) {
  return useGlass() ? <GlassListTitle {...props} /> : material ? <M3ListTitle {...props} /> : <Ios6TableTitle {...props} />;
}

export function TableEmpty(props: ComponentProps<typeof Ios6TableEmpty>) {
  return useGlass() ? <GlassEmpty {...props} /> : material ? <M3Empty {...props} /> : <Ios6TableEmpty {...props} />;
}

export function SearchBar(props: ComponentProps<typeof Ios6SearchBar>) {
  return useGlass() ? <GlassSearchBar {...props} /> : material ? <M3SearchBar {...props} /> : <Ios6SearchBar {...props} />;
}

export function Badge(props: ComponentProps<typeof Ios6Badge>) {
  return useGlass() ? <GlassBadge {...props} /> : material ? <M3Badge {...props} /> : <Ios6Badge {...props} />;
}

export function Linen(props: ComponentProps<typeof Ios6Linen>) {
  return useGlass() ? <Wallpaper {...props} /> : material ? <M3Surface {...props} /> : <Ios6Linen {...props} />;
}

export function LinenHeader(props: ComponentProps<typeof Ios6LinenHeader>) {
  return useGlass() ? <GlassLinenHeader {...props} /> : material ? <M3Header {...props} /> : <Ios6LinenHeader {...props} />;
}
