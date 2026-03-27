import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { initDatabase } from '@/src/services/database';
import { getSettings } from '@/src/store/settings';
import { AppThemeProvider, useAppTheme } from '@/src/store/theme';
import { apiService } from '@/src/services/api';
import { initializeNotifications, requestPermissions } from '@/src/services/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  useEffect(() => {
    async function init() {
      await initDatabase();
      const settings = await getSettings();
      apiService.setSettings(settings);
      await initializeNotifications();
      await requestPermissions();
    }
    init();
  }, []);

  return (
    <AppThemeProvider>
      <RootNavigator />
    </AppThemeProvider>
  );
}

function RootNavigator() {
  const { colorScheme } = useAppTheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="contact/add"
          options={{ title: 'Add Contact', headerBackTitle: 'Contacts' }}
        />
        <Stack.Screen
          name="contact/[id]"
          options={{ title: 'Edit Contact', headerBackTitle: 'Contacts' }}
        />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
