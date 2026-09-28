// ── Composition d'un compte par composants de domaine (lot 1a) ───────────────
// Miroir CLIENT des règles du backend (configComposantsService.validerComposition) :
// il sert à guider l'admin dans le wizard / l'édition ; le serveur reste juge.
// Types volontairement structurels (compatibles avec DomaineProfil / Composant
// de src/types) pour ne pas coupler ce module aux types du profil de domaine.

export type TypeTechnique = 'activite' | 'labo' | 'gerant' | 'acheteurs';

export interface ComposantDef {
  id?: number;
  code: string;
  libelle: string;
  libellePluriel?: string | null;
  icone?: string | null;
  aide?: string | null;
  typeTechnique: TypeTechnique;
  nbMin?: number;
  nbMax?: number | null;
  ordre?: number;
  actif?: boolean;
}

export interface DomaineOption {
  id: number;
  nom: string;
  slug?: string;
  description?: string | null;
  nbClients?: number;
  composants?: ComposantDef[];
  regles?: Record<string, unknown>;
}

export interface ReglesComposition {
  acheteurs_requiert_labo: boolean;
  depot_exige_acheteurs: boolean;
  formules: ('basique' | 'premium')[];
}

export const REGLES_DEFAUT: ReglesComposition = {
  acheteurs_requiert_labo: true,
  depot_exige_acheteurs: true,
  formules: ['basique', 'premium'],
};

/** Paliers de facturation de la base acheteurs (0 = option absente). */
export const PALIERS_ACHETEURS = [0, 10, 20, 50, 100] as const;
export const PALIER_LABELS: Record<number, string> = {
  0: 'Aucun',
  10: 'Palier 1 à 10 acheteurs',
  20: 'Palier 11 à 20 acheteurs',
  50: 'Palier 21 à 50 acheteurs',
  100: 'Palier 51 à 100 acheteurs',
};

/** Palier de facturation couvrant un quota acheteurs (1-10 / 11-20 / 21-50 / 51-100) — même
 *  arrondi que le backend (pricingEngine.palierAcheteurs) ; un quota historique hors palier
 *  (ex. 35, accepté par l'API) est ainsi ramené au palier facturé (50) dans les éditeurs. */
export function palierAcheteurs(n: number): number {
  return n <= 0 ? 0 : n <= 10 ? 10 : n <= 20 ? 20 : n <= 50 ? 50 : 100;
}

/** Sous-titre par défaut d'un composant sans `aide` (composants IDENTITÉ des domaines
 *  existants : mêmes textes que l'ancien wizard). */
export const AIDE_DEFAUT: Record<TypeTechnique, string> = {
  activite: '0 = compte dépôt (labo + acheteurs)',
  labo: 'Laboratoires de production centralisée',
  gerant: 'Comptes gérants supplémentaires',
  acheteurs: "Carnet d'acheteurs B2B facturé par palier",
};

export interface Compteurs { nbActivites: number; nbLabos: number; nbGerants: number; nbAcheteurs: number }

/** Règles résolues (défauts + écarts du domaine), tolérantes aux valeurs inattendues. */
export function resoudreRegles(raw?: Record<string, unknown> | null): ReglesComposition {
  const r = raw || {};
  const formulesRaw = Array.isArray(r.formules) ? r.formules.filter((f): f is 'basique' | 'premium' => f === 'basique' || f === 'premium') : [];
  return {
    acheteurs_requiert_labo: typeof r.acheteurs_requiert_labo === 'boolean' ? r.acheteurs_requiert_labo : REGLES_DEFAUT.acheteurs_requiert_labo,
    depot_exige_acheteurs: typeof r.depot_exige_acheteurs === 'boolean' ? r.depot_exige_acheteurs : REGLES_DEFAUT.depot_exige_acheteurs,
    formules: formulesRaw.length > 0 ? formulesRaw : REGLES_DEFAUT.formules,
  };
}

