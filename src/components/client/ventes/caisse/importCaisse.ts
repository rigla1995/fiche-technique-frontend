// Import d'un fichier de caisse (étape V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) : la
// logique de la fenêtre « Vérifier les ventes ». Fonctions PURES, mêmes règles que le serveur (src/utils/ventesImport.js).
//   - chaque ligne du fichier est rattachée à UN produit de la carte : reconnue (déjà apprise), proposée (un nom de la
//     carte lui ressemble) ou à choisir ; elle peut aussi être ignorée ;
//   - sa quantité se répartit par canal. Décision du client (18/11/2026) : l'utilisateur saisit la part de chaque
//     prestataire, LE RESTE EST DE LA VENTE DIRECTE. Dans une catégorie de LIVRAISON, rien ne va en vente directe : la
//     quantité se répartit entre les prestataires seulement (le dernier laissé vide reçoit le reste).
// Syntaxe TypeScript effaçable : testé tel quel par « node --test scripts/ventes-caisse.test.mjs ».
import { normaliserDesignation, ressemblanceDesignations } from '../../factures/lecture/correspondre.ts';
import type { LigneCaisse, ModeleAppris } from './lireCaisse.ts';

export const CANAL_DIRECT = 'directe';
const EPS = 0.0005;
const millime = (v: number): number => Math.round(v * 1000 + 1e-7) / 1000;

/** Clé d'une catégorie du fichier (la casse et les accents ne comptent pas). */
export const cleCategorie = (nom: string | null | undefined): string => normaliserDesignation(nom).slice(0, 130);
/** Clé d'apprentissage d'une ligne : sa catégorie ET sa désignation (le même plat existe dans deux cartes à deux prix). */
export const cleCorrespondance = (categorie: string | null | undefined, designation: string): string =>
  `${cleCategorie(categorie)}|${normaliserDesignation(designation)}`.slice(0, 330);

/** Un produit de la carte de l'activité, et les canaux où il est en vente. */
export interface ProduitCarte { cle: string; articleType: 'produit' | 'ingredient'; articleId: number; nom: string; canaux: readonly string[] }
export interface CorrespondanceApprise { cle: string; ignoree: boolean; cibles: { article_type: string; article_id: number; quantite: number }[] }
export interface CategorieApprise { cle: string; nom: string; livraison: boolean }

export const cleProduit = (articleType: string, articleId: number): string => `${articleType}:${articleId}`;

/**
 * Une catégorie du fichier est-elle de la livraison ? Proposé d'après son nom (« DELIVERY », « Livraison », le nom d'un
 * prestataire) ; l'utilisateur confirme au premier import, la réponse est retenue ensuite.
 */
export function livraisonProposee(nom: string, prestataires: readonly string[]): boolean {
  const n = ` ${normaliserDesignation(nom)} `;
  if (/ (delivery|deliveries|livraison|livraisons) /.test(n)) return true;
  return prestataires.some((p) => { const c = normaliserDesignation(p); return c.length >= 3 && n.includes(` ${c} `); });
}

export type EtatLigne = 'reconnue' | 'proposee' | 'a_choisir';

/** Nom d'un produit pour la comparaison : une variante « Plat — Livraison » se compare aussi par son plat. */
const ressemblance = (designation: string, nom: string): number =>
  Math.max(ressemblanceDesignations(designation, nom), ressemblanceDesignations(designation, nom.split(' — ')[0]));

/**
 * Le produit d'une ligne du fichier. `voulus` = les canaux de la ligne (les prestataires pour une catégorie de
 * livraison, la vente directe sinon) : à ressemblance égale, le produit en vente sur ces canaux l'emporte — c'est ce
 * qui fait proposer la variante de livraison plutôt que le plat sur place.
 */
