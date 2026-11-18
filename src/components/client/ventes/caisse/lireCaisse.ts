// Import d'un fichier de caisse (étape V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) : LIRE
// l'export de la caisse. Fonctions PURES : elles reçoivent ce que le navigateur a tiré du fichier (cellules d'un
// classeur Excel, rangées de mots d'un PDF) et rendent la même lecture pour les deux.
// Modèle connu : l'export « Products / Revenue » d'une caisse en ligne (catégories, sous-catégories, produits, colonnes
// quantité, prix, brut, remises, TVA, net). Règles mesurées sur les documents du client (essai du 18/11/2026,
// labflow-reprise/ventes-cartes/essai/RAPPORT-ESSAI.md) ; les tests n'emploient qu'un jeu FICTIF.
// Syntaxe TypeScript effaçable : testé tel quel par « node --test scripts/ventes-caisse.test.mjs ».
import { lireNombre } from '../../factures/lecture/nombres.ts';
import type { Rangee } from '../../factures/lecture/types.ts';

/** Une ligne de produit du fichier. `montant` = ce que le client a payé : le brut moins les remises. */
export interface LigneCaisse {
  rang: number;
  categorie: string | null;
  sousCategorie: string | null;
  designation: string;
  quantite: number;
  prixUnitaire: number | null;
  brut: number | null;
  remises: number | null;
  tva: number | null;
  net: number | null;
  montant: number;
}
/** Une somme imprimée par le fichier (sous-catégorie, catégorie, total) comparée à la somme des lignes lues. */
export interface ControleCaisse { quoi: string; juste: boolean; lignes: number }
export interface LectureCaisse {
  modele: string;
  lignes: LigneCaisse[];
  /** Catégories du fichier, dans l'ordre (vide : le fichier n'en a pas). */
  categories: string[];
  controles: ControleCaisse[];
  /** Total du fichier sur la même base que les lignes (brut moins remises) ; null s'il n'est pas imprimé. */
  totalLu: number | null;
  /** Chiffre par jour, quand le fichier le donne (un export couvre une période). */
  jours: { date: string; montant: number }[];
  /** Période annoncée en tête (PDF). */
  periode: { du: string; au: string } | null;
}

const plat = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const propre = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();
export const millime = (v: number): number => Math.round(v * 1000 + 1e-7) / 1000;
const egal = (a: number | null, b: number | null): boolean => a !== null && b !== null && Math.abs(a - b) < 0.0011;

type Role = 'designation' | 'quantite' | 'prixUnitaire' | 'brut' | 'remises' | 'tva' | 'net';
// L'ordre compte : « Net turnover (excl. tax) » est un net avant d'être un chiffre.
const TITRES: [Role, RegExp][] = [
  ['designation', /^(name|nom|designation|libelle|produits?|articles?)$/],
  ['quantite', /(quantit|^qte$|^qty$)/],
  ['prixUnitaire', /(unit price|prix unit|^p\.? ?u\.?( |$))/],
  ['net', /(^net |hors taxe|excl\. tax|\bht\b)/],
  ['remises', /(discount|remise)/],
  ['tva', /(^tva|^vat|^taxe)/],
  ['brut', /(gross|brut|turnover|chiffre|^ca$|montant|^total)/],
];
/** Rôle d'un titre de colonne, en français ou en anglais (« Gross turnover (TND) » → brut). */
export function roleDuTitre(texte: unknown): Role | null {
  const t = plat(texte).replace(/\((tnd|dt|dinars?)\)/g, '').trim();
  if (!t) return null;
  for (const [role, re] of TITRES) if (re.test(t)) return role;
  return null;
}

const CATEGORIE = /^\s*(category|categorie)\s*:/i;
const SOUS_CATEGORIE = /^\s*(sub-?category|sous-?categorie|famille)\s*:/i;
const DATE = /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/;
const iso = (m: RegExpExecArray): string => `${m[3]}-${m[2]}-${m[1]}`;

interface Brute { designation: string; quantite: number | null; prixUnitaire: number | null; brut: number | null; remises: number | null; tva: number | null; net: number | null }
interface SousTotal { niveau: 'categorie' | 'sousCategorie'; nom: string; categorie: string | null; quantite: number | null; brut: number | null; remises: number | null }

