// Couche « ocr » de la lecture de la patente (lot 3, étape 7) : extraction GÉOMÉTRIQUE des champs.
// Fonctions PURES (ni DOM ni tesseract) : elles ne partent que des mots reconnus (texte, cadre, confiance). Sur ces
// formulaires bilingues, une rangée porte le libellé français à gauche, la valeur au milieu et le libellé arabe à
// droite, reliés par des pointillés ; tesseract les éclate en plusieurs lignes et lit l'arabe en lettres latines. On
// reconstitue donc les rangées par recouvrement vertical, on retire les pointillés, et une valeur est le groupe de mots
// CONTIGUS après le libellé : l'arabe mal lu, séparé par un grand trou, est écarté. Sur une rangée SANS valeur, il peut
// rester seul : pour le nom ou la raison sociale, un groupe trop à droite, trop court ou trop peu sûr est donc refusé.
import type { TypeDocument } from '../types.ts';
import { cleCoherente, corrigerChiffres, matriculeLu, remettreALEndroit } from './matricule.ts';
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

// Caractères sans dessin : marques de sens d'écriture, et ceux que le serveur retire aussi d'une valeur (césure
// invisible, espaces et liants de largeur nulle). Laissés dans un mot, ils le feraient refuser en entier.
const INVISIBLES = /[\u{AD}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}\u{2066}-\u{2069}\u{FEFF}]/gu;

/** Résultat de tesseract.js (sortie « blocks ») → mots à plat, numérotés par ligne. */
export function motsDePage(page: BlocsTesseract): MotOcr[] {
  const mots: MotOcr[] = [];
  let li = 0;
  for (const bloc of page.blocks ?? []) {
    for (const paragraphe of bloc.paragraphs) {
      for (const ligne of paragraphe.lines) {
        li++;
        for (const m of ligne.words) mots.push({ t: m.text.replace(INVISIBLES, ''), c: Math.round(m.confidence), b: m.bbox, li });
      }
    }
  }
  return mots;
}

