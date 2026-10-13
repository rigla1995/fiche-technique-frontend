// Lecture de l'en-tête d'une facture (étape F2) : la chaîne de reconnaissance de caractères d'une IMAGE (scan, photo,
// PDF numérisé), sans DOM ni tesseract — l'image (`Source`) et la reconnaissance (`MoteurFacture`) sont fournies par
// l'appelant : un canvas et tesseract.js dans le navigateur (lireFacture.ts), un canvas Node pour l'essai.
// Même méthode que la patente (lot 3, étape 7), mesurée sur le jeu de factures fictives (ESSAI-FACTURES.md) :
//   passe 0  redressement (l'analyse de mise en page donne l'angle, l'image est tournée) ;
//   passe 1  page entière en gris normalisé, mots et lignes → rangées → en-tête ;
//   passe 2  seulement s'il manque le numéro, la date, le nom, ou si les totaux ne se recoupent pas : la page relue par
//            ZONES (haut gauche, haut droit, bas droit), chacune comme un bloc de texte — l'analyse de mise en page de la
//            passe 1 mélange parfois deux colonnes voisines (cadre « FACTURE N° », totaux à côté du récapitulatif de TVA).
import type { Source } from '../../../admin/patente/ocr/chaine.ts';
import { etirer, gris } from '../../../admin/patente/ocr/pixels.ts';
import type { Pixels } from '../../../admin/patente/ocr/pixels.ts';
import { lireEntete } from './entete.ts';
import { colonnesDuTitre, lireTableaux } from './lignes.ts';
import { construireRangees, motsDeTesseract } from './rangees.ts';
import type { BlocsTesseract } from './rangees.ts';
import {
  accentuer, depuisCadrePage, eclaircirZonesFoncees, effacerTraits, egaliserFond, feuillePleine, ordonnerCoins, redresserFeuille, tournerPixels,
  tournerQuart, trouverFeuille, versCadrePage,
} from './image.ts';
import type { Coins } from './image.ts';
import type { Destinataire, EnteteLu, LigneLue, MiseEnPage, Mot, PageLue, PreparationPage, SuiviLecture, Trajet } from './types.ts';

export type { Source };

/** Reconnaissance de caractères (tesseract.js, modèle « fra ») sur une image en niveaux de gris. */
export interface MoteurFacture {
  /** Angle des lignes de texte, en radians (analyse de mise en page seule). */
  angle(image: Pixels): Promise<number>;
  /** Page entière (analyse de mise en page complète) : blocs, paragraphes, lignes, mots. */
  page(image: Pixels): Promise<BlocsTesseract>;
  /** Une zone lue comme un seul bloc de texte (sans analyse de colonnes). */
  bloc(image: Pixels): Promise<BlocsTesseract>;
}

export const ETAPE_OCR = 'Reconnaissance des caractères…';
/** Préparation de l'image (étape F5, lecture/image.ts) ; l'outil d'essai coupe chaque traitement pour mesurer son effet. */
export const PREPARATION = { feuille: true, zonesFoncees: true, fond: true, traits: true, nettete: true };
/** Plus grand côté de la page lue : une facture A4 photographiée à 4000 px est réduite, un scan de 1000 px agrandi. */
export const COTE_LU = 2400;
const ANGLE_MIN = 0.004; // en radians (~0,2°) : en dessous, on ne tourne pas

/** L'image en gris normalisé, à la taille de lecture (`COTE_LU`), et son échelle. */
async function normaliser(source: Source): Promise<{ grise: Pixels; echelle: number }> {
  const echelle = Math.min(3, Math.max(0.3, COTE_LU / Math.max(source.largeur, source.hauteur)));
  const rgba = await source.extraire(
    { left: 0, top: 0, width: source.largeur, height: source.hauteur },
    Math.round(source.largeur * echelle), Math.round(source.hauteur * echelle),
  );
  return { grise: etirer(gris(rgba)), echelle };
}

/** Mots lisibles d'une passe (trois lettres au moins, reconnus avec assurance) : jugent une orientation de la page. */
export const motsLisibles = (mots: readonly Mot[]): number => mots.filter((m) => (m.c ?? 100) >= 70 && /\p{L}{3,}/u.test(m.t)).length;
/**
 * Page sans doute couchée ou à l'envers (les trois autres orientations sont alors essayées) : peu de mots lisibles, et
 * peu au regard des mots reconnus. Mesuré sur le jeu fictif (ESSAI-FACTURES.md §8) : une photo couchée donne 3 à 13 mots
 * lisibles (moins de 10 % des mots), une photo droite 34 à 77 (plus de 35 %), même floue.
 */
