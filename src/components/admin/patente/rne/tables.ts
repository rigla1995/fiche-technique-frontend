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
const FORMES_AR: [CodeForme, RegExp][] = [
  ['SUARL', /الشخص الواحد/],
  ['SARL', /ذات ال?مسؤولية ال?محدودة/],
  ['SA', /خفية الاسم/],
  ['SNC', /المفاوضة/],
  ['AUTO_ENTREPRENEUR', /المبادر الذاتي/],
  ['EI', /شخص طبيعي/],
  ['ASSOCIATION', /جمعية/],
  ['AUTRE', /التوصية|مجمع المصلحة الاقتصادية|تعاونية|تعاضدية/],
];
const SIGLES: CodeForme[] = ['SUARL', 'SARL', 'SA', 'SNC'];

/** Code de la fiche pour un libellé de forme juridique ; '' si les deux libellés sont vides, « AUTRE » si inconnu. */
export function formeJuridiqueVersCode(libelleFr: string | null | undefined, libelleAr: string | null | undefined = ''): CodeForme | '' {
  const n = normaliser(libelleFr);
  // le sigle entre parenthèses en fin de libellé fait foi : « … (SUARL) »
  const sigle = (/\(([A-Z. ]{2,8})\)\s*$/.exec(n) || [])[1];
  if (sigle) {
    const s = sigle.replace(/[. ]/g, '');
    const connu = SIGLES.find((c) => c === s);
    if (connu) return connu;
  }
  for (const [code, re] of FORMES_FR) if (n && re.test(n)) return code;
  const a = String(libelleAr ?? '').normalize('NFKC');
  for (const [code, re] of FORMES_AR) if (a && re.test(a)) return code;
  return n || a.trim() ? 'AUTRE' : '';
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
const QUALITES_AR: [RegExp, string][] = [
  [/^وكيل/, 'Gérant'], [/^مسير/, 'Gérant'], [/رئيس مدير عام/, 'Président directeur général'],
  [/مدير عام مساعد/, 'Directeur général adjoint'], [/مدير عام/, 'Directeur général'],
  [/رئيس مجلس الإدارة/, "Président du conseil d'administration"], [/عضو مجلس الإدارة|^متصرف/, 'Administrateur'],
  [/^شريك/, 'Associé'], [/^صاحب/, 'Titulaire'], [/ممثل قانوني/, 'Représentant légal'], [/^مصف/, 'Liquidateur'],
  [/^رئيس/, 'Président'], [/كاتب عام/, 'Secrétaire général'], [/أمين المال|أمين مال/, 'Trésorier'],
];
const traduire = (table: [RegExp, string][], s: string): string => {
  for (const [re, fr] of table) if (re.test(s)) return fr;
  return '';
};

/** Qualité en français ; '' si le libellé arabe est inconnu (jamais d'arabe proposé pour la fiche). */
export function qualiteVersFrancais(q: string | null | undefined): string {
  const lu = String(q ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!lu) return '';
  if (estArabe(lu)) return traduire(QUALITES_AR, lu);
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
const rogner = (s: string): string => s.replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');

/**
 * « 8 Rue des Jasmins 5000 Monastir Monastir » → rue « 8 Rue des Jasmins », code postal 5000, ville « Monastir »,
 * gouvernorat « Monastir ». Le code postal est le DERNIER nombre de 4 chiffres suivi d'un nom (une rue peut porter un
 * numéro à 4 chiffres : « Rue 8600 »). Sans code postal suivi d'une ville, rien n'est découpé : tout reste dans `rue`.
 */
export function decouperAdresse(adresse: string | null | undefined): AdresseDecoupee {
  const a = String(adresse ?? '').replace(/\s+/g, ' ').trim();
  const re = /(^|[^\p{L}\d])(\d{4})(?![\p{L}\d])/gu;
  let debut = -1;
  for (let m = re.exec(a); m; m = re.exec(a)) {
    const position = m.index + m[1].length;
    if (/\p{L}/u.test(a.slice(position + 4))) debut = position;
  }
  if (debut < 0) return { rue: a, codePostal: '', ville: '', gouvernorat: '' };
  let ville = rogner(a.slice(debut + 4));
  let gouvernorat = '';
  for (const g of GOUVERNORATS) {
    const fin = new RegExp(`(^|[\\s,-])${g}$`, 'i');
    if (!fin.test(ville)) continue;
    gouvernorat = g;
    const sans = rogner(ville.replace(fin, ''));
    if (sans) ville = sans; // « 1000 Tunis » : la ville porte le nom du gouvernorat, on la garde
    break;
  }
  return { rue: rogner(a.slice(0, debut)), codePostal: a.slice(debut, debut + 4), ville, gouvernorat };
}
