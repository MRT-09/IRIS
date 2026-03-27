import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Alert, Platform } from 'react-native';

/**
 * We only need local notifications, so the module is loaded lazily and push-token
 * auto-registration is disabled when Expo Go is detected.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const detectionChannelId = 'detections';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let initialized = false;
let permissionGranted = false;

function showDetectionAlert(body: string): void {
  Alert.alert('IRIS - Person Detected', body);
}

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return null;

  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').catch(() => null);
  }

  return notificationsModulePromise;
}

export async function initializeNotifications(): Promise<boolean> {
  if (initialized) return permissionGranted;

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    initialized = true;
    permissionGranted = false;
    return false;
  }

  try {
    if (isExpoGo && Notifications.setAutoServerRegistrationEnabledAsync) {
      await Notifications.setAutoServerRegistrationEnabledAsync(false);
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(detectionChannelId, {
        name: 'Detections',
        description: 'IRIS person detection alerts',
        importance: Notifications.AndroidImportance.MAX,
        enableVibrate: true,
        showBadge: false,
        vibrationPattern: [0, 250, 150, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
      });
    }

    const permissions = await Notifications.getPermissionsAsync();
    permissionGranted = permissions.granted || permissions.status === 'granted';
    initialized = true;
    return permissionGranted;
  } catch {
    initialized = true;
    permissionGranted = false;
    return false;
  }
}

export async function requestPermissions(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    permissionGranted = false;
    return false;
  }

  await initializeNotifications();

  if (permissionGranted) return true;

  try {
    const permissions = await Notifications.requestPermissionsAsync();
    permissionGranted = permissions.granted || permissions.status === 'granted';
    return permissionGranted;
  } catch {
    permissionGranted = false;
    return false;
  }
}

export async function sendDetectionNotification(names: string[]): Promise<boolean> {
  if (names.length === 0) return false;

  const body =
    names.length === 1 ? `${names[0]} detected` : `Detected: ${names.join(', ')}`;

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    showDetectionAlert(body);
    return false;
  }

  try {
    await initializeNotifications();
    if (!permissionGranted) {
      permissionGranted = await requestPermissions();
    }

    if (!permissionGranted) {
      showDetectionAlert(body);
      return false;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'IRIS - Person Detected',
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: Platform.OS === 'android' ? { channelId: detectionChannelId } : null,
    });
    return true;
  } catch {
    showDetectionAlert(body);
    return false;
  }
}
