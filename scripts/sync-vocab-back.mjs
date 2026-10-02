// Génère dans le backend la copie du moteur de vocabulaire (lot 2, spec §1.2).
// SOURCE UNIQUE : frontend src/vocab/{lexiqueDefaut,vocab,rendre,categoriesPt,excel,composants}.ts.
//
//   node scripts/sync-vocab-back.mjs            écrit les deux fichiers du backend
//   node scripts/sync-vocab-back.mjs --check    n'écrit rien ; code de sortie 1 si le backend n'est pas à jour
//   --back <dossier>                            dépôt backend (défaut : ../fiche-technique-backend, ou $LABFLOW_BACK)
//
// Fichiers générés (en-tête « FICHIER GÉNÉRÉ — ne pas éditer ») :
//   <back>/src/config/lexiqueDefaut.js   exports LEXIQUE_DEFAUT, LEXIQUE_CLES (objets gelés)
//   <back>/src/utils/vocab.js            moteur + balises + résolution, CommonJS :
//                                        creerVocab, vocabDefaut, resoudreLexique, completerLexique,
//                                        vocabDuLexique, rendre, rendreTout, balisesInvalides ;
//                                        catégories PT (libelleCategoriePt, CATEGORIES_PT_CONNUES),
//                                        onglets Excel (nomOnglet), composants (entreeComposant, entreeComposantVoc, libelleComposant)
//                                        — lot 2b, spec §4.1 et §4.2
// Conversion : ts.transpileModule du TypeScript installé dans ce dépôt (aucune dépendance côté backend).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const iBack = args.indexOf('--back');
const BACK = path.resolve(
  iBack !== -1 && args[iBack + 1] ? args[iBack + 1] : process.env.LABFLOW_BACK || path.join(RACINE, '..', 'fiche-technique-backend'),
);

const ENTETE = '// FICHIER GÉNÉRÉ — ne pas éditer, source : frontend src/vocab';
const lf = (s) => s.replace(/\r\n/g, '\n');
const lireSource = (nom) => lf(fs.readFileSync(path.join(RACINE, 'src', 'vocab', nom), 'utf8'));

// TypeScript → CommonJS, sans vérification de types (les sources sont en syntaxe effaçable).
const transpiler = (nom) => {
  const sortie = ts.transpileModule(lireSource(nom), {
    fileName: nom,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
      verbatimModuleSyntax: false,
    },
  });
  const erreurs = (sortie.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (erreurs.length) {
    throw new Error(`${nom} : ${erreurs.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' ; ')}`);
  }
  return lf(sortie.outputText).trimEnd();
};

// ── src/config/lexiqueDefaut.js ──────────────────────────────────────────────
const genererLexique = () => [
  ENTETE,
  '// (src/vocab/lexiqueDefaut.ts). Pour modifier le lexique par défaut : éditer la source dans le',
  '// dépôt frontend, puis lancer `node scripts/sync-vocab-back.mjs` depuis ce dépôt frontend.',
  '// Exports : LEXIQUE_DEFAUT, LEXIQUE_CLES (objets gelés).',
  '',
  transpiler('lexiqueDefaut.ts'),
  '',
].join('\n');

// ── src/utils/vocab.js ───────────────────────────────────────────────────────
// Les modules sources sont réunis dans un seul fichier CommonJS ; leur import de
// './lexiqueDefaut.ts' est servi par require('../config/lexiqueDefaut'). Lot 2b (spec §4.1, §4.2) :
// catégories PT, onglets Excel et composants rejoignent le moteur (leurs imports de './vocab.ts' sont des
// imports de TYPE, effacés à la conversion).
const MODULES = ['rendre.ts', 'vocab.ts', 'categoriesPt.ts', 'excel.ts', 'composants.ts'];

const genererVocab = (exportsPublics) => [
  ENTETE,
  `// (${MODULES.map((nom) => `src/vocab/${nom}`).join(' + ')}).`,
  '// Pour modifier le moteur : éditer la source dans le',
  '// dépôt frontend, puis lancer `node scripts/sync-vocab-back.mjs` depuis ce dépôt frontend.',
  `// Exports : ${exportsPublics.join(', ')}.`,
  "'use strict';",
  '',
  'const __modules = {',
  ...MODULES.map((nom) => [
    `  './${nom}': function (exports, require) {`,
    // Code du module recopié SANS ré-indentation (une chaîne multi-lignes resterait intacte).
    transpiler(nom),
    '  },',
  ].join('\n')),
  '};',
  '',
  'const __cache = {};',
  'function __require(id) {',
  "  if (id === './lexiqueDefaut.ts') return require('../config/lexiqueDefaut');",
  '  if (__cache[id]) return __cache[id];',
  "  if (!__modules[id]) throw new Error('vocab.js : module inconnu ' + id);",
  '  const exports = {};',
  '  __cache[id] = exports;',
  '  __modules[id](exports, __require);',
  '  return exports;',
  '}',
  '',
  `module.exports = { ${['vocab.ts', 'rendre.ts', ...MODULES.filter((nom) => nom !== 'vocab.ts' && nom !== 'rendre.ts')].map((nom) => `...__require('./${nom}')`).join(', ')} };`,
  '',
].join('\n');

