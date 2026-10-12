// Correspondances (étape F3 — labflow-reprise/achats-compta/PLAN-FACTURES.md §4 « Les correspondances ») : pour chaque
// ligne lue, l'article du client à proposer et la conversion « 1 unité de la facture = N unités de stock ». Fonctions
// PURES (testées par scripts/factures-correspondre.test.mjs).
//   reconnue    la même ligne (même référence produit, sinon même désignation) a déjà été validée chez ce fournisseur ;
//   proposee    une ligne voisine a été validée, ou le nom d'un article se retrouve dans la désignation, ou c'est un
//               transport, une consigne… (hors stock) : à confirmer ;
//   a_choisir   rien de sûr : la personne choisit l'article (ceux déjà achetés chez ce fournisseur d'abord), ou « hors stock ».

export type NatureHorsStock = 'transport' | 'livraison' | 'consigne' | 'service' | 'autre';
export const NATURES: { valeur: NatureHorsStock; libelle: string }[] = [
  { valeur: 'transport', libelle: 'Transport' },
  { valeur: 'livraison', libelle: 'Frais de livraison' },
  { valeur: 'consigne', libelle: 'Consigne' },
  { valeur: 'service', libelle: 'Service' },
  { valeur: 'autre', libelle: 'Autre (hors stock)' },
];

export interface ArticleConnu { id: number; nom: string; unite: string; categorie?: string | null; selectionne?: boolean }
export interface CorrespondanceConnue {
  id: number; cle: string; designation: string; reference: string | null; uniteFacture: string | null;
  articleId: number | null; horsStock: NatureHorsStock | null; conversion: number; emplois: number;
}
export interface AchatConnu { articleId: number; dernierPrix: number | null; derniereDate: string | null; nbAchats: number }
export interface Contexte { correspondances: CorrespondanceConnue[]; achats: AchatConnu[]; articles: ArticleConnu[] }

export type EtatLigne = 'reconnue' | 'proposee' | 'a_choisir';
export interface Proposition {
  etat: EtatLigne;
  articleId: number | null;
  horsStock: NatureHorsStock | null;
  conversion: number;
  /** La conversion vient de la désignation et des unités (à confirmer), ou de la correspondance apprise. */
  conversionSure: boolean;
  raison: string;
}

// ── Clé d'apprentissage : MÊME RÈGLE que le serveur (src/services/facturesValidees.js) ────────────────────────────────

