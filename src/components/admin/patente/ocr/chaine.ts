// Couche « ocr » de la lecture de la patente (lot 3, étape 7) : la chaîne de lecture, du document aux champs.
// Sans DOM ni tesseract : l'image (`Source`) et la reconnaissance (`Moteur`) sont fournies par l'appelant — un canvas et
// tesseract.js dans le navigateur (lireOcr.ts). Chaîne validée par l'essai du 04/10/2026 :
//   passe 0  redressement (l'analyse de mise en page donne l'angle, la source est tournée) ;
//   passe 1  page entière en gris normalisé ; une photo couchée d'un quart de tour s'arrête là, sans aucun champ ;
//            sinon type du document et extraction géométrique ;
//   carte d'identification fiscale : passe « bande du matricule » — 24 lectures (2 binarisations × 4 échelles ×
//            3 cadrages), glyphe par glyphe avec l'alphabet attendu, puis vote : identifiant et lettre-clé sur les
//            lectures dont la lettre est cohérente avec les 7 chiffres, fin du matricule sur toutes les lectures
//            complètes ; fin indécise → l'identifiant seul ;
//   carte auto-entrepreneur (texte blanc sur bleu) : deuxième passe sur le canal rouge inversé, pour combler un vide
//            et signaler les désaccords.
// Les textes rendus (avertissements, notes) sont affichés tels quels à l'admin : phrases courtes, sans jargon.
import { texteChamp } from '../types.ts';
import type { ChampIdentite, ChampLu, ResultatCouche, SuiviLecture } from '../types.ts';
import {
  cadreBande, construireRangees, extraireCarteAutoEntrepreneur, extraireCarteFiscale, ligneLue, photoCouchee, reconnaitreDocument,
} from './extraction.ts';
import type { MotOcr, Zone } from './extraction.ts';
import { ALPHABET_CLE, CHIFFRES, CODES_CATEGORIE, CODES_TVA, cleCoherente, voterMatricule } from './matricule.ts';
import type { CandidatMatricule, VoteMatricule } from './matricule.ts';
import { binariser, couperEnJetons, decouperGlyphes, etirer, gris, inverser, nettoyerBande, seuilOtsu } from './pixels.ts';
import type { Cadre, Glyphes, Pixels } from './pixels.ts';

/** Image du document : découpe rééchantillonnée et rotation (un canvas dans le navigateur). */
export interface Source {
  largeur: number;
  hauteur: number;
  /** Zone de la source ramenée à `largeur` × `hauteur` pixels, en RGBA, sur fond blanc. */
  extraire(zone: Zone, largeur: number, hauteur: number): Pixels | Promise<Pixels>;
  /** La même image tournée de `radians` dans le sens horaire, agrandie pour tout contenir, sur fond blanc. */
  tourner(radians: number): Source | Promise<Source>;
}

/** Reconnaissance de caractères (tesseract.js, modèle « fra ») sur des images en niveaux de gris. */
export interface Moteur {
  /** Passe 0 : angle des lignes de texte, en radians (analyse de mise en page seule, sans reconnaissance). */
  angle(image: Pixels): Promise<number>;
  /** Page entière : mots reconnus, avec cadre, confiance et numéro de ligne. */
  page(image: Pixels): Promise<MotOcr[]>;
  /** Un jeton de la bande du matricule : une ligne de texte ou un caractère seul, dans l'alphabet attendu. */
  jeton(image: Pixels, mode: 'ligne' | 'caractere', alphabet: string): Promise<string>;
}

export const ETAPE = 'Reconnaissance des caractères…';
const CONSEIL = "Déposez plutôt l'original, à plat, sans ombre, plus de 1500 px de large.";
export const PHOTO_COUCHEE = 'La photo semble couchée : redressez-la, puis recommencez.';
// Notes affichées sous le champ : la lettre-clé est contrôlée par le calcul, la fin du matricule ne l'est pas.
const NOTE_CLE = 'Lettre-clé cohérente avec les 7 chiffres.';
const noteMatricule = (matricule: string): string => `Lettre-clé cohérente avec les 7 chiffres ; relisez la fin (${matricule.slice(8)}).`;
// Fin indécise : seuls les 8 premiers caractères sont posés. « /A/M/000 » montre la forme à compléter, pas une lecture.
const NOTE_FIN_NON_LUE = "Fin du matricule (/A/M/000) non lue : complétez-la d'après la carte.";

const COTE_NORMAL = 2000; // plus grand côté de la page lue : une photo de 4000 px est réduite, une capture de 900 px agrandie
const ANGLE_MIN = 0.005; // en radians (~0,3°) : en dessous, on ne tourne pas
const ANGLE_FRAGILE = 5; // en degrés : au-delà, le matricule devient incertain même redressé
const LARGEUR_SURE = 1500; // en pixels

