import common from './common.json';
import auth from './auth.json';
import apps from './apps.json';
import people from './people.json';
import account from './account.json';

/**
 * English — the reference dictionary. Any key missing from another language
 * falls back to the value here, so a half-finished translation still renders.
 */
export default {
  code: 'en',
  label: 'English',
  dir: 'ltr',
  // Locale used for Intl date and number formatting.
  intl: 'en-GB',
  common,
  auth,
  apps,
  people,
  account,
};
