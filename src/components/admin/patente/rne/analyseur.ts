// Extrait RNE (lot 3, étape 7) — lecture PAR POSITIONS de la couche texte d'un extrait du Registre national des
// entreprises. Fonctions PURES : ni pdfjs, ni DOM (testées par scripts/patente-rne.test.mjs) ; lireTextePdf.ts leur
// donne les morceaux de texte positionnés et les cases à cocher. Portage de l'essai du 04/10/2026.
//
// Principe : on ne se fie JAMAIS à l'ordre du flux du PDF (l'extrait dessine tous les libellés d'un bloc, puis les
// valeurs). On regroupe les morceaux en lignes (même y), puis on apparie chaque libellé FRANÇAIS à sa valeur par la
// position. Quatre dispositions fixes sur l'extrait :
//   bloc principal        libellé français à gauche, valeur sur la MÊME ligne à droite (l'arabe est sur la ligne au-dessus)
//   grille et en-tête     valeur À GAUCHE d'un libellé empilé (arabe au-dessus, français dessous)
//   tableau de direction  en-têtes sur une ligne, valeurs rangées par colonne sur les lignes suivantes (en arabe)
//   cases à cocher        dessins (dessins.ts) ; le libellé d'une case est le texte le plus proche à sa gauche
// Arabe : un morceau par glyphe, en formes de présentation et en ordre visuel → tri par x décroissant puis NFKC.
// Il ne sert qu'à reconnaître (libellés, tables de correspondance) : aucune valeur arabe n'est proposée ni affichée.
import type { ChampIdentite, ChampLu, LectureTextePdf } from '../types.ts';
import { texteChamp } from '../types.ts';
import {
  decouperAdresse, estArabe, formeJuridiqueVersCode, nationaliteVersFrancais, normaliser, qualiteVersFrancais,
  typeRegistreVersFrancais,
} from './tables.ts';

/** Morceau de texte positionné (repère PDF : origine en bas à gauche, en points). */
export interface Morceau {
  str: string;
  x: number;
  y: number;
  largeur: number;
}

/** Case à cocher repérée dans les dessins d'une page (boîte en points). */
export interface CaseACocher {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cochee: boolean;
}

export interface PageTexte {
  largeur: number;
  hauteur: number;
  morceaux: Morceau[];
  /** Cases à cocher de la page ; null ou absent : dessins non lus (l'état du registre est alors signalé « non lu »). */
  cases?: CaseACocher[] | null;
}

export interface LigneTexte<T extends Morceau = Morceau> {
  y: number;
  items: T[];
}

/** Lien officiel de vérification d'un extrait. Constante : jamais repris du document qu'on cherche à vérifier. */
export const LIEN_VERIFICATION_RNE = 'https://www.registre-entreprises.tn/rne-public/#/qr-code/validation';
export const NOTE_MATRICULE_RACINE = "racine seulement : le complément (/A/M/000) figure sur la carte d'identification fiscale";

const RE_IDENTIFIANT = /^\d{7}[A-Z]$/;
const RE_CODE_VERIFICATION = /^[A-Z0-9]{14}$/;
const AVEC_LETTRE = /\p{L}/u;
// Bas de page (pagination, adresse et téléphone du registre lui-même) : hors du texte reconnu.
const PIED_DE_PAGE = 0.12;
// En dessous, la page n'a pas de couche texte exploitable (PDF scanné).
const CARACTERES_MIN = 30;

const estBlanc = (s: string): boolean => s.trim() === '';

// ── 1. Mise en page : lignes, jointure latine, reconstruction de l'arabe ───────────────────────────────────────────

/** Regroupe les morceaux en lignes (même y à `tolerance` près), de haut en bas ; dans une ligne, de gauche à droite. */
export function regrouperEnLignes<T extends Morceau>(morceaux: readonly T[], tolerance = 2.6): LigneTexte<T>[] {
  const tri = morceaux.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lignes: LigneTexte<T>[] = [];
  for (const m of tri) {
    let meilleure: LigneTexte<T> | null = null;
    for (const L of lignes) {
      const ecart = Math.abs(L.y - m.y);
      if (ecart <= tolerance && (!meilleure || ecart < Math.abs(meilleure.y - m.y))) meilleure = L;
    }
    if (!meilleure) {
      meilleure = { y: m.y, items: [] };
      lignes.push(meilleure);
    }
    meilleure.items.push(m);
  }
  for (const L of lignes) L.items.sort((a, b) => a.x - b.x);
  return lignes.sort((a, b) => b.y - a.y);
}