// Bande du matricule : échelles visant des glyphes de 26 à 32 px de haut (zone où la lecture est stable), trois
// décalages verticaux du cadrage et deux binarisations (globale et locale) : des lectures variées pour le vote.
const HAUTEURS_CIBLES = [26, 28, 30, 32];
const DECALAGES = [-3, 0, 3];
const BINARISATIONS = ['otsu', 'sauvola'] as const;

interface PageLue {
  rgba: Pixels;
  grise: Pixels;
  /** Pixels de la page lue par pixel de la source. */
  echelle: number;
}

async function normaliser(source: Source): Promise<PageLue> {
  const echelle = Math.min(2.5, Math.max(0.4, COTE_NORMAL / Math.max(source.largeur, source.hauteur)));
  const rgba = await source.extraire(
    { left: 0, top: 0, width: source.largeur, height: source.hauteur },
    Math.round(source.largeur * echelle), Math.round(source.hauteur * echelle),
  );
  return { rgba, grise: etirer(gris(rgba)), echelle };
}

/** Une lecture de la bande, valeur par valeur : « 1234567R/A/M/000 », ou null si les quatre valeurs ne sont pas isolées. */
async function lireBande(moteur: Moteur, bande: Glyphes): Promise<string | null> {
  if (bande.glyphes.length < 4) return null;
  // Ordre imprimé, de gauche à droite : établissement | catégorie | TVA | matricule.
  const [etablissement, categorie, tva, matricule] = couperEnJetons(bande.glyphes, 4);
  const lire = async (glyphes: Cadre[], mode: 'ligne' | 'caractere', alphabet: string): Promise<string> =>
    (await moteur.jeton(decouperGlyphes(bande.image, glyphes), mode, alphabet)).replace(/\s/g, '');
  // Une lettre hors des codes usuels est relue avec l'alphabet restreint.
  const code = async (glyphes: Cadre[], codes: string): Promise<string> => {
    const lettre = await lire(glyphes, 'caractere', ALPHABET_CLE);
    return lettre.length === 1 && codes.includes(lettre) ? lettre : lire(glyphes, 'caractere', codes);
  };
  const lu = {
    etablissement: await lire(etablissement, 'ligne', CHIFFRES),
    categorie: await code(categorie, CODES_CATEGORIE),
    tva: await code(tva, CODES_TVA),
    identifiant: matricule.length > 1 ? await lire(matricule.slice(0, -1), 'ligne', CHIFFRES) : '',
    cle: await lire(matricule.slice(-1), 'caractere', ALPHABET_CLE), // lettres seules : jamais « corrigée », contrôlée par le calcul
  };
  return `${lu.identifiant}${lu.cle}/${lu.tva}/${lu.categorie}/${lu.etablissement}`;
}

async function lireBandes(source: Source, moteur: Moteur, zone: Zone, avance: (part: number) => void): Promise<(string | null)[]> {
  // Canal max : l'encre colorée des tampons devient claire, l'encre noire reste noire.
  const bande = async (z: Zone, facteur: number, binarisation: 'otsu' | 'sauvola'): Promise<Glyphes> =>
    nettoyerBande(gris(await source.extraire(z, Math.round(z.width * facteur), Math.round(z.height * facteur)), 'max'), binarisation);
  const hauteurGlyphe = (await bande(zone, 1, 'otsu')).hauteurGlyphe; // calibrage, à l'échelle 1
  const total = BINARISATIONS.length * HAUTEURS_CIBLES.length * DECALAGES.length;
  const lectures: (string | null)[] = [];
  for (const binarisation of BINARISATIONS) {
    for (const cible of HAUTEURS_CIBLES) {
      for (const decalage of DECALAGES) {
        const top = Math.max(0, zone.top + decalage);
        const cadrage = { ...zone, top, height: Math.min(zone.height, source.hauteur - top) };
        lectures.push(await lireBande(moteur, await bande(cadrage, cible / hauteurGlyphe, binarisation)));
        avance(lectures.length / total);
      }
    }
  }
  return lectures;
}

// « 1234567R/A/M/000 » → ordre imprimé sur la carte : « 000 M A 1234567R ».
const ordreImprime = (matricule: string): string => matricule.split('/').reverse().join(' ');

