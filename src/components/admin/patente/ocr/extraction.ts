// Couche « ocr » de la lecture de la patente (lot 3, étape 7) : extraction GÉOMÉTRIQUE des champs.
// Fonctions PURES (ni DOM ni tesseract) : elles ne partent que des mots reconnus (texte, cadre, confiance). Sur ces
// formulaires bilingues, une rangée porte le libellé français à gauche, la valeur au milieu et le libellé arabe à
// droite, reliés par des pointillés ; tesseract les éclate en plusieurs lignes et lit l'arabe en lettres latines. On
// reconstitue donc les rangées par recouvrement vertical, on retire les pointillés, et une valeur est le groupe de mots
// CONTIGUS après le libellé : l'arabe mal lu, séparé par un grand trou, n'est jamais proposé.
import type { TypeDocument } from '../types.ts';
import { corrigerChiffres, matriculeLu, remettreALEndroit } from './matricule.ts';
import type { Cadre } from './pixels.ts';

/** Mot reconnu : texte, confiance (0 à 100), cadre en pixels, numéro de la ligne tesseract (facultatif). */
export interface MotOcr {
  t: string;
  c: number;
  b: Cadre;
  li?: number;
}

/** Rangée du formulaire : mots de gauche à droite. */
export interface Rangee {
  mots: MotOcr[];
  texte: string;
  y0: number;
  y1: number;
  cy: number;
}

