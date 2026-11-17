// Canaux de vente (étape C1 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2) : fonctions PURES de la grille
// « Configuration vente » et de la saisie des ventes. Un canal = la vente directe ('directe') ou un prestataire activé
// sur l'activité (identifiant du lien activité–prestataire). Un produit est EN VENTE sur un canal quand sa case est
// cochée et qu'il y porte un prix > 0. Mêmes règles que le serveur (src/utils/canauxVente.js).
// Syntaxe TypeScript effaçable : testé tel quel par « node --test scripts/canaux-vente.test.mjs ».

export const CANAL_DIRECT = 'directe';

/** Pas d'arrondi proposés à la copie d'un canal (en dinars). */
export const PAS_ARRONDI: readonly { valeur: number; libelle: string }[] = [
  { valeur: 0.01, libelle: 'Au centième (0,01)' },
  { valeur: 0.1, libelle: 'À 100 millimes (0,100)' },
  { valeur: 0.5, libelle: 'À 500 millimes (0,500)' },
  { valeur: 1, libelle: 'Au dinar' },
];
export const MAJORATION_MIN = -90;
export const MAJORATION_MAX = 500;

/** Ligne vendable telle que le serveur la sert (absente : le produit n'a jamais été configuré dans l'activité). */
export interface VendableConnu { id: string; prix_vente: number; actif: boolean; directe?: boolean }
export interface PrixPrestataire { article_vendable_id: string; activite_prestataire_id: string; prix_vente: number | null; en_vente?: boolean }

/** État d'une cellule : son prix (null = aucun) et sa case. */
export interface EtatCellule { prix: number | null; enVente: boolean }
/** Modification en attente : le texte du prix, la case, et si la case a été cliquée à la main. */
export interface Edition {
  prix?: string; enVente?: boolean; manuel?: boolean;
  /** C2 : case décochée d'office au profit d'une variante — ce que la modification en attente disait avant. */
  cede?: { enVente?: boolean; manuel?: boolean };
}
export interface CelluleEnvoyee { article_type: string; article_id: number; canal: string; prix?: number | null; en_vente?: boolean }

export const cleCellule = (articleType: string, articleId: number, canal: string): string => `${articleType}:${articleId}|${canal}`;

export function lireCle(cle: string): { article_type: string; article_id: number; canal: string } {
  const [article, canal] = cle.split('|');
  const [type, id] = article.split(':');
  return { article_type: type, article_id: Number(id), canal };
}

