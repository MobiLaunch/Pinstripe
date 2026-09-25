import { StyleSheet, Text } from 'react-native';

import { colors, fontFamily } from '@/theme/aqua';

export const PASSWORD_MIN = 8;

/** A rough guide, not a gate: the server only enforces the minimum length. */
export function strength(password: string): { label: string; color: string } | null {
  if (!password) return null;
  if (password.length < PASSWORD_MIN) return { label: 'Too short', color: colors.danger };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /\s/].filter((r) => r.test(password)).length;
  const score = (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0) + (variety >= 3 ? 1 : 0);
  if (score >= 2) return { label: 'Strong', color: colors.verified };
  if (score === 1) return { label: 'Good', color: colors.verified };
  return { label: 'Fair', color: '#9a6a08' };
}

export function StrengthMeter({ password }: { password: string }) {
  const meter = strength(password);
  return meter ? (
    <Text style={[styles.meter, { color: meter.color }]} accessibilityLiveRegion="polite">
      {meter.label}
    </Text>
  ) : null;
}

const styles = StyleSheet.create({
  meter: { fontFamily, fontSize: 12, fontWeight: '700', textAlign: 'right' },
});