/** Jointure de morceaux latins, de gauche à droite : une espace quand l'écart horizontal dépasse 1 pt. */
export function joindre(morceaux: readonly Morceau[]): string {
  let s = '';
  let prec: Morceau | null = null;
  for (const m of morceaux.filter((i) => !estBlanc(i.str)).sort((a, b) => a.x - b.x)) {
    if (prec && m.x - (prec.x + prec.largeur) > 1) s += ' ';
    s += m.str;
    prec = m;
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Texte arabe d'une suite de morceaux : lecture de droite à gauche (x décroissant), puis NFKC (formes de présentation
 * → lettres). pdf.js remet déjà dans l'ordre logique les morceaux de plusieurs glyphes.
 */
export function reconstruireArabe(morceaux: readonly Morceau[]): string {
  const s = morceaux.slice().sort((a, b) => b.x - a.x).map((i) => i.str).join('');
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

interface Item extends Morceau {
  blanc: boolean;
  ar: boolean;
}
type Ligne = LigneTexte<Item>;
interface Page {
  numero: number;
  hauteur: number;
  items: Item[];
  lignes: Ligne[];
  cases: CaseACocher[] | null;
}

function preparer(pages: readonly PageTexte[]): Page[] {
  return pages.map((p, k) => {
    const items: Item[] = p.morceaux
      .filter((m) => typeof m.str === 'string' && m.str !== '')
      .map((m) => ({ str: m.str, x: m.x, y: m.y, largeur: m.largeur, blanc: estBlanc(m.str), ar: estArabe(m.str) }));
    return { numero: k + 1, hauteur: p.hauteur, items, lignes: regrouperEnLignes(items), cases: p.cases ?? null };
  });
}

// Suites de morceaux voisins (écart horizontal ≤ ecartMax) : un libellé écrit en plusieurs morceaux.
function segments(items: readonly Item[], ecartMax: number): Item[][] {
  const res: Item[][] = [];
  let prec: Item | null = null;
  for (const it of items.slice().sort((a, b) => a.x - b.x)) {
    if (prec && it.x - (prec.x + prec.largeur) <= ecartMax) res[res.length - 1].push(it);
    else res.push([it]);
    prec = it;
  }
  return res;
}

// ── 2. Libellés de l'extrait (modèle « société ») et leur disposition ──────────────────────────────────────────────
//   droite : « Libellé: valeur » sur la même ligne      empile : valeur à gauche d'un libellé empilé
//   auto   : « droite », puis « empile » s'il n'y a rien à droite (l'identifiant unique existe sous les deux formes)
export type CleRne =
  | 'identifiantUnique' | 'dateEdition' | 'numeroExtrait' | 'typeRegistre' | 'numeroGestion'
  | 'denomination' | 'nomCommercial' | 'enseigne' | 'adresseSiege' | 'adresseActivite' | 'formeJuridique'
  | 'capital' | 'duree' | 'datePublication' | 'activitePrincipale' | 'codeActivite' | 'dateDebutActivite';

interface DefChamp {
  cle: CleRne;
  /** Libellé français normalisé (sans accents, en majuscules). */
  libelle: RegExp;
  mode: 'droite' | 'empile' | 'auto';
  multiLigne?: boolean;
  jointure?: string;
}

const CHAMPS: DefChamp[] = [
  { cle: 'identifiantUnique', libelle: /^IDENTIFIANT UNIQUE$/, mode: 'auto' },
  { cle: 'dateEdition', libelle: /^DATE D'EDITION DE L'EXTRAIT$/, mode: 'empile' },
  { cle: 'numeroExtrait', libelle: /^NUMERO EXTRAIT$/, mode: 'empile' },
  { cle: 'typeRegistre', libelle: /^TYPE DE REGISTRE$/, mode: 'empile' },
  { cle: 'numeroGestion', libelle: /^N.? ?DE GESTION INTERNE$/, mode: 'empile' },
  { cle: 'denomination', libelle: /^DENOMINATION SOCIALE ?:?$/, mode: 'droite' },
  { cle: 'nomCommercial', libelle: /^NOM COMMERCIAL ?:?$/, mode: 'droite' },
  { cle: 'enseigne', libelle: /^ENSEIGNE ?:?$/, mode: 'droite' },
  { cle: 'adresseSiege', libelle: /^ADRESSE DU SIEGE SOCIAL ?:?$/, mode: 'droite', multiLigne: true, jointure: ' ' },
  { cle: 'adresseActivite', libelle: /^ADRESSE ACTIVITE ?:?$/, mode: 'droite', multiLigne: true, jointure: ' ' },
  { cle: 'formeJuridique', libelle: /^FORME JURIDIQUE ?:?$/, mode: 'droite', multiLigne: true, jointure: ' ' },
  { cle: 'capital', libelle: /^CAPITAL SOCIAL ?:?$/, mode: 'droite' },
  { cle: 'duree', libelle: /^DUREE DE L'ENTREPRISE ?:?$/, mode: 'droite' },
  { cle: 'datePublication', libelle: /^DATE DE PUBLICATION ?:?$/, mode: 'droite' },
  { cle: 'activitePrincipale', libelle: /^ACTIVITE PRINCIPALE ?:?$/, mode: 'droite', multiLigne: true },
  { cle: 'codeActivite', libelle: /^CODE ACTIVITE PRINCIPALE ?:?$/, mode: 'droite' },
  { cle: 'dateDebutActivite', libelle: /^DATE DEBUT ACTIVITE ?:?$/, mode: 'droite' },
];
// Autres libellés de l'extrait : ils ne donnent pas de champ, mais ils arrêtent la lecture d'une valeur.
const AUTRES_LIBELLES = [/^NOM ET PRENOM$/, /^NATIONALITE$/, /^QUALITE$/, /^ETAT DU REGISTRE$/, /^EFFECTIF$/, /^LEASING$/, /^NANTISSEMENT$/];
const estLibelle = (texte: string): boolean => {
  const n = normaliser(texte);
  return CHAMPS.some((c) => c.libelle.test(n)) || AUTRES_LIBELLES.some((r) => r.test(n));
};

interface Jumeau {
  items: Item[];
  y: number;
  x0: number;
  x1: number;
}
interface Libelle {
  def: DefChamp;
  membres: Item[];
  x0: number;
  x1: number;
  y: number;
  ligne: Ligne;
  page: Page;
  /** Libellé arabe posé juste au-dessus du libellé français (dispositions empilées). */
  jumeau: Jumeau | null;
}
interface Valeur {
  valeur: string;
  morceaux: Item[];
  arabe: boolean;
}
const SANS_VALEUR: Valeur = { valeur: '', morceaux: [], arabe: false };

// Libellés d'une ligne : jusqu'à 4 morceaux latins qui se suivent (« DATE D'ÉDITION DE » + « L'EXTRAIT »).
function trouverLibelles(L: Ligne, page: Page): Libelle[] {
  const latins = L.items.filter((i) => !i.blanc && !i.ar);
  const trouves: Libelle[] = [];
  for (let a = 0; a < latins.length; a++) {
    for (let b = a; b < Math.min(latins.length, a + 4); b++) {
      const suite = latins.slice(a, b + 1);
      const n = normaliser(joindre(suite));
      const fin = suite[suite.length - 1];
      for (const def of CHAMPS) {
        if (def.libelle.test(n)) trouves.push({ def, membres: suite, x0: suite[0].x, x1: fin.x + fin.largeur, y: L.y, ligne: L, page, jumeau: null });
      }
    }
  }
  return trouves;
}

function jumeauArabe(lab: Libelle): Jumeau | null {
  const items = lab.page.items.filter((i) => i.ar && i.y > lab.y + 3 && i.y <= lab.y + 16 && i.x + i.largeur >= lab.x0 - 30 && i.x <= lab.x1 + 30);
  if (!items.length) return null;
  return { items, y: Math.max(...items.map((i) => i.y)), x0: Math.min(...items.map((i) => i.x)), x1: Math.max(...items.map((i) => i.x + i.largeur)) };
}

// Valeur à droite du libellé, sur sa ligne. Barrières : une lettre arabe, un « : » isolé, un autre libellé — une
// valeur absente ressort vide, sans prendre le voisin.
function valeurDroite(lab: Libelle): Valeur {
  const L = lab.ligne;
  const morceaux: Item[] = [];
  for (const it of L.items) {
    if (it.x < lab.x1 - 0.5 || it.blanc || lab.membres.includes(it)) continue;
    if (it.ar || it.str.trim() === ':' || estLibelle(it.str)) break;
    morceaux.push(it);
  }
  if (!morceaux.length) return SANS_VALEUR;
  const textes = [joindre(morceaux)];
  if (lab.def.multiLigne) {
    // la valeur déborde sur la ligne suivante : reprise seulement si elle est alignée sur le début de la valeur,
    // sans lettre arabe et sans libellé
    const x0 = morceaux[0].x;
    let yPrec = L.y;
    for (const suivante of lab.page.lignes) {
      if (suivante.y >= L.y) continue;
      if (yPrec - suivante.y > 22) break;
      const pleins = suivante.items.filter((i) => !i.blanc);
      if (!pleins.length) continue;
      if (pleins.some((i) => i.ar || estLibelle(i.str)) || Math.abs(pleins[0].x - x0) > 4) break;
      textes.push(joindre(pleins));
      yPrec = suivante.y;
    }
  }
  return { valeur: textes.join(lab.def.jointure ?? ' ; ').replace(/\s*:\s*$/, '').trim(), morceaux, arabe: false };
}

// Valeur d'un libellé empilé : entre la ligne arabe et la ligne française, à gauche du libellé, sans dépasser le
// libellé voisin de gauche.
function valeurEmpilee(lab: Libelle, tous: readonly Libelle[]): Valeur {
  const jumeau = lab.jumeau;
  if (!jumeau) return SANS_VALEUR;
  const bordDroit = Math.min(lab.x0, jumeau.x0);
  let bordGauche = 0;
  for (const autre of tous) {
    if (autre === lab || autre.page !== lab.page || Math.abs(autre.y - lab.y) > 3) continue;
    const fin = Math.max(autre.x1, autre.jumeau ? autre.jumeau.x1 : -Infinity);
    if (fin <= bordDroit + 0.5) bordGauche = Math.max(bordGauche, fin);
  }
  const dansZone = (i: Item): boolean =>
    !jumeau.items.includes(i) && i.y > lab.y + 2 && i.y <= jumeau.y + 2 && i.x >= bordGauche - 0.5 && i.x + i.largeur <= bordDroit + 0.5;
  const morceaux = lab.page.items.filter((i) => !i.blanc && dansZone(i));
  if (!morceaux.length) return SANS_VALEUR;
  const arabe = morceaux.some((i) => i.ar) && morceaux.every((i) => i.ar || /^[\d\s]+$/.test(i.str));
  const texte = arabe ? reconstruireArabe(lab.page.items.filter(dansZone)) : joindre(morceaux.filter((i) => !i.ar));
  return { valeur: texte.replace(/\s*:\s*$/, '').trim(), morceaux, arabe };
}

// ── 3. Reconnaissance du document ──────────────────────────────────────────────────────────────────────────────────
export interface Reconnaissance {
  /** Au moins 3 marqueurs, dont le titre « EXTRAIT RNE » ou le domaine du registre. */
  estExtraitRne: boolean;
  /** Type lu dans la parenthèse du titre, normalisé (« SOCIETE ») ; '' s'il est absent. */
  type: string;
  marqueurs: string[];
  nbCaracteres: number;
}

function reconnaitrePages(pages: readonly Page[]): Reconnaissance {
  const nbCaracteres = pages.reduce((n, p) => n + p.items.reduce((s, i) => s + i.str.replace(/\s/g, '').length, 0), 0);
  // texte dans l'ordre de LECTURE (lignes reconstruites), pas dans l'ordre du flux
  const latin = normaliser(pages.flatMap((p) => p.lignes.map((L) => joindre(L.items.filter((i) => !i.ar)))).filter(Boolean).join(' '));
  const arabe = pages.flatMap((p) => p.lignes.map((L) => reconstruireArabe(L.items.filter((i) => i.ar || i.blanc)))).join('\n');
  const marqueurs: string[] = [];
  if (/EXTRAIT RNE/.test(latin)) marqueurs.push('titre');
  if (/REGISTRE-ENTREPRISES\.TN/.test(latin)) marqueurs.push('domaine');
  if (/QR-CODE\/VALIDATION/.test(latin)) marqueurs.push('lien de validation');
  if (/IDENTIFIANT UNIQUE \d{7}[A-Z]\b/.test(latin)) marqueurs.push('identifiant unique');
  if (/\bER\d{8,}\b/.test(latin) && /NUMERO EXTRAIT/.test(latin)) marqueurs.push('numéro extrait');
  if (/السجل الوطني للمؤسسات/.test(arabe)) marqueurs.push('nom arabe du registre');
  if (/رقم التثبت/.test(arabe)) marqueurs.push('code de vérification');
  if (/TUNTRUST/.test(latin)) marqueurs.push('cachet TUNTRUST');
  const fort = marqueurs.includes('titre') || marqueurs.includes('domaine');
  const titre = /EXTRAIT RNE \(([^)]+)\)/.exec(latin);
  return { estExtraitRne: nbCaracteres >= CARACTERES_MIN && fort && marqueurs.length >= 3, type: titre ? titre[1].trim() : '', marqueurs, nbCaracteres };
}

/** Le document est-il un extrait RNE ? (PDF sans couche texte ou autre document : `estExtraitRne` à false.) */
export function reconnaitre(pages: readonly PageTexte[]): Reconnaissance {
  return reconnaitrePages(preparer(pages));
}

// ── 4. Analyse complète ────────────────────────────────────────────────────────────────────────────────────────────
export interface Representant {
  /** Textes lus dans le tableau de la direction (arabe reconstruit, ou latin). */
  qualiteLue: string;
  nationaliteLue: string;
  nomLu: string;
  /** Qualité en français ('' si elle n'est pas dans la table). */
  qualite: string;
  nationalite: string;
  /** Nom proposé : seulement s'il est écrit en lettres latines imprimables, sinon ''. */
  nom: string;
}

export interface CaseLue {
  page: number;
  libelle: string;
  cochee: boolean;
}

export interface EtatRegistre {
  actif: boolean;
  suspendu: boolean;
  radie: boolean;
}

export interface AnalyseRne {
  reconnaissance: Reconnaissance;
  /** Valeur retenue pour chaque libellé de l'extrait ('' : libellé absent ou valeur vide). Peut être en arabe. */
  valeurs: Record<CleRne, string>;
  /** Libellés dont les occurrences ne concordent pas (l'identifiant est répété en tête de chaque page). */
  divergents: CleRne[];
  /** Code lu à côté du libellé arabe du code de vérification, sans contrôle de forme ('' s'il est absent). */
  codeVerification: string;
  formeJuridiqueArabe: string;
  representants: Representant[];
  /** Cases à cocher et leur libellé ; null : dessins non lus. */
  cases: CaseLue[] | null;
  /** État du registre ; null : cases « ACTIF / SUSPENDU / REGISTRE RADIÉ » non lues. */
  etat: EtatRegistre | null;
  /** Texte latin reconnu, ligne par ligne, dans l'ordre de lecture (jamais d'arabe). */
  lignes: string[];
}

interface Fragment {
  x: number;
  texte: string;
}
interface CaseLibellee extends CaseLue {
  x: number;
  items: Item[];
  ligne: Ligne | null;
}

const LIBELLE_CODE_AR = 'رقم التثبت';
const LIBELLE_FORME_AR = 'الشكل القانوني';
const EN_ARABE = "en arabe sur l'extrait";

export function analyserExtraitRne(pagesTexte: readonly PageTexte[]): AnalyseRne {
  const pages = preparer(pagesTexte);
  const reconnaissance = reconnaitrePages(pages);

  // Texte reconnu : les lectures « par disposition » posent une entrée lisible sur leur ligne et retirent leurs
  // morceaux du texte brut (une valeur empilée ne se lit pas de gauche à droite).
  const consommes = new Set<Item>();
  const entrees = new Map<Ligne, Fragment[]>();
  const ajouter = (ligne: Ligne, x: number, texte: string): void => {
    const liste = entrees.get(ligne);
    if (liste) liste.push({ x, texte });
    else entrees.set(ligne, [{ x, texte }]);
  };
  const consommer = (items: readonly Item[]): void => {
    for (const i of items) consommes.add(i);
  };

  // 4a. libellés français et leur valeur
  const libelles: Libelle[] = [];
  for (const page of pages) for (const L of page.lignes) libelles.push(...trouverLibelles(L, page));
  for (const lab of libelles) lab.jumeau = jumeauArabe(lab);
  const occurrences = new Map<CleRne, string[]>();
  for (const lab of libelles) {
    const { def } = lab;
    let lue = def.mode === 'empile' ? SANS_VALEUR : valeurDroite(lab);
    let empilee = false;
    if (def.mode !== 'droite' && !lue.valeur) {
      lue = valeurEmpilee(lab, libelles);
      empilee = true;
    }
    const liste = occurrences.get(def.cle);
    if (liste) liste.push(lue.valeur);
    else occurrences.set(def.cle, [lue.valeur]);
    // texte reconnu : « LIBELLÉ : valeur » quand la valeur est empilée ou que le libellé n'a pas ses deux-points
    const texteLibelle = joindre(lab.membres);
    if (empilee || !/:$/.test(texteLibelle)) {
      consommer(lab.membres);
      consommer(lue.morceaux);
      const montree = lue.arabe ? (def.cle === 'typeRegistre' ? typeRegistreVersFrancais(lue.valeur) : '') : lue.valeur;
      ajouter(lab.ligne, lab.x0, `${texteLibelle} : ${montree}`.trim());
    }
  }
  const valeurs = {} as Record<CleRne, string>;
  const divergents: CleRne[] = [];
  for (const def of CHAMPS) {
    const distinctes = [...new Set((occurrences.get(def.cle) ?? []).filter(Boolean))];
    valeurs[def.cle] = distinctes[0] ?? '';
    if (distinctes.length > 1) divergents.push(def.cle);
  }

  // 4b. lignes repérées par leur libellé ARABE (pas de libellé français) : code de vérification, forme juridique en
  //     arabe (secours de la table des formes) ; lien de vérification
  let codeVerification = '';
  let formeJuridiqueArabe = '';
  for (const page of pages) {
    for (const L of page.lignes) {
      const latins = L.items.filter((i) => !i.ar && !i.blanc);
      if (/registre-entreprises\.tn\/rne-public/i.test(joindre(latins))) {
        consommer(latins);
        ajouter(L, latins[0].x, `Lien de vérification : ${joindre(latins).replace(/[:\s]+$/, '')}`);
        continue;
      }
      const arabes = L.items.filter((i) => i.ar);
      if (!arabes.length) continue;
      const texte = reconstruireArabe(L.items.filter((i) => i.ar || i.blanc));
      if (texte.includes(LIBELLE_CODE_AR)) {
        // le code est à GAUCHE du libellé arabe : on se fie à x (un extracteur « bidi » inverserait ses blocs)
        const premierArabe = Math.min(...arabes.map((i) => i.x));
        const aGauche = latins.filter((i) => i.x < premierArabe);
        const code = joindre(aGauche).replace(/[:\s]+/g, '');
        if (!codeVerification) codeVerification = code;
        consommer(aGauche);
        if (aGauche.length) ajouter(L, aGauche[0].x, `Code de vérification : ${code}`);
      }
      if (!formeJuridiqueArabe && texte.includes(LIBELLE_FORME_AR)) {
        // lecture de droite à gauche : le libellé d'abord, sa valeur ensuite
        formeJuridiqueArabe = texte.slice(texte.indexOf(LIBELLE_FORME_AR) + LIBELLE_FORME_AR.length).trim();
      }
    }
  }

  // 4c. tableau de la direction : en-têtes QUALITÉ / NATIONALITÉ / NOM ET PRÉNOM, une ligne par dirigeant dessous
  const representants: Representant[] = [];
  for (const page of pages) {
    const entete = page.lignes.find((L) => {
      const n = normaliser(joindre(L.items.filter((i) => !i.ar)));
      return /NOM ET PRENOM/.test(n) && /QUALITE/.test(n);
    });
    if (!entete) continue;
    const titres = segments(entete.items.filter((i) => !i.blanc && !i.ar), 6);
    const colonnes: { cle: 'qualite' | 'nationalite' | 'nom'; centre: number }[] = [];
    titres.forEach((titre, k) => {
      const n = normaliser(joindre(titre));
      const cle = /NOM ET PRENOM/.test(n) ? 'nom' : /NATIONALITE/.test(n) ? 'nationalite' : /QUALITE/.test(n) ? 'qualite' : null;
      if (!cle) return;
      // la colonne couvre le libellé français et le libellé arabe qui le suit sur la ligne
      const x0 = titre[0].x;
      const dernier = titre[titre.length - 1];
      const suivant = titres[k + 1] ? titres[k + 1][0].x : Infinity;
      const x1 = entete.items.filter((j) => j.ar && j.x > x0 && j.x < suivant).reduce((m, j) => Math.max(m, j.x + j.largeur), dernier.x + dernier.largeur);
      colonnes.push({ cle, centre: (x0 + x1) / 2 });
    });
    if (!colonnes.length) continue;
    consommer(entete.items);
    let yPrec = entete.y;
    for (const L of page.lignes) {
      if (L.y >= entete.y - 3) continue;
      if (yPrec - L.y > 50) break;
      const pleins = L.items.filter((i) => !i.blanc);
      if (pleins.some((i) => !i.ar && /^[A-Z ]{8,}$/.test(i.str) && i.x < 20)) break; // titre de la section suivante
      const cellules: Record<'qualite' | 'nationalite' | 'nom', Item[]> = { qualite: [], nationalite: [], nom: [] };
      for (const it of L.items) {
        const milieu = it.x + it.largeur / 2;
        const colonne = colonnes.reduce((m, c) => (Math.abs(milieu - c.centre) < Math.abs(milieu - m.centre) ? c : m));
        cellules[colonne.cle].push(it);
      }
      const texte = (cellule: Item[]): string => (cellule.some((i) => i.ar) ? reconstruireArabe(cellule) : joindre(cellule));
      const qualiteLue = texte(cellules.qualite);
      const nationaliteLue = texte(cellules.nationalite);
      const nomLu = texte(cellules.nom);
      if (!nomLu && !qualiteLue) continue;
      const rep: Representant = {
        qualiteLue, nationaliteLue, nomLu,
        qualite: qualiteVersFrancais(qualiteLue),
        nationalite: nationaliteVersFrancais(nationaliteLue),
        nom: estArabe(nomLu) ? '' : texteChamp(nomLu),
      };
      representants.push(rep);
      consommer(L.items);
      const montrer = (lu: string, fr: string): string => fr || (estArabe(lu) ? EN_ARABE : lu);
      const parties: string[] = [];
      if (qualiteLue) parties.push(`Qualité : ${montrer(qualiteLue, rep.qualite)}`);
      if (nationaliteLue) parties.push(`Nationalité : ${montrer(nationaliteLue, rep.nationalite)}`);
      if (nomLu) parties.push(`Nom et prénom : ${montrer(nomLu, rep.nom)}`);
      ajouter(L, 0, parties.join(' — '));
      yPrec = L.y;
    }
  }

  // 4d. cases à cocher : le libellé d'une case est le texte latin le plus proche À GAUCHE, sur la même bande
  let cases: CaseLibellee[] | null = null;
  for (const page of pages) {
    if (!page.cases) continue;
    cases ??= [];
    const dePage: CaseLibellee[] = [];
    for (const k of page.cases) {
      const milieu = (k.y0 + k.y1) / 2;
      const candidats = page.items.filter((i) => !i.blanc && !i.ar && Math.abs(i.y - milieu) <= 14 && i.x + i.largeur <= k.x0 + 2);
      if (!candidats.length) continue;
      const proche = candidats.reduce((m, i) => (i.x + i.largeur > m.x + m.largeur ? i : m));
      const memeLigne = candidats
        .filter((i) => Math.abs(i.y - proche.y) < 1 && i.x <= proche.x && proche.x - (i.x + i.largeur) < 40)
        .sort((a, b) => a.x - b.x);
      // seulement le groupe de morceaux contigus qui finit sur le plus proche (« REGISTRE » + « RADIÉ »)
      const groupe: Item[] = [];
      for (let j = memeLigne.length - 1; j >= 0; j--) {
        const it = memeLigne[j];
        if (groupe.length && groupe[0].x - (it.x + it.largeur) > 6) break;
        groupe.unshift(it);
      }
      const ligne = page.lignes.find((L) => L.items.includes(proche)) ?? null;
      dePage.push({ page: page.numero, libelle: joindre(groupe), cochee: k.cochee, x: k.x0, items: groupe, ligne });
    }
    cases.push(...dePage);
    // texte reconnu : « TITRE : libellés cochés » (le titre d'un groupe de cases est à sa droite sur l'extrait)
    const lignesDeCases = new Set(dePage.map((c) => c.ligne));
    for (const L of lignesDeCases) {
      if (!L) continue;
      const deLigne = dePage.filter((c) => c.ligne === L);
      const membres = new Set(deLigne.flatMap((c) => c.items));
      const titres = segments(L.items.filter((i) => !i.blanc && !i.ar && !membres.has(i) && !consommes.has(i) && AVEC_LETTRE.test(i.str)), 12);
      const rangees = new Set<CaseLibellee>();
      let bordGauche = -Infinity;
      for (const titre of titres) {
        const x0 = titre[0].x;
        const groupe = deLigne.filter((c) => c.x > bordGauche && c.x < x0);
        bordGauche = x0;
        if (!groupe.length) continue;
        const cochees = groupe.filter((c) => c.cochee).map((c) => c.libelle);
        consommer(titre);
        ajouter(L, x0, `${joindre(titre)} : ${cochees.join(' + ') || 'aucune case cochée'}`);
        for (const c of groupe) rangees.add(c);
      }
      for (const c of deLigne) {
        if (!rangees.has(c)) ajouter(L, c.x, `${c.libelle} : ${c.cochee ? 'case cochée' : 'case non cochée'}`);
      }
      consommer([...membres]);
    }
  }
  let etat: EtatRegistre | null = null;
  if (cases) {
    const cochee = (re: RegExp): boolean | null => {
      const trouvees = (cases ?? []).filter((c) => re.test(normaliser(c.libelle)));
      return trouvees.length ? trouvees.some((c) => c.cochee) : null;
    };
    const actif = cochee(/^ACTIF$/);
    const suspendu = cochee(/^SUSPENDU$/);
    const radie = cochee(/^(REGISTRE )?RADIE$/);
    if (actif !== null || suspendu !== null || radie !== null) etat = { actif: actif === true, suspendu: suspendu === true, radie: radie === true };
  }

  // 4e. texte reconnu, dans l'ordre de lecture : page par page, de haut en bas ; ce qu'une page répète (en-tête) n'est
  //     donné qu'une fois
  const lignes: string[] = [];
  const dejaVues = new Set<string>();
  for (const page of pages) {
    const dePage: string[] = [];
    for (const L of page.lignes) {
      if (L.y < page.hauteur * PIED_DE_PAGE) continue;
      const fragments = (entrees.get(L) ?? []).slice();
      const brut = texteBrut(L, consommes);
      if (brut) fragments.push(brut);
      fragments.sort((a, b) => a.x - b.x);
      for (const f of fragments) {
        const t = f.texte.normalize('NFC').replace(/\s+/g, ' ').trim();
        if (t && !estArabe(t) && !dejaVues.has(t)) dePage.push(t);
      }
    }
    for (const t of dePage) dejaVues.add(t);
    lignes.push(...dePage);
  }

  return {
    reconnaissance, valeurs, divergents, codeVerification, formeJuridiqueArabe, representants,
    cases: cases ? cases.map(({ page, libelle, cochee }) => ({ page, libelle, cochee })) : null,
    etat, lignes,
  };
}

// Texte latin d'une ligne, hors morceaux déjà rendus. Sur une ligne bilingue, les chiffres et la ponctuation isolés
// appartiennent à la phrase arabe (numéro et code postal de l'adresse arabe, « : » des libellés arabes), sauf les
// chiffres placés à droite d'un libellé français (« Capital social: 10000 »). Une ligne où l'arabe domine est une
// phrase arabe qui cite quelques mots latins : elle n'est pas reprise.
function texteBrut(L: Ligne, consommes: ReadonlySet<Item>): Fragment | null {
  const latins = L.items.filter((i) => !i.blanc && !i.ar && !consommes.has(i));
  if (!latins.length) return null;
  const arabes = L.items.filter((i) => i.ar);
  let gardes = latins;
  if (arabes.length) {
    gardes = [];
    for (const i of latins) {
      if (AVEC_LETTRE.test(i.str) || (/\d/.test(i.str) && gardes.length)) gardes.push(i);
    }
    const nbLettres = gardes.reduce((n, i) => n + (i.str.match(/\p{L}/gu) ?? []).length, 0);
    const nbArabes = arabes.reduce((n, i) => n + i.str.replace(/\s/g, '').length, 0);
    if (nbArabes > 2 * nbLettres) return null;
  }
  if (!gardes.length) return null;
  const texte = joindre(gardes).replace(/\s+[:/]$/, '').trim();
  return texte ? { x: gardes[0].x, texte } : null;
}

// ── 5. Résultat remis à l'écran ────────────────────────────────────────────────────────────────────────────────────
// Qualités qui désignent le représentant légal, quand l'extrait liste plusieurs dirigeants.
const QUALITES_DE_REPRESENTANT = ['Gérant', 'Cogérant', 'Président directeur général', 'Directeur général', 'Président', 'Titulaire', 'Représentant légal'];

/**
 * Lecture d'un extrait RNE : champs de la fiche d'identité légale, texte reconnu, mises en garde.
 * `null` si le PDF n'a pas de couche texte ou n'est pas reconnu comme un extrait RNE.
 */
export function lectureExtraitRne(pagesTexte: readonly PageTexte[]): LectureTextePdf | null {
  const a = analyserExtraitRne(pagesTexte);
  if (!a.reconnaissance.estExtraitRne) return null;
  const v = a.valeurs;
  const champs: Partial<Record<ChampIdentite, ChampLu>> = {};
  const avertissements: string[] = [];
  // une valeur non imprimable en Windows-1252 (l'arabe) n'est jamais proposée : le champ reste absent
  const poser = (cle: ChampIdentite, brut: string, note?: string): boolean => {
    const valeur = texteChamp(brut);
    if (!valeur) return false;
    champs[cle] = note ? { valeur, source: 'pdf', aRelire: false, note } : { valeur, source: 'pdf', aRelire: false };
    return true;
  };

  if (a.reconnaissance.type && a.reconnaissance.type !== 'SOCIETE') {
    avertissements.push(`Extrait de type « ${a.reconnaissance.type} » : seul le modèle « société » est connu, relisez chaque champ.`);
  }

  if (!poser('raisonSociale', v.denomination)) {
    avertissements.push(v.denomination
      ? "La dénomination sociale n'est pas en lettres latines sur l'extrait : à saisir à la main."
      : "Dénomination sociale introuvable sur l'extrait : à saisir à la main.");
  }
  if (!poser('nomCommercial', v.nomCommercial)) poser('nomCommercial', v.enseigne, "repris de la ligne « Enseigne » de l'extrait");

  const forme = formeJuridiqueVersCode(v.formeJuridique, a.formeJuridiqueArabe);
  if (forme) {
    const libelle = texteChamp(v.formeJuridique);
    poser('formeJuridique', forme, forme === 'AUTRE' && libelle ? `libellé de l'extrait : « ${libelle} »` : undefined);
  } else {
    avertissements.push("Forme juridique introuvable sur l'extrait : à choisir à la main.");
  }

  if (a.divergents.includes('identifiantUnique')) {
    avertissements.push("L'identifiant unique n'est pas le même partout sur l'extrait : il n'est pas proposé, vérifiez le document.");
  } else if (RE_IDENTIFIANT.test(v.identifiantUnique)) {
    poser('matriculeFiscal', v.identifiantUnique, NOTE_MATRICULE_RACINE);
    poser('rne', v.identifiantUnique);
  } else {
    avertissements.push(v.identifiantUnique
      ? "Identifiant unique illisible sur l'extrait (7 chiffres et 1 lettre attendus) : matricule fiscal et RNE à saisir à la main."
      : "Identifiant unique introuvable sur l'extrait : matricule fiscal et RNE à saisir à la main.");
  }

  if (v.adresseSiege) {
    const adresse = decouperAdresse(v.adresseSiege);
    if (adresse.codePostal && adresse.ville) {
      poser('adresse', adresse.rue);
      poser('ville', `${adresse.codePostal} ${adresse.ville}`);
    } else {
      poser('adresse', v.adresseSiege);
    }
  } else {
    avertissements.push("Adresse du siège social introuvable sur l'extrait : à saisir à la main.");
  }

  const representant = a.representants.find((r) => QUALITES_DE_REPRESENTANT.includes(r.qualite)) ?? a.representants[0];
  if (representant) {
    poser('representantNom', representant.nom);
    if (!poser('representantQualite', representant.qualite) && representant.qualiteLue) {
      avertissements.push("Qualité du représentant non reconnue sur l'extrait : à saisir à la main.");
    }
    if (a.representants.length > 1) avertissements.push("L'extrait liste plusieurs dirigeants : vérifiez le représentant proposé.");
  }

  if (!a.etat) {
    avertissements.push("État du registre non lu : vérifiez sur l'extrait que la case « ACTIF » est cochée.");
  } else {
    if (a.etat.radie) avertissements.push("Attention : la case « REGISTRE RADIÉ » est cochée sur l'extrait.");
    if (a.etat.suspendu) avertissements.push("Attention : la case « SUSPENDU » est cochée sur l'extrait.");
    if (!a.etat.radie && !a.etat.suspendu && !a.etat.actif) {
      avertissements.push("Aucun état du registre n'est coché sur l'extrait (ACTIF, SUSPENDU ou RADIÉ) : à vérifier.");
    }
  }

  const code = RE_CODE_VERIFICATION.test(a.codeVerification) ? a.codeVerification : null;
  if (!code) avertissements.push("Code de vérification introuvable sur l'extrait : il ne pourra pas être contrôlé sur le site du registre.");

  return { document: 'extrait_rne', champs, lignes: a.lignes, avertissements, verification: { code, lien: LIEN_VERIFICATION_RNE } };
}
