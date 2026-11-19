// Import d'un fichier de caisse (étape V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) : LIRE
// l'export de la caisse. Fonctions PURES : elles reçoivent ce que le navigateur a tiré du fichier (cellules d'un
// classeur Excel, rangées de mots d'un PDF) et rendent la même lecture pour les deux.
// Modèle connu : l'export « Products / Revenue » d'une caisse en ligne (catégories, sous-catégories, produits, colonnes
// quantité, prix, brut, remises, TVA, net). Règles mesurées sur les documents du client (essai du 18/11/2026,
// labflow-reprise/ventes-cartes/essai/RAPPORT-ESSAI.md) ; les tests n'emploient qu'un jeu FICTIF.
// Syntaxe TypeScript effaçable : testé tel quel par « node --test scripts/ventes-caisse.test.mjs ».
import { datesDuTexte, lireNombre } from '../../factures/lecture/nombres.ts';
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

// ── V1b : TOUT fichier ───────────────────────────────────────────────────────────────────────────────────────────────
// Décision du client (18/11/2026) : « accepter tous mes fichiers, les détecter et demander la correspondance ».
// Quand les titres d'un tableau ne se reconnaissent pas seuls, l'utilisateur DÉSIGNE ses colonnes sur un aperçu ; le
// choix est retenu par activité avec la ligne de titres du fichier (sa « signature ») : le fichier suivant de la même
// caisse se lit sans question. Tout fichier (Excel, CSV, PDF) est ramené à une FEUILLE : des lignes de cellules.

/** Ce qu'une colonne peut être. `montant` = ce que le client a payé pour la ligne, remises déduites. */
export type RoleDesigne = 'designation' | 'quantite' | 'montant' | 'prixUnitaire' | 'categorie';
export const ROLES_DESIGNES: readonly RoleDesigne[] = ['designation', 'quantite', 'montant', 'prixUnitaire', 'categorie'];
/** Rôle → numéro de colonne de la feuille (à partir de 1). */
export type ColonnesDesignees = Partial<Record<RoleDesigne, number>>;
export interface ModeleAppris { signature: string; colonnes: ColonnesDesignees }
export const MODELE_DESIGNE = 'Colonnes désignées';

const nombreDe = (v: unknown): number | null => (typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' && v.trim() !== '' ? lireNombre(v) : null);
const texteDe = (v: unknown): string => (v == null ? '' : propre(typeof v === 'string' ? v : String(v)));
const TOTAL = /^(total|totaux|sous[- ]?total|sub[- ]?total|grand total|somme)\b/;
const TOTAL_GENERAL = /^(total|totaux|grand total)( general| ttc| net| du jour)?$/;
const CATEGORIE_TITRE = /^(categor|famille|rayon|groupe|departement)/;

/** Désignation, quantité et montant (ou prix unitaire) désignés, chacun sur sa colonne. */
export function colonnesCompletes(c: ColonnesDesignees): boolean {
  const prises = ROLES_DESIGNES.map((r) => c[r]).filter((n): n is number => typeof n === 'number');
  return Boolean(c.designation && c.quantite && (c.montant || c.prixUnitaire)) && new Set(prises).size === prises.length;
}

/** Une feuille est exploitable si une de ses lignes porte au moins un texte et un nombre. */
export function exploitable(feuille: readonly LigneFeuille[]): boolean {
  return feuille.some((l) => {
    const pleines = Array.from(l.cellules).filter((v) => texteDe(v) !== '');
    return pleines.some((v) => nombreDe(v) !== null) && pleines.some((v) => nombreDe(v) === null);
  });
}

const estDonnee = (l: LigneFeuille, c: ColonnesDesignees): boolean => {
  const q = nombreDe(l.cellules[c.quantite as number]);
  return q !== null && q > 0 && texteDe(l.cellules[c.designation as number]) !== '';
};

/** Date d'une cellule de date (« 05/11/2026 », « 2026-11-05 14:02 ») ; null pour tout autre texte. */
const dateDeCellule = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.trim().length > 24) return null;
  const d = datesDuTexte(v);
  return d.length === 1 ? d[0].iso : null;
};

/**
 * Lit une feuille dont les colonnes sont désignées. Une ligne de produit = une désignation et une quantité positive ;
 * les titres et les lignes de texte sont sautés d'eux-mêmes, les lignes « Total » servent au contrôle. Les lignes du
 * même produit (un export détaillé par ticket) sont REGROUPÉES : quantités et montants additionnés.
 * La journée : les dates portées par les lignes (plusieurs jours : l'import est refusé, comme pour le modèle connu),
 * sinon les dates écrites hors du tableau.
 */