// Charge le code généré en mémoire (sans toucher au disque) : vérifie qu'il s'exécute et
// donne la liste des exports.
const evaluer = (code, requireFictif) => {
  const module = { exports: {} };
  const fonction = vm.runInThisContext(`(function (module, exports, require) {\n${code}\n})`, { filename: 'genere.js' });
  fonction(module, module.exports, requireFictif);
  return module.exports;
};

const texteLexique = genererLexique();
const lexique = evaluer(texteLexique, () => { throw new Error('lexiqueDefaut.js ne doit rien importer'); });
const requireVocab = (id) => {
  if (id === '../config/lexiqueDefaut') return lexique;
  throw new Error(`vocab.js : import inattendu « ${id} »`);
};
const exportsPublics = Object.keys(evaluer(genererVocab([]), requireVocab));
const texteVocab = genererVocab(exportsPublics);
const moteur = evaluer(texteVocab, requireVocab);

// Contrôles avant écriture : le code généré se comporte comme la source.
const controles = [
  [Object.isFrozen(lexique.LEXIQUE_DEFAUT) && Object.isFrozen(lexique.LEXIQUE_CLES), 'LEXIQUE_DEFAUT et LEXIQUE_CLES gelés'],
  [Object.values(lexique.LEXIQUE_DEFAUT).every((e) => Object.isFrozen(e)), 'entrées gelées'],
  [lexique.LEXIQUE_CLES.length === Object.keys(lexique.LEXIQUE_DEFAUT).length && lexique.LEXIQUE_CLES.length >= 32, 'LEXIQUE_CLES complet'],
  [['creerVocab', 'vocabDefaut', 'resoudreLexique', 'rendre', 'rendreTout'].every((n) => n in moteur), 'exports du moteur'],
  // Lot 2b (spec §4.1, §4.2) : un export par module ajouté, sans collision de noms entre modules.
  [['libelleCategoriePt', 'CATEGORIES_PT_CONNUES', 'nomOnglet', 'entreeComposant', 'entreeComposantVoc', 'libelleComposant'].every((n) => typeof moteur[n] !== 'undefined'), 'exports des modules catégories PT, Excel, composants'],
  [moteur.vocabDefaut.le('activite') === "l'activité" && moteur.vocabDefaut.n('labo', 3) === '3 labos', 'moteur : rendus par défaut'],
  [moteur.rendre(moteur.vocabDefaut, 'Espace [[Pl:activite]]') === 'Espace Activités', 'balises'],
  [JSON.stringify(moteur.resoudreLexique(lexique.LEXIQUE_DEFAUT, {})) === JSON.stringify(lexique.LEXIQUE_DEFAUT), 'résolution sans écart = défaut'],
  // Exemples de saisie : l'exemple d'origine tant que le lexique est celui par défaut (domaine sans écart compris).
  [moteur.vocabDefaut.estDefaut === true && moteur.vocabDefaut.ex('a', 'b') === 'a'
    && moteur.creerVocab(moteur.resoudreLexique(lexique.LEXIQUE_DEFAUT, {})).estDefaut === true
    && moteur.creerVocab(moteur.resoudreLexique(lexique.LEXIQUE_DEFAUT, { labo: { sg: 'Atelier' } })).ex('a', 'b') === 'b'
    && moteur.rendre(moteur.vocabDefaut, '[[ex:activite:Restaurant A]]') === 'Restaurant A', 'exemples de saisie : estDefaut, ex, balise ex'],
  // Onglets Excel : le nom réservé « History » n'est jamais rendu ; un nom actuel sort inchangé.
  [moteur.nomOnglet('History') === 'Feuille' && moteur.nomOnglet("Vue d'ensemble") === "Vue d'ensemble", 'nomOnglet'],
  // Catégories PT : les 5 libellés par défaut rendus à l'identique avec le vocabulaire par défaut.
  [moteur.CATEGORIES_PT_CONNUES.length === 5
    && moteur.CATEGORIES_PT_CONNUES.every((v) => moteur.libelleCategoriePt(moteur.vocabDefaut, v) === v), 'libelleCategoriePt : identité par défaut'],
  // Composants identité : libellé et pluriel du brouillon rendus EXACTEMENT avec le vocabulaire par défaut.
  [[['activite', 'Activité', 'Activités'], ['labo', 'Labo', 'Labos'], ['gerant', 'Gérant', 'Gérants'], ['acheteurs', 'Base acheteurs', 'Base acheteurs']]
    .every(([code, libelle, libellePluriel]) => {
      const c = { code, typeTechnique: code, libelle, libellePluriel };
      return moteur.libelleComposant(moteur.vocabDefaut, c, 1) === libelle && moteur.libelleComposant(moteur.vocabDefaut, c, 2) === libellePluriel;
    }), 'libelleComposant : composants identité par défaut'],
  [JSON.stringify(moteur.entreeComposant({ libelle: 'Huilerie', libellePluriel: 'Huileries', genre: 'f', elision: true }))
    === JSON.stringify({ sg: 'Huilerie', pl: 'Huileries', g: 'f', el: true })
    && moteur.vocabDefaut.avec(moteur.entreeComposant({ libelle: 'Cuisine', libelle_pluriel: 'Cuisines', genre: 'f' })).mon('_') === 'ma cuisine'
    && moteur.entreeComposant({ libelle: 'Atelier', elision: 'auto' }).el === true, 'entreeComposant'],
  // entreeComposantVoc : par défaut, même accord que entreeComposant pour un composant identité au brouillon.
  [moteur.vocabDefaut.avec(moteur.entreeComposantVoc(moteur.vocabDefaut, { code: 'activite', typeTechnique: 'activite', libelle: 'Activité', libellePluriel: 'Activités', genre: 'f' })).mon('_') === 'mon activité'
    && moteur.vocabDefaut.avec(moteur.entreeComposantVoc(moteur.vocabDefaut, { code: 'labo', typeTechnique: 'labo', libelle: 'Labo', libellePluriel: 'Labos' })).mon('_', true) === 'mes labos', 'entreeComposantVoc'],
];
const rates = controles.filter(([ok]) => !ok).map(([, nom]) => nom);
if (rates.length) {
  console.error(`sync-vocab-back : code généré incorrect (${rates.join(' ; ')})`);
  process.exit(2);
}

