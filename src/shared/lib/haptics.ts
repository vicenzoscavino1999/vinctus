/** Short vibration on phones whose browser supports it (Android Chrome); does nothing elsewhere. */
export const triggerSelectionHaptic = async (): Promise<void> => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
  } catch (error) {
    console.error('Haptic feedback failed:', error);
  }
};