/** Prix saisi : nombre > 0 à deux décimales (virgule acceptée), sinon null. */
export function lirePrixSaisi(texte: string): number | null {
  const n = parseFloat(String(texte ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100 + 1e-7) / 100 : null;
}

/** Ce que le serveur a enregistré pour un produit sur un canal. */
export function etatEnregistre(vendable: VendableConnu | null | undefined, prix: readonly PrixPrestataire[], canal: string): EtatCellule {
  if (!vendable) return { prix: null, enVente: false };
  if (canal === CANAL_DIRECT) {
    return { prix: vendable.prix_vente > 0 ? vendable.prix_vente : null, enVente: vendable.actif === true && vendable.directe !== false };
  }
  const ligne = prix.find((p) => p.article_vendable_id === vendable.id && p.activite_prestataire_id === canal);
  const p = ligne?.prix_vente != null && ligne.prix_vente > 0 ? ligne.prix_vente : null;
  return { prix: p, enVente: vendable.actif === true && p != null && ligne?.en_vente !== false };
}

/** Ce que la cellule affiche : l'enregistré, corrigé par la modification en attente. */
export function etatAffiche(enr: EtatCellule, ed: Edition | undefined): { texte: string; prix: number | null; enVente: boolean; cochable: boolean; modifie: boolean } {
  if (!ed) return { texte: enr.prix != null ? String(enr.prix) : '', prix: enr.prix, enVente: enr.enVente, cochable: enr.prix != null, modifie: false };
  const prix = ed.prix !== undefined ? lirePrixSaisi(ed.prix) : enr.prix;
  const texte = ed.prix !== undefined ? ed.prix : (enr.prix != null ? String(enr.prix) : '');
  const voulu = ed.enVente !== undefined ? ed.enVente : enr.enVente;
  const enVente = voulu && prix != null;
  return { texte, prix, enVente, cochable: prix != null, modifie: prix !== enr.prix || enVente !== enr.enVente };
}

/**
 * Saisie d'un prix. Une cellule sans prix enregistré se coche d'elle-même au premier prix (c'est le geste attendu :
 * « je mets un prix chez ce prestataire, donc je l'y vends ») ; un prix vidé décoche ; retaper un prix rend à la
 * cellule la case qu'elle avait. Une case cliquée à la main n'est plus touchée, sauf faute de prix.
 */
export function surPrix(enr: EtatCellule, ed: Edition | undefined, texte: string): Edition {
  const suite: Edition = { ...ed, prix: texte };
  if (lirePrixSaisi(texte) == null) return suite; // sans prix, etatAffiche décoche de lui-même
  if (!ed?.manuel) suite.enVente = enr.prix == null ? true : enr.enVente;
  return suite;
}

/** Clic sur la case. */
export function surCase(ed: Edition | undefined, coche: boolean): Edition {
  const suite: Edition = { ...ed, enVente: coche, manuel: true };
  delete suite.cede; // un clic à la main l'emporte sur une case cédée d'office à une variante
  return suite;
}

/** Une modification qui ramène la cellule à son état enregistré n'en est plus une. */
export function garder(enr: EtatCellule, ed: Edition): Edition | undefined {
  return etatAffiche(enr, ed).modifie ? ed : undefined;
}

/** La cellule à envoyer au serveur (seulement ce qui change), ou null. */
export function celluleAEnvoyer(cle: string, enr: EtatCellule, ed: Edition | undefined): CelluleEnvoyee | null {
  const a = etatAffiche(enr, ed);
  if (!a.modifie) return null;
  const cellule: CelluleEnvoyee = { ...lireCle(cle) };
  if (a.prix !== enr.prix) cellule.prix = a.prix;
  if (a.enVente !== enr.enVente) cellule.en_vente = a.enVente;
  return cellule;
}

/** Prix copié d'un canal vers un autre : majoré de `pct` %, arrondi au pas, jamais sous un centième. */
export function majorer(prix: number, pct = 0, pas = 0.01): number {
  const p = PAS_ARRONDI.some((x) => x.valeur === pas) ? pas : 0.01;
  const pasCentimes = Math.round(p * 100);
  const arrondi = Math.round((prix * (100 + pct)) / pasCentimes + 1e-7) * pasCentimes;
  return Math.max(1, arrondi) / 100;
}

/**
 * Une ligne pour l'aperçu de la copie : ce qu'elle fait sur le canal d'origine et sur le canal d'arrivée. `cle`
 * (« produit:12 ») et `origine` (la clé du produit d'origine, pour une variante) servent à la règle des variantes.
 */
export interface LigneCopie { source: EtatCellule; cible: EtatCellule; cle?: string; origine?: string | null }

/**
 * Ce que ferait la copie d'un canal vers un autre, pour l'annoncer avant de la lancer. Même règle que le serveur
 * (planCopie) : un produit et sa variante ne se remplacent pas — si le canal d'arrivée vend déjà l'autre, la ligne est
 * laissée telle quelle, ni copiée ni retirée.
 */
export function apercuCopie(
  lignes: readonly LigneCopie[], pct: number, pas: number, retirerAbsents: boolean,
): { copies: number; remplaces: number; retires: number; laisses: number } {
  const enCible = new Set<string>();
  const variantesDe = new Map<string, string[]>();
  for (const l of lignes) {
    if (!l.cle) continue;
    if (l.cible.enVente) enCible.add(l.cle);
    if (l.origine) variantesDe.set(l.origine, [...(variantesDe.get(l.origine) ?? []), l.cle]);
  }
  const aCopier = (l: LigneCopie): boolean => l.source.enVente && l.source.prix != null;
  const gardees = new Set<string>();
  let copies = 0; let remplaces = 0; let laisses = 0;
  for (const l of lignes) {
    if (!aCopier(l)) continue;
    const proches = !l.cle ? [] : l.origine ? [l.origine] : (variantesDe.get(l.cle) ?? []);
    const enPlace = proches.filter((c) => enCible.has(c));
    if (enPlace.length) {
      laisses++;
      for (const c of enPlace) gardees.add(c);
      continue;
    }
    copies++;
    if (l.cible.prix != null && l.cible.prix !== majorer(l.source.prix as number, pct, pas)) remplaces++;
  }
  let retires = 0;
  if (retirerAbsents) {
    for (const l of lignes) if (!aCopier(l) && l.cible.enVente && !(l.cle && gardees.has(l.cle))) retires++;
  }
  return { copies, remplaces, retires, laisses };
}

// ── Recette propre à un canal (C2) : un produit et sa variante sur un même canal ──────────────────────────────────────
// Sur un canal, une variante en vente tient la place de son produit d'origine : les deux ne s'y vendent pas ensemble
// (le serveur le refuse). La cellule de l'origine y est verrouillée tant que la variante y est cochée.

/** Une ligne de la grille, pour les règles entre un produit et ses variantes. */
export interface LigneGrille { type: string; id: number; varianteDeId?: number | null; vendable?: VendableConnu | null }
type Editions = Readonly<Record<string, Edition>>;

const estProduit = (l: LigneGrille): boolean => l.type === 'produit';
const cleSur = (l: LigneGrille, canal: string): string => cleCellule(l.type, l.id, canal);

/** Ce qu'une ligne affiche sur un canal, modifications en attente comprises. */
export function afficheSur(ligne: LigneGrille, prix: readonly PrixPrestataire[], canal: string, edits: Editions) {
  return etatAffiche(etatEnregistre(ligne.vendable, prix, canal), edits[cleSur(ligne, canal)]);
}

/** La variante en vente sur ce canal à la place de ce produit (sa cellule y est alors verrouillée), ou null. */
export function remplacantSur<T extends LigneGrille>(
  ligne: LigneGrille, lignes: readonly T[], prix: readonly PrixPrestataire[], canal: string, edits: Editions,
): T | null {
  if (!estProduit(ligne) || ligne.varianteDeId != null) return null;
  return lignes.find((v) => estProduit(v) && v.varianteDeId === ligne.id && afficheSur(v, prix, canal, edits).enVente) ?? null;
}

/**
 * À appeler après la modification de la cellule `cle`. Si c'est celle d'une variante :
 *  - elle est en vente sur le canal et son produit d'origine aussi → l'origine y est décochée d'office (prix gardé) :
 *    la variante remplace, comme à sa création ;
 *  - plus aucune variante n'y est en vente et l'origine avait été décochée d'office → l'origine retrouve sa case.
 */
export function accorderOrigine(
  edits: Editions, cle: string, lignes: readonly LigneGrille[], prix: readonly PrixPrestataire[],
): Record<string, Edition> {
  const { article_type, article_id, canal } = lireCle(cle);
  const variante = article_type === 'produit' ? lignes.find((l) => estProduit(l) && l.id === article_id) : undefined;
  const origine = variante?.varianteDeId != null ? lignes.find((l) => estProduit(l) && l.id === variante.varianteDeId) : undefined;
  if (!origine) return { ...edits };
  const cleOrigine = cleSur(origine, canal);
  const ed = edits[cleOrigine];
  if (remplacantSur(origine, lignes, prix, canal, edits)) {
    if (!afficheSur(origine, prix, canal, edits).enVente) return { ...edits };
    return { ...edits, [cleOrigine]: { ...ed, enVente: false, manuel: true, cede: { enVente: ed?.enVente, manuel: ed?.manuel } } };
  }
  if (!ed?.cede) return { ...edits };
  const rendue: Edition = { ...ed, enVente: ed.cede.enVente, manuel: ed.cede.manuel };
  delete rendue.cede;
  if (rendue.enVente === undefined) delete rendue.enVente;
  if (rendue.manuel === undefined) delete rendue.manuel;
  const suite: Record<string, Edition> = { ...edits };
  if (Object.keys(rendue).length) suite[cleOrigine] = rendue; else delete suite[cleOrigine];
  return suite;
}

/**
 * « ✓ Tout » / « ✕ Aucun » d'une colonne, sur les lignes affichées (`visibles`). « ✓ Tout » coche ce qui a un prix sur
 * le canal sans changer qui y tient la place : une variante n'est pas cochée là où son produit d'origine se vend, un
 * produit d'origine n'est pas coché là où une variante le remplace.
 */
export function cocherCanal(
  edits: Editions, visibles: readonly LigneGrille[], lignes: readonly LigneGrille[], prix: readonly PrixPrestataire[],
  canal: string, coche: boolean,
): Record<string, Edition> {
  const suite: Record<string, Edition> = { ...edits };
  const basculer = (l: LigneGrille) => { suite[cleSur(l, canal)] = surCase(suite[cleSur(l, canal)], coche); };
  if (!coche) {
    for (const l of visibles) if (afficheSur(l, prix, canal, suite).enVente) basculer(l);
    return suite;
  }
  const libre = (l: LigneGrille): boolean => {
    const a = afficheSur(l, prix, canal, suite);
    return a.cochable && !a.enVente;
  };
  const estVariante = (l: LigneGrille): boolean => estProduit(l) && l.varianteDeId != null;
  // Les variantes d'abord : un produit d'origine ne se coche ensuite que si aucune de ses variantes ne tient la place.
  for (const l of visibles) {
    if (!estVariante(l) || !libre(l)) continue;
    const origine = lignes.find((o) => estProduit(o) && o.id === l.varianteDeId);
    if (!origine || !afficheSur(origine, prix, canal, suite).enVente) basculer(l);
  }
  for (const l of visibles) {
    if (!estVariante(l) && libre(l) && !remplacantSur(l, lignes, prix, canal, suite)) basculer(l);
  }
  return suite;
}

/** Saisie des ventes : la case du produit est-elle ouverte sur ce canal ? */
export function ouvertALaSaisie(vendable: VendableConnu, prix: readonly PrixPrestataire[], canal: string): boolean {
  return etatEnregistre(vendable, prix, canal).enVente;
}
