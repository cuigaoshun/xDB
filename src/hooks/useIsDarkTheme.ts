import { useState, useEffect } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';

/**
 * 检测当前是否为深色主题
 * 支持 light/dark/system 三种模式
 */
export function useIsDarkTheme(): boolean {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setIsDark(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      setIsDark(theme === 'dark');
    }
  }, [theme]);

  return isDark;
}