export function lireFeuilleDesignee(feuille: readonly LigneFeuille[], colonnes: ColonnesDesignees): LectureCaisse | null {
  if (!colonnesCompletes(colonnes)) return null;
  const designees = new Set(ROLES_DESIGNES.map((r) => colonnes[r]).filter((n): n is number => typeof n === 'number'));
  const lignes: LigneCaisse[] = [];
  const parCle = new Map<string, LigneCaisse>();
  const parJour = new Map<string, number>();
  const horsTableau = new Set<string>();
  let totalImprime: number | null = null;
  for (const l of feuille) {
    const nom = texteDe(l.cellules[colonnes.designation as number]);
    const m = colonnes.montant ? nombreDe(l.cellules[colonnes.montant]) : null;
    if (nom && TOTAL.test(plat(nom))) {
      if (TOTAL_GENERAL.test(plat(nom)) && m !== null) totalImprime = m;
      continue;
    }
    if (!estDonnee(l, colonnes)) {
      for (const v of l.cellules) if (typeof v === 'string') for (const d of datesDuTexte(v)) horsTableau.add(d.iso);
      continue;
    }
    const q = nombreDe(l.cellules[colonnes.quantite as number]) as number;
    const pu = colonnes.prixUnitaire ? nombreDe(l.cellules[colonnes.prixUnitaire]) : null;
    const montant = m ?? (pu !== null ? pu * q : null);
    if (montant === null || montant < 0) continue;
    const categorie = colonnes.categorie ? texteDe(l.cellules[colonnes.categorie]) || null : null;
    let jour: string | null = null;
    for (let col = 1; col < l.cellules.length && !jour; col++) if (!designees.has(col)) jour = dateDeCellule(l.cellules[col]);
    if (jour) parJour.set(jour, (parJour.get(jour) ?? 0) + montant);
    const cle = `${plat(categorie)}|${plat(nom)}`;
    const deja = parCle.get(cle);
    if (deja) {
      deja.quantite = millime(deja.quantite + q);
      deja.montant = millime(deja.montant + montant);
      deja.brut = deja.montant;
      deja.prixUnitaire = null;
    } else {
      const ligne: LigneCaisse = { rang: lignes.length + 1, categorie, sousCategorie: null, designation: nom, quantite: millime(q), prixUnitaire: pu, brut: millime(montant), remises: null, tva: null, net: null, montant: millime(montant) };
      parCle.set(cle, ligne);
      lignes.push(ligne);
    }
  }
  if (!lignes.length) return null;
  const categories = [...new Set(lignes.map((l) => l.categorie).filter((c): c is string => c !== null))];
  // Les lignes d'une même catégorie se suivent (dans l'ordre où les catégories apparaissent), sans catégorie à la fin.
  const ordre = (c: string | null): number => (c === null ? categories.length : categories.indexOf(c));
  lignes.sort((a, b) => ordre(a.categorie) - ordre(b.categorie) || a.rang - b.rang);
  lignes.forEach((l, i) => { l.rang = i + 1; });
  const total = millime(lignes.reduce((s, l) => s + l.montant, 0));
  const controles: ControleCaisse[] = totalImprime === null ? [] : [{ quoi: 'Total', lignes: lignes.length, juste: egal(total, totalImprime) }];
  const jours = [...parJour].map(([date, montant]) => ({ date, montant: millime(montant) })).sort((a, b) => a.date.localeCompare(b.date));
  const dates = [...horsTableau].sort();
  const periode = !jours.length && dates.length ? { du: dates[0], au: dates[dates.length - 1] } : null;
  return { modele: MODELE_DESIGNE, lignes, categories, controles, totalLu: totalImprime, jours, periode };
}

const signatureDeLigne = (l: LigneFeuille): string => Array.from(l.cellules, (v) => plat(texteDe(v))).join('|').replace(/\|+$/, '').slice(0, 400);
const sansTitres = (l: LigneFeuille): string => `sans titres (${Math.max(0, l.cellules.length - 1)} colonnes)`;

/**
 * Signature d'un modèle de fichier : sa LIGNE DE TITRES — la ligne la plus proche au-dessus de la première ligne de
 * produit qui porte un texte dans la colonne des désignations et dans celle des quantités. Sans titres : le nombre de
 * colonnes (un tel modèle est proposé, jamais appliqué sans que l'utilisateur le confirme).
 */