/** Range les rangées d'un tableau, dans l'ordre du fichier : catégories, sous-catégories, produits ; puis les contrôle. */
function ranger(brutes: readonly Brute[], modele: string, totalImprime: number | null, jours: LectureCaisse['jours'], periode: LectureCaisse['periode']): LectureCaisse {
  const lignes: LigneCaisse[] = [];
  const sousTotaux: SousTotal[] = [];
  let categorie: string | null = null;
  let sousCategorie: string | null = null;
  for (const b of brutes) {
    const nom = propre(b.designation);
    const sansAccent = nom.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (CATEGORIE.test(sansAccent)) {
      categorie = propre(nom.slice(nom.indexOf(':') + 1)) || null;
      sousCategorie = null;
      if (categorie) sousTotaux.push({ niveau: 'categorie', nom: categorie, categorie: null, quantite: b.quantite, brut: b.brut, remises: b.remises });
    } else if (SOUS_CATEGORIE.test(sansAccent)) {
      sousCategorie = propre(nom.slice(nom.indexOf(':') + 1)) || null;
      if (sousCategorie) sousTotaux.push({ niveau: 'sousCategorie', nom: sousCategorie, categorie, quantite: b.quantite, brut: b.brut, remises: b.remises });
    } else if (nom && b.quantite !== null && b.quantite > 0) {
      const base = b.brut ?? b.net;
      if (base === null) continue;
      lignes.push({ rang: lignes.length + 1, categorie, sousCategorie, designation: nom, quantite: b.quantite, prixUnitaire: b.prixUnitaire, brut: b.brut, remises: b.remises, tva: b.tva, net: b.net,
        montant: millime(base - (b.brut !== null ? (b.remises ?? 0) : 0)) });
    }
  }
  const categories = sousTotaux.filter((s) => s.niveau === 'categorie').map((s) => s.nom);
  const somme = (ls: LigneCaisse[], champ: 'quantite' | 'brut' | 'montant'): number => millime(ls.reduce((s, l) => s + (l[champ] ?? 0), 0));
  const controles: ControleCaisse[] = sousTotaux.map((s) => {
    const dedans = lignes.filter((l) => (s.niveau === 'categorie' ? l.categorie === s.nom : l.sousCategorie === s.nom && l.categorie === s.categorie));
    return { quoi: `${s.niveau === 'categorie' ? 'Catégorie' : 'Sous-catégorie'} ${s.nom}`, lignes: dedans.length,
      juste: egal(somme(dedans, 'quantite'), s.quantite) && egal(somme(dedans, 'brut'), s.brut) };
  });
  // Total sur la base des lignes (brut moins remises) : la somme des catégories quand elles sont imprimées, sinon le
  // total annoncé en tête du fichier.
  const cats = sousTotaux.filter((s) => s.niveau === 'categorie' && s.brut !== null);
  const totalLu = cats.length && cats.length === categories.length ? millime(cats.reduce((s, c) => s + (c.brut as number) - (c.remises ?? 0), 0)) : totalImprime;
  if (totalLu !== null) controles.push({ quoi: 'Total', lignes: lignes.length, juste: egal(somme(lignes, 'montant'), totalLu) });
  return { modele, lignes, categories, controles, totalLu, jours, periode };
}

// ── Excel : lignes de cellules ───────────────────────────────────────────────────────────────────────────────────────

/** Une ligne d'une feuille : son numéro et ses cellules par numéro de colonne (les lignes vides sont omises). */
export interface LigneFeuille { n: number; cellules: readonly unknown[] }