export const pageCouchee = (mots: readonly Mot[]): boolean => {
  // Une page presque vide (dernière page avec les seuls totaux, ticket court) n'est jamais « couchée » : essayer les
  // trois autres orientations y coûterait trois lectures pour rien (relecture des écrans). Couchée, une facture donne au
  // contraire beaucoup de « mots » mal reconnus (74 à 167 sur le jeu fictif).
  if (mots.length < 30) return false;
  const n = motsLisibles(mots);
  return n < 6 || (n < 20 && n < 0.2 * mots.length);
};

/** Découpe d'une image en niveaux de gris (coordonnées en pixels, bornées à l'image). */
export function decouper(image: Pixels, x: number, y: number, l: number, h: number): Pixels {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const w = Math.max(1, Math.min(image.width - x0, Math.round(l))), hh = Math.max(1, Math.min(image.height - y0, Math.round(h)));
  const data = new Uint8ClampedArray(w * hh);
  for (let r = 0; r < hh; r++) data.set(image.data.subarray((y0 + r) * image.width + x0, (y0 + r) * image.width + x0 + w), r * w);
  return { data, width: w, height: hh };
}

/** Zones de la passe 2, en parts de la page : en-tête gauche, en-tête droit, bas droit (totaux). Ticket : haut, bas. */
export function zonesDePage(largeur: number, hauteur: number): [number, number, number, number][] {
  if (hauteur > 2 * largeur) return [[0, 0, 1, 0.4], [0, 0.45, 1, 0.55]];
  return [[0, 0, 0.55, 0.32], [0.45, 0, 0.55, 0.32], [0.4, 0.3, 0.6, 0.7]];
}

/** Ce qui manque à une lecture pour qu'une passe par zones vaille la peine. */
export const incomplete = (e: EnteteLu): boolean =>
  !e.numero || !e.date || !e.nom || e.totaux.coherents !== true;

/** Complète une lecture par une autre : les valeurs absentes ; les totaux s'ils se recoupent mieux. */
export function completer(a: EnteteLu, b: EnteteLu): EnteteLu {
  const totauxB = b.totaux.coherents === true && a.totaux.coherents !== true;
  const r: EnteteLu = {
    ...a,
    matricule: a.matricule ?? b.matricule,
    nom: a.nom ?? b.nom,
    adresse: a.adresse ?? b.adresse,
    telephone: a.telephone ?? b.telephone,
    email: a.email ?? b.email,
    numero: a.numero ?? b.numero,
    date: a.date ?? b.date,
    totaux: totauxB ? b.totaux : a.totaux,
    miseEnPage: a.miseEnPage ?? b.miseEnPage ?? null,
    miseEnPageConnue: Boolean(a.miseEnPageConnue || b.miseEnPageConnue),
  };
  // Les avertissements de la première lecture qui ne valent plus (numéro, date, totaux retrouvés) sont retirés.
  r.avertissements = a.avertissements.filter((m) => !((/^Numéro/.test(m) && r.numero) || (/^Date/.test(m) && r.date)
    || (/^Totaux lus/.test(m) && totauxB) || (/matricule fiscal lu/i.test(m) && r.matricule)));
  return r;
}

/** Place les pages lues dans la facture déposée : rang du fichier, numéro de la première page dans ce fichier. */
export function situer(e: EnteteLu, fichier: number, premierePage = 1): EnteteLu {
  return { ...e, pages: e.pages.map((p, k) => ({ ...p, fichier, page: premierePage + k })) };
}

/** Ajoute les lignes et les pages d'une autre page lue (la dernière page d'une facture de plusieurs pages). */
export function ajouterPages(a: EnteteLu, b: EnteteLu): EnteteLu {
  const decalage = a.pages.length;
  return {
    ...a,
    pages: [...a.pages, ...b.pages],
    lignesFacture: [...a.lignesFacture, ...b.lignesFacture.map((l) => ({ ...l, cadre: { ...l.cadre, page: l.cadre.page + decalage } }))],
    miseEnPage: a.miseEnPage ?? b.miseEnPage ?? null,
    miseEnPageConnue: Boolean(a.miseEnPageConnue || b.miseEnPageConnue),
  };
}

