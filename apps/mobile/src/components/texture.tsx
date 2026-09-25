/**
 * A repeating material texture filling its parent (linen, brushed metal,
 * wood). Phones repeat an image natively; react-native-web draws it once,
 * so there the tiles are laid out by hand.
 */
import { useState } from 'react';
import { Image, type ImageSourcePropType, Platform, StyleSheet, View } from 'react-native';

export function Texture({ source, tile }: { source: ImageSourcePropType; tile: { width: number; height: number } }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  if (Platform.OS !== 'web') {
    return <Image source={source} resizeMode="repeat" style={StyleSheet.absoluteFill} />;
  }
  const cols = Math.ceil(size.width / tile.width);
  const rows = Math.ceil(size.height / tile.height);
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.clip]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}>
      {Array.from({ length: rows * cols }, (_, i) => (
        <Image
          key={i}
          source={source}
          style={{ position: 'absolute', left: (i % cols) * tile.width, top: Math.floor(i / cols) * tile.height, width: tile.width, height: tile.height }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
