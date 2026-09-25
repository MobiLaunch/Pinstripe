import { StyleSheet, Text } from 'react-native';

import { fontFamily } from '@/theme/aqua';

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.error} accessibilityRole="alert">
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  error: {
    fontFamily,
    fontSize: 13,
    color: '#86190f',
    backgroundColor: '#fde8e6',
    borderWidth: 1,
    borderColor: '#d9392f',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
