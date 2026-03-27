import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';

export default function TabLayout() {
  const { colorScheme } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Live',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="eye.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="gear" color={color} />,
        }}
      />
    </Tabs>
  );
}