export function proposerProduit(
  ligne: Pick<LigneCaisse, 'categorie' | 'designation'>, carte: readonly ProduitCarte[],
  apprises: ReadonlyMap<string, CorrespondanceApprise>, voulus: readonly string[],
): { etat: EtatLigne; produit: string | null } {
  const apprise = apprises.get(cleCorrespondance(ligne.categorie, ligne.designation));
  if (apprise && !apprise.ignoree && apprise.cibles.length === 1) {
    const cle = cleProduit(apprise.cibles[0].article_type, apprise.cibles[0].article_id);
    if (carte.some((p) => p.cle === cle)) return { etat: 'reconnue', produit: cle };
  }
  const notes = carte
    .map((p) => { const r = ressemblance(ligne.designation, p.nom); return { p, r, note: r + (p.canaux.some((c) => voulus.includes(c)) ? 0.15 : 0) }; })
    .filter((x) => x.r >= 0.6)
    .sort((a, b) => b.note - a.note);
  if (!notes.length || (notes.length > 1 && notes[1].note > notes[0].note - 0.02)) return { etat: 'a_choisir', produit: null };
  return { etat: 'proposee', produit: notes[0].p.cle };
}

/** Quantité saisie : nombre ≥ 0 au millime (virgule acceptée) ; '' = rien ; null = saisie fausse. */
export function lireQuantite(texte: string | undefined): number | null {
  const t = String(texte ?? '').trim().replace(',', '.');
  if (t === '') return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  return millime(Number(t));
}

export type ErreurRepartition = 'SAISIE' | 'TROP' | 'RESTE' | 'SANS_PRESTATAIRE' | 'PAS_CHEZ_PRESTATAIRE' | 'HORS_CANAL';
export interface Repartition {
  /** Ce qui part au serveur : les canaux servis et leur quantité. */
  parts: { canal: string; quantite: number }[];
  /** Quantité de chaque prestataire, calculée comprise (le prestataire laissé vide d'une catégorie de livraison). */
  parPrestataire: Record<string, number>;
  /** Liens dont la quantité est calculée (le reste), pas saisie. */
  calcules: string[];
  directe: number;
  /** Ce qui reste à répartir (catégorie de livraison seulement). */
  reste: number;
  erreur: ErreurRepartition | null;
  /** Canaux servis où le produit choisi n'est pas en vente. */
  horsCanal: string[];
}

/**
 * Répartition d'une ligne par canal. `saisies` = ce que l'utilisateur a tapé pour chaque prestataire (lien → texte).
 * `enVente` = les canaux où le produit choisi se vend (null : pas encore de produit).
 */
export function repartir(
  quantite: number, saisies: Readonly<Record<string, string>>, livraison: boolean, prestataires: readonly string[], enVente: readonly string[] | null,
): Repartition {
  const r: Repartition = { parts: [], parPrestataire: {}, calcules: [], directe: 0, reste: 0, erreur: null, horsCanal: [] };
  let somme = 0;
  // Prestataires laissés vides qui PEUVENT recevoir le reste : ceux où le produit choisi se vend.
  const vides: string[] = [];
  for (const lien of prestataires) {
    const q = lireQuantite(saisies[lien]);
    if (q === null) return { ...r, erreur: 'SAISIE' };
    if (String(saisies[lien] ?? '').trim() === '' && (!enVente || enVente.includes(lien))) vides.push(lien);
    r.parPrestataire[lien] = q;
    somme = millime(somme + q);
  }
  if (somme > quantite + EPS) return { ...r, erreur: 'TROP', reste: millime(quantite - somme) };
  const restant = millime(quantite - somme);
  if (livraison) {
    if (!prestataires.length) return { ...r, erreur: 'SANS_PRESTATAIRE', reste: quantite };
    // Le produit choisi ne se vend chez aucun prestataire : rien ne peut être réparti.
    if (enVente && !prestataires.some((p) => enVente.includes(p))) return { ...r, erreur: 'PAS_CHEZ_PRESTATAIRE', reste: quantite };
    // Un seul prestataire laissé vide : il reçoit le reste (avec un seul prestataire possible, tout lui revient sans saisie).
    if (vides.length === 1 && restant > EPS) {
      r.parPrestataire[vides[0]] = restant;
      r.calcules = [vides[0]];
    } else if (restant > EPS) {
      r.reste = restant;
      r.erreur = 'RESTE';
    }
  } else {
    r.directe = restant;
  }
  for (const lien of prestataires) if (r.parPrestataire[lien] > EPS) r.parts.push({ canal: lien, quantite: r.parPrestataire[lien] });
  if (r.directe > EPS) r.parts.unshift({ canal: CANAL_DIRECT, quantite: r.directe });
  if (!r.erreur && enVente) {
    r.horsCanal = r.parts.map((p) => p.canal).filter((c) => !enVente.includes(c));
    if (r.horsCanal.length) r.erreur = 'HORS_CANAL';
  }
  return r;
}