/** Composants actifs du domaine, dans l'ordre d'affichage. */
export function composantsActifs(d?: DomaineOption | null): ComposantDef[] {
  return (d?.composants || [])
    .filter((c) => c.actif !== false)
    .slice()
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || (a.id ?? 0) - (b.id ?? 0));
}

/** Σ par type (acheteurs = MAX des composants acheteurs) — même dérivation que le backend. */
export function deriveCompteurs(composants: ComposantDef[], nbParCode: Record<string, number>): Compteurs {
  const c: Compteurs = { nbActivites: 0, nbLabos: 0, nbGerants: 0, nbAcheteurs: 0 };
  for (const comp of composants) {
    const nb = Math.max(0, nbParCode[comp.code] ?? 0);
    if (comp.typeTechnique === 'activite') c.nbActivites += nb;
    else if (comp.typeTechnique === 'labo') c.nbLabos += nb;
    else if (comp.typeTechnique === 'gerant') c.nbGerants += nb;
    else if (comp.typeTechnique === 'acheteurs') c.nbAcheteurs = Math.max(c.nbAcheteurs, nb);
  }
  return c;
}

/** Quantités initiales : nbMin partout, et 1 sur le premier composant de vente (comme l'ancien défaut « 1 activité »). */
export function quantitesInitiales(composants: ComposantDef[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of composants) out[c.code] = Math.max(0, c.nbMin ?? 0);
  const premierActivite = composants.find((c) => c.typeTechnique === 'activite');
  const sommeActivites = composants.filter((c) => c.typeTechnique === 'activite').reduce((s, c) => s + out[c.code], 0);
  if (premierActivite && sommeActivites === 0 && (premierActivite.nbMax == null || premierActivite.nbMax >= 1)) {
    out[premierActivite.code] = 1;
  }
  return out;
}

/** Payload `composants` pour l'API ([{ code, nb }] — tous les composants actifs, 0 inclus). */
export function composantsPayload(composants: ComposantDef[], nbParCode: Record<string, number>): { code: string; nb: number }[] {
  return composants.map((c) => ({ code: c.code, nb: Math.max(0, nbParCode[c.code] ?? 0) }));
}

/** Libellé « 2 Restaurants » / « 1 Cuisine » (pluriel du domaine si nb > 1). */
export function libelleComposant(c: { libelle: string; libellePluriel?: string | null }, nb: number): string {
  return `${nb} ${nb > 1 ? (c.libellePluriel || c.libelle) : c.libelle}`;
}

/** Liste d'erreurs FR (vide = composition valide côté client). */
export function validerCompositionClient(
  composants: ComposantDef[],
  nbParCode: Record<string, number>,
  regles: ReglesComposition,
): string[] {
  const errs: string[] = [];
  const k = deriveCompteurs(composants, nbParCode);
  for (const c of composants) {
    const nb = nbParCode[c.code] ?? 0;
    const min = c.nbMin ?? 0;
    if (nb < min) errs.push(`« ${c.libelle} » : minimum ${min}.`);
    if (c.nbMax != null && nb > c.nbMax) errs.push(`« ${c.libelle} » : maximum ${c.nbMax}.`);
  }
  // Même borne que le backend (0 ≤ quota ≤ 100 ; la facturation arrondit au palier) —
  // un quota historique hors palier ne bloque pas l'éditeur.
  if (k.nbAcheteurs < 0 || k.nbAcheteurs > 100) {
    errs.push('Quota acheteurs invalide (0 à 100).');
  }
  if (regles.acheteurs_requiert_labo && k.nbAcheteurs > 0 && k.nbLabos < 1) {
    errs.push("L'option Acheteurs nécessite au moins un labo.");
  }
  if (k.nbActivites === 0) {
    if (k.nbLabos < 1) {
      errs.push('Un compte sans activité (dépôt) doit avoir au moins un labo.');
    } else if (regles.depot_exige_acheteurs && k.nbAcheteurs === 0) {
      errs.push("Un labo sans activité nécessite l'option Acheteurs (compte dépôt = labo + acheteurs).");
    }
  }
  return errs;
}
