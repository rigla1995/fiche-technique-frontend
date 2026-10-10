// Lecture de l'en-tête d'une facture (étape F2) : quel fournisseur du compte a émis la facture ? Fonctions PURES.
// Règle (PLAN-FACTURES.md §4 « Le fournisseur ») : par le MATRICULE lu (sûr) ; sinon par le NOM (proposé, à confirmer) ;
// sinon fournisseur nouveau, créé d'après la facture après validation. Un fournisseur du compte qui n'a pas encore de
// matricule et dont le nom correspond est proposé AVANT toute création (pour ne pas doubler un fournisseur existant).

export interface FournisseurConnu {
  id: number;
  nom: string;
  raisonSociale?: string | null;
  matriculeFiscal?: string | null;
}

export type Rapprochement =
  /** Matricule identique : choisi d'office. */
  | { etat: 'reconnu'; fournisseur: FournisseurConnu; par: 'matricule' }
  /** Nom voisin : proposé, à confirmer. `ajouterMatricule` : le fournisseur n'a pas de matricule, celui lu peut lui être ajouté. */
  | { etat: 'propose'; fournisseur: FournisseurConnu; par: 'nom' | 'identifiant'; ajouterMatricule: boolean }
  /** Rien de connu : fournisseur à créer d'après la facture. */
  | { etat: 'nouveau' };

// Les formes longues d'abord (« s a r l » avant « s a »).
const FORMES = /\b(s u a r l|s a r l|s a|ste|societe|soc|sarl|suarl|sa|ets|etablissements?|etb|et cie|cie|groupe|tunisie|tunisienne?|de|du|des|la|le|les|l|d|et)\b/g;

/** Nom comparable : sans accents ni ponctuation, en minuscules, formes juridiques et petits mots retirés. */
export function nomComparable(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(FORMES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sigles d'un nom : initiales de ses mots, avec et sans les formes juridiques (« Société Méditerranéenne de Distribution
// Alimentaire » → « smda » et « mda »).
const PETITS_MOTS = /\b(de|du|des|la|le|les|l|d|et)\b/g;
function sigles(s: string): Set<string> {
  const brut = String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(PETITS_MOTS, ' ');
  const avec = brut.split(' ').filter(Boolean);
  const sans = nomComparable(s).split(' ').filter(Boolean);
  return new Set([avec, sans].filter((m) => m.length >= 2).map((m) => m.map((x) => x[0]).join('')));
}

// Ressemblance de deux noms (0 à 1) : part des mots communs (Dice), ou 0,9 si l'un contient l'autre ; un mot de l'un qui
// est le sigle de l'autre (« SMDA ») compte comme un mot commun.
export function ressemblance(a: string, b: string): number {
  const A = nomComparable(a), B = nomComparable(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if ((A.length >= 4 && B.includes(A)) || (B.length >= 4 && A.includes(B))) return 0.9;
  const ma = new Set(A.split(' ')), mb = new Set(B.split(' '));
  const siglesA = sigles(a), siglesB = sigles(b);
  let communs = 0;
  for (const m of ma) if (mb.has(m)) communs++;
  // Sigle d'au moins 3 lettres : c'est le même fournisseur, nommé court.
  const sigleDe = (mots: Set<string>, autres: Set<string>) => [...mots].some((m) => m.length >= 3 && autres.has(m));
  if (sigleDe(mb, siglesA) || sigleDe(ma, siglesB)) return Math.max(0.75, (2 * communs + 2) / (ma.size + mb.size));
  return (2 * communs) / (ma.size + mb.size);
}

const SEUIL_NOM = 0.6;
const racine = (m: string | null | undefined): string => String(m ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
const complet = (m: string | null | undefined): string => String(m ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Rapproche ce qui a été lu (matricule, nom) des fournisseurs du compte. */
export function rapprocher(lu: { matricule?: string | null; nom?: string | null }, fournisseurs: readonly FournisseurConnu[]): Rapprochement {
  const matricule = complet(lu.matricule);
  if (matricule.length >= 8) {
    const exact = fournisseurs.find((f) => complet(f.matriculeFiscal) === matricule);
    if (exact) return { etat: 'reconnu', fournisseur: exact, par: 'matricule' };
    // Même entreprise (7 chiffres + clé), autre établissement ou forme courte : proposé.
    const memeRacine = fournisseurs.filter((f) => racine(f.matriculeFiscal) === matricule.slice(0, 8));
    if (memeRacine.length === 1) return { etat: 'propose', fournisseur: memeRacine[0], par: 'identifiant', ajouterMatricule: false };
  }
  if (lu.nom) {
    const classes = fournisseurs
      .map((f) => ({ f, score: Math.max(ressemblance(lu.nom as string, f.nom), ressemblance(lu.nom as string, f.raisonSociale ?? '')) }))
      .filter((x) => x.score >= SEUIL_NOM)
      // Un fournisseur qui a déjà un AUTRE matricule n'est pas celui-là.
      .filter((x) => !(matricule.length >= 8 && x.f.matriculeFiscal && racine(x.f.matriculeFiscal) !== matricule.slice(0, 8)))
      .sort((a, b) => b.score - a.score);
    if (classes.length) {
      const f = classes[0].f;
      return { etat: 'propose', fournisseur: f, par: 'nom', ajouterMatricule: matricule.length >= 8 && !f.matriculeFiscal };
    }
  }
  return { etat: 'nouveau' };
}
