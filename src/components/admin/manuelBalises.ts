// Lot 2c (docs/lot-2c-spec.md du backend, §6) — balises du manuel et de la base de connaissances dans l'admin.
//
// Logique PURE (aucun appel réseau, aucun React) partagée par AdminManuelPage et AdminKnowledgeBasePage :
//   - rendu des textes balisés pour l'affichage (liste en vocabulaire LabFlow, I4 ; aperçu dans un domaine) ;
//   - contrôle des balises AVANT l'enregistrement, même règle que `verifierBalises` du serveur
//     (src/utils/manuelRendu.js) : grammaire (`balisesInvalides`), clé connue (`LEXIQUE_CLES`), balise non fermée,
//     fin de balise sans début. Le serveur reste juge (R5.7.1) ; scripts/admin-manuel-balises.test.mjs vérifie
//     que les deux contrôles donnent la même chose ;
//   - légende des balises (R6.1.3).
// Imports avec l'extension `.ts` : le module tourne aussi sous Node (test), comme le moteur de src/vocab/.
import { rendre, balisesInvalides } from '../../vocab/rendre.ts';
import { LEXIQUE_CLES } from '../../vocab/lexiqueDefaut.ts';
import { vocabDefaut } from '../../vocab/vocab.ts';
import type { Vocab } from '../../vocab/vocab.ts';

export interface BaliseFautive { balise: string; raison: string }
export interface BaliseFautiveChamp extends BaliseFautive { champ: string }

const silence = () => {};

/** Rend un texte balisé, sans écrire au journal du navigateur (l'aperçu est rendu à chaque frappe ; les balises
 * fautives sont listées à part). Un texte sans « [[ » est rendu tel quel. */
export const rendreTexte = (voc: Vocab, texte: string | null | undefined): string =>
  typeof texte === 'string' ? rendre(voc, texte, silence) : '';

/** Rendu en vocabulaire LabFlow (liste, recherche, confirmations de l'admin : I4). */
export const rendreDefaut = (texte: string | null | undefined): string => rendreTexte(vocabDefaut, texte);

/** Vocabulaire de l'aperçu : '' = restauration (vocabulaire par défaut) ; slug absent de la liste → null
 * (domaine absent : pas d'aperçu possible, §8.6). */
export function vocDuDomaine(domaines: readonly { slug: string; voc: Vocab }[], slug: string): Vocab | null {
  if (!slug) return vocabDefaut;
  return domaines.find((d) => d.slug === slug)?.voc ?? null;
}

// ── Contrôle des balises (portage de verifierBalises, backend src/utils/manuelRendu.js) ──────────────────────
const CANDIDATE = /\[\[([^[\]\n]*)\]\]/g;     // même motif que `rendre`
const RESTE_DE_BALISE = /\[\[|\]\]/g;
const A_CROCHETS = /\[\[|\]\]/;
const EXTRAIT_MAX = 40;
const CLES_CONNUES = new Set<string>(LEXIQUE_CLES);
const masquerBalises = (texte: string) => texte.replace(CANDIDATE, (b) => ' '.repeat(b.length));

// Clé d'une balise de grammaire valide : `rendre` appelle voc[méthode](clé, …) ; un vocabulaire muet note la clé
// du PREMIER appel (pour `ex`, `Nom(clé)` est appelé avant `ex(texte…)`). Aucune copie de la grammaire ici.
const cleDeBalise = (balise: string): string | null => {
  let cle: string | null = null;
  const espion = new Proxy({}, { get: () => (k: string) => { if (cle === null) cle = k; return ''; } });
  rendre(espion as unknown as Vocab, balise, silence);
  return cle;
};

const extraitAutour = (texte: string, index: number, ouvrante: boolean): string => {
  if (ouvrante) {
    const fin = texte.indexOf('\n', index);
    return texte.slice(index, fin < 0 ? texte.length : fin).slice(0, EXTRAIT_MAX);
  }
  const debut = texte.lastIndexOf('\n', index) + 1;
  return texte.slice(debut, index + 2).slice(-EXTRAIT_MAX);
};

