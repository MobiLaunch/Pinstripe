import { Redirect } from 'expo-router';

/**
 * The OAuth redirect target (pinstripe://oauth). The browser session
 * normally captures it before navigation; if a platform routes it here
 * anyway, just go home and let the guards pick the right screen.
 */
export default function OAuthRedirect() {
  return <Redirect href="/" />;
}