/**
 * Une page d'image → ses rangées (coordonnées de la page lue, redressée), l'image lue (pour les passes suivantes) et son
 * trajet depuis l'image d'origine. Étape F5 : la feuille d'une photo est recadrée (coins choisis — « Recadrer » — ou
 * trouvés seuls), tournée d'un quart de tour si demandé (« Pivoter ») ou si la page est illisible telle quelle, puis
 * redressée ; les zones foncées sont éclaircies et l'ombre égalisée.
 */
export async function lirePageImage(
  source: Source, moteur: MoteurFacture, numero = 1, suivi: SuiviLecture = () => {}, debut = 0, part = 1, preparation: PreparationPage = {},
): Promise<{ page: PageLue; grise: Pixels; angle: number; trajet: Trajet }> {
  suivi(ETAPE_OCR, debut + part * 0.05);
  const { grise: reduite, echelle } = await normaliser(source);
  let coins: Coins | null = null;
  let coinsAuto = false;
  if (preparation.coins !== undefined) {
    // Coins posés à la main : remis dans l'ordre ; un cadre qui se croise n'est pas employé.
    const ordonnes = preparation.coins ? ordonnerCoins(preparation.coins) : null;
    coins = ordonnes ? ordonnes.map(([fx, fy]) => ({ x: fx * reduite.width, y: fy * reduite.height })) as Coins : null;
  } else if (PREPARATION.feuille) {
    coins = trouverFeuille(reduite);
    coinsAuto = Boolean(coins);
  }
  const feuille = coins ? redresserFeuille(reduite, coins) : reduite;
  // Le cadre de la page est la feuille : recadrée, ou l'image entière d'un scan (contre-relecture : un scan n'apprenait
  // jamais sa mise en page).
  const cadreFeuille = Boolean(coins) || feuillePleine(reduite);
  const essayer = async (quarts: number) => {
    const tournee = tournerQuart(feuille, quarts);
    const angle = await moteur.angle(tournee);
    const base = { largeur: source.largeur, hauteur: source.hauteur, coins: coins ? coins.map((p) => [p.x, p.y] as [number, number]) : null, coinsAuto, quarts, angle: 0 };
    let grise = tournee;
    let trajet: Trajet = { ...base, rotation: 'pixels', echelle, tailles: { reduite: [reduite.width, reduite.height], feuille: [feuille.width, feuille.height], quarts: [tournee.width, tournee.height], lue: [tournee.width, tournee.height] } };
    if (Math.abs(angle) >= ANGLE_MIN) {
      if (coins || quarts) {
        grise = tournerPixels(tournee, angle);
        trajet = { ...trajet, angle, tailles: { ...trajet.tailles, lue: [grise.width, grise.height] } };
      } else {
        // Page entière dans son sens : tournée depuis l'image d'origine (meilleure qualité).
        const tourneeSource = await source.tourner(angle);
        const n = await normaliser(tourneeSource);
        grise = n.grise;
        trajet = { ...base, angle, rotation: 'source', echelle: n.echelle, tailles: { reduite: [reduite.width, reduite.height], feuille: [reduite.width, reduite.height], quarts: [tourneeSource.largeur, tourneeSource.hauteur], lue: [grise.width, grise.height] } };
      }
    }
    if (PREPARATION.zonesFoncees) grise = eclaircirZonesFoncees(grise);
    if (PREPARATION.fond) grise = etirer(egaliserFond(grise));
    // Netteté : pour une photo (feuille recadrée) ou une petite image agrandie — un scan propre n'en a pas besoin (le
    // bruit du papier renforcé gênait la lecture des noms).
    if (PREPARATION.nettete && (coins || echelle > 1.6)) grise = accentuer(grise);
    suivi(ETAPE_OCR, debut + part * 0.25);
    const { mots, lignes } = motsDeTesseract(await moteur.page(grise));
    return { grise, angle, trajet, mots, lignes };
  };
  let lu = await essayer(preparation.quarts ?? 0);
  // Page illisible telle quelle (photo couchée ou à l'envers) : les autres orientations, la plus lisible gardée.
  if (preparation.quarts === undefined && pageCouchee(lu.mots)) {
    for (const q of [1, 3, 2]) {
      const autre = await essayer(q);
      if (motsLisibles(autre.mots) > motsLisibles(lu.mots)) lu = autre;
      if (!pageCouchee(lu.mots)) break;
    }
  }
  suivi(ETAPE_OCR, debut + part);
  const t = lu.trajet;
  // Le cadre de la page droite, où s'exprime une mise en page ; elle ne s'apprend et ne s'applique que si ce cadre est la
  // feuille (une photo non recadrée contient la table autour : les fractions y tomberaient à côté).
  const cadre = { versFraction: (x: number, y: number) => versCadrePage(t, x, y), depuisFraction: (fx: number, fy: number) => depuisCadrePage(t, fx, fy), feuille: cadreFeuille };
  return { page: { largeur: lu.grise.width, hauteur: lu.grise.height, rangees: construireRangees(lu.mots, numero, lu.lignes), cadre }, grise: lu.grise, angle: lu.angle, trajet: t };
}

