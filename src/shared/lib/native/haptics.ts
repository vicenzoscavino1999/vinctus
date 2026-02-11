import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNativePlatform } from '@/shared/lib/native/capacitor';

export const triggerSelectionHaptic = async (): Promise<void> => {
  try {
    if (isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
  } catch (error) {
    console.error('Haptic feedback failed:', error);
  }
};
