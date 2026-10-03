// Lot 2c (spec backend docs/lot-2c-spec.md §6) — logique de l'aperçu et du contrôle des balises des écrans admin
// du manuel et de la base de connaissances (src/components/admin/manuelBalises.ts).
//   node --test scripts/admin-manuel-balises.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
//
// 1. rendu par défaut = texte d'entrée (texte sans balise, et texte balisé qui rend son origine : I10) ;
// 2. aperçu dans un domaine (lexique résolu) ; domaine absent → pas d'aperçu ;
// 3. contrôle des balises : grammaire, clé inconnue, balise non fermée, fin sans début ; champs interdits ;
// 4. même résultat que verifierBalises du serveur (../fiche-technique-backend/src/utils/manuelRendu.js), si le
//    dépôt du serveur est à côté ;
// 5. légende : chaque balise est valide et se rend.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { LEXIQUE_DEFAUT } from '../src/vocab/lexiqueDefaut.ts';
import { vocabDefaut, vocabDuLexique, resoudreLexique } from '../src/vocab/vocab.ts';
import {
  rendreDefaut, rendreTexte, vocDuDomaine, verifierBalises, controlerChamps, messageFautes, LEGENDE_BALISES,
} from '../src/components/admin/manuelBalises.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lexiques = JSON.parse(fs.readFileSync(path.join(ICI, 'vocab-lexiques-test.json'), 'utf8'));
const vocH = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, lexiques.hotellerie));
const vocC = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, lexiques.ceramique));

// Paires origine → balisé de la spec (§7.7), rendues par défaut à l'identique.
const PAIRES = [
  ['Stock Labo', '[[Nom:stock]] [[Court:labo]]'],
  ['Stock & Appro', '[[Nom:stock]] & [[Court:appro]]'],
  ['Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités',
    'Cet écran envoie [[le:article:pl]] et [[le:pt:pl]] ([[court:pt:pl]]) [[du:labo]] vers [[votre:activite:pl]]'],
  ['- [Activités & labos](#activites) · [Mon abonnement](#abonnement)',
    '- [[[Pl:activite]] & [[pl:labo]]](#activites) · [Mon abonnement](#abonnement)'],
  ['Dès votre première activité ou votre labo créé',
    'Dès [[acc:activite:votre premier:votre première]] [[nom:activite]] ou [[votre:labo]] [[acc:labo:créé:créée]]'],
  ['Labo central', '[[Nom:labo]][[acc:labo: central:]]'],
  ['Un transfert déplace du stock du LABO (production centrale) vers une ACTIVITÉ (point de vente).',
    '[[Un:transfert]] déplace [[du:stock]] [[det:labo:du]][[MAJ:labo]] (production centrale) vers [[det:activite:un]][[MAJ:activite]] ([[nom:activite_desc]]).'],
];

test('rendu par défaut = texte d\'entrée (texte sans balise)', () => {
  for (const t of ['', 'Stock Labo', '## Titre\n\n- point [lien](#slug)\n\n:::astuce\nUn [crochet] seul.\n:::', 'a ] b [ c']) {
    assert.equal(rendreDefaut(t), t);
    assert.equal(rendreTexte(vocabDefaut, t), t);
  }
  assert.equal(rendreDefaut(null), '');
  assert.equal(rendreDefaut(undefined), '');
});

test('rendu par défaut d\'un texte balisé = son origine (I10)', () => {
  for (const [origine, balise] of PAIRES) assert.equal(rendreDefaut(balise), origine, balise);
});