/** Balises fautives d'un texte, dans l'ordre du texte : `[{ balise, raison }]` (même sortie que le serveur). */
export function verifierBalises(texte: string | null | undefined): BaliseFautive[] {
  if (typeof texte !== 'string' || !A_CROCHETS.test(texte)) return [];
  const fautives: (BaliseFautive & { index: number })[] = [];
  for (const m of texte.matchAll(CANDIDATE)) {
    const balise = m[0];
    const index = m.index ?? 0;
    const grammaire = balisesInvalides(balise);
    if (grammaire.length) { fautives.push(...grammaire.map((g) => ({ ...g, index }))); continue; }
    const cle = cleDeBalise(balise);
    if (cle === null || !CLES_CONNUES.has(cle)) fautives.push({ balise, raison: `clé inconnue « ${cle} »`, index });
  }
  // Candidats remplacés par des espaces de même longueur : positions conservées, et deux crochets séparés par une
  // balise ne se rejoignent pas (« [[[Pl:activite]]](#a) » ne laisse que « [ » et « ] »).
  for (const m of masquerBalises(texte).matchAll(RESTE_DE_BALISE)) {
    const index = m.index ?? 0;
    const ouvrante = m[0] === '[[';
    fautives.push({
      balise: extraitAutour(texte, index, ouvrante),
      raison: ouvrante ? 'balise non fermée' : 'fin de balise sans début',
      index,
    });
  }
  return fautives.sort((a, b) => a.index - b.index).map(({ balise, raison }) => ({ balise, raison }));
}

/**
 * Contrôle avant enregistrement (R5.7.1, R6.1.4) :
 *   balisables : champs où une balise est permise → balises fautives, champ par champ ;
 *   interdits  : champs où « [[ » est refusé (mots-clés, slug, icône, catégorie) → une entrée par champ fautif.
 * Les noms de champ sont ceux affichés à l'admin.
 */
export function controlerChamps(
  balisables: Record<string, string | null | undefined>,
  interdits: Record<string, string | null | undefined> = {},
): BaliseFautiveChamp[] {
  const sortie: BaliseFautiveChamp[] = [];
  for (const [champ, texte] of Object.entries(balisables)) {
    for (const f of verifierBalises(texte)) sortie.push({ champ, ...f });
  }
  for (const [champ, texte] of Object.entries(interdits)) {
    if (typeof texte === 'string' && texte.includes('[[')) {
      sortie.push({ champ, balise: '[[', raison: 'aucune balise n\'est permise dans ce champ' });
    }
  }
  return sortie;
}

/** Message d'erreur affiché sous le formulaire (même tournure que le refus 400 du serveur). */
export function messageFautes(fautes: BaliseFautiveChamp[]): string {
  if (!fautes.length) return '';
  const f = fautes[0];
  const reste = fautes.length > 1 ? ` — ${fautes.length} balise(s) fautive(s)` : '';
  return `Balise invalide dans le champ « ${f.champ} » : ${f.balise} (${f.raison})${reste}`;
}

// ── Légende (R6.1.3) ──────────────────────────────────────────────────────────────────────────────────────────
export const LEGENDE_BALISES: readonly { balise: string; role: string }[] = Object.freeze([
  { balise: '[[nom:labo]]', role: 'nom' },
  { balise: '[[Nom:labo]]', role: 'nom, majuscule' },
  { balise: '[[nom:labo:pl]]', role: 'pluriel' },
  { balise: '[[le:labo]]', role: 'le / la / l\'' },
  { balise: '[[du:labo]]', role: 'du / de la / de l\'' },
  { balise: '[[de:appro]]', role: 'de / d\'' },
  { balise: '[[au:labo]]', role: 'au / à la / à l\'' },
  { balise: '[[votre:activite:pl]]', role: 'votre / vos' },
  { balise: '[[Court:labo]]', role: 'forme courte' },
  { balise: '[[avecCourt:pt:pl]]', role: 'nom (forme courte)' },
  { balise: '[[acc:labo:créé:créée]]', role: 'accord' },
  { balise: '[[MAJ:labo]]', role: 'capitales' },
  { balise: '[[det:labo:du]]', role: 'déterminant seul, devant MAJ' },
]);

/** Clés du lexique, pour la légende. */
export const CLES_LEXIQUE: readonly string[] = LEXIQUE_CLES;
