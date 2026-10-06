import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const DETECT_VERSION = '2026-10-06';
export const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';
export const PLATFORM = `${Platform.OS} ${Platform.Version}`;