export function signatureFeuille(feuille: readonly LigneFeuille[], colonnes: ColonnesDesignees): string {
  const premiere = feuille.findIndex((l) => estDonnee(l, colonnes));
  if (premiere < 0) return '';
  for (let i = premiere - 1; i >= Math.max(0, premiere - 6); i--) {
    const titre = feuille[i].cellules[colonnes.quantite as number];
    if (texteDe(feuille[i].cellules[colonnes.designation as number]) && texteDe(titre) && nombreDe(titre) === null) return signatureDeLigne(feuille[i]);
  }
  return sansTitres(feuille[premiere]);
}

/**
 * Le modèle retenu qui convient à une feuille. `sur` : sa ligne de titres s'y retrouve à l'identique — il s'applique
 * sans question ; sinon (fichier sans titres, même nombre de colonnes) il est seulement proposé.
 */
export function trouverModele(feuille: readonly LigneFeuille[], modeles: readonly ModeleAppris[]): { modele: ModeleAppris; sur: boolean } | null {
  const parSignature = new Map(modeles.filter((m) => colonnesCompletes(m.colonnes)).map((m) => [m.signature, m]));
  if (!parSignature.size) return null;
  for (const l of feuille.slice(0, 80)) {
    const m = parSignature.get(signatureDeLigne(l));
    if (m && !m.signature.startsWith('sans titres (')) return { modele: m, sur: true };
  }
  const chiffree = feuille.find((l) => Array.from(l.cellules).filter((v) => nombreDe(v) !== null).length >= 2);
  const m = chiffree ? parSignature.get(sansTitres(chiffree)) : undefined;
  return m ? { modele: m, sur: false } : null;
}

/** Colonnes proposées d'après les titres que la feuille porte (pré-remplit la désignation des colonnes). */
export function devinerColonnes(feuille: readonly LigneFeuille[]): ColonnesDesignees {
  const VERS: Partial<Record<Role, RoleDesigne>> = { designation: 'designation', quantite: 'quantite', brut: 'montant', net: 'montant', prixUnitaire: 'prixUnitaire' };
  let meilleur: ColonnesDesignees = {};
  for (const l of feuille.slice(0, 80)) {
    // Une ligne de TITRES ne porte aucun nombre (« Total 12 142,500 » n'en est pas une).
    if (Array.from(l.cellules).some((v) => nombreDe(v) !== null)) continue;
    const c: ColonnesDesignees = {};
    l.cellules.forEach((v, col) => {
      if (typeof v !== 'string' || !v.trim()) return;
      const role = roleDuTitre(v);
      const d = role ? VERS[role] : CATEGORIE_TITRE.test(plat(v)) ? 'categorie' : undefined;
      if (d && c[d] === undefined) c[d] = col;
    });
    if (Object.keys(c).length > Object.keys(meilleur).length) meilleur = c;
  }
  return meilleur;
}

/**
 * Aperçu d'une feuille pour désigner ses colonnes : ses colonnes utilisées (14 au plus) et une douzaine de lignes à
 * partir du tableau (deux lignes avant la première qui mêle texte et nombres, pour voir les titres).
 */
export function apercuFeuille(feuille: readonly LigneFeuille[], max = 12): { colonnes: number[]; lignes: LigneFeuille[] } {
  const debut = Math.max(0, feuille.findIndex((l) => exploitable([l])) - 2);
  const lignes = feuille.slice(debut, debut + max);
  const vues = new Set<number>();
  for (const l of feuille.slice(debut, debut + 200)) l.cellules.forEach((v, col) => { if (texteDe(v) !== '') vues.add(col); });
  return { colonnes: [...vues].sort((a, b) => a - b).slice(0, 14), lignes };
}

/** Texte d'une cellule pour l'aperçu. */
export const texteCellule = (v: unknown): string => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : texteDe(v));

/**
 * Journée lue dans le NOM d'un fichier (« ventes_05-11-2026.xlsx », « caisse 2026-11-05.csv », « 20261105.pdf ») ; null
 * si le nom n'en porte pas une seule. Elle est proposée quand le fichier n'annonce pas sa journée.
 */
export function jourDuNom(nom: string): string | null {
  const base = nom.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
  const dates = new Set(datesDuTexte(base).map((d) => d.iso));
  for (const m of base.matchAll(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g)) dates.add(`${m[1]}-${m[2]}-${m[3]}`);
  return dates.size === 1 ? [...dates][0] : null;
}