const ARABE = /[\u{0600}-\u{06FF}\u{0750}-\u{077F}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFF}]/u;
export const estArabe = (s: string): boolean => ARABE.test(s);
/** Points de conduite du formulaire, lus comme . … _ — - = ‘ etc. */
export const estPointilles = (s: string): boolean => /^[\s.…_—–\-=‘’'`",:;|!+*~°»«]+$/.test(s);

// Apostrophe typographique ENTRE DEUX LETTRES (« L’ETOILE ») : c'est une apostrophe, on la rend droite. En bord de mot,
// ‘ et ’ sont des restes de pointillés.
const apostrophesDroites = (s: string): string => s.replace(/(\p{L})[‘’](?=\p{L})/gu, "$1'");

/** Valeur débarrassée des pointillés : « SOCIETE.EXEMPLE » → « SOCIETE EXEMPLE », ponctuation isolée retirée. */
export function nettoyerValeur(s: string): string {
  return apostrophesDroites(s)
    .replace(/[…_—–=‘’`|]+/g, ' ')
    .replace(/(^|\s)[.\-:;,]+(?=\s|$)/g, ' ')
    .replace(/([A-Za-zÀ-ÿŒœ]{2,})\.(?=[A-Za-zÀ-ÿŒœ]{2,})/g, '$1 ')
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

// Alphabet d'une valeur : lettres latines (Œ compris : il s'imprime sur les factures), chiffres, ponctuation d'un nom
// ou d'une adresse.
const ALPHABET_VALEUR = /^[A-Za-zÀ-ÿŒœ0-9,()/'&.°+-]+$/;
const dansAlphabet = (m: MotOcr): boolean => ALPHABET_VALEUR.test(m.t);
const sansPointillesColles = (t: string): string => t.replace(/^[_…—–=.\-‘’'"+]+/, '').replace(/[_…—–=+]+$/, '').replace(/\.{2,}$/, '');
// Mot normalisé AVANT le contrôle de l'alphabet : apostrophe typographique rendue droite, trait d'union typographique
// ramené au trait d'union (comme au serveur), guillemets retirés en bord de mot — sans cela « L’ETOILE » ou « «LE »
// étaient refusés en entier, sans trace —, puis pointillés collés retirés.
const normaliserMot = (t: string): string =>
  sansPointillesColles(apostrophesDroites(t).replace(/[\u{2010}-\u{2012}\u{2212}]/gu, '-').replace(/^[«»“”"]+|[«»“”"]+$/g, ''));
// Bruit : mot court, peu sûr, en minuscules (reste de pointillés ou d'arabe).
const bruit = (m: MotOcr): boolean => m.c < 40 && m.t.length <= 2 && /[a-z]/.test(m.t);

// Mots d'une rangée situés entre xmin et xmax : sans pointillés, sans arabe, hors bruit — alphabet pas encore contrôlé.
function motsZone(rangee: Rangee, xmin: number, xmax: number): MotOcr[] {
  return rangee.mots
    .filter((m) => m.b.x0 >= xmin - 2 && m.b.x1 <= xmax && !estPointilles(m.t) && !estArabe(m.t))
    .map((m) => ({ ...m, t: normaliserMot(m.t) }))
    .filter((m) => m.t && !bruit(m));
}

/** Mots d'une rangée situés entre xmin et xmax : sans pointillés, sans arabe, hors bruit, dans l'alphabet d'une valeur. */
export function motsValeur(rangee: Rangee, xmin: number, xmax: number): MotOcr[] {
  return motsZone(rangee, xmin, xmax).filter(dansAlphabet);
}

// Lettres et chiffres d'un groupe ; un mot hors alphabet ne compte pas.
const richesse = (g: MotOcr[]): number => g.reduce((s, m) => s + (dansAlphabet(m) ? (m.t.match(/[A-Za-zÀ-ÿŒœ0-9]/g) ?? []).length : 0), 0);

/**
 * Une valeur est un groupe de mots CONTIGUS : on coupe aux grands trous (là où étaient les pointillés ou le libellé
 * arabe) et l'on garde le groupe le plus riche en lettres et en chiffres. `debutMax` : un groupe qui commence plus à
 * droite n'est pas une valeur (zone du libellé arabe).
 */
export function groupePrincipal(mots: MotOcr[], debutMax = Infinity): MotOcr[] {
  if (!mots.length) return [];
  const trouMax = 2.5 * mediane(mots.map((m) => m.b.y1 - m.b.y0));
  const groupes: MotOcr[][] = [[mots[0]]];
  for (let k = 1; k < mots.length; k++) {
    if (mots[k].b.x0 - mots[k - 1].b.x1 > trouMax) groupes.push([]);
    groupes[groupes.length - 1].push(mots[k]);
  }
  return groupes.filter((g) => g[0].b.x0 <= debutMax).sort((a, b) => richesse(b) - richesse(a))[0] ?? [];
}

// Groupe de mots d'une valeur. Le découpage en groupes se fait AVANT le contrôle de l'alphabet : un mot refusé au
// milieu d'une valeur (« CAFE #1 TUNIS ») ne la coupe plus en deux.
const groupeValeur = (rangee: Rangee, xmin: number, xmax: number, debutMax?: number): MotOcr[] =>
  groupePrincipal(motsZone(rangee, xmin, xmax), debutMax).filter(dansAlphabet);
const texteGroupe = (groupe: MotOcr[]): string => nettoyerValeur(groupe.map((m) => m.t).join(' '));

/** Valeur lue sur une rangée, entre xmin et xmax (libellé → valeur). */
export const texteValeur = (rangee: Rangee, xmin: number, xmax: number): string => texteGroupe(groupeValeur(rangee, xmin, xmax));

// Rangée sans valeur (personne physique : pas de raison sociale ; ou valeur non lue) : il reste parfois un bout de
// pointillés ou de libellé arabe lu en lettres latines. Une vraie valeur compte au moins 3 lettres ou chiffres, et soit
// un mot sûr (confiance 40), soit 6 lettres ou chiffres : une valeur juste peut tomber très bas en confiance.
const tropFaible = (groupe: MotOcr[]): boolean => richesse(groupe) < 3 || (richesse(groupe) < 6 && !groupe.some((m) => m.c >= 40));

/**
 * Photo couchée d'un quart de tour : tesseract lit quand même le texte vertical, mais les rangées n'ont plus de sens.
 * Signe : la plupart des mots sûrs (confiance 60, 3 caractères au moins) ont un cadre nettement plus haut que large.
 * Mesuré sur les deux documents de l'essai : aucun mot sur 30 à 50 pour une photo droite, 9 sur 10 pour une couchée.
 */
export function photoCouchee(mots: MotOcr[]): boolean {
  const surs = mots.filter((m) => m.c >= 60 && m.t.trim().length >= 3);
  const hauts = surs.filter((m) => m.b.y1 - m.b.y0 > 1.5 * (m.b.x1 - m.b.x0));
  return surs.length >= 5 && hauts.length > surs.length / 2;
}

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

/**
 * « 12 RUE DES JASMINS, Hammam Sousse, Hammam Sousse, Sousse, 4011 » → rue | localité | délégation | gouvernorat | code postal.
 * Quand le code postal est lu, la fin est fixe (localité, délégation, gouvernorat, code postal) : tout ce qui précède
 * est la rue, virgules comprises (« 12, RUE DES JASMINS »).
 */
export function decouperAdresse(valeur: string): AdresseDecoupee {
  const segments = valeur.split(',').map((s) => s.trim()).filter(Boolean);
  const decoupe: AdresseDecoupee = { complete: valeur, rue: '' };
  if (segments.length && /^\d{4}$/.test(segments[segments.length - 1])) decoupe.codePostal = segments.pop();
  if (segments.length >= 3) decoupe.gouvernorat = segments.pop();
  const nRue = decoupe.codePostal && segments.length > 3 ? segments.length - 2 : 1;
  decoupe.rue = segments.slice(0, nRue).join(', ');
  const localites: string[] = [];
  for (const s of segments.slice(nRue)) if (!localites.some((l) => l.toLowerCase() === s.toLowerCase())) localites.push(s);
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
  // La valeur commence avant 60 % de la largeur (au-delà : libellé arabe) et n'est pas un reste de bruit.
  const nom = (rangee: number, motifLibelle: RegExp): string => {
    const libelle = chercherMot(rangees[rangee], motifLibelle);
    const groupe = libelle ? groupeValeur(rangees[rangee], libelle.b.x1, droite, largeur * 0.6) : [];
    return tropFaible(groupe) ? '' : texteGroupe(groupe);
  };
  let i = chercherRangee(rangees, /raison\s+socia/i);
  if (i >= 0) {
    const v = retirerPoints(nom(i, /socia/i));
    if (v) lu.raisonSociale = v;
  }
  if (!lu.raisonSociale) {
    i = chercherRangee(rangees, /Nom\s+et\s+pr/i);
    const v = i >= 0 ? nom(i, /pr[ée]nom/i) : '';
    if (v) lu.raisonSociale = v;
  }

  // Adresse : la valeur est sur la rangée du libellé « Adresse » et/ou sur la suivante. Le libellé peut être collé aux
  // pointillés ou précédé de bruit de bord de page.
  i = rangees.findIndex((r) => r.mots.slice(0, 3).some((m) => /^Adr/i.test(m.t)) && !/Activit/i.test(r.texte));
  if (i >= 0) {
    // La rangée du libellé ne porte souvent que des pointillés, parfois lus en lettres ou en chiffres : un morceau
    // court est du bruit — moins de 6 caractères sans chiffre, ou moins de 6 lettres ou chiffres sans aucun mot sûr
    // (confiance 40). Un morceau plus long est gardé même peu sûr : c'est le début de la rue, ou l'adresse entière.
    const libelle = chercherMot(rangees[i], /^Adr/i);
    const groupe = libelle ? groupeValeur(rangees[i], libelle.b.x1, droite) : [];
    let v = texteGroupe(groupe);
    if ((!/\d/.test(v) && v.length < 6) || (richesse(groupe) < 6 && !groupe.some((m) => m.c >= 40))) v = '';
    const activite = chercherRangee(rangees, /Activit[ée]\s+princip/i, i + 1);
    const suivantes = rangees.slice(i + 1, activite > 0 ? activite : i + 3).map((r) => texteValeur(r, 0, droite)).filter((s) => /\d|,/.test(s));
    v = [v, ...suivantes].filter(Boolean).join(', ');
    if (v) lu.adresse = decouperAdresse(v);
  } else {
    // Repli, SEULEMENT si le libellé n'a pas été trouvé : entre « raison sociale » et « Activité principale », la rangée
    // qui ressemble le plus à une adresse — un code postal à 4 chiffres ET au moins une virgule. Une rangée dont les
    // virgules sont mal lues (points-virgules, tirets) donnerait rue, ville et code postal collés : elle n'est pas
    // proposée. Si le mot « Adresse » est sur la rangée, la valeur commence après lui : il n'entre jamais dans la rue.
    const debut = chercherRangee(rangees, /raison|socia/i), fin = chercherRangee(rangees, /Activit[ée]\s+princip/i);
    if (debut >= 0 && fin > debut) {
      const candidates = rangees.slice(debut + 1, fin).map((r) => texteValeur(r, chercherMot(r, /^Adresse/i)?.b.x1 ?? 0, droite))
        .map((s) => ({ s, virgules: (s.match(/,/g) ?? []).length }))
        .filter((c) => c.virgules >= 1 && /\b\d{4}\b/.test(c.s)).sort((a, b) => b.virgules - a.virgules);
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
  /** Identifiant unique : 7 chiffres + lettre-clé (commun au RNE et au fisc), lettre cohérente avec les chiffres. */
  identifiant?: string;
  /** Lu, mais la lettre-clé n'est pas celle que donnent les 7 chiffres : jamais proposé, seulement cité à l'admin. */
  identifiantIncoherent?: string;
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

  // Identifiant : 7 chiffres + lettre, n'importe où sur la rangée. La lettre-clé n'est jamais « corrigée » : elle est
  // contrôlée par le calcul (à basse résolution, A se lit B, et les deux ont la forme d'une lettre-clé).
  const iIdentifiant = chercherRangee(rangees, /Identifiant/i);
  if (iIdentifiant >= 0) {
    const brut = rangees[iIdentifiant].mots.map((m) => m.t.replace(/[^0-9A-Za-z|!]/g, '')).find((t) => /^[0-9ODQIl|!ZSGTB]{7}[A-Z]$/.test(t));
    const lecture = brut ? matriculeLu(corrigerChiffres(brut.slice(0, 7)) + brut[7]) : null;
    if (lecture && cleCoherente(lecture)) lu.identifiant = lecture;
    else if (lecture) lu.identifiantIncoherent = lecture;
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

const ALPHABET_LIGNE = /^[A-Za-zÀ-ÿŒœ0-9,()/'&.°+:-]+$/;

/**
 * Texte reconnu d'une rangée, pour l'affichage : lettres latines seulement, pointillés retirés ('' si rien d'utile).
 * Pas de tri par confiance : d'une lecture à l'autre, un mot juste peut tomber très bas. L'arabe lu en lettres latines
 * peut donc rester dans ce texte ; il n'entre jamais dans un champ.
 */
export function ligneLue(rangee: Rangee): string {
  const mots = rangee.mots
    .filter((m) => !estPointilles(m.t) && !estArabe(m.t))
    .map((m) => ({ ...m, t: normaliserMot(m.t) }))
    .filter((m) => m.t && ALPHABET_LIGNE.test(m.t) && !bruit(m));
  return nettoyerValeur(mots.map((m) => m.t).join(' '));
}
