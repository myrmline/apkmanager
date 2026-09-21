import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'relay.theme';
const ThemeContext = createContext(null);

const systemPrefersDark = () =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

const resolve = (choice) => (choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice);

export function ThemeProvider({ children }) {
  // 'light' | 'dark' | 'system'. The resolved value is written to <html> so the
  // stylesheet only ever needs to know about light and dark.
  const [choice, setChoice] = useState(() => localStorage.getItem(KEY) || 'system');

  useEffect(() => {
    document.documentElement.dataset.theme = resolve(choice);
    localStorage.setItem(KEY, choice);
  }, [choice]);

  useEffect(() => {
    if (choice !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.dataset.theme = resolve('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  const value = useMemo(
    () => ({
      choice,
      theme: resolve(choice),
      setChoice,
      // Tapping the switch moves to the opposite of what is on screen now.
      toggle: () => setChoice(resolve(choice) === 'dark' ? 'light' : 'dark'),
    }),
    [choice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Set the theme before first paint, so a dark session never flashes white. */
export const bootTheme = () => {
  const stored = localStorage.getItem(KEY) || 'system';
  document.documentElement.dataset.theme = resolve(stored);
};
