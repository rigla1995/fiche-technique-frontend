// Identité légale du client (lot 3, spec backend docs/lot-3-spec.md §1) : type, formes juridiques, valeurs vides.
// Le serveur (src/utils/identite.js) normalise, contrôle et décide ; l'écran ne fait que saisir et afficher.
// Partagé par l'espace admin (fiche et création d'un client) et par le profil du client (« Mon entreprise », étape 6).

export interface IdentiteLegale {
  raisonSociale: string | null;
  nomCommercial: string | null;
  formeJuridique: string | null;
  matriculeFiscal: string | null;
  rne: string | null;
  adresse: string | null;
  ville: string | null;
  representantNom: string | null;
  representantQualite: string | null;
}

export const IDENTITE_VIDE: IdentiteLegale = {
  raisonSociale: null, nomCommercial: null, formeJuridique: null, matriculeFiscal: null, rne: null,
  adresse: null, ville: null, representantNom: null, representantQualite: null,
};

// Valeur enregistrée → libellé affiché ; qualité du représentant proposée quand le champ est vide.
export const FORMES_JURIDIQUES: { value: string; label: string; qualite: string }[] = [
  { value: 'SARL', label: 'SARL', qualite: 'Gérant' },
  { value: 'SUARL', label: 'SUARL', qualite: 'Gérant' },
  { value: 'SA', label: 'SA', qualite: 'Président directeur général' },
  { value: 'SNC', label: 'SNC', qualite: 'Gérant' },
  { value: 'EI', label: 'Entreprise individuelle', qualite: 'Titulaire' },
  { value: 'AUTO_ENTREPRENEUR', label: 'Auto-entrepreneur', qualite: 'Titulaire' },
  { value: 'ASSOCIATION', label: 'Association', qualite: 'Président' },
  { value: 'AUTRE', label: 'Autre', qualite: '' },
];

export const libelleForme = (v: string | null | undefined): string | null =>
  v ? (FORMES_JURIDIQUES.find((f) => f.value === v)?.label ?? v) : null;

export const identiteDe = (e: Partial<IdentiteLegale> | null | undefined): IdentiteLegale => ({ ...IDENTITE_VIDE, ...(e || {}) });

// Saisie → corps de l'API : chaînes rognées, vide → '' (le serveur l'enregistre en NULL).
export const corpsIdentite = (v: IdentiteLegale): Record<keyof IdentiteLegale, string> =>
  Object.fromEntries(Object.entries(v).map(([k, val]) => [k, (val ?? '').trim()])) as Record<keyof IdentiteLegale, string>;

export const memeIdentite = (a: IdentiteLegale, b: IdentiteLegale): boolean =>
  JSON.stringify(corpsIdentite(a)) === JSON.stringify(corpsIdentite(b));

// Seuls les champs modifiés partent au serveur : une donnée ancienne non touchée (adresse avec un caractère non
// imprimable, par exemple) ne bloque pas l'enregistrement, et deux admins ne s'écrasent pas champ par champ.
export const champsModifies = (v: IdentiteLegale, initiale: IdentiteLegale): Partial<Record<keyof IdentiteLegale, string>> => {
  const a = corpsIdentite(v);
  const b = corpsIdentite(initiale);
  return Object.fromEntries((Object.keys(a) as (keyof IdentiteLegale)[]).filter((k) => a[k] !== b[k]).map((k) => [k, a[k]]));
};

// Pour une entreprise individuelle ou un auto-entrepreneur, la « raison sociale » est le nom du titulaire.
export const formeIndividuelle = (forme: string | null | undefined): boolean => forme === 'EI' || forme === 'AUTO_ENTREPRENEUR';
