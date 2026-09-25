import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Stroke icons from the design canvas, drawn on a 24×24 grid. */
const ICONS = {
  feed: <Path d="M4 6h16M4 12h16M4 18h10" />,
  play: <Path d="M8 5l11 7-11 7z" />,
  account: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  camera: (
    <>
      <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <Circle cx={12} cy={13} r={3.5} />
    </>
  ),
  heart: <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  comment: <Path d="M4 5h16v11H9l-5 4z" />,
  boost: <Path d="M4 9V7a2 2 0 0 1 2-2h12l-3-3M20 15v2a2 2 0 0 1-2 2H6l3 3" />,
  share: <Path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />,
  reply: <Path d="M10 8L4 13l6 5M4 13h10a6 6 0 0 1 6 6" />,
  photo: (
    <>
      <Rect x={3} y={5} width={18} height={14} rx={2} />
      <Path d="M3 16l5-5 5 5 3-3 5 5" />
    </>
  ),
  bell: <Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  person: <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />,
  at: <Path d="M16 12a4 4 0 1 1-1.2-2.8M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1" />,
  more: <Path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={3.5} />,
  flag: <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  check: <Path d="M5 12l5 5 9-10" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="M16 16l4.5 4.5" />
    </>
  ),
  sound: <Path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
  soundOff: <Path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6" />,
  trash: <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  lock: (
    <>
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  chevronLeft: <Path d="M15 5l-7 7 7 7" />,
  chevronRight: <Path d="M9 5l7 7-7 7" />,
  gear: (
    <>
      <Circle cx={12} cy={12} r={3.2} />
      <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  filled = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
}) {
  // The View keeps the icon above absolutely-positioned gradient layers on web.
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        accessible={false}>
        {ICONS[name]}
      </Svg>
    </View>
  );
}
