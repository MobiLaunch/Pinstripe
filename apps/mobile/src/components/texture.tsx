/**
 * A repeating material texture filling its parent (linen, brushed metal,
 * wood, leather), drawn at `tile` size so a 2x image stays crisp. On the
 * web it's a CSS background, which always fills the space however it
 * grows; on phones the tiles are laid out to cover the measured area.
 */
import { Asset } from 'expo-asset';
import { useState, useSyncExternalStore } from 'react';
import { Image, type ImageSourcePropType, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

export function Texture({ source, tile }: { source: ImageSourcePropType; tile: { width: number; height: number } }) {
  return Platform.OS === 'web' ? <WebTexture source={source} tile={tile} /> : <TiledTexture source={source} tile={tile} />;
}

const noop = () => () => {};

function WebTexture({ source, tile }: { source: ImageSourcePropType; tile: { width: number; height: number } }) {
  // Only once running in the browser: the statically rendered HTML has no texture to disagree with.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const uri = hydrated ? Asset.fromModule(source as number).uri : null;
  // react-native-web passes these CSS properties through to the element.
  const background = uri
    ? ({ backgroundImage: `url("${uri}")`, backgroundRepeat: 'repeat', backgroundSize: `${tile.width}px ${tile.height}px` } as unknown as ViewStyle)
    : null;
  return <View style={[StyleSheet.absoluteFill, background]} pointerEvents="none" />;
}

function TiledTexture({ source, tile }: { source: ImageSourcePropType; tile: { width: number; height: number } }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
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
