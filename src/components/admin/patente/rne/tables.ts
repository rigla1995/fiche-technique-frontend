// Extrait RNE (lot 3, étape 7) — tables de correspondance : forme juridique, qualité du représentant, adresse.
// Fonctions PURES : ni pdfjs, ni DOM (testées par scripts/patente-rne.test.mjs). Portage de l'essai du 04/10/2026.
import { texteChamp } from '../types.ts';

// Blocs arabes d'Unicode, formes de présentation comprises (c'est sous cette forme que le PDF les donne).
const RE_ARABE = /[\u{0600}-\u{06FF}\u{0750}-\u{077F}\u{08A0}-\u{08FF}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFF}]/u;
export const estArabe = (s: string): boolean => RE_ARABE.test(s);

/** Pour comparer des libellés : formes de présentation arabes → lettres (NFKC), sans accents, en majuscules. */
export function normaliser(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFKC')
    .normalize('NFD').replace(/[\u{0300}-\u{036F}]/gu, '')
    .replace(/[\u{2018}\u{2019}\u{02BC}\u{0060}\u{00B4}]/gu, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// ── Forme juridique : libellé du RNE (français, puis arabe en secours) → code de la fiche ──────────────────────────
export type CodeForme = 'SARL' | 'SUARL' | 'SA' | 'SNC' | 'EI' | 'AUTO_ENTREPRENEUR' | 'ASSOCIATION' | 'AUTRE';

// L'ordre compte : SUARL avant SARL, auto-entrepreneur avant entreprise individuelle.
const FORMES_FR: [CodeForme, RegExp][] = [
  ['SUARL', /\bSUARL\b|UNIPERSONNELLE A RESPONSABILITE LIMITEE/],
  ['SARL', /\bSARL\b|A RESPONSABILITE LIMITEE/],
  ['SA', /\bSA\b|SOCIETE ANONYME/],
  ['SNC', /\bSNC\b|EN NOM COLLECTIF/],
  ['AUTO_ENTREPRENEUR', /AUTO.?ENTREPRENEUR/],
  ['EI', /PERSONNE PHYSIQUE|ENTREPRISE INDIVIDUELLE|\bEI\b|COMMERCANT|ENTREPRENEUR INDIVIDUEL/],
  ['ASSOCIATION', /ASSOCIATION/],
  ['AUTRE', /COMMANDITE|\bSCS\b|\bSCA\b|GROUPEMENT D'INTERET|\bGIE\b|SOCIETE CIVILE|COOPERATIVE|MUTUELLE|ETABLISSEMENT PUBLIC|SUCCURSALE|SOCIETE ETRANGERE/],
];
// Libellés arabes écrits comme `arabeNu` les rend : alif sans hamza (« الاسم » pour « الإسم »), article facultatif.
const FORMES_AR: [CodeForme, RegExp][] = [
  ['SUARL', /شخص (?:ال)?واحد/],
  ['SARL', /ذات (?:ال)?مس[ؤئ]ولية (?:ال)?محدودة/],
  ['SA', /خفية الاسم/],
  ['SNC', /مفاوضة/],
  ['AUTO_ENTREPRENEUR', /مبادر (?:ال)?ذاتي/],
  ['EI', /شخص (?:ال)?طبيعي|مؤسسة فردية/],
  ['ASSOCIATION', /جمعية/],
  ['AUTRE', /مقارضة|توصية|محاصة|ت?جمع المصالح|مجمع المصلحة|شركة مدنية|تعاونية|تعاضدية/],
];
const SIGLES: CodeForme[] = ['SUARL', 'SARL', 'SA', 'SNC'];

/**
 * Arabe à comparer : formes de présentation → lettres (NFKC), sans voyelles brèves ni trait d'allongement, alif à
 * hamza ou à madda ramené à l'alif nu (l'extrait écrit « الإسم », d'autres documents « الاسم »).
 */
export function arabeNu(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[\u{064B}-\u{0652}\u{0670}\u{0640}]/gu, '')
    .replace(/[\u{0622}\u{0623}\u{0625}\u{0671}]/gu, '\u{0627}')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Code de la fiche pour un libellé de forme juridique (français, puis arabe en secours) ; '' si aucun des deux n'est
 * reconnu. « AUTRE » n'est rendu que pour une forme CONNUE hors de la liste (commandite, GIE, société civile…) : ce
 * n'est jamais une valeur par défaut.
 */
export function formeJuridiqueVersCode(libelleFr: string | null | undefined, libelleAr: string | null | undefined = ''): CodeForme | '' {
  const n = normaliser(libelleFr);
  // le sigle entre parenthèses en fin de libellé fait foi : « … (SUARL) »
  const sigle = (/\(([A-Z. ]{2,8})\)\s*$/.exec(n) || [])[1];
  if (sigle) {
    const s = sigle.replace(/[. ]/g, '');
    const connu = SIGLES.find((c) => c === s);
    if (connu) return connu;
  }
  // le libellé tel quel, puis sans ses points (« S.A.R.L » hors parenthèses)
  for (const texte of [n, n.replace(/\./g, '')]) {
    for (const [code, re] of FORMES_FR) if (texte && re.test(texte)) return code;
  }
  const a = arabeNu(libelleAr);
  for (const [code, re] of FORMES_AR) if (a && re.test(a)) return code;
  return '';
}

// ── Qualité du représentant : le tableau de la direction est en arabe sur l'extrait ────────────────────────────────
// Libellés français alignés sur ceux de la fiche (FORMES_JURIDIQUES de utils/identiteLegale.ts).
const QUALITES_FR: [RegExp, string][] = [
  [/^GERANT/, 'Gérant'], [/^COGERANT|^CO-GERANT/, 'Cogérant'],
  [/PRESIDENT.?DIRECTEUR GENERAL|\bPDG\b/, 'Président directeur général'],
  [/DIRECTEUR GENERAL ADJOINT/, 'Directeur général adjoint'], [/DIRECTEUR GENERAL/, 'Directeur général'],
  [/PRESIDENT DU CONSEIL/, "Président du conseil d'administration"], [/ADMINISTRATEUR/, 'Administrateur'],
  [/ASSOCIE/, 'Associé'], [/TITULAIRE|PROPRIETAIRE|EXPLOITANT/, 'Titulaire'], [/REPRESENTANT LEGAL/, 'Représentant légal'],
  [/LIQUIDATEUR/, 'Liquidateur'], [/^PRESIDENT/, 'Président'],
];
// Écrits comme `arabeNu` les rend (alif sans hamza : « الادارة » pour « الإدارة »).
const QUALITES_AR: [RegExp, string][] = [
  [/^وكيل/, 'Gérant'], [/^مسير/, 'Gérant'], [/رئيس مدير عام/, 'Président directeur général'],
  [/مدير عام مساعد/, 'Directeur général adjoint'], [/مدير عام/, 'Directeur général'],
  [/رئيس مجلس الادارة/, "Président du conseil d'administration"], [/عضو مجلس الادارة|^متصرف/, 'Administrateur'],
  [/^شريك/, 'Associé'], [/^صاحب/, 'Titulaire'], [/ممثل قانوني/, 'Représentant légal'], [/^مصف/, 'Liquidateur'],
  [/^رئيس/, 'Président'], [/كاتب عام/, 'Secrétaire général'], [/امين (?:ال)?مال/, 'Trésorier'],
];
const traduire = (table: [RegExp, string][], s: string): string => {
  for (const [re, fr] of table) if (re.test(s)) return fr;
  return '';
};

/** Qualité en français ; '' si le libellé arabe est inconnu (jamais d'arabe proposé pour la fiche). */
export function qualiteVersFrancais(q: string | null | undefined): string {
  const lu = String(q ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!lu) return '';
  if (estArabe(lu)) return traduire(QUALITES_AR, arabeNu(lu));
  return traduire(QUALITES_FR, normaliser(lu)) || texteChamp(lu);
}

const NATIONALITES_AR: [RegExp, string][] = [[/^تونسي/, 'Tunisienne']];
const TYPES_REGISTRE_AR: [RegExp, string][] = [[/^شركة/, 'Société'], [/شخص طبيعي/, 'Personne physique'], [/جمعية/, 'Association']];
export const nationaliteVersFrancais = (s: string): string => (estArabe(s) ? traduire(NATIONALITES_AR, s.trim()) : texteChamp(s));
export const typeRegistreVersFrancais = (s: string): string => (estArabe(s) ? traduire(TYPES_REGISTRE_AR, s.trim()) : texteChamp(s));

// ── Adresse : « rue, code postal, ville, gouvernorat » écrits à la suite sur une seule ligne ───────────────────────
export interface AdresseDecoupee {
  rue: string;
  codePostal: string;
  ville: string;
  gouvernorat: string;
}

// Les noms longs d'abord (« La Manouba » avant « Manouba », « Le Kef » avant « Kef »).
const GOUVERNORATS = [
  'Tunis', 'Ariana', 'Ben Arous', 'La Manouba', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte', 'Béja', 'Beja', 'Jendouba',
  'Le Kef', 'Kef', 'Siliana', 'Sousse', 'Monastir', 'Mahdia', 'Sfax', 'Kairouan', 'Kasserine', 'Sidi Bouzid', 'Gabès',
  'Gabes', 'Médenine', 'Medenine', 'Tataouine', 'Gafsa', 'Tozeur', 'Kébili', 'Kebili',
];
/**
 * Retire de la fin de `s` — et de son début si `auDebut` — les caractères que reconnaît `aRetirer` (expression d'UN
 * caractère, sans drapeau g). En boucle : une expression ancrée sur la fin (« [\s,]+$ ») relit, depuis chacun de ses
 * caractères, toute suite de séparateurs placée au MILIEU du texte — coût quadratique sur un texte fabriqué.
 */
export function rognerBouts(s: string, aRetirer: RegExp, auDebut = true): string {
  let debut = 0;
  let fin = s.length;
  while (fin > 0 && aRetirer.test(s[fin - 1])) fin--;
  if (auDebut) while (debut < fin && aRetirer.test(s[debut])) debut++;
  return s.slice(debut, fin);
}
// Séparateurs retirés aux deux bouts d'une rue ou d'une localité.
const SEPARATEUR_D_ADRESSE = /[\s,;:/-]/;
const rogner = (s: string): string => rognerBouts(s, SEPARATEUR_D_ADRESSE);

// Mots de voie (texte passé par `normaliser`). Juste AVANT un nombre de 4 chiffres, ils en font un numéro (« Rue
// 8600 », « Lot 1234 ») ; APRÈS lui, ils disent que la rue continue. Un mois juste avant en fait une année (« 14
// Janvier 2011 »), si le nombre peut en être une.
const MOTS_DE_VOIE = 'RUE|AVENUE|AV|BOULEVARD|BD|ROUTE|RTE|IMPASSE|PLACE|LOT|LOTISSEMENT|BLOC|IMMEUBLE|IMM|RESIDENCE|KM|BP|N°|NO|NUMERO'
  + '|APPARTEMENT|APP|ETAGE|BUREAU|LOCAL|VILLA';
const MOIS = 'JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE';
const APRES_UN_MOT_DE_VOIE = new RegExp(`(^|[^A-Z])(${MOTS_DE_VOIE})[\\s.,:;-]*$`);
const APRES_UN_MOIS = new RegExp(`(^|[^A-Z])(${MOIS})[\\s.,:;-]*$`);
const CONTIENT_UN_MOT_DE_VOIE = new RegExp(`(^|[^A-Z])(${MOTS_DE_VOIE})([^A-Z]|$)`);
// Nom de localité (ville, puis gouvernorat) : quelques mots faits de lettres, séparés par des espaces, des virgules, un
// tiret ou une barre (« Sousse - Sousse ») ; un numéro de 1 ou 2 chiffres y est admis (« Quartier Exemple 2 Ariana »).
const LOCALITE = /^\p{L}[\p{L}'’.-]*(?:[\s,/-]+(?:\p{L}[\p{L}'’.-]*|\d{1,2})){0,6}$/u;
// Plus long, ce n'est pas un nom de localité. Le plafond borne aussi le coût de l'expression : le tiret y est à la fois
// une lettre de mot et un séparateur, et sur une suite fabriquée (« a-a-a-… ») elle essaierait toutes les découpes.
const LOCALITE_MAX = 60;

/**
 * « 8 Rue des Jasmins 5000 Monastir Monastir » → rue « 8 Rue des Jasmins », code postal 5000, ville « Monastir »,
 * gouvernorat « Monastir ». Le code postal n'est retenu que s'il est SÛR : le dernier nombre de 4 chiffres de
 * l'adresse, précédé d'une rue, suivi jusqu'à la fin d'un nom de localité, et qui n'est ni un numéro de voie ni une
 * année. Sinon rien n'est découpé : tout reste dans `rue` (« Rue 8600 Charguia 1 Tunis », « Avenue 14 Janvier 2011
 * Sousse Sousse », code postal en fin de ligne).
 */
export function decouperAdresse(adresse: string | null | undefined): AdresseDecoupee {
  const a = String(adresse ?? '').replace(/\s+/g, ' ').trim();
  const entiere: AdresseDecoupee = { rue: a, codePostal: '', ville: '', gouvernorat: '' };
  const re = /(^|[^\p{L}\d])(\d{4})(?![\p{L}\d])/gu;
  let debut = -1;
  for (let m = re.exec(a); m; m = re.exec(a)) debut = m.index + m[1].length;
  if (debut < 0) return entiere;
  const avant = normaliser(a.slice(0, debut));
  const nombre = Number(a.slice(debut, debut + 4));
  const suite = rogner(a.slice(debut + 4));
  if (!rogner(avant) || APRES_UN_MOT_DE_VOIE.test(avant)) return entiere;
  if (nombre >= 1800 && nombre <= 2099 && APRES_UN_MOIS.test(avant)) return entiere;
  if (suite.length > LOCALITE_MAX || !LOCALITE.test(suite) || CONTIENT_UN_MOT_DE_VOIE.test(normaliser(suite))) return entiere;
  let ville = suite;
  let gouvernorat = '';
  for (const g of GOUVERNORATS) {
    const fin = new RegExp(`(^|[\\s,/-])${g}$`, 'i');
    if (!fin.test(ville)) continue;
    gouvernorat = g;
    const sans = rogner(ville.replace(fin, ''));
    if (sans) ville = sans; // « 1000 Tunis » : la ville porte le nom du gouvernorat, on la garde
    break;
  }
  return { rue: rogner(a.slice(0, debut)), codePostal: a.slice(debut, debut + 4), ville, gouvernorat };
}