/** Lit une feuille d'un classeur ; null si aucun tableau de ventes ne s'y trouve. */
export function lireFeuilleCaisse(feuille: readonly LigneFeuille[]): LectureCaisse | null {
  const iTitre = feuille.findIndex((l) => {
    const roles = l.cellules.map((v) => (typeof v === 'string' ? roleDuTitre(v) : null));
    return roles.includes('designation') && roles.includes('quantite');
  });
  if (iTitre < 0) return null;
  const colonnes: Partial<Record<Role, number>> = {};
  feuille[iTitre].cellules.forEach((v, col) => {
    const r = typeof v === 'string' ? roleDuTitre(v) : null;
    if (r && !(r in colonnes)) colonnes[r] = col;
  });
  if (colonnes.brut === undefined && colonnes.net === undefined) return null;
  const brutes: Brute[] = [];
  let fin = iTitre;
  for (let i = iTitre + 1; i < feuille.length; i++) {
    const l = feuille[i];
    // Une ligne sautée dans la feuille (numéros qui ne se suivent plus) ferme le tableau.
    if (l.n !== feuille[i - 1].n + 1) break;
    const nombre = (role: Role): number | null => {
      const v = colonnes[role] === undefined ? null : l.cellules[colonnes[role] as number];
      return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' ? lireNombre(v) : null;
    };
    const nom = l.cellules[colonnes.designation as number];
    brutes.push({ designation: typeof nom === 'string' ? nom : nom == null ? '' : String(nom), quantite: nombre('quantite'), prixUnitaire: nombre('prixUnitaire'),
      brut: nombre('brut'), remises: nombre('remises'), tva: nombre('tva'), net: nombre('net') });
    fin = i;
  }
  let totalImprime: number | null = null;
  for (const l of feuille.slice(0, iTitre)) {
    if (/^net turnover|^chiffre (d'affaires )?net|^total net/.test(plat(l.cellules[1])) && typeof l.cellules[2] === 'number') totalImprime = l.cellules[2];
  }
  const jours: LectureCaisse['jours'] = [];
  for (const l of feuille.slice(fin + 1)) {
    const m = DATE.exec(propre(l.cellules[1]));
    if (m && typeof l.cellules[2] === 'number') jours.push({ date: iso(m), montant: l.cellules[2] });
  }
  const lu = ranger(brutes, 'Export « Products / Revenue »', totalImprime, jours, null);
  return lu.lignes.length ? lu : null;
}

// ── PDF avec texte : rangées de mots placés ──────────────────────────────────────────────────────────────────────────

const grouper = (valeurs: number[], ecart: number): { x: number; n: number }[] => {
  const groupes: number[][] = [];
  for (const v of [...valeurs].sort((a, b) => a - b)) {
    const g = groupes[groupes.length - 1];
    if (g && v - g[g.length - 1] <= ecart) g.push(v); else groupes.push([v]);
  }
  return groupes.map((g) => ({ x: g.reduce((s, v) => s + v, 0) / g.length, n: g.length }));
};

const estNombre = (t: string): boolean => /^-?\d[\d.,]*$/.test(t) && lireNombre(t) !== null;

/**
 * Lit les pages d'un PDF avec texte ; null si aucun tableau de ventes ne s'y trouve. Le tableau se lit par POSITIONS :
 * les colonnes de nombres sont les débuts de mots numériques qui reviennent ; une ligne du tableau est une rangée
 * chiffrée et les morceaux de désignation au-dessus et au-dessous d'elle (les noms longs sont coupés sur deux ou trois
 * rangées, la rangée chiffrée au milieu).
 */
export function lirePagesCaisse(pages: readonly { rangees: readonly Rangee[] }[]): LectureCaisse | null {
  const titreDe = (p: { rangees: readonly Rangee[] }): number => p.rangees.findIndex((r) => r.mots.length <= 6 && r.mots.some((m) => roleDuTitre(m.t) === 'designation')
    && p.rangees.some((q) => Math.abs(q.y0 - r.y0) < 4 * r.hauteur && q.mots.some((m) => roleDuTitre(m.t) === 'quantite')));
  const avecTableau = pages.map((p) => ({ p, i: titreDe(p) })).filter((x) => x.i >= 0);
  if (!avecTableau.length) return null;

  // Bandeau des titres (cellules sur plusieurs rangées), répété en tête de chaque page, puis les données en dessous.
  const donnees: Rangee[] = [];
  let bandeau: Rangee[] = [];
  for (const { p, i } of avecTableau) {
    const t = p.rangees[i];
    const dans = p.rangees.filter((r) => Math.abs(r.y0 - t.y0) <= 4 * t.hauteur && !r.mots.some((m) => estNombre(m.t)));
    const bas = Math.max(...dans.map((r) => r.y1));
    if (!bandeau.length) bandeau = dans;
    donnees.push(...p.rangees.filter((r) => r.y0 > bas));
  }
  const xDesignation = Math.min(...bandeau.flatMap((r) => r.mots.filter((m) => roleDuTitre(m.t) === 'designation').map((m) => m.x0)));
  const ancres = grouper(donnees.flatMap((r) => r.mots.filter((m) => estNombre(m.t) && m.x0 > xDesignation + 60).map((m) => m.x0)), 6)
    .filter((g) => g.n >= 3).map((g) => g.x);
  if (ancres.length < 2) return null;
  const colonneDe = (x: number): number => ancres.findIndex((a, k) => x >= a - 8 && (k === ancres.length - 1 || x < ancres[k + 1] - 8));
  const roles = ancres.map((_, k) => roleDuTitre(bandeau
    .flatMap((r) => r.mots.filter((m) => colonneDe(m.x0) === k).map((m) => ({ y: r.y0, x: m.x0, t: m.t })))
    .sort((u, v) => u.y - v.y || u.x - v.x).map((m) => m.t).join(' ')));
  if (!roles.includes('quantite') || !(roles.includes('brut') || roles.includes('net'))) return null;

  const chiffree = (r: Rangee): boolean => r.mots.filter((m) => estNombre(m.t) && colonneDe(m.x0) >= 0).length >= 2;
  const ancresY = donnees.filter(chiffree);
  if (!ancresY.length) return null;
  const pasDe = ancresY.slice(1).map((r, k) => (r.page === ancresY[k].page ? r.y0 - ancresY[k].y0 : Infinity)).filter(Number.isFinite).sort((a, b) => a - b);
  const pas = pasDe.length ? pasDe[Math.floor(pasDe.length / 2)] : 24;
  const blocs = ancresY.map((r) => ({ ancre: r, noms: [] as { y: number; x: number; t: string }[] }));
  for (const r of donnees) {
    const nom = r.mots.filter((m) => m.x0 < ancres[0] - 8);
    if (!nom.length) continue;
    const proches = blocs.filter((b) => b.ancre.page === r.page).map((b) => ({ b, d: Math.abs(b.ancre.y0 - r.y0) })).sort((u, v) => u.d - v.d);
    if (proches.length && proches[0].d <= 0.75 * pas) proches[0].b.noms.push(...nom.map((m) => ({ y: r.y0, x: m.x0, t: m.t })));
  }
  const brutes: Brute[] = blocs.map((b) => {
    const ligne: Brute = { designation: b.noms.sort((u, v) => u.y - v.y || u.x - v.x).map((m) => m.t).join(' '), quantite: null, prixUnitaire: null, brut: null, remises: null, tva: null, net: null };
    for (const m of b.ancre.mots) {
      const role = estNombre(m.t) ? roles[colonneDe(m.x0)] : null;
      if (role && role !== 'designation' && ligne[role] === null) ligne[role] = lireNombre(m.t);
    }
    return ligne;
  });

  // En-tête : période, total annoncé (libellés sur plusieurs rangées, valeurs en dessous), chiffre par jour.
  const toutes = pages.flatMap((p) => p.rangees);
  const mPeriode = toutes.map((r) => /from\s+(\d{2}-\d{2}-\d{4})\s+\d{2}:\d{2}\s+to\s+(\d{2}-\d{2}-\d{4})/i.exec(r.texte.replace(/\s+/g, ' '))).find(Boolean) ?? null;
  const d1 = mPeriode ? DATE.exec(mPeriode[1]) : null, d2 = mPeriode ? DATE.exec(mPeriode[2]) : null;
  const jours: LectureCaisse['jours'] = [];
  for (const r of toutes) {
    const m = r.mots.length === 2 ? DATE.exec(r.mots[0].t) : null;
    if (m && estNombre(r.mots[1].t)) jours.push({ date: iso(m), montant: lireNombre(r.mots[1].t) as number });
  }
  let totalImprime: number | null = null;
  const premiere = pages[0].rangees;
  const yTableau = avecTableau[0].p === pages[0] ? pages[0].rangees[avecTableau[0].i].y0 : Infinity;
  const valeurs = premiere.find((r) => r.mots.length >= 4 && r.mots.every((m) => estNombre(m.t)) && r.y0 < yTableau);
  if (valeurs) {
    const libelles = premiere.filter((r) => r.y0 < valeurs.y0 && valeurs.y0 - r.y0 < 6 * valeurs.hauteur).flatMap((r) => r.mots.map((m) => ({ y: r.y0, x: m.x0, t: m.t })));
    valeurs.mots.forEach((v, k) => {
      const suivant = valeurs.mots[k + 1]?.x0 ?? Infinity;
      const libelle = plat(libelles.filter((m) => m.x >= v.x0 - 4 && m.x < suivant - 4).sort((a, b) => a.y - b.y || a.x - b.x).map((m) => m.t).join(' '));
      if (/^net turnover|^chiffre (d'affaires )?net|^total net/.test(libelle)) totalImprime = lireNombre(v.t);
    });
  }
  const lu = ranger(brutes, 'Export « Products / Revenue »', totalImprime, jours, d1 && d2 ? { du: iso(d1), au: iso(d2) } : null);
  return lu.lignes.length ? lu : null;
}

/**
 * La journée d'un fichier : un import = une journée. Le fichier couvre souvent une période ; il se rattache au SEUL jour
 * qui porte du chiffre. Plusieurs jours de chiffre : refus ('plusieurs'). Aucun jour annoncé : à saisir ('inconnue').
 */
export function jourDuFichier(lu: Pick<LectureCaisse, 'jours' | 'periode'>): { date: string | null; etat: 'trouvee' | 'plusieurs' | 'inconnue'; jours: string[] } {
  const avecChiffre = lu.jours.filter((j) => Math.abs(j.montant) > 0.0005).map((j) => j.date);
  if (avecChiffre.length === 1) return { date: avecChiffre[0], etat: 'trouvee', jours: avecChiffre };
  if (avecChiffre.length > 1) return { date: null, etat: 'plusieurs', jours: avecChiffre };
  if (lu.periode && lu.periode.du === lu.periode.au) return { date: lu.periode.du, etat: 'trouvee', jours: [lu.periode.du] };
  return { date: null, etat: 'inconnue', jours: [] };
}