/** Passe 2 : les zones de la page, chacune lue comme un bloc ; les mots sont remis dans les coordonnées de la page. */
export async function lireZones(grise: Pixels, moteur: MoteurFacture, numero = 1, suivi: SuiviLecture = () => {}, debut = 0, part = 1, cadre?: PageLue['cadre']): Promise<PageLue> {
  const tous: Mot[] = [];
  const lignes: number[] = [];
  const zones = zonesDePage(grise.width, grise.height);
  let decalage = 0;
  for (const [k, [px, py, pl, ph]] of zones.entries()) {
    const x = px * grise.width, y = py * grise.height;
    const { mots, lignes: li } = motsDeTesseract(await moteur.bloc(decouper(grise, x, y, pl * grise.width, ph * grise.height)));
    mots.forEach((m, i) => {
      tous.push({ ...m, x0: m.x0 + x, x1: m.x1 + x, y0: m.y0 + y, y1: m.y1 + y });
      lignes.push(li[i] + decalage);
    });
    decalage += 10_000;
    suivi(ETAPE_OCR, debut + part * ((k + 1) / zones.length));
  }
  // Les zones se chevauchent un peu : un mot lu deux fois (même texte, même place) n'est gardé qu'une fois.
  const vus = new Set<string>();
  const uniques: Mot[] = [], lignesUniques: number[] = [];
  tous.forEach((m, i) => {
    const cle = `${m.t}|${Math.round(m.x0 / 8)}|${Math.round(m.y0 / 8)}`;
    if (vus.has(cle)) return;
    vus.add(cle);
    uniques.push(m);
    lignesUniques.push(lignes[i]);
  });
  // Les lignes de deux zones voisines à la même hauteur se rejoignent en une rangée, comme sur la page.
  return { largeur: grise.width, hauteur: grise.height, rangees: construireRangees(uniques, numero, lignesUniques), ...(cadre ? { cadre } : {}) };
}

const plat = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Bande verticale du tableau des lignes sur une page lue (en pixels) : du titre des colonnes (ou de la première rangée
 * chiffrée, ou d'un mot de titre isolé) jusqu'aux totaux ; à défaut, le milieu de la page.
 */
export function bandeDuTableau(page: PageLue): { y0: number; y1: number } {
  const H = page.hauteur;
  const rs = page.rangees;
  const titre = rs.findIndex((r) => colonnesDuTitre(r) !== null);
  const motTitre = rs.findIndex((r) => /(designat|libelle|article|produit|quantit|\bqte\b|p\.?\s?u\b|prix\s+unit)/.test(plat(r.texte)));
  const chiffree = rs.findIndex((r) => r.mots.filter((m) => /\d[.,]\d{3}\)?$/.test(m.t)).length >= 2);
  // Une désignation suivie d'un montant au millime (le titre des colonnes peut manquer sur une photo).
  const article = rs.findIndex((r) => /\p{L}{3,}/u.test(r.texte) && /\d[.,]\d{3}\)?$/.test(r.mots[r.mots.length - 1]?.t ?? '')
    && !/(total|net\s*a|tva|timbre|tel|m\.?\s?f\b|capital|rib)/.test(plat(r.texte)));
  const debut = [titre, motTitre, chiffree, article].filter((i) => i >= 0).map((i) => rs[i].y0 - 3 * rs[i].hauteur);
  const y0 = Math.max(0, debut.length ? Math.min(...debut) : 0.25 * H);
  const fin = rs.find((r) => r.y0 > y0 + 4 * r.hauteur && /^(total|net\s*a\s*pay|sous[\s-]?total|arrete|montant\s*(ht|total))/.test(plat(r.texte).trim()));
  const y1 = Math.min(H, fin ? fin.y0 + 0.5 * fin.hauteur : 0.9 * H);
  return y1 - y0 > 0.05 * H ? { y0, y1 } : { y0: 0.25 * H, y1: 0.9 * H };
}

