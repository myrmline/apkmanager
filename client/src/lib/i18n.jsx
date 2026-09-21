import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import en from '../data/data_en/index.js';
import fr from '../data/data_fr/index.js';
import ar from '../data/data_ar/index.js';
import { makeFormatters } from './format.js';

/** Every language the client ships, loaded from the data folders. */
export const LOCALES = { en, fr, ar };

const KEY = 'relay.locale';
const I18nContext = createContext(null);

const lookup = (dict, path) =>
  path.split('.').reduce((node, key) => (node == null ? node : node[key]), dict);

const fill = (text, vars) =>
  text.replace(/\{(\w+)\}/g, (match, key) =>
    vars?.[key] === undefined ? match : String(vars[key]),
  );

/** Stored choice, else the browser's preference, else English. */
function detect() {
  const stored = localStorage.getItem(KEY);
  if (stored && LOCALES[stored]) return stored;

  const preferred = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || 'en'];

  return preferred.map((tag) => tag.slice(0, 2).toLowerCase()).find((code) => LOCALES[code]) || 'en';
}

/** Set lang and dir before first paint, so Arabic does not start left to right. */
export function bootLocale() {
  const locale = LOCALES[detect()];
  document.documentElement.lang = locale.code;
  document.documentElement.dir = locale.dir;
}

export function I18nProvider({ children }) {
  const [code, setCode] = useState(detect);
  const locale = LOCALES[code] || en;

  useEffect(() => {
    localStorage.setItem(KEY, code);
    document.documentElement.lang = locale.code;
    document.documentElement.dir = locale.dir;
  }, [code, locale]);

  const value = useMemo(() => {
    // Which plural forms a language needs is the language's business: English
    // and French want one/other, Arabic also wants two/few/many. Intl decides.
    const plural = new Intl.PluralRules(locale.intl);

    /**
     * t('apps.title') or t('apps.detail.downloads', { count }). With a `count`,
     * the plural form for that number is tried first, then `_other`. Any key the
     * active language is missing falls back to English, then to the key itself,
     * so a gap in a translation is visible but never blank.
     */
    const t = (path, vars) => {
      if (vars?.count !== undefined) {
        for (const suffix of [`_${plural.select(vars.count)}`, '_other']) {
          const form = lookup(locale, path + suffix) ?? lookup(en, path + suffix);
          if (typeof form === 'string') return fill(form, vars);
        }
      }
      const text = lookup(locale, path) ?? lookup(en, path);
      return typeof text === 'string' ? fill(text, vars) : path;
    };

    return {
      t,
      locale: locale.code,
      dir: locale.dir,
      locales: Object.values(LOCALES).map(({ code: value, label, dir }) => ({ value, label, dir })),
      setLocale: (next) => LOCALES[next] && setCode(next),
      fmt: makeFormatters(locale.intl, t),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