/**
 * Ramène les pages d'un PDF avec texte à une feuille, par POSITIONS : les colonnes de nombres sont les positions qui
 * reviennent (bord gauche, bord droit ou milieu des nombres, selon l'alignement qui en explique le plus) ; le texte de
 * la ligne va dans la première colonne. Une rangée chiffrée reprend les morceaux de désignation voisins (noms coupés
 * sur plusieurs rangées) ; les mots d'une rangée de titres sont placés au-dessus de leur colonne.
 */
export function feuilleDePages(pages: readonly { rangees: readonly Rangee[] }[]): LigneFeuille[] {
  const toutes = pages.flatMap((p) => p.rangees);
  const nombres = toutes.flatMap((r) => r.mots.filter((m) => estNombre(m.t)));
  type Alignement = (m: { x0: number; x1: number }) => number;
  const alignements: Alignement[] = [(m) => m.x1, (m) => m.x0, (m) => (m.x0 + m.x1) / 2];
  const ancresDe = (position: Alignement): { x: number; n: number }[] => {
    const g = grouper(nombres.map(position), 6).filter((c) => c.n >= 3);
    const plus = Math.max(0, ...g.map((c) => c.n));
    return g.filter((c) => c.n >= Math.max(3, 0.4 * plus));
  };
  let position = alignements[0];
  let groupes = ancresDe(position);
  for (const a of alignements.slice(1)) {
    const g = ancresDe(a);
    if (g.reduce((s, c) => s + c.n, 0) > groupes.reduce((s, c) => s + c.n, 0)) { position = a; groupes = g; }
  }
  const ancres = groupes.map((c) => c.x);
  const colonneDe = (m: { t: string; x0: number; x1: number }): number => (estNombre(m.t) ? ancres.findIndex((a) => Math.abs(position(m) - a) <= 8) : -1);
  const chiffree = (r: Rangee): boolean => ancres.length >= 2 && r.mots.filter((m) => colonneDe(m) >= 0).length >= 2;

  const ancresY = toutes.filter(chiffree);
  const pasDe = ancresY.slice(1).map((r, k) => (r.page === ancresY[k].page ? r.y0 - ancresY[k].y0 : Infinity)).filter(Number.isFinite).sort((a, b) => a - b);
  const pas = pasDe.length ? pasDe[Math.floor(pasDe.length / 2)] : 24;
  const blocs = new Map<Rangee, { y: number; x: number; t: string }[]>(ancresY.map((r) => [r, []]));
  const seules: Rangee[] = [];
  for (const r of toutes) {
    if (blocs.has(r)) { (blocs.get(r) as { y: number; x: number; t: string }[]).push(...r.mots.filter((m) => colonneDe(m) < 0).map((m) => ({ y: r.y0, x: m.x0, t: m.t }))); continue; }
    const proche = ancresY.filter((b) => b.page === r.page).map((b) => ({ b, d: Math.abs(b.y0 - r.y0) })).sort((u, v) => u.d - v.d)[0];
    if (proche && proche.d <= 0.75 * pas) (blocs.get(proche.b) as { y: number; x: number; t: string }[]).push(...r.mots.map((m) => ({ y: r.y0, x: m.x0, t: m.t })));
    else seules.push(r);
  }
  const feuille: LigneFeuille[] = [];
  for (const r of toutes) {
    const cellules: unknown[] = [];
    if (blocs.has(r)) {
      cellules[1] = (blocs.get(r) as { y: number; x: number; t: string }[]).sort((u, v) => u.y - v.y || u.x - v.x).map((m) => m.t).join(' ');
      for (const m of r.mots) { const k = colonneDe(m); if (k >= 0 && cellules[k + 2] === undefined) cellules[k + 2] = m.t; }
    } else if (seules.includes(r)) {
      // Rangée de texte : un mot posé au-dessus d'une colonne de nombres en est le titre.
      const texte: string[] = [];
      for (const m of r.mots) {
        const milieu = (m.x0 + m.x1) / 2;
        const k = ancres.length && m.x0 > ancres[0] - 70 ? ancres.map((a, i) => ({ i, d: Math.abs(milieu - a) })).sort((u, v) => u.d - v.d)[0] : null;
        if (k && k.d <= 45) cellules[k.i + 2] = cellules[k.i + 2] === undefined ? m.t : `${cellules[k.i + 2] as string} ${m.t}`;
        else texte.push(m.t);
      }
      if (texte.length) cellules[1] = texte.join(' ');
    } else continue;
    feuille.push({ n: feuille.length + 1, cellules });
  }
  return feuille;
}