/** Passe « tableau » : la bande du tableau relue comme un seul bloc (les rangées n'y sont pas coupées en colonnes). */
export async function lireTableau(grise: Pixels, moteur: MoteurFacture, page: PageLue, numero = 1): Promise<PageLue> {
  const { y0, y1 } = bandeDuTableau(page);
  const { mots, lignes } = motsDeTesseract(await moteur.bloc(decouper(grise, 0, y0, grise.width, y1 - y0)));
  const places = mots.map((m) => ({ ...m, y0: m.y0 + y0, y1: m.y1 + y0 }));
  return { largeur: grise.width, hauteur: grise.height, rangees: construireRangees(places, numero, lignes), ...(page.cadre ? { cadre: page.cadre } : {}) };
}

/** Qualité d'une lecture des lignes : lignes dont le calcul se vérifie, puis lignes complètes. */
const qualite = (ls: LigneLue[]) => ls.filter((l) => l.controle === true).length * 1000 + ls.filter((l) => l.montant !== null).length;

/** Les lignes d'une lecture méritent-elles la passe « tableau » ? (aucune, un calcul faux, ou la somme ≠ HT lu) */
export function lignesDouteuses(e: EnteteLu): boolean {
  const ls = e.lignesFacture;
  if (!ls.length || ls.some((l) => l.controle !== true)) return true;
  const somme = ls.reduce((s, l) => s + (l.montant ?? 0), 0);
  return e.totaux.ht !== null && Math.abs(somme - e.totaux.ht) > 0.011 && Math.abs(somme - (e.totaux.ht + (e.totaux.remise ?? 0))) > 0.011;
}

/** Étape F5 : options de lecture d'une page d'image. */
export interface OptionsImage {
  /** « Recadrer », « Pivoter » ; absent : la feuille et l'orientation se cherchent seules. */
  preparation?: PreparationPage;
  /** Mise en page apprise du fournisseur, d'après son matricule lu (null : aucune). */
  modele?: (matricule: string) => Promise<MiseEnPage | null>;
  /** Passe par zones de l'en-tête et des totaux (false : page du milieu d'une facture longue). */
  entete?: boolean;
}

/**
 * Lit une image de facture : passe 1 ; passe 2 par zones si l'en-tête est incomplet ; si les lignes sont douteuses, la
 * mise en page connue du fournisseur (étape F5), puis la passe « tableau » (étape F3) — la meilleure lecture des lignes
 * est gardée. `suivi` reçoit un avancement de 0 à 1.
 */
export async function lireImageFacture(source: Source, moteur: MoteurFacture, client: Destinataire = {}, suivi: SuiviLecture = () => {}, options: OptionsImage = {}): Promise<EnteteLu> {
  const { page, grise, trajet } = await lirePageImage(source, moteur, 1, suivi, 0, 0.5, options.preparation);
  let entete = lireEntete([page], 'ocr', client);
  if (options.entete !== false && incomplete(entete)) {
    const zones = await lireZones(grise, moteur, 1, suivi, 0.5, 0.3, page.cadre);
    entete = completer(entete, lireEntete([zones], 'ocr', client));
  }
  // Étape F5 : la mise en page apprise du fournisseur (par son matricule lu) relit les rangées de la page.
  const modele = entete.matricule && options.modele && lignesDouteuses(entete)
    ? await options.modele(entete.matricule.valeur).catch(() => null) : null;
  if (modele) {
    const t = lireTableaux([page], 'ocr', modele);
    if (qualite(t.lignes) > qualite(entete.lignesFacture)) entete = { ...entete, lignesFacture: t.lignes, miseEnPageConnue: t.modeleEmploye };
  }
  if (lignesDouteuses(entete)) {
    suivi(ETAPE_OCR, 0.85);
    // Le tableau relu d'un bloc, sans son quadrillage : la passe « page entière » garde les traits (sans eux, son
    // analyse de mise en page perdait les colonnes étroites d'un tableau — quantité, TVA).
    const t = lireTableaux([await lireTableau(PREPARATION.traits ? effacerTraits(grise) : grise, moteur, page)], 'ocr', modele);
    if (qualite(t.lignes) > qualite(entete.lignesFacture)) {
      entete = { ...entete, lignesFacture: t.lignes, miseEnPageConnue: t.modeleEmploye, miseEnPage: entete.miseEnPage ?? t.miseEnPage };
    }
  }
  suivi(ETAPE_OCR, 1);
  return { ...entete, pages: entete.pages.map((p) => ({ ...p, trajet })) };
}
