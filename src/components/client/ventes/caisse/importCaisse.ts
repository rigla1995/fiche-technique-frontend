// Import d'un fichier de caisse (étape V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) : la
// logique de la fenêtre « Vérifier les ventes ». Fonctions PURES, mêmes règles que le serveur (src/utils/ventesImport.js).
//   - chaque ligne du fichier est rattachée à UN produit de la carte : reconnue (déjà apprise), proposée (un nom de la
//     carte lui ressemble) ou à choisir ; elle peut aussi être ignorée ;
//   - sa quantité se répartit par canal. Décision du client (18/11/2026) : l'utilisateur saisit la part de chaque
//     prestataire, LE RESTE EST DE LA VENTE DIRECTE. Dans une catégorie de LIVRAISON, rien ne va en vente directe : la
//     quantité se répartit entre les prestataires seulement (le dernier laissé vide reçoit le reste).
// V1c — menus, formules et lots : une ligne peut valoir PLUSIEURS produits (chacun avec sa quantité pour une ligne
//   vendue) ou plusieurs unités d'un produit (« Lot de 6 »). Son montant est PARTAGÉ entre ses produits d'après leurs
//   prix à la carte ; ses canaux sont ceux où TOUS ses produits se vendent. Une ligne ignorée peut l'être « toujours ».
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
/** `prix` : son prix à la carte en vente directe — il pèse dans le partage du montant d'un menu entre ses produits. */
export interface ProduitCarte { cle: string; articleType: 'produit' | 'ingredient'; articleId: number; nom: string; canaux: readonly string[]; prix?: number }
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

/**
 * Un LOT annoncé par la désignation (« Lot de 6 briks », « Brik x6 », « Pack de 12 sodas ») : la quantité d'unités par
 * ligne vendue et le reste du nom, pour y chercher le produit. Null si la désignation n'annonce pas de lot.
 */
