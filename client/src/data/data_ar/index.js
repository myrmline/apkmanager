import common from './common.json';
import auth from './auth.json';
import apps from './apps.json';
import people from './people.json';
import account from './account.json';

/** Arabic, right to left. Missing keys fall back to data_en. */
export default {
  code: 'ar',
  label: 'العربية',
  dir: 'rtl',
  // ar-TN keeps Western digits, which suit version numbers and file sizes.
  intl: 'ar-TN',
  common,
  auth,
  apps,
  people,
  account,
};
