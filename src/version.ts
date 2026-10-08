import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const DETECT_VERSION = '2026-10-08';
export const PRIVACY_URL = '';
export const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';
export const PLATFORM = `${Platform.OS} ${Platform.Version}`;