// Matricule non rempli : les lectures sont citées (trois au plus), celles dont la lettre-clé est cohérente d'abord.
// `lecturePage` : la rangée lue avec le reste de la page — peu fiable, une lecture de plus, jamais une voix.
function matriculeNonRempli(vote: VoteMatricule, lecturePage: string | undefined): string {
  const lectures: CandidatMatricule[] = [...vote.candidats];
  if (lecturePage && !lectures.some((c) => c.valeur === lecturePage)) lectures.push({ valeur: lecturePage, voix: 1, cleCoherente: cleCoherente(lecturePage) });
  if (!lectures.length) return 'Matricule fiscal illisible : saisissez-le à la main, en relisant la lettre-clé.';
  const citer = (liste: CandidatMatricule[]): string => liste.slice(0, 3).map((c) => `${c.valeur} (${c.voix} lecture${c.voix > 1 ? 's' : ''})`).join(', ');
  const coherentes = lectures.filter((c) => c.cleCoherente);
  return coherentes.length
    ? `Matricule fiscal indécis, non rempli. Lectures : ${citer(coherentes)}. Relisez-le sur le document.`
    : `Matricule fiscal non rempli : la lettre-clé lue ne correspond pas aux 7 chiffres. Lectures : ${citer(lectures)}. Relisez-le sur le document.`;
}

// Ce qui diffère entre deux lectures d'une même valeur (les mots communs du début et de la fin sont retirés).
function ecart(a: string, b: string): [string, string] {
  const A = a.split(' '), B = b.split(' ');
  let debut = 0;
  while (debut < A.length && debut < B.length && A[debut] === B[debut]) debut++;
  let fin = 0;
  while (fin < A.length - debut && fin < B.length - debut && A[A.length - 1 - fin] === B[B.length - 1 - fin]) fin++;
  const ea = A.slice(debut, A.length - fin).join(' '), eb = B.slice(debut, B.length - fin).join(' ');
  return ea && eb ? [ea, eb] : [a, b];
}