// ── Écriture ou contrôle ─────────────────────────────────────────────────────
const CIBLES = [
  [path.join(BACK, 'src', 'config', 'lexiqueDefaut.js'), texteLexique],
  [path.join(BACK, 'src', 'utils', 'vocab.js'), texteVocab],
];

if (!fs.existsSync(path.join(BACK, 'src'))) {
  console.error(`sync-vocab-back : dépôt backend introuvable (${BACK}) — utiliser --back <dossier>`);
  process.exit(2);
}

// Fins de ligne : celles du fichier déjà présent, sinon celles d'un fichier voisin du backend.
const finDeLigne = (fichier) => {
  for (const f of [fichier, path.join(BACK, 'src', 'app.js')]) {
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').includes('\r\n') ? '\r\n' : '\n';
  }
  return '\n';
};

let perimes = 0;
for (const [fichier, texte] of CIBLES) {
  const relatif = path.relative(BACK, fichier).split(path.sep).join('/');
  const actuel = fs.existsSync(fichier) ? lf(fs.readFileSync(fichier, 'utf8')) : null;
  if (actuel === texte) {
    console.log(`à jour    ${relatif}`);
    continue;
  }
  perimes += 1;
  if (CHECK) {
    console.error(`PÉRIMÉ    ${relatif}${actuel === null ? ' (absent)' : ''}`);
    continue;
  }
  const eol = finDeLigne(fichier);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, eol === '\n' ? texte : texte.replace(/\n/g, eol));
  console.log(`écrit     ${relatif}`);
}

if (CHECK && perimes) {
  console.error('sync-vocab-back --check : le backend n\'est pas à jour — lancer `node scripts/sync-vocab-back.mjs`.');
  process.exit(1);
}
console.log(
  `sync-vocab-back : ${lexique.LEXIQUE_CLES.length} clés ; exports du moteur : ${exportsPublics.join(', ')} ; `
  + `backend ${CHECK ? 'à jour' : 'synchronisé'} (${BACK})`,
);
