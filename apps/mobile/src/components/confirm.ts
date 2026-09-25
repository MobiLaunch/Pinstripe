import { showDialog } from '@/components/dialog';

/** A yes/no question in an iOS 6 alert. Resolves true for the confirming button. */
export async function confirm(title: string, message: string, confirmLabel: string): Promise<boolean> {
  const destructive = /delete|block|suspend|remove|sign out|report/i.test(confirmLabel);
  const answer = await showDialog(title, message, [
    { label: 'Cancel', style: 'cancel' },
    { label: confirmLabel, style: destructive ? 'destructive' : 'default' },
  ]);
  return answer === 1;
}