export function lotDe(designation: string): { quantite: number; reste: string } | null {
  const n = normaliserDesignation(designation);
  const m = /(?:^| )(?:lot|pack|boite|plateau|carton|paquet|assortiment) de (\d{1,3})(?: |$)/.exec(n) ?? /(?:^| )x ?(\d{1,3})(?: |$)/.exec(n) ?? /(?:^| )(\d{1,3}) ?(?:pcs|pieces|unites)(?: |$)/.exec(n);
  if (!m) return null;
  const quantite = Number(m[1]);
  const reste = `${n.slice(0, m.index)} ${n.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return quantite >= 2 && quantite <= 200 && reste ? { quantite, reste } : null;
}

/** Un produit proposé pour une ligne, avec sa quantité pour UNE ligne vendue (1, sauf dans un lot ou un menu). */
export interface CibleProposee { produit: string; quantite: number }

/**
 * Ce que vaut une ligne du fichier. Apprise : ses produits et leurs quantités (un menu, un lot), ou « ignorée
 * toujours ». Sinon proposée d'après son nom : un produit de la carte, ou un LOT (« Lot de 6 briks » : 6 × Brik).
 */
export function proposerCibles(
  ligne: Pick<LigneCaisse, 'categorie' | 'designation'>, carte: readonly ProduitCarte[],
  apprises: ReadonlyMap<string, CorrespondanceApprise>, voulus: readonly string[],
): { etat: EtatLigne | 'ignoree'; cibles: CibleProposee[] } {
  const apprise = apprises.get(cleCorrespondance(ligne.categorie, ligne.designation));
  if (apprise?.ignoree) return { etat: 'ignoree', cibles: [] };
  if (apprise && apprise.cibles.length) {
    const cibles = apprise.cibles.map((c) => ({ produit: cleProduit(c.article_type, c.article_id), quantite: Number(c.quantite) }));
    if (cibles.every((c) => c.quantite > 0 && carte.some((p) => p.cle === c.produit))) return { etat: 'reconnue', cibles };
  }
  // Un lot annoncé par le nom : le produit se cherche dans le reste du nom — sauf si la carte porte ce nom entier.
  const lot = lotDe(ligne.designation);
  const entier = normaliserDesignation(ligne.designation);
  if (lot && !carte.some((p) => normaliserDesignation(p.nom) === entier)) {
    const p = proposerProduit({ categorie: ligne.categorie, designation: lot.reste }, carte, new Map(), voulus);
    if (p.produit) return { etat: 'proposee', cibles: [{ produit: p.produit, quantite: lot.quantite }] };
  }
  const simple = proposerProduit(ligne, carte, new Map(), voulus);
  return simple.produit ? { etat: simple.etat, cibles: [{ produit: simple.produit, quantite: 1 }] } : { etat: 'a_choisir', cibles: [] };
}

/** Quantité d'un produit par ligne vendue : un nombre > 0 au millime (virgule acceptée) ; null = saisie fausse. */
export function lireMultiplicateur(texte: string | undefined): number | null {
  const q = lireQuantite(String(texte ?? '').trim() === '' ? '1' : texte);
  return q !== null && q > 0 ? q : null;
}

/**
 * Partage un montant au millime selon des poids (plus grands restes) : la somme des parts égale TOUJOURS le montant.
 * Poids tous nuls : parts égales.
 */
export function partager(montant: number, poids: readonly number[]): number[] {
  if (!poids.length) return [];
  const utiles = poids.some((p) => p > 0) ? poids.map((p) => Math.max(0, p)) : poids.map(() => 1);
  const somme = utiles.reduce((s, p) => s + p, 0);
  const millimes = Math.round(montant * 1000);
  const bruts = utiles.map((p) => (millimes * p) / somme);
  const parts = bruts.map((b) => Math.floor(b + 1e-9));
  const ordre = bruts.map((b, i) => ({ i, r: b - Math.floor(b + 1e-9) })).sort((a, b) => b.r - a.r || a.i - b.i);
  let reste = millimes - parts.reduce((s, p) => s + p, 0);
  for (let k = 0; reste > 0; k = (k + 1) % ordre.length) { parts[ordre[k].i] += 1; reste -= 1; }
  return parts.map((p) => p / 1000);
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

/** Un produit d'une ligne vérifiée : sa quantité pour une ligne vendue et sa part du montant de la ligne. */
export interface CibleVerifiee { produit: ProduitCarte; quantite: number; montant: number }
export type ErreurCibles = 'QUANTITE' | 'DOUBLON';
/**
 * Une ligne telle que vérifiée à l'écran. `produit` : son premier produit, null tant qu'elle n'est pas rattachée.
 * `cibles` : tous ses produits (V1c) ; absent = un seul produit, une unité. `canaux` : ceux où tous se vendent.
 */
export interface LigneVerifiee {
  ligne: LigneCaisse; ignoree: boolean; produit: ProduitCarte | null; repartition: Repartition;
  cibles?: CibleVerifiee[]; canaux?: readonly string[] | null; erreurCibles?: ErreurCibles | null; toujours?: boolean;
}

/** Ce que l'utilisateur a choisi pour une ligne : ses produits (clé de la carte, quantité saisie), ignorée ou non, ses parts. */
export interface CibleChoisie { produit: string | null; quantite: string }
export interface ChoixLigne { cibles: readonly CibleChoisie[]; ignoree: boolean; toujours?: boolean; saisies: Readonly<Record<string, string>> }

/**
 * Vérifie une ligne : ses produits (tous choisis, une quantité > 0 chacun, pas deux fois le même), le partage de son
 * montant d'après les prix de la carte (prix × quantité ; sans prix : d'après les quantités), ses canaux (ceux où TOUS
 * ses produits se vendent) et sa répartition par canal.
 */
export function verifierLigne(ligne: LigneCaisse, choix: ChoixLigne, carte: readonly ProduitCarte[], livraison: boolean, prestataires: readonly string[]): LigneVerifiee {
  const lues = choix.cibles.map((c) => ({ produit: carte.find((p) => p.cle === c.produit) ?? null, quantite: lireMultiplicateur(c.quantite) }));
  const choisies = lues.length > 0 && lues.every((c) => c.produit !== null);
  const erreurCibles: ErreurCibles | null = !choisies ? null
    : lues.some((c) => c.quantite === null) ? 'QUANTITE'
      : new Set(lues.map((c) => (c.produit as ProduitCarte).cle)).size !== lues.length ? 'DOUBLON' : null;
  if (!choisies || erreurCibles) {
    return { ligne, ignoree: choix.ignoree, toujours: choix.ignoree && choix.toujours === true, produit: null, canaux: null, erreurCibles, repartition: repartir(ligne.quantite, choix.saisies, livraison, prestataires, null) };
  }
  const justes = lues as { produit: ProduitCarte; quantite: number }[];
  const poids = justes.map((c) => c.quantite * (c.produit.prix ?? 0));
  const parts = partager(ligne.montant, poids.some((p) => p > 0) ? poids : justes.map((c) => c.quantite));
  const canaux = justes[0].produit.canaux.filter((canal) => justes.every((c) => c.produit.canaux.includes(canal)));
  return {
    ligne, ignoree: choix.ignoree, toujours: choix.ignoree && choix.toujours === true, produit: justes[0].produit, canaux, erreurCibles: null,
    cibles: justes.map((c, i) => ({ produit: c.produit, quantite: c.quantite, montant: parts[i] })),
    repartition: repartir(ligne.quantite, choix.saisies, livraison, prestataires, canaux),
  };
}

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
    lignes: d.lignes.map((l) => {
      const base = { categorie: l.ligne.categorie, designation: l.ligne.designation, quantite: l.ligne.quantite, montant: l.ligne.montant };
      if (l.ignoree) return { ...base, ignoree: true, ...(l.toujours ? { toujours: true } : {}) };
      // Un produit, une unité : la forme d'avant V1c. Menu, formule, lot : `cibles`, chacune avec sa quantité et sa part.
      const composee = l.cibles && (l.cibles.length > 1 || l.cibles[0].quantite !== 1);
      return composee
        ? { ...base, ignoree: false, cibles: (l.cibles as CibleVerifiee[]).map((c) => ({ article_type: c.produit.articleType, article_id: c.produit.articleId, quantite: c.quantite, montant: c.montant })), repartition: l.repartition.parts }
        : { ...base, ignoree: false, article_type: l.produit?.articleType, article_id: l.produit?.articleId, repartition: l.repartition.parts };
    }),
  };
}