export const normaliserDesignation = (s: string | null | undefined): string => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .replace(/(\d)[.,](\d)/g, '$1,$2')
  .replace(/[^a-z0-9,]+/g, ' ')
  .replace(/(^|\s),+|,+(\s|$)/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const normaliserReference = (s: string | null | undefined): string =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase();

export function cleDeLigne(l: { reference?: string | null; designation?: string | null }): string | null {
  const ref = normaliserReference(l.reference).slice(0, 60);
  if (ref) return `ref:${ref}`;
  const des = normaliserDesignation(l.designation).slice(0, 190);
  return des ? `des:${des}` : null;
}

// ── Unités et conversion ─────────────────────────────────────────────────────────────────────────────────────────

type Dimension = 'masse' | 'volume' | 'compte';
const MESURES: Record<string, { dim: Dimension; facteur: number }> = {
  kg: { dim: 'masse', facteur: 1000 }, kilo: { dim: 'masse', facteur: 1000 }, kilos: { dim: 'masse', facteur: 1000 },
  g: { dim: 'masse', facteur: 1 }, gr: { dim: 'masse', facteur: 1 }, grs: { dim: 'masse', facteur: 1 }, gramme: { dim: 'masse', facteur: 1 }, grammes: { dim: 'masse', facteur: 1 },
  l: { dim: 'volume', facteur: 1000 }, lt: { dim: 'volume', facteur: 1000 }, litre: { dim: 'volume', facteur: 1000 }, litres: { dim: 'volume', facteur: 1000 },
  ml: { dim: 'volume', facteur: 1 }, cl: { dim: 'volume', facteur: 10 },
};
const mesure = (u: string | null | undefined) => MESURES[normaliserDesignation(u).replace(/\s/g, '')] ?? null;

// Contenants : « carton de 12 », « pack 6 », « plateau 30 », « (paquet 250) ».
const CONTENANT = /\b(carton|ctn|crt|pack|paquet|pqt|caisse|casier|colis|fardeau|lot|boite|bte|sachet|plateau|barquette|sac|seau|bidon|bac|palette|douzaine)\s*(?:de\s*)?(\d+)\b(?!\s*(?:kg|g|gr|l|lt|ml|cl)\b)/;
const COMPTE_X = /(?:^|\s)x\s?(\d+)\b(?!\s*(?:kg|g|gr|l|lt|ml|cl)\b)|\b(\d+)\s?x(?=\s|$)/;
const LOT_TAILLE = /\b(\d+)\s*x\s*(\d+(?:,\d+)?)\s*(kg|g|gr|l|lt|ml|cl)\b/;
const TAILLE = /\b(\d+(?:,\d+)?)\s*(kg|g|gr|grs|l|lt|ml|cl)\b/;

const nombre = (s: string) => Number(s.replace(',', '.'));
const arrondi = (x: number) => Math.round(x * 1e6) / 1e6;
const fmt = (x: number) => String(arrondi(x)).replace('.', ',');

/**
 * Conversion proposée : 1 unité de la facture = N unités de stock (`uniteStock` : l'unité de l'article). D'après la
 * désignation et l'unité lue : « sac 25 kg » → 25 kg ; « pack 6 » → 6 bouteilles ; « 12 x 1 L » → 12 L ; « 500 g »
 * pour un article au kilo → 0,5. Rien de lisible → 1, non sûr.
 */
export function proposerConversion(designation: string, uniteFacture: string | null, uniteStock: string): { n: number; sure: boolean; raison: string } {
  const texte = normaliserDesignation(`${designation} ${uniteFacture ?? ''}`);
  const stock = mesure(uniteStock);
  const facture = mesure(uniteFacture);
  // Unité de la facture et du stock de même nature (kg et g, L et cl) : simple changement d'unité.
  if (stock && facture && stock.dim === facture.dim) {
    const n = facture.facteur / stock.facteur;
    return { n: arrondi(n), sure: true, raison: n === 1 ? `même unité (${uniteStock})` : `1 ${uniteFacture} = ${fmt(n)} ${uniteStock}` };
  }
  const lot = texte.match(LOT_TAILLE);
  const contenant = texte.match(CONTENANT);
  const compteX = texte.match(COMPTE_X);
  const nombreDans = lot ? nombre(lot[1]) : contenant ? nombre(contenant[2]) : compteX ? nombre(compteX[1] ?? compteX[2]) : null;
  const taille = lot ? { v: nombre(lot[2]), u: lot[3] } : (() => { const m = texte.match(TAILLE); return m ? { v: nombre(m[1]), u: m[2] } : null; })();
  if (stock && taille) {
    const t = mesure(taille.u);
    if (t && t.dim === stock.dim) {
      const n = (nombreDans ?? 1) * taille.v * t.facteur / stock.facteur;
      if (n > 0) {
        const quoi = nombreDans ? `${fmt(nombreDans)} × ${fmt(taille.v)} ${taille.u}` : `${fmt(taille.v)} ${taille.u}`;
        return { n: arrondi(n), sure: true, raison: `${quoi} = ${fmt(n)} ${uniteStock}` };
      }
    }
  }
  if (!stock && nombreDans && nombreDans > 1) {
    return { n: nombreDans, sure: true, raison: `${fmt(nombreDans)} ${uniteStock} par unité de la facture` };
  }
  return { n: 1, sure: false, raison: 'une unité de la facture = une unité de stock (à vérifier)' };
}

// ── Article proposé ──────────────────────────────────────────────────────────────────────────────────────────────

// Mots qui ne disent pas QUEL produit c'est : unités, contenants, chiffres, petits mots.
const BRUIT = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'en', 'et', 'pour', 'avec', 'sans',
  'x', 'kg', 'g', 'gr', 'grs', 'l', 'lt', 'ml', 'cl', 'carton', 'ctn', 'crt', 'pack', 'paquet', 'pqt', 'caisse', 'casier',
  'colis', 'fardeau', 'lot', 'boite', 'bte', 'sachet', 'plateau', 'barquette', 'sac', 'seau', 'bidon', 'bac', 'piece',
  'pieces', 'pc', 'pcs', 'u', 'unite', 'bouteille', 'btl', 'pot', 'rouleau', 'douzaine']);
