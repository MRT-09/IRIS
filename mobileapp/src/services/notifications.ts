import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * expo-notifications' push-token auto-registration crashes in Expo Go (SDK 53+).
 * We only need *local* notifications, so we skip the import entirely in Expo Go
 * and load the module lazily in dev-build / production.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

if (!isExpoGo && Platform.OS !== 'web') {
  // Configure how incoming notifications are displayed while the app is foregrounded.
  // This runs once at module load time in dev-build / production builds only.
  import('expo-notifications').then(({ setNotificationHandler }) => {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  });
}

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
    const { requestPermissionsAsync } = await import('expo-notifications');
    const { status } = await requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function sendDetectionNotification(names: string[]): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  const body =
    names.length === 1 ? `${names[0]} detected` : `Detected: ${names.join(', ')}`;
  try {
    const { scheduleNotificationAsync } = await import('expo-notifications');
    await scheduleNotificationAsync({
      content: { title: 'IRIS — Person Detected', body },
      trigger: null,
    });
  } catch {
    // Silently ignore — TTS is the primary output channel
  }
}
