import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { getSettings, saveSettings } from '@/src/store/settings';
import type { ThemeMode } from '@/src/types';

type ColorScheme = 'light' | 'dark';

interface ThemeContextValue {
  colorScheme: ColorScheme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    let mounted = true;

    (async () => {
      const settings = await getSettings();
      if (mounted) {
        setThemeModeState(settings.themeMode ?? 'light');
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await saveSettings({ themeMode: mode });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorScheme: themeMode,
      themeMode,
      setThemeMode,
    }),
    [themeMode, setThemeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return context;
}
