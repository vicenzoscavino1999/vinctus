import { Capacitor } from '@capacitor/core';

export const getNativePlatform = (): string => Capacitor.getPlatform();

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

export const isIOSNative = (): boolean => getNativePlatform() === 'ios' && isNativePlatform();
