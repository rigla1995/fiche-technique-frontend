// ── Définitions de la grille tarifaire (clés, défauts, sections, style de carte) ──
// Module SANS composant React : partagé par TarifsConfig (grille générale) et
// AdminDomaineEditPage (grille par domaine) — sorti de TarifsConfig.tsx pour respecter
// eslint react-refresh/only-export-components (un fichier de composants n'exporte que des composants).

// ── Clés de la grille tarifaire (tarifs_config) ──────────────────────────────
// Partagées avec la grille par domaine (AdminDomaineEditPage → onglet Grille tarifaire).
export const TARIF_KEYS = [
  'prix_base_activite_basique',
  'prix_base_activite_premium',
  'remise_2eme_sans_labo',
  'remise_3eme_plus_sans_labo',
  'remise_avec_labo',
  'labo_sup_mensuel',
  'gerant_sup_mensuel',
  'onboarding_sans_labo',
  'onboarding_avec_labo',
  'acheteurs_palier_10',
  'acheteurs_palier_20',
  'acheteurs_palier_50',
  'acheteurs_palier_100',
] as const;

export type TarifKey = typeof TARIF_KEYS[number];

export const DEFAULTS: Record<TarifKey, number> = {
  prix_base_activite_basique:  150,
  prix_base_activite_premium:  200,
  remise_2eme_sans_labo:       20,
  remise_3eme_plus_sans_labo:  40,
  remise_avec_labo:            30,
  labo_sup_mensuel:            160,
  gerant_sup_mensuel:          80,
  onboarding_sans_labo:        500,
  onboarding_avec_labo:        700,
  acheteurs_palier_10:         50,
  acheteurs_palier_20:         90,
  acheteurs_palier_50:         150,
  acheteurs_palier_100:        220,
};

// ── Sections et libellés (source unique pour la grille générale ET la grille par domaine) ──
export interface TarifFieldDef {
  cle: TarifKey; label: string; hint?: string; unit: string; min?: number; max?: number; step: number; accentColor: string;
}
export interface TarifSectionDef {
  key: string; icon: string; title: string; subtitle: string; gradient: string; textColor: string; fields: TarifFieldDef[];
}

export const TARIF_SECTIONS: TarifSectionDef[] = [
  {
    key: 'formules', icon: '💰', title: 'Formules d\'activités', subtitle: 'Prix de base par activité selon la formule — référence pour le calcul des remises',
    gradient: 'linear-gradient(135deg,#eff6ff,#dbeafe)', textColor: '#1e40af',
    fields: [
      { cle: 'prix_base_activite_basique', label: 'Formule Basique', hint: 'Stock + Ventes d\'articles, sans Espace Produit', unit: 'DT/mois', min: 0, step: 10, accentColor: '#0ea5e9' },
      { cle: 'prix_base_activite_premium', label: 'Formule Premium', hint: 'Basique + Espace Produit complet', unit: 'DT/mois', min: 0, step: 10, accentColor: '#2563eb' },
    ],
  },
  {
    key: 'sans_labo', icon: '📉', title: 'Remises dégressive — Sans Labo', subtitle: 'Applicable aux clients qui n\'ont pas de labo',
    gradient: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', textColor: '#15803d',
    fields: [
      { cle: 'remise_2eme_sans_labo', label: 'Remise — 2ème activité', hint: 'Remise appliquée à la 2ème activité (sans labo)', unit: '%', min: 0, max: 100, step: 1, accentColor: '#15803d' },
      { cle: 'remise_3eme_plus_sans_labo', label: 'Remise — 3ème activité et suivantes', hint: 'Remise appliquée dès la 3ème activité · s\'applique aussi aux suppléments', unit: '%', min: 0, max: 100, step: 1, accentColor: '#15803d' },
    ],
  },
  {
    key: 'avec_labo', icon: '🏭', title: 'Remise forfaitaire — Avec Labo', subtitle: 'Déclenché dès qu\'au moins 1 labo est configuré · s\'applique à toutes les activités',
    gradient: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', textColor: '#5b21b6',
    fields: [
      { cle: 'remise_avec_labo', label: 'Remise toutes activités — Avec Labo', hint: 'Appliqué dès qu\'au moins 1 labo est configuré sur le compte', unit: '%', min: 0, max: 100, step: 1, accentColor: '#7c3aed' },
    ],
  },
  {
    key: 'fixes', icon: '🔧', title: 'Tarifs fixes', subtitle: 'Labo et gérant supplémentaire — prix par unité / mois',
    gradient: 'linear-gradient(135deg,#fff7ed,#fed7aa)', textColor: '#9a3412',
    fields: [
      { cle: 'labo_sup_mensuel', label: 'Prix par Labo', hint: 'Par labo configuré · mois', unit: 'DT/mois', min: 0, step: 10, accentColor: '#ea580c' },
      { cle: 'gerant_sup_mensuel', label: 'Prix par Gérant supplémentaire', hint: 'Par gérant ajouté au-delà du premier · mois', unit: 'DT/mois', min: 0, step: 10, accentColor: '#ea580c' },
    ],
  },
  {
    key: 'onboarding', icon: '🎯', title: 'Frais d\'intégration — Onboarding', subtitle: 'Versement unique à l\'activation du compte',
    gradient: 'linear-gradient(135deg,#f0f9ff,#bae6fd)', textColor: '#0369a1',
    fields: [
      { cle: 'onboarding_sans_labo', label: 'Onboarding — Client sans Labo', hint: 'Versement unique · pas de labo sur le compte', unit: 'DT', min: 0, step: 50, accentColor: '#0ea5e9' },
      { cle: 'onboarding_avec_labo', label: 'Onboarding — Client avec Labo', hint: 'Versement unique · au moins 1 labo sur le compte', unit: 'DT', min: 0, step: 50, accentColor: '#0ea5e9' },
    ],
  },
  {
    key: 'acheteurs', icon: '🤝', title: 'Option Acheteurs (paliers)', subtitle: 'Supplément mensuel selon le palier d\'acheteurs · nécessite au moins 1 labo',
    gradient: 'linear-gradient(135deg,#fffbeb,#fef3c7)', textColor: '#78350f',
    fields: [
      { cle: 'acheteurs_palier_10', label: 'Palier — 1 à 10 acheteurs', hint: 'Supplément mensuel pour un quota jusqu\'à 10 acheteurs', unit: 'DT/mois', min: 0, step: 10, accentColor: '#b45309' },
      { cle: 'acheteurs_palier_20', label: 'Palier — 11 à 20 acheteurs', hint: 'Supplément mensuel pour un quota jusqu\'à 20 acheteurs', unit: 'DT/mois', min: 0, step: 10, accentColor: '#b45309' },
      { cle: 'acheteurs_palier_50', label: 'Palier — 21 à 50 acheteurs', hint: 'Supplément mensuel pour un quota jusqu\'à 50 acheteurs', unit: 'DT/mois', min: 0, step: 10, accentColor: '#b45309' },
      { cle: 'acheteurs_palier_100', label: 'Palier — 51 à 100 acheteurs', hint: 'Supplément mensuel pour un quota jusqu\'à 100 acheteurs', unit: 'DT/mois', min: 0, step: 10, accentColor: '#b45309' },
    ],
  },
];

export const tarifCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
  overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
};