const racine = (m: string) => (m.length > 4 ? m.replace(/(es|s|x)$/, '') : m);
const motsUtiles = (s: string) => normaliserDesignation(s).split(' ')
  .filter((m) => m && !BRUIT.has(m) && !/^\d/.test(m)).map(racine);
const memeMot = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** Part des mots utiles du nom de l'article retrouvés dans la désignation (0 à 1). */
export function ressemblanceArticle(designation: string, article: string): number {
  const d = motsUtiles(designation);
  const a = motsUtiles(article);
  if (!a.length || !d.length) return 0;
  const trouves = a.filter((m) => d.some((x) => memeMot(m, x))).length;
  return trouves / a.length;
}

/** Ressemblance de deux désignations de facture (mots utiles communs, Dice). */
export function ressemblanceDesignations(a: string, b: string): number {
  const A = motsUtiles(a), B = motsUtiles(b);
  if (!A.length || !B.length) return 0;
  const communs = A.filter((m) => B.some((x) => memeMot(m, x))).length;
  return (2 * communs) / (A.length + B.length);
}

const HORS_STOCK: [RegExp, NatureHorsStock][] = [
  [/\b(transport|frais\s+de\s+port|port\s+(du|paye)|fret|acheminement)\b/, 'transport'],
  [/\b(livraison|frais\s+de\s+livraison|frais\s+d\s+expedition)\b/, 'livraison'],
  [/\b(consigne|deconsigne|caution|emballage\s+consigne|casier\s+vide)\b/, 'consigne'],
  [/\b(service|prestation|main\s+d\s?oeuvre|installation|maintenance|reparation|location|abonnement)\b/, 'service'],
];

/** Articles à proposer pour une ligne, les plus probables d'abord : déjà achetés chez ce fournisseur, puis les autres. */
export function articlesProbables(designation: string, ctx: Contexte): ArticleConnu[] {
  const achetes = new Set(ctx.achats.map((a) => a.articleId));
  return [...ctx.articles]
    .map((a) => ({ a, s: ressemblanceArticle(designation, a.nom), achete: achetes.has(a.id) }))
    .sort((x, y) => Number(y.achete) - Number(x.achete) || y.s - x.s || x.a.nom.localeCompare(y.a.nom))
    .map((x) => x.a);
}

/** Ce que LabFlow propose pour une ligne lue. */
export function proposer(l: { designation: string; reference?: string | null; unite?: string | null }, ctx: Contexte): Proposition {
  const articles = new Map(ctx.articles.map((a) => [a.id, a]));
  const avecConversion = (articleId: number, raison: string, etat: EtatLigne, conversionApprise?: number): Proposition => {
    if (conversionApprise !== undefined) return { etat, articleId, horsStock: null, conversion: conversionApprise, conversionSure: true, raison };
    const c = proposerConversion(l.designation, l.unite ?? null, articles.get(articleId)?.unite ?? '');
    return { etat, articleId, horsStock: null, conversion: c.n, conversionSure: c.sure, raison };
  };
  // 1. Même ligne déjà validée chez ce fournisseur.
  const cle = cleDeLigne(l);
  const exacte = cle ? ctx.correspondances.find((c) => c.cle === cle) : undefined;
  if (exacte && (exacte.horsStock || (exacte.articleId && articles.has(exacte.articleId)))) {
    const fois = exacte.emplois > 1 ? `${exacte.emplois} factures` : 'une facture';
    if (exacte.horsStock) return { etat: 'reconnue', articleId: null, horsStock: exacte.horsStock, conversion: 1, conversionSure: true, raison: `déjà validée sur ${fois}` };
    return avecConversion(exacte.articleId as number, `déjà validée sur ${fois}`, 'reconnue', exacte.conversion);
  }
  // 2. Ligne voisine déjà validée (désignation presque identique, autre conditionnement ou faute de lecture).
  const voisine = ctx.correspondances
    .map((c) => ({ c, s: ressemblanceDesignations(l.designation, c.designation) }))
    .filter((x) => x.s >= 0.75 && (x.c.horsStock || (x.c.articleId && articles.has(x.c.articleId))))
    .sort((a, b) => b.s - a.s)[0];
  if (voisine) {
    if (voisine.c.horsStock) return { etat: 'proposee', articleId: null, horsStock: voisine.c.horsStock, conversion: 1, conversionSure: true, raison: `ressemble à « ${voisine.c.designation} »` };
    const memeUnite = normaliserDesignation(voisine.c.uniteFacture) === normaliserDesignation(l.unite);
    return avecConversion(voisine.c.articleId as number, `ressemble à « ${voisine.c.designation} »`, 'proposee', memeUnite ? voisine.c.conversion : undefined);
  }
  // 3. Hors stock reconnaissable (transport, consigne…).
  const plat = normaliserDesignation(l.designation);
  for (const [motif, nature] of HORS_STOCK) {
    if (motif.test(plat)) return { etat: 'proposee', articleId: null, horsStock: nature, conversion: 1, conversionSure: true, raison: 'hors stock (d\'après la désignation)' };
  }
  // 4. Le nom d'un article se retrouve en entier dans la désignation (déjà acheté chez ce fournisseur d'abord).
  const achetes = new Set(ctx.achats.map((a) => a.articleId));
  const candidat = ctx.articles
    .map((a) => ({ a, s: ressemblanceArticle(l.designation, a.nom), n: motsUtiles(a.nom).length, achete: achetes.has(a.id) }))
    .filter((x) => x.s >= 1)
    .sort((x, y) => y.n - x.n || Number(y.achete) - Number(x.achete) || Number(y.a.selectionne) - Number(x.a.selectionne))[0];
  if (candidat) return avecConversion(candidat.a.id, `le nom « ${candidat.a.nom} » est dans la désignation`, 'proposee');
  return { etat: 'a_choisir', articleId: null, horsStock: null, conversion: 1, conversionSure: false, raison: '' };
}