/** Une ligne telle que vérifiée à l'écran. */
export interface LigneVerifiee { ligne: LigneCaisse; ignoree: boolean; produit: ProduitCarte | null; repartition: Repartition }

/** Bilan de la fenêtre : ce qui sera enregistré par canal, et ce qui empêche encore d'enregistrer. */
export function bilan(lignes: readonly LigneVerifiee[]): { aEnregistrer: number; total: number; parCanal: Record<string, number>; sansProduit: number; enErreur: number; ignorees: number; pret: boolean } {
  const b = { aEnregistrer: 0, total: 0, parCanal: {} as Record<string, number>, sansProduit: 0, enErreur: 0, ignorees: 0, pret: false };
  for (const l of lignes) {
    if (l.ignoree) { b.ignorees++; continue; }
    b.aEnregistrer++;
    b.total = millime(b.total + l.ligne.montant);
    if (!l.produit) b.sansProduit++;
    if (l.repartition.erreur) { b.enErreur++; continue; }
    for (const p of l.repartition.parts) b.parCanal[p.canal] = millime((b.parCanal[p.canal] ?? 0) + (l.ligne.montant * p.quantite) / l.ligne.quantite);
  }
  b.pret = b.aEnregistrer > 0 && b.sansProduit === 0 && b.enErreur === 0;
  return b;
}

/**
 * Le corps de POST /api/ventes/imports. V1b : `remplacer` (la journée a déjà un import : ses ventes sont annulées et
 * leur stock rendu) ; `colonnes` (le modèle du fichier à retenir, quand ses colonnes ont été désignées).
 */
export function corpsImport(d: {
  activiteId: number; date: string; source: 'excel' | 'pdf' | 'csv'; fichierNom: string; empreinte: string; modele: string; totalLu: number | null;
  categories: readonly { nom: string; livraison: boolean }[]; lignes: readonly LigneVerifiee[];
  remplacer?: boolean; colonnes?: ModeleAppris | null;
}) {
  return {
    activite_id: d.activiteId, date_vente: d.date, source: d.source, fichier_nom: d.fichierNom, empreinte: d.empreinte, modele: d.modele, total_lu: d.totalLu,
    ...(d.remplacer ? { remplacer: true } : {}),
    ...(d.colonnes ? { colonnes: { signature: d.colonnes.signature, colonnes: d.colonnes.colonnes } } : {}),
    categories: d.categories.map((c) => ({ nom: c.nom, livraison: c.livraison })),
    lignes: d.lignes.map((l) => (l.ignoree
      ? { categorie: l.ligne.categorie, designation: l.ligne.designation, quantite: l.ligne.quantite, montant: l.ligne.montant, ignoree: true }
      : { categorie: l.ligne.categorie, designation: l.ligne.designation, quantite: l.ligne.quantite, montant: l.ligne.montant, ignoree: false,
        article_type: l.produit?.articleType, article_id: l.produit?.articleId, repartition: l.repartition.parts })),
  };
}