test('aperçu dans un domaine : lexique résolu ; restauration par défaut ; domaine absent → null', () => {
  assert.equal(rendreTexte(vocH, '[[Nom:labo]][[acc:labo: central:]]'), 'Cuisine centrale');
  assert.equal(rendreTexte(vocC, '[[Nom:stock]] & [[Court:appro]]'), 'Stock & Réception');
  assert.equal(rendreTexte(vocH, PAIRES[3][1]), '- [Services & cuisines centrales](#activites) · [Mon abonnement](#abonnement)');
  const domaines = [{ slug: 'hotellerie', voc: vocH }];
  assert.equal(vocDuDomaine(domaines, ''), vocabDefaut);
  assert.equal(vocDuDomaine(domaines, 'hotellerie'), vocH);
  assert.equal(vocDuDomaine(domaines, 'ceramique'), null);
  // Aucun « [[ » ne part vers MarkdownView pour un texte aux balises valides.
  for (const [, balise] of PAIRES) assert.ok(!rendreTexte(vocC, balise).includes('[['), balise);
});

const CAS = [
  '[[nom:labbo]]',
  '[[nom:labo:xx]]',
  '[[Nom:labo]]',
  '[[foo:labo]]',
  '[[acc:labo:créé]]',
  '[[ex:labbo:Ex: Poulet]]',
  'avant [[nom:labo] après',
  'avant [[nom:labo',
  'un texte ]] sans début',
  '[[nom:\nlabo]]',
  '[[[Pl:activite]] & [[pl:labo]]](#activites)',
  '[[nom:labo]] et [[nom:labbo]] puis [[du:stock',
  'texte sans balise [lien](#slug)',
  ...PAIRES.map(([, b]) => b),
];

test('contrôle des balises : refus et acceptations', () => {
  assert.deepEqual(verifierBalises('[[nom:labbo]]'), [{ balise: '[[nom:labbo]]', raison: 'clé inconnue « labbo »' }]);
  assert.equal(verifierBalises('[[nom:labo:xx]]').length, 1);
  assert.deepEqual(verifierBalises('[[Nom:labo]]'), []);
  assert.deepEqual(verifierBalises('avant [[nom:labo'), [{ balise: '[[nom:labo', raison: 'balise non fermée' }]);
  assert.deepEqual(verifierBalises('un texte ]] sans début'), [{ balise: 'un texte ]]', raison: 'fin de balise sans début' }]);
  assert.deepEqual(verifierBalises('[[[Pl:activite]] & [[pl:labo]]](#activites)'), []);
  for (const [, b] of PAIRES) assert.deepEqual(verifierBalises(b), [], b);
  assert.deepEqual(verifierBalises(null), []);
});

test('contrôle des champs : balisables et interdits ; message comme le serveur', () => {
  const f = controlerChamps({ titre: '[[Nom:labo]]', contenu: 'x [[nom:labbo]]' }, { 'mots-clés': 'labo, [[nom:labo]]', slug: 'stock-labo' });
  assert.deepEqual(f.map((x) => x.champ), ['contenu', 'mots-clés']);
  assert.equal(messageFautes([]), '');
  assert.equal(messageFautes(f), 'Balise invalide dans le champ « contenu » : [[nom:labbo]] (clé inconnue « labbo ») — 2 balise(s) fautive(s)');
});

test('même contrôle que verifierBalises du serveur', (t) => {
  const fichier = path.resolve(ICI, '..', '..', 'fiche-technique-backend', 'src', 'utils', 'manuelRendu.js');
  if (!fs.existsSync(fichier)) { t.skip('dépôt du serveur absent'); return; }
  const serveur = createRequire(import.meta.url)(fichier);
  for (const texte of [...CAS, ...LEGENDE_BALISES.map((l) => l.balise)]) {
    assert.deepEqual(verifierBalises(texte), serveur.verifierBalises(texte), JSON.stringify(texte));
  }
});

test('légende : balises valides, rendues', () => {
  assert.equal(LEGENDE_BALISES.length, 13);
  for (const { balise } of LEGENDE_BALISES) {
    assert.deepEqual(verifierBalises(balise), [], balise);
    const r = rendreDefaut(balise);
    assert.ok(r && !r.includes('[[') && !/‹[a-z0-9_]+›/.test(r), `${balise} → ${r}`);
    assert.ok(!rendreTexte(vocH, balise).includes('[['), balise);
  }
});