/** Prix par unité de stock d'une ligne d'article : montant ÷ (quantité × conversion), au millime ; null si incalculable. */
export function prixParUniteDeStock(montant: number | null, quantite: number | null, conversion: number): number | null {
  if (montant === null || quantite === null || !(quantite > 0) || !(conversion > 0)) return null;
  return Math.round((montant / (quantite * conversion)) * 1000) / 1000;
}

/** Écart (en %) entre un prix et le dernier prix payé ; null si l'un manque. Au-delà de 30 % : alerte (PLAN §4). */
export function ecartDePrix(prix: number | null, dernier: number | null): number | null {
  if (prix === null || dernier === null || !(dernier > 0)) return null;
  return Math.round(((prix - dernier) / dernier) * 1000) / 10;
}

/**
 * Totaux recalculés d'après les lignes vérifiées — MÊME CALCUL que le serveur (src/services/facturesValidees.js,
 * `repartir`) : remise globale répartie au prorata des montants, FODEC au prorata du net, TVA par taux sur (net + FODEC),
 * TTC = HT + FODEC + TVA + timbre. `prixStock` : prix par unité de stock des lignes d'article (coût net / quantité en stock).
 */
export function totauxRecalcules(
  lignes: { quantite: number; montant: number; tauxTva: number; conversion: number | null }[],
  pied: { remiseGlobale?: number; fodec?: number; timbre?: number },
): { ht: number; fodec: number; tva: number; ttc: number; parTaux: { taux: number; base: number; montant: number }[]; prixStock: (number | null)[] } {
  const m = (x: number) => Math.round(x * 1000) / 1000;
  const brut = lignes.reduce((s, l) => s + l.montant, 0);
  const remise = Math.min(Math.max(0, pied.remiseGlobale ?? 0), brut);
  const nets = lignes.map((l) => (brut > 0 ? l.montant - remise * (l.montant / brut) : 0));
  const totalNet = nets.reduce((s, n) => s + n, 0);
  const f = Math.max(0, pied.fodec ?? 0);
  const couts = nets.map((n) => n + (totalNet > 0 ? f * (n / totalNet) : 0));
  const taux = new Map<number, number>();
  lignes.forEach((l, i) => taux.set(l.tauxTva, (taux.get(l.tauxTva) ?? 0) + couts[i]));
  const parTaux = [...taux].sort((a, b) => a[0] - b[0]).map(([t, base]) => ({ taux: t, base: m(base), montant: m(base * t / 100) }));
  const ht = m(brut - remise);
  const tva = m(parTaux.reduce((s, x) => s + x.montant, 0));
  return {
    ht, fodec: m(f), tva, ttc: m(ht + m(f) + tva + (pied.timbre ?? 0)), parTaux,
    prixStock: lignes.map((l, i) => (l.conversion && l.quantite > 0 ? m(couts[i] / (l.quantite * l.conversion)) : null)),
  };
}