/** Lit le document : type, champs de la fiche (tous « à relire »), texte reconnu et mises en garde. */
export async function lireDocument(source: Source, moteur: Moteur, suivi: SuiviLecture = () => {}): Promise<ResultatCouche> {
  const champs: Partial<Record<ChampIdentite, ChampLu>> = {};
  const avertissements: string[] = [];
  // Toute valeur passe par texteChamp : une valeur non imprimable (arabe) n'est jamais proposée.
  const poser = (champ: ChampIdentite, valeur: string | undefined, note?: string): void => {
    const v = texteChamp(valeur);
    if (v) champs[champ] = note ? { valeur: v, source: 'ocr', aRelire: true, note } : { valeur: v, source: 'ocr', aRelire: true };
  };

  // Passe 0 : redressement. Sans lui, une photo inclinée de 5° n'est même pas reconnue.
  suivi(ETAPE, 0.1);
  let page = await normaliser(source);
  const angle = await moteur.angle(page.grise);
  let droite = source;
  if (Math.abs(angle) >= ANGLE_MIN) {
    droite = await source.tourner(angle);
    page = await normaliser(droite);
  }
  suivi(ETAPE, 0.25);

  // Passe 1 : page entière, en gris normalisé.
  const mots = await moteur.page(page.grise);
  suivi(ETAPE, 0.55);
  const largeur = page.grise.width;
  const { rangees, hauteurMediane } = construireRangees(mots);
  let lignes = rangees.map(ligneLue);
  // Photo couchée d'un quart de tour : le titre se lit encore, mais les rangées se mélangent et les champs sortiraient
  // faux. On s'arrête avant d'extraire : aucun champ, le texte lu tel quel, et la marche à suivre.
  if (photoCouchee(mots)) {
    suivi(ETAPE, 1);
    return { document: 'inconnu', champs, lignes: lignes.filter(Boolean), avertissements: [PHOTO_COUCHEE] };
  }
  const texte = mots.map((m) => m.t).join(' ');
  const document = reconnaitreDocument(texte);

  if (document === 'carte_fiscale') {
    const lu = extraireCarteFiscale(rangees, largeur);
    poser('raisonSociale', lu.raisonSociale);
    poser('adresse', lu.adresse?.rue);
    poser('ville', [lu.adresse?.codePostal, lu.adresse?.ville].filter(Boolean).join(' '));
    // La passe 1 ne lit jamais bien la rangée du matricule (le filet du tableau barre le haut des valeurs) : on relit
    // la bande dans l'image d'origine, et l'on ne remplit le champ que si assez de lectures à lettre-clé cohérente
    // s'accordent. La fin du matricule (/TVA/catégorie/établissement) n'a pas de clé : la note demande de la relire ;
    // si les lectures ne s'accordent pas sur elle, seul l'identifiant est posé et la note demande de la compléter.
    const zone = cadreBande(rangees, hauteurMediane, largeur, page.echelle, droite);
    const vote = voterMatricule(zone ? await lireBandes(droite, moteur, zone, (part) => suivi(ETAPE, 0.55 + 0.45 * part)) : []);
    if (vote.matricule) poser('matriculeFiscal', vote.matricule, noteMatricule(vote.matricule));
    else if (vote.identifiant) poser('matriculeFiscal', vote.identifiant, NOTE_FIN_NON_LUE);
    else avertissements.push(matriculeNonRempli(vote, lu.matriculePage));
    // Texte affiché : la rangée du matricule lue par la passe 1 est fausse, on montre à sa place la lecture retenue.
    const tableau = lu.tableau;
    const retenu = vote.matricule ?? vote.identifiant;
    if (tableau) {
      lignes = rangees.flatMap((r, i) => {
        if (i > tableau.entete && i < tableau.nom) return [];
        return i === tableau.entete && retenu ? [ligneLue(r), ordreImprime(retenu)] : [ligneLue(r)];
      });
    }
  } else if (document === 'carte_auto_entrepreneur') {
    const l1 = extraireCarteAutoEntrepreneur(rangees, largeur);
    // Passe 2 : canal rouge inversé (le texte blanc devient noir, le fond bleu devient clair), puis noir et blanc.
    const rouge = etirer(inverser(gris(page.rgba, 'rouge')));
    const l2 = extraireCarteAutoEntrepreneur(construireRangees(await moteur.page(binariser(rouge, seuilOtsu(rouge)))).rangees, largeur);
    // La passe 1 est la plus robuste ; la passe 2 comble un vide, et un désaccord est signalé.
    type Cle = 'prenom' | 'nom' | 'identifiant' | 'adresse';
    const differe = (c: Cle): boolean => Boolean(l1[c] && l2[c] && l1[c] !== l2[c]);
    const signaler = (c: Cle, libelle: string): string | undefined => {
      if (!differe(c)) return undefined;
      const [a, b] = ecart(l1[c] as string, l2[c] as string);
      avertissements.push(`${libelle} : deux lectures différentes (« ${a} » / « ${b} »). À relire.`);
      return `Deuxième lecture : « ${b} ».`;
    };
    const notePrenom = signaler('prenom', 'Prénom'), noteNom = signaler('nom', 'Nom');
    const titulaire = [l1.prenom || l2.prenom, l1.nom || l2.nom].filter(Boolean).join(' ');
    const noteTitulaire = [notePrenom, noteNom].filter(Boolean).join(' ') || undefined;
    poser('raisonSociale', titulaire, noteTitulaire);
    poser('representantNom', titulaire, noteTitulaire);
    poser('formeJuridique', 'AUTO_ENTREPRENEUR');
    // Identifiant : la lettre-clé se confond à basse résolution (A/B). Seule une lecture dont la lettre est cohérente
    // avec les 7 chiffres est proposée ; une lecture incohérente est seulement citée.
    const identifiant = l1.identifiant || l2.identifiant;
    const incoherents = [...new Set([l1.identifiantIncoherent, l2.identifiantIncoherent])].filter((v): v is string => Boolean(v));
    if (differe('identifiant')) {
      avertissements.push(`Identifiant indécis, non rempli. Lectures : ${l1.identifiant}, ${l2.identifiant}. Relisez-le sur la carte.`);
    } else if (identifiant) {
      poser('matriculeFiscal', identifiant, NOTE_CLE);
      poser('rne', identifiant, NOTE_CLE);
    } else if (incoherents.length) {
      avertissements.push(`Identifiant non rempli : la lettre-clé lue ne correspond pas aux 7 chiffres. Lecture${incoherents.length > 1 ? 's' : ''} : ${incoherents.join(', ')}. Relisez-le sur la carte.`);
    } else {
      avertissements.push('Identifiant unique illisible : saisissez-le à la main, en relisant la lettre-clé.');
    }
    const passeAdresse = l1.adresse ? l1 : l2;
    poser('adresse', passeAdresse.adresse, signaler('adresse', 'Adresse'));
    poser('ville', passeAdresse.ville);
  } else if (/Registre\s+National/i.test(texte)) {
    avertissements.push("Extrait du RNE en image : déposez plutôt le PDF d'origine, il se lit sans erreur.");
  } else {
    avertissements.push(`Document non reconnu : seules la carte d'identification fiscale et la carte auto-entrepreneur se lisent en image. Si la photo est couchée ou à l'envers, redressez-la. ${CONSEIL}`);
  }

  // Qualité de la photo : au-delà de ces limites, les lectures restent possibles mais deviennent fragiles.
  const defauts: string[] = [];
  const degres = Math.abs((angle * 180) / Math.PI);
  if (degres > ANGLE_FRAGILE) defauts.push(`inclinée (${Math.round(degres)}°)`);
  if (source.largeur < LARGEUR_SURE) defauts.push(`petite (${source.largeur} px de large)`);
  if (document !== 'inconnu') {
    if (defauts.length) avertissements.push(`Image ${defauts.join(' et ')} : lecture moins sûre. ${CONSEIL}`);
    else if (Object.keys(champs).length < 3) avertissements.push(`Peu de champs lus. ${CONSEIL}`);
  }

  suivi(ETAPE, 1);
  return { document, champs, lignes: lignes.filter(Boolean), avertissements };
}
