import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { SYMBOLS, type SymbolName } from './symbols';

export type { SymbolName };

/** A Material Symbol (Rounded), outlined or filled, as Pixel apps draw them. */
export function Glyph({ name, size = 24, color, filled = false }: { name: SymbolName; size?: number; color: string; filled?: boolean }) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 -960 960 960">
        <Path d={SYMBOLS[name][filled ? 1 : 0]} fill={color} />
      </Svg>
    </View>
  );
}
