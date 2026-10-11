export const en = {
  nav: {
    label: 'Main navigation',
    moreLabel: 'More sections',
    today: 'Today',
    people: 'People',
    organizations: 'Organizations',
    settings: 'Settings',
    search: 'Search',
    more: 'More',
  },
  search: {
    open: 'Search',
  },
  language: {
    label: 'Language',
    toggle: 'Language: {{current}}, switch to {{next}}',
    en: 'English',
    de: 'German',
  },
  theme: {
    label: 'Appearance',
    hint: 'Saved on this device.',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },
  placeholder: {
    kicker: 'Coming soon',
    body: 'This page is not built yet.',
  },
  status: {
    apiOk: 'API reachable',
    apiDown: 'API not reachable',
    apiChecking: 'Checking API…',
  },
  notFound: {
    kicker: 'Error 404',
    title: 'Page not found',
    back: 'Back to Today',
  },
};

export type Translations = typeof en;