/** Zone d'une image, en pixels. */
export interface Zone {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BlocsTesseract {
  blocks: { paragraphs: { lines: { words: { text: string; confidence: number; bbox: Cadre }[] }[] }[] }[] | null;
}

const BIDI = /[\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/gu;

/** Résultat de tesseract.js (sortie « blocks ») → mots à plat, numérotés par ligne. */
export function motsDePage(page: BlocsTesseract): MotOcr[] {
  const mots: MotOcr[] = [];
  let li = 0;
  for (const bloc of page.blocks ?? []) {
    for (const paragraphe of bloc.paragraphs) {
      for (const ligne of paragraphe.lines) {
        li++;
        for (const m of ligne.words) mots.push({ t: m.text.replace(BIDI, ''), c: Math.round(m.confidence), b: m.bbox, li });
      }
    }
  }
  return mots;
}

const ARABE = /[\u{0600}-\u{06FF}\u{0750}-\u{077F}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFF}]/u;
export const estArabe = (s: string): boolean => ARABE.test(s);
/** Points de conduite du formulaire, lus comme . … _ — - = ‘ etc. */
export const estPointilles = (s: string): boolean => /^[\s.…_—–\-=‘’'`",:;|!+*~°»«]+$/.test(s);

/** Valeur débarrassée des pointillés : « SOCIETE.EXEMPLE » → « SOCIETE EXEMPLE », ponctuation isolée retirée. */
export function nettoyerValeur(s: string): string {
  return s
    .replace(/[…_—–=‘’`|]+/g, ' ')
    .replace(/(^|\s)[.\-:;,]+(?=\s|$)/g, ' ')
    .replace(/([A-Za-zÀ-ÿ]{2,})\.(?=[A-Za-zÀ-ÿ]{2,})/g, '$1 ')
    .replace(/^[\s.\-:,]+|[\s.\-:,]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Pointillés restés à l'intérieur d'une valeur : « DE. » → « DE » (jamais pour une adresse : « Av. »).
const retirerPoints = (s: string): string => s.replace(/\.(?=\s|$)/g, '').replace(/\s{2,}/g, ' ').trim();

const croissant = (a: number, b: number): number => a - b;
const mediane = (v: number[]): number => [...v].sort(croissant)[Math.floor(v.length / 2)];

/**
 * Regroupe les mots en rangées : on part des lignes de tesseract (elles suivent déjà une légère inclinaison) et l'on
 * fusionne celles qui se recouvrent verticalement à plus de 50 % (libellé, valeur, libellé arabe).
 */
export function construireRangees(mots: MotOcr[]): { rangees: Rangee[]; hauteurMediane: number } {
  const utiles = mots.filter((m) => m.t && m.t.trim());
  const hauteurMediane = (utiles.length && mediane(utiles.map((m) => m.b.y1 - m.b.y0))) || 10;
  const parLigne = new Map<number | string, MotOcr[]>();
  utiles.forEach((m, i) => {
    const cle = m.li ?? `mot-${i}`; // sans numéro de ligne, chaque mot est sa propre ligne
    const ligne = parLigne.get(cle);
    if (ligne) ligne.push(m); else parLigne.set(cle, [m]);
  });
  const lignes = [...parLigne.values()].map((l) => {
    const y0 = mediane(l.map((m) => m.b.y0)), y1 = mediane(l.map((m) => m.b.y1));
    return { mots: l, y0, y1, cy: (y0 + y1) / 2 };
  }).sort((a, b) => a.cy - b.cy);
  const groupes: { cy: number; y0: number; y1: number; mots: MotOcr[] }[] = [];
  for (const l of lignes) {
    let meilleur: (typeof groupes)[number] | null = null;
    let part = 0;
    for (const g of groupes) {
      const recouvrement = Math.min(g.y1, l.y1) - Math.max(g.y0, l.y0);
      const ratio = recouvrement / Math.min(g.y1 - g.y0, l.y1 - l.y0);
      if (ratio > 0.5 && ratio > part) { meilleur = g; part = ratio; }
    }
    if (meilleur) meilleur.mots.push(...l.mots); else groupes.push({ cy: l.cy, y0: l.y0, y1: l.y1, mots: [...l.mots] });
  }
  const rangees = groupes.map((g) => {
    const ms = [...g.mots].sort((a, b) => a.b.x0 - b.b.x0);
    return { mots: ms, texte: ms.map((m) => m.t).join(' '), y0: Math.min(...ms.map((m) => m.b.y0)), y1: Math.max(...ms.map((m) => m.b.y1)), cy: g.cy };
  }).sort((a, b) => a.cy - b.cy);
  return { rangees, hauteurMediane };
}

const ALPHABET_VALEUR = /^[A-Za-zÀ-ÿ0-9,()/'&.°-]+$/;
const sansPointillesColles = (t: string): string => t.replace(/^[_…—–=.\-‘’'"]+/, '').replace(/[_…—–=]+$/, '').replace(/\.{2,}$/, '');
// Bruit : mot court, peu sûr, en minuscules (reste de pointillés ou d'arabe).
const bruit = (m: MotOcr): boolean => m.c < 40 && m.t.length <= 2 && /[a-z]/.test(m.t);

/** Mots d'une rangée situés entre xmin et xmax : sans pointillés, sans arabe, hors bruit. */
export function motsValeur(rangee: Rangee, xmin: number, xmax: number): MotOcr[] {
  return rangee.mots
    .filter((m) => m.b.x0 >= xmin - 2 && m.b.x1 <= xmax && !estPointilles(m.t) && !estArabe(m.t))
    .map((m) => ({ ...m, t: sansPointillesColles(m.t) }))
    .filter((m) => m.t && ALPHABET_VALEUR.test(m.t) && !bruit(m));
}

/**
 * Une valeur est un groupe de mots CONTIGUS : on coupe aux grands trous (là où étaient les pointillés ou le libellé
 * arabe) et l'on garde le groupe le plus riche en lettres et en chiffres.
 */
export function groupePrincipal(mots: MotOcr[]): MotOcr[] {
  if (mots.length < 2) return mots;
  const trouMax = 2.5 * mediane(mots.map((m) => m.b.y1 - m.b.y0));
  const groupes: MotOcr[][] = [[mots[0]]];
  for (let k = 1; k < mots.length; k++) {
    if (mots[k].b.x0 - mots[k - 1].b.x1 > trouMax) groupes.push([]);
    groupes[groupes.length - 1].push(mots[k]);
  }
  const richesse = (g: MotOcr[]): number => g.reduce((s, m) => s + (m.t.match(/[A-Za-zÀ-ÿ0-9]/g) ?? []).length, 0);
  return groupes.sort((a, b) => richesse(b) - richesse(a))[0];
}

/** Valeur lue sur une rangée, entre xmin et xmax (libellé → valeur). */
export const texteValeur = (rangee: Rangee, xmin: number, xmax: number): string =>
  nettoyerValeur(groupePrincipal(motsValeur(rangee, xmin, xmax)).map((m) => m.t).join(' '));

const chercherRangee = (rangees: Rangee[], motif: RegExp, depuis = 0): number => {
  for (let i = Math.max(0, depuis); i < rangees.length; i++) if (motif.test(rangees[i].texte)) return i;
  return -1;
};
const chercherMot = (rangee: Rangee, motif: RegExp): MotOcr | undefined => rangee.mots.find((m) => motif.test(m.t));

/** Type du document, par mots-clés du titre. */
export function reconnaitreDocument(texte: string): TypeDocument {
  if (/Identification\s+Fiscale/i.test(texte)) return 'carte_fiscale';
  if (/Auto\s*-?\s*Entrepreneur/i.test(texte)) return 'carte_auto_entrepreneur';
  return 'inconnu';
}

export interface AdresseDecoupee {
  complete: string;
  rue: string;
  ville?: string;
  codePostal?: string;
  gouvernorat?: string;
}

/** « 12 RUE DES JASMINS, Hammam Sousse, Hammam Sousse, Sousse, 4011 » → rue | localité | délégation | gouvernorat | code postal. */
export function decouperAdresse(valeur: string): AdresseDecoupee {
  const segments = valeur.split(',').map((s) => s.trim()).filter(Boolean);
  const decoupe: AdresseDecoupee = { complete: valeur, rue: '' };
  if (segments.length && /^\d{4}$/.test(segments[segments.length - 1])) decoupe.codePostal = segments.pop();
  if (segments.length >= 3) decoupe.gouvernorat = segments.pop();
  decoupe.rue = segments[0] ?? '';
  const localites: string[] = [];
  for (const s of segments.slice(1)) if (!localites.some((l) => l.toLowerCase() === s.toLowerCase())) localites.push(s);
  const ville = localites[localites.length - 1] ?? decoupe.gouvernorat;
  if (ville) decoupe.ville = ville;
  return decoupe;
}

/** Rangées du tableau « N° établissement | Code Catégorie | Code TVA | Matricule Fiscal » : en-tête, puis « Nom et prénom ». */
function tableauMatricule(rangees: Rangee[]): { entete: number; nom: number } | null {
  const entete = rangees.findIndex((r) => /Code/i.test(r.texte) && /TVA|Matricule|Cat/i.test(r.texte));
  if (entete < 0) return null;
  const nom = rangees.findIndex((r, i) => i > entete && /Nom|raison|pr[ée]nom/i.test(r.texte));
  return nom > entete ? { entete, nom } : null;
}

export interface LectureCarteFiscale {
  raisonSociale?: string;
  adresse?: AdresseDecoupee;
  /** Lus, mais sans champ dans la fiche. */
  activite?: string;
  regime?: string;
  /**
   * Rangée du matricule lue par la passe « page entière », remise à l'endroit. PEU FIABLE (le filet du tableau barre le
   * haut des valeurs) : jamais proposée pour le champ, seulement citée parmi les candidats quand le vote échoue.
   */
  matriculePage?: string;
  /** Indices des rangées « en-tête du tableau » et « Nom et prénom » : les valeurs du matricule sont entre les deux. */
  tableau?: { entete: number; nom: number };
}

/** Carte d'identification fiscale : `largeur` est celle de l'image lue (au-delà de 80 % : libellés arabes). */
export function extraireCarteFiscale(rangees: Rangee[], largeur: number): LectureCarteFiscale {
  const lu: LectureCarteFiscale = {};
  const droite = largeur * 0.8;
  const apres = (i: number, motifLibelle: RegExp): string => {
    const libelle = chercherMot(rangees[i], motifLibelle);
    return libelle ? texteValeur(rangees[i], libelle.b.x1, droite) : '';
  };

  const regime = rangees.map((r) => r.texte.match(/R[ÉE]GIME\s+([A-ZÉÈ]+)/i)).find(Boolean);
  if (regime) lu.regime = `RÉGIME ${regime[1].toUpperCase().replace('REEL', 'RÉEL')}`;

  const tableau = tableauMatricule(rangees);
  if (tableau) {
    lu.tableau = tableau;
    const aPlat = matriculeLu(remettreALEndroit(rangees.slice(tableau.entete + 1, tableau.nom).map((r) => r.texte).join(' ')));
    if (aPlat) lu.matriculePage = aPlat;
  }

  // Raison sociale : rangée du libellé « ou raison sociale » ; à défaut « Nom et prénom » (personne physique).
  let i = chercherRangee(rangees, /raison\s+socia/i);
  if (i >= 0) {
    const v = retirerPoints(apres(i, /socia/i));
    if (v) lu.raisonSociale = v;
  }
  if (!lu.raisonSociale) {
    i = chercherRangee(rangees, /Nom\s+et\s+pr/i);
    const v = i >= 0 ? apres(i, /pr[ée]nom/i) : '';
    if (v.length > 2) lu.raisonSociale = v;
  }

  // Adresse : la valeur est sur la rangée du libellé « Adresse » et/ou sur la suivante. Le libellé peut être collé aux
  // pointillés ou précédé de bruit de bord de page.
  i = rangees.findIndex((r) => r.mots.slice(0, 3).some((m) => /^Adr/i.test(m.t)) && !/Activit/i.test(r.texte));
  if (i >= 0) {
    let v = apres(i, /^Adr/i);
    if (!/\d/.test(v) && v.length < 6) v = ''; // bruit sur la rangée du libellé
    const activite = chercherRangee(rangees, /Activit[ée]\s+princip/i, i + 1);
    const suivantes = rangees.slice(i + 1, activite > 0 ? activite : i + 3).map((r) => texteValeur(r, 0, droite)).filter((s) => /\d|,/.test(s));
    v = [v, ...suivantes].filter(Boolean).join(', ');
    if (v) lu.adresse = decouperAdresse(v);
  }
  if (!lu.adresse) {
    // Repli : libellé illisible → entre « raison sociale » et « Activité principale », la rangée qui ressemble le plus à
    // une adresse (virgules et code postal à 4 chiffres).
    const debut = chercherRangee(rangees, /raison|socia/i), fin = chercherRangee(rangees, /Activit[ée]\s+princip/i);
    if (debut >= 0 && fin > debut) {
      const candidates = rangees.slice(debut + 1, fin).map((r) => texteValeur(r, 0, droite))
        .map((s) => ({ s, note: (s.match(/,/g) ?? []).length + (/\b\d{4}\b/.test(s) ? 3 : 0) }))
        .filter((c) => c.note >= 3).sort((a, b) => b.note - a.note);
      if (candidates.length) lu.adresse = decouperAdresse(candidates[0].s);
    }
  }

  i = chercherRangee(rangees, /Activit[ée]\s+princip/i);
  if (i >= 0) {
    let v = apres(i, /princip/i);
    const date = v.match(/\(?\s*(\d{2}\/\d{2}\/\d{4})\s*\)?\s*$/); // date de début, imprimée après l'activité
    if (date) v = v.slice(0, date.index).trim();
    if (v) lu.activite = retirerPoints(v);
  }
  return lu;
}

/**
 * Cadre de la bande du matricule dans l'image SOURCE : sous l'en-tête du tableau, au-dessus de « Nom et prénom ».
 * Les rangées sont en pixels de l'image lue (source × `echelle`). La hauteur est plafonnée : la rangée « Nom et
 * prénom » peut être mal lue, et le rééchantillonnage d'un canvas déplace un peu les cadres.
 */
export function cadreBande(
  rangees: Rangee[], hauteurMediane: number, largeur: number, echelle: number, source: { largeur: number; hauteur: number },
): Zone | null {
  const tableau = tableauMatricule(rangees);
  if (!tableau) return null;
  const entete = rangees[tableau.entete];
  const reperes = entete.mots.filter((m) => /second|Cat|Code|TVA|Matric|Fisc|N°/i.test(m.t));
  if (!reperes.length) return null;
  const x0 = Math.max(0, (Math.min(...reperes.map((m) => m.b.x0)) - 2 * hauteurMediane) / echelle);
  const x1 = Math.min(largeur, Math.max(...reperes.map((m) => m.b.x1)) + 3 * hauteurMediane) / echelle;
  const y0 = (entete.y1 + 2) / echelle;
  const hauteur = Math.min(rangees[tableau.nom].y0 - 4 - entete.y1, 5.5 * hauteurMediane) / echelle;
  const left = Math.round(x0), top = Math.round(y0);
  return {
    left, top,
    width: Math.min(Math.round(x1 - x0), source.largeur - left),
    height: Math.min(Math.max(10, Math.round(hauteur)), source.hauteur - top),
  };
}

export interface LectureCarteAutoEntrepreneur {
  prenom?: string;
  nom?: string;
  /** Identifiant unique : 7 chiffres + lettre-clé (commun au RNE et au fisc). */
  identifiant?: string;
  /** Lue, mais sans champ dans la fiche. */
  activite?: string;
  adresse?: string;
  ville?: string;
}

/** Carte auto-entrepreneur : colonne latine à gauche (jusqu'à 56 % de la `largeur` de l'image lue), arabe à droite. */
export function extraireCarteAutoEntrepreneur(rangees: Rangee[], largeur: number): LectureCarteAutoEntrepreneur {
  const lu: LectureCarteAutoEntrepreneur = {};
  const milieu = largeur * 0.56;
  const apres = (motifRangee: RegExp, motifLibelle: RegExp): { i: number; v: string } | null => {
    const i = chercherRangee(rangees, motifRangee);
    if (i < 0) return null;
    const libelle = chercherMot(rangees[i], motifLibelle) ?? rangees[i].mots[0];
    return { i, v: nettoyerValeur(motsValeur(rangees[i], libelle.b.x1 + 1, milieu).map((m) => m.t).join(' ')) };
  };
  const prenom = apres(/Pr[ée]nom/i, /Pr[ée]nom/i);
  if (prenom?.v) lu.prenom = prenom.v;
  const nom = apres(/^\s*Nom\b/i, /^Nom/i);
  if (nom?.v) lu.nom = nom.v;

  // Identifiant : 7 chiffres + lettre, n'importe où sur la rangée. La lettre-clé n'est jamais « corrigée ».
  const iIdentifiant = chercherRangee(rangees, /Identifiant/i);
  if (iIdentifiant >= 0) {
    const brut = rangees[iIdentifiant].mots.map((m) => m.t.replace(/[^0-9A-Za-z|!]/g, '')).find((t) => /^[0-9ODQIl|!ZSGTB]{7}[A-Z]$/.test(t));
    const identifiant = brut ? matriculeLu(corrigerChiffres(brut.slice(0, 7)) + brut[7]) : null;
    if (identifiant) lu.identifiant = identifiant;
  }

  const activite = apres(/Activit[ée]\s*:/i, /Activit/i);
  if (activite?.v && !/Adresse/i.test(rangees[activite.i].texte)) lu.activite = activite.v;

  // Adresse sur plusieurs rangées : de « Adresse Activité » jusqu'à « Date Édition », colonne latine.
  const iAdresse = chercherRangee(rangees, /Adresse\s+Activit/i);
  const iDate = chercherRangee(rangees, /Date\s+[ÉE]dition/i);
  const libelle = iAdresse >= 0 ? chercherMot(rangees[iAdresse], /Activit/i) : undefined;
  if (libelle) {
    const x0 = libelle.b.x1 + 1;
    const morceaux: string[] = [];
    for (let k = iAdresse; k < (iDate > 0 ? iDate : rangees.length); k++) {
      if (k > iAdresse && /Date|[ÉE]dition/i.test(rangees[k].texte)) break;
      const brut = motsValeur(rangees[k], k === iAdresse ? x0 : x0 - largeur * 0.03, milieu)
        .filter((m) => !/^\d{2}\/\d{2}\/\d{4}$/.test(m.t)).map((m) => m.t).join(' ');
      // La virgule de fin de rangée (« Bloc 2, ») est gardée : nettoyerValeur la retirerait.
      const s = nettoyerValeur(brut) + (/,\s*$/.test(brut) ? ',' : '');
      if (s && s !== ',') morceaux.push(s);
    }
    const adresse = morceaux.join(' ').replace(/\s+,/g, ',').replace(/,(?=\S)/g, ', ').replace(/,$/, '');
    if (adresse) {
      lu.adresse = adresse;
      const segments = adresse.split(',').map((s) => s.trim()).filter(Boolean);
      if (segments.length > 1) lu.ville = segments[segments.length - 1];
    }
  }
  return lu;
}

const ALPHABET_LIGNE = /^[A-Za-zÀ-ÿ0-9,()/'&.°:-]+$/;

/**
 * Texte reconnu d'une rangée, pour l'affichage : lettres latines seulement, pointillés retirés ('' si rien d'utile).
 * Pas de tri par confiance : d'une lecture à l'autre, un mot juste peut tomber très bas. L'arabe lu en lettres latines
 * peut donc rester dans ce texte ; il n'entre jamais dans un champ.
 */
export function ligneLue(rangee: Rangee): string {
  const mots = rangee.mots
    .filter((m) => !estPointilles(m.t) && !estArabe(m.t))
    .map((m) => ({ ...m, t: sansPointillesColles(m.t) }))
    .filter((m) => m.t && ALPHABET_LIGNE.test(m.t) && !bruit(m));
  return nettoyerValeur(mots.map((m) => m.t).join(' '));
}
