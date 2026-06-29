// ── Thème centralisé de l'Espace Produit (Direction « Indigo unifié ») ──────────
// Point UNIQUE pour rethémer toute la section. Avant, les couleurs (émeraude + hero
// sombre) étaient copiées-collées en inline dans ~6 fichiers ; elles pointent
// désormais toutes ici. Changer de thème = éditer ce seul fichier.
export const PRODUCT_THEME = {
  // En-tête (bandeau hero) des pages
  heroGradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%)',
  heroGradientShort: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
  heroShadow: '0 8px 32px rgba(30,27,75,0.35)',
  iconBadgeBg: 'rgba(99,102,241,0.18)',
  iconBadgeBorder: 'rgba(99,102,241,0.3)',
  counterBg: 'rgba(99,102,241,0.14)',
  counterText: '#a5b4fc',

  // Accent de section (indigo, aligné sur --primary global de l'app)
  accent: '#6366f1',       // accent principal
  accentDark: '#4338ca',   // variante foncée (textes/contours/HistoryFilterBar accentDark)
  accentDeep: '#4f46e5',   // boutons pleins
  accentText: '#3730a3',   // texte sur fond clair indigo

  // Pastille d'icône + bouton d'ajout
  iconGradient: 'linear-gradient(135deg, #6366f1, #4338ca)',
  btnGradient: 'linear-gradient(135deg, #6366f1, #4f46e5)',

  // Fonds clairs / bordures
  surfaceTint: '#eef2ff',
  surfaceTint2: '#faf5ff',
  border: '#c7d2fe',
  borderSoft: '#e0e7ff',
} as const;

export default PRODUCT_THEME;
