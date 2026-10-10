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
import { construireRangees, motsDeTesseract } from './rangees.ts';
import type { BlocsTesseract } from './rangees.ts';
import type { Destinataire, EnteteLu, Mot, PageLue, SuiviLecture } from './types.ts';

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
/** Plus grand côté de la page lue : une facture A4 photographiée à 4000 px est réduite, un scan de 1000 px agrandi. */
export const COTE_LU = 2400;
const ANGLE_MIN = 0.004; // en radians (~0,2°) : en dessous, on ne tourne pas

async function normaliser(source: Source): Promise<Pixels> {
  const echelle = Math.min(3, Math.max(0.3, COTE_LU / Math.max(source.largeur, source.hauteur)));
  const rgba = await source.extraire(
    { left: 0, top: 0, width: source.largeur, height: source.hauteur },
    Math.round(source.largeur * echelle), Math.round(source.hauteur * echelle),
  );
  return etirer(gris(rgba));
}

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
  };
  // Les avertissements de la première lecture qui ne valent plus (numéro, date, totaux retrouvés) sont retirés.
  r.avertissements = a.avertissements.filter((m) => !((/^Numéro/.test(m) && r.numero) || (/^Date/.test(m) && r.date)
    || (/^Totaux lus/.test(m) && totauxB) || (/matricule fiscal lu/i.test(m) && r.matricule)));
  return r;
}

/** Une page d'image → ses rangées (coordonnées de la page lue, redressée), et l'image lue (pour la passe 2). */
export async function lirePageImage(
  source: Source, moteur: MoteurFacture, numero = 1, suivi: SuiviLecture = () => {}, debut = 0, part = 1,
): Promise<{ page: PageLue; grise: Pixels; angle: number }> {
  suivi(ETAPE_OCR, debut + part * 0.05);
  let grise = await normaliser(source);
  const angle = await moteur.angle(grise);
  if (Math.abs(angle) >= ANGLE_MIN) grise = await normaliser(await source.tourner(angle));
  suivi(ETAPE_OCR, debut + part * 0.25);
  const { mots, lignes } = motsDeTesseract(await moteur.page(grise));
  suivi(ETAPE_OCR, debut + part);
  return { page: { largeur: grise.width, hauteur: grise.height, rangees: construireRangees(mots, numero, lignes) }, grise, angle };
}

/** Passe 2 : les zones de la page, chacune lue comme un bloc ; les mots sont remis dans les coordonnées de la page. */
export async function lireZones(grise: Pixels, moteur: MoteurFacture, numero = 1, suivi: SuiviLecture = () => {}, debut = 0, part = 1): Promise<PageLue> {
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
  return { largeur: grise.width, hauteur: grise.height, rangees: construireRangees(uniques, numero, lignesUniques) };
}

/**
 * Lit l'en-tête d'une image de facture : passe 1, puis passe 2 par zones si quelque chose manque.
 * `suivi` reçoit un avancement de 0 à 1.
 */
export async function lireImageFacture(source: Source, moteur: MoteurFacture, client: Destinataire = {}, suivi: SuiviLecture = () => {}): Promise<EnteteLu> {
  const { page, grise } = await lirePageImage(source, moteur, 1, suivi, 0, 0.6);
  let entete = lireEntete([page], 'ocr', client);
  if (incomplete(entete)) {
    const zones = await lireZones(grise, moteur, 1, suivi, 0.6, 0.4);
    entete = completer(entete, lireEntete([zones], 'ocr', client));
  }
  suivi(ETAPE_OCR, 1);
  return entete;
}
