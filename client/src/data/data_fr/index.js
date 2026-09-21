import common from './common.json';
import auth from './auth.json';
import apps from './apps.json';
import people from './people.json';
import account from './account.json';

/** French. Missing keys fall back to data_en. */
export default {
  code: 'fr',
  label: 'Français',
  dir: 'ltr',
  // Locale used for Intl date and number formatting.
  intl: 'fr-FR',
  common,
  auth,
  apps,
  people,
  account,
};
