export interface PageTheme {
  gradient: string;
  shadow: string;
  accent: string;
  accentLight: string;
  accentBg: string;
  accentBorder: string;
}

export const THEMES = {
  labo: {
    gradient: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
    shadow: 'rgba(126,34,206,0.28)',
    accent: '#7e22ce',
    accentLight: '#a855f7',
    accentBg: '#faf5ff',
    accentBorder: '#d8b4fe',
  },
  stock: {
    gradient: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 55%, #3b82f6 100%)',
    shadow: 'rgba(30,64,175,0.28)',
    accent: '#1e40af',
    accentLight: '#3b82f6',
    accentBg: '#eff6ff',
    accentBorder: '#bfdbfe',
  },
  inventaire: {
    gradient: 'linear-gradient(135deg, #064e3b 0%, #065f46 55%, #10b981 100%)',
    shadow: 'rgba(6,95,70,0.28)',
    accent: '#065f46',
    accentLight: '#10b981',
    accentBg: '#f0fdf4',
    accentBorder: '#a7f3d0',
  },
  catalogue: {
    gradient: 'linear-gradient(135deg, #78350f 0%, #92400e 55%, #f59e0b 100%)',
    shadow: 'rgba(146,64,14,0.28)',
    accent: '#92400e',
    accentLight: '#f59e0b',
    accentBg: '#fffbeb',
    accentBorder: '#fde68a',
  },
  produits: {
    gradient: 'linear-gradient(135deg, #881337 0%, #9f1239 55%, #f43f5e 100%)',
    shadow: 'rgba(159,18,57,0.28)',
    accent: '#9f1239',
    accentLight: '#f43f5e',
    accentBg: '#fff1f2',
    accentBorder: '#fecdd3',
  },
  rapports: {
    gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #6366f1 100%)',
    shadow: 'rgba(49,46,129,0.28)',
    accent: '#312e81',
    accentLight: '#6366f1',
    accentBg: '#eef2ff',
    accentBorder: '#c7d2fe',
  },
  gerants: {
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)',
    shadow: 'rgba(3,105,161,0.28)',
    accent: '#0369a1',
    accentLight: '#0ea5e9',
    accentBg: '#f0f9ff',
    accentBorder: '#bae6fd',
  },
  compte: {
    gradient: 'linear-gradient(135deg, #164e63 0%, #0e7490 55%, #06b6d4 100%)',
    shadow: 'rgba(14,116,144,0.28)',
    accent: '#0e7490',
    accentLight: '#06b6d4',
    accentBg: '#ecfeff',
    accentBorder: '#a5f3fc',
  },
  admin: {
    gradient: 'linear-gradient(135deg, #18181b 0%, #27272a 55%, #52525b 100%)',
    shadow: 'rgba(39,39,42,0.28)',
    accent: '#27272a',
    accentLight: '#52525b',
    accentBg: '#f4f4f5',
    accentBorder: '#d4d4d8',
  },
  pertes: {
    gradient: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 55%, #ef4444 100%)',
    shadow: 'rgba(153,27,27,0.28)',
    accent: '#991b1b',
    accentLight: '#ef4444',
    accentBg: '#fff5f5',
    accentBorder: '#fecaca',
  },
  activites: {
    gradient: 'linear-gradient(135deg, #14532d 0%, #166534 55%, #22c55e 100%)',
    shadow: 'rgba(22,101,52,0.28)',
    accent: '#166534',
    accentLight: '#22c55e',
    accentBg: '#f0fdf4',
    accentBorder: '#bbf7d0',
  },
} as const satisfies Record<string, PageTheme>;

export type ThemeKey = keyof typeof THEMES;
