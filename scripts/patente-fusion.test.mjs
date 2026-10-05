// Lot 3, étape 7 — lecture de la patente : fusion des trois couches (cachet vérifié, puis texte du PDF, puis
// reconnaissance de caractères), tri des champs lus face à la fiche, recopie d'une ligne.
//   node --test scripts/patente-fusion.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
// Données fictives seulement (société « SOCIETE EXEMPLE », identifiant 1234567A).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionner, repartir, valeurRecopiee } from '../src/components/admin/patente/fusion.ts';
import { MATRICULE_LU, imprimable, texteChamp } from '../src/components/admin/patente/types.ts';

const lu = (valeur, source, aRelire = false) => ({ valeur, source, aRelire });
const cachet = (etat = 'valide') => ({ etat, autorite: 'TN01', certificat: '0148', typeDocument: 'H1', emisLe: '22/09/2026', identifiant: '1234567A' });
const code = (champs = {}, etat) => ({ document: 'extrait_rne', champs: { matriculeFiscal: lu('1234567A', 'cachet'), rne: lu('1234567A', 'cachet'), ...champs }, lignes: ['Identifiant unique : 1234567A'], avertissements: [], cachet: cachet(etat) });
// Ce que la couche « cachet » rend pour une signature invalide : un cachet, rien d'autre.
const codeInvalide = () => ({ document: 'inconnu', champs: {}, lignes: [], avertissements: [], cachet: cachet('invalide') });
const texte = (champs = {}) => ({ document: 'extrait_rne', champs: { raisonSociale: lu('SOCIETE EXEMPLE', 'pdf'), matriculeFiscal: lu('1234567A', 'pdf'), ...champs }, lignes: ['Dénomination sociale: SOCIETE EXEMPLE'], avertissements: [], verification: { code: 'ABCDEF12GHIJKL', lien: 'https://www.registre-entreprises.tn/rne-public/#/qr-code/validation' } });
const ocr = (champs = {}, document = 'carte_fiscale') => ({ document, champs, lignes: ['SOCIETE EXEMPLE'], avertissements: [] });

test('priorité : le cachet VÉRIFIÉ l\'emporte sur le PDF, le PDF sur la reconnaissance ; chaque champ garde sa source', () => {
  const r = fusionner(code({ raisonSociale: lu('SOCIETE EXEMPLE', 'cachet') }), texte({ raisonSociale: lu('Société Exemple', 'pdf'), formeJuridique: lu('SARL', 'pdf') }), ocr({ adresse: lu('1 rue Exemple', 'ocr', true), formeJuridique: lu('SA', 'ocr', true) }));
  assert.deepEqual(r.champs.raisonSociale, lu('SOCIETE EXEMPLE', 'cachet'));
  assert.deepEqual(r.champs.matriculeFiscal, lu('1234567A', 'cachet'), 'identifiant : source cachet');
  assert.deepEqual(r.champs.formeJuridique, lu('SARL', 'pdf'));
  assert.deepEqual(r.champs.adresse, lu('1 rue Exemple', 'ocr', true));
  assert.deepEqual(r.couches, ['cachet', 'pdf', 'ocr']);
  assert.equal(r.document, 'extrait_rne');
  assert.equal(r.cachet.etat, 'valide');
  assert.equal(r.verification.code, 'ABCDEF12GHIJKL');
  assert.deepEqual(r.avertissements, []);
});

test('cachet non vérifié (certificat inconnu) : il passe APRÈS le texte du PDF', () => {
  const r = fusionner(code({ raisonSociale: lu('SOCIETE FORGEE', 'cachet', true) }, 'non_verifiable'), texte(), ocr({ adresse: lu('1 rue Exemple', 'ocr', true) }));
  assert.deepEqual(r.champs.raisonSociale, lu('SOCIETE EXEMPLE', 'pdf'), 'le texte du PDF gagne');
  assert.equal(r.champs.matriculeFiscal.source, 'pdf');
  assert.equal(r.champs.rne.source, 'cachet', 'un champ que seul le cachet porte reste proposé');
  assert.deepEqual(r.couches, ['pdf', 'cachet', 'ocr']);
  assert.equal(r.cachet.etat, 'non_verifiable');
  assert.deepEqual(r.avertissements, [], 'la raison est portée par cachet.motif, pas par un avertissement de fusion');
  // Seul : il propose encore ses champs (avant la reconnaissance de caractères).
  const seul = fusionner(code({}, 'non_verifiable'), null, ocr({ matriculeFiscal: lu('1234567A/A/M/000', 'ocr', true) }));
  assert.deepEqual(seul.couches, ['cachet', 'ocr']);
  assert.equal(seul.champs.rne.valeur, '1234567A');
});

test('cachet invalide : UN avertissement, en tête, et rien de ce que porte le code n\'est repris', () => {
  const r = fusionner({ ...codeInvalide(), champs: { raisonSociale: lu('SOCIETE FORGEE', 'cachet') }, lignes: ['Dénomination : SOCIETE FORGEE'], document: 'extrait_rne' }, null, ocr({ raisonSociale: lu('SOCIETE EXEMPLE', 'ocr', true) }), ['La lecture par le texte du PDF a échoué.']);
  assert.equal(r.avertissements.length, 2);
  assert.match(r.avertissements[0], /^Cachet électronique INVALIDE : ce document a pu être modifié, ses données ne sont pas reprises/, 'en tête, avant l\'avertissement de lecture');
  assert.equal(r.cachet.etat, 'invalide');
  assert.deepEqual(r.champs.raisonSociale, lu('SOCIETE EXEMPLE', 'ocr', true), 'aucun champ du code');
  assert.equal(r.lignes.includes('Dénomination : SOCIETE FORGEE'), false, 'aucune ligne du code');
  assert.equal(r.document, 'carte_fiscale', 'le type du document ne vient pas du code');
  assert.deepEqual(r.couches, ['ocr']);
  const seul = fusionner(codeInvalide(), null, null);
  assert.equal(seul.document, 'inconnu');
  assert.deepEqual(seul.champs, {});
  assert.equal(seul.avertissements.length, 1);
  const sansSignature = fusionner({ ...codeInvalide(), cachet: { ...cachet('invalide'), motif: 'signature absente' } }, null, null);
  assert.match(sansSignature.avertissements[0], /^Cachet électronique INVALIDE \(signature absente\) : /, 'la raison exacte vient de cachet.motif');
});

test('même valeur lue plus sûrement par une autre couche : la lecture sûre remplace celle qui était « à relire »', () => {
  // Cachet valide d'un type de document inconnu : ses champs sont « à relire » ; le texte du PDF dit la même chose.
  const r = fusionner(code({ matriculeFiscal: lu('1234567A', 'cachet', true), rne: lu('1234567A', 'cachet', true) }), texte({ rne: lu('7654321B', 'pdf') }), null);
  assert.deepEqual(r.champs.matriculeFiscal, lu('1234567A', 'pdf'), 'même valeur : la lecture sûre est gardée');
  assert.deepEqual(r.champs.rne, lu('1234567A', 'cachet', true), 'valeur différente : la priorité ne change pas');
  assert.equal(r.avertissements.length, 1, 'le désaccord sur le RNE reste signalé');
});

test('matricule : même racine et suffixe lu par la reconnaissance → le matricule complet est pris (à relire)', () => {
  const r = fusionner(code(), null, ocr({ matriculeFiscal: lu('1234567A/A/M/000', 'ocr', true) }));
  assert.deepEqual(r.champs.matriculeFiscal, lu('1234567A/A/M/000', 'ocr', true));
  assert.equal(r.champs.rne.valeur, '1234567A');
  assert.deepEqual(r.avertissements, []);
});

test('désaccord sur l\'identifiant : la lecture la plus sûre est gardée, l\'admin est prévenu une seule fois', () => {
  const r = fusionner(code(), null, ocr({ matriculeFiscal: lu('1234567B/A/M/000', 'ocr', true), rne: lu('1234567B', 'ocr', true) }, 'carte_auto_entrepreneur'));
  assert.equal(r.champs.matriculeFiscal.valeur, '1234567A');
  assert.equal(r.champs.rne.valeur, '1234567A');
  assert.equal(r.avertissements.length, 1, 'un seul avertissement pour le même désaccord (matricule et RNE)');
  assert.match(r.avertissements[0], /Désaccord sur l'identifiant : le cachet électronique donne 1234567A, la reconnaissance de caractères donne 1234567B/);
});

test('une seule couche, aucune couche, avertissements de lecture et lignes sans doublon', () => {
  const seul = fusionner(null, null, ocr({ raisonSociale: lu('SOCIETE EXEMPLE', 'ocr', true) }));
  assert.equal(seul.document, 'carte_fiscale');
  assert.equal(seul.cachet, null);
  assert.equal(seul.verification, null);
  assert.deepEqual(seul.couches, ['ocr']);
  const rien = fusionner(null, null, null, ['La lecture par le texte du PDF a échoué.']);
  assert.equal(rien.document, 'inconnu');
  assert.deepEqual(rien.champs, {});
  assert.deepEqual(rien.avertissements, ['La lecture par le texte du PDF a échoué.']);
  const lignes = fusionner(code(), { ...texte(), lignes: ['A', ' A ', '', 'B'] }, { ...ocr(), lignes: ['B', 'C'], avertissements: ['x', 'x'] });
  assert.deepEqual(lignes.lignes, ['A', 'B', 'C', 'Identifiant unique : 1234567A']);
  assert.deepEqual(lignes.avertissements, ['x']);
  assert.equal(lignes.document, 'extrait_rne', 'le type du document vient de la couche la plus sûre qui le reconnaît');
  const inconnuPuisOcr = fusionner({ ...code(), document: 'inconnu' }, null, ocr({}, 'carte_auto_entrepreneur'));
  assert.equal(inconnuPuisOcr.document, 'carte_auto_entrepreneur');
});

test('repartir : seuls les champs VIDES de la fiche sont à remplir ; un champ rempli autrement est seulement proposé', () => {
  const fiche = { raisonSociale: 'Ancienne SARL', formeJuridique: null, matriculeFiscal: '', adresse: '   ', ville: '4011 Hammam Sousse', rne: undefined };
  const lus = {
    raisonSociale: lu('SOCIETE EXEMPLE', 'cachet'), formeJuridique: lu('SARL', 'pdf'), matriculeFiscal: lu('1234567A', 'cachet'),
    adresse: lu('1 rue Exemple', 'ocr', true), ville: lu('4011 Hammam Sousse', 'pdf'), rne: lu('1234567A', 'cachet'),
  };
  const { aRemplir, aProposer } = repartir(fiche, lus);
  assert.deepEqual(Object.keys(aRemplir).sort(), ['adresse', 'formeJuridique', 'matriculeFiscal', 'rne'], 'null, vide, espaces seuls, absent');
  assert.deepEqual(Object.keys(aProposer), ['raisonSociale'], 'rempli et différent : proposé, jamais rempli');
  assert.equal('ville' in aRemplir || 'ville' in aProposer, false, 'valeur identique : ni l\'un ni l\'autre');
  assert.deepEqual(aRemplir.adresse, lu('1 rue Exemple', 'ocr', true), 'la valeur lue garde sa source et son « à relire »');
  assert.deepEqual(repartir({}, {}), { aRemplir: {}, aProposer: {} });
  assert.deepEqual(repartir({ ville: 'Tunis' }, { ville: { valeur: '', source: 'ocr', aRelire: true } }), { aRemplir: {}, aProposer: {} }, 'valeur lue vide : ignorée');
});

test('repartir : un matricule lu qui n\'est que le début de celui de la fiche n\'est pas proposé', () => {
  const racine = { matriculeFiscal: lu('1234567A', 'cachet') };
  assert.deepEqual(repartir({ matriculeFiscal: '1234567A/A/M/000' }, racine).aProposer, {}, 'la fiche est déjà plus complète');
  assert.deepEqual(Object.keys(repartir({ matriculeFiscal: '7654321B/A/M/000' }, racine).aProposer), ['matriculeFiscal'], 'autre identifiant : proposé');
  assert.deepEqual(Object.keys(repartir({ matriculeFiscal: '1234567A' }, { matriculeFiscal: lu('1234567A/A/M/000', 'ocr', true) }).aProposer), ['matriculeFiscal'], 'lecture plus complète que la fiche : proposée');
  assert.deepEqual(Object.keys(repartir({ rne: '1234567A-bis' }, { rne: lu('1234567A', 'cachet') }).aProposer), ['rne'], 'la règle ne vaut que pour le matricule');
});

test('valeurRecopiee : libellé retiré ; matricule remis dans l\'ordre de saisie', () => {
  assert.equal(valeurRecopiee('raisonSociale', 'Dénomination sociale: SOCIETE EXEMPLE'), 'SOCIETE EXEMPLE');
  assert.equal(valeurRecopiee('raisonSociale', 'Dénomination : SOCIETE EXEMPLE'), 'SOCIETE EXEMPLE');
  assert.equal(valeurRecopiee('adresse', '1 rue Exemple'), '1 rue Exemple', 'ligne sans libellé : entière');
  assert.equal(valeurRecopiee('adresse', '  1 rue Exemple  '), '1 rue Exemple');
  assert.equal(valeurRecopiee('raisonSociale', 'Nom commercial:'), 'Nom commercial:', 'libellé sans valeur : la ligne est gardée');
  assert.equal(valeurRecopiee('matriculeFiscal', '000 M A 1234567A'), '1234567A/A/M/000', 'ordre imprimé sur la carte → ordre de saisie');
  assert.equal(valeurRecopiee('matriculeFiscal', 'IDENTIFIANT UNIQUE : 1234567A'), '1234567A');
  assert.equal(valeurRecopiee('rne', '000 M A 1234567A'), '000 M A 1234567A', 'la remise en ordre ne vaut que pour le matricule');
});

test('texteChamp / imprimable : nettoyage comme au serveur ; l\'arabe et les émojis ne sont jamais proposés ; MATRICULE_LU exige la clé', () => {
  assert.equal(texteChamp('  Société   Décor  '), 'Société Décor');
  assert.equal(texteChamp('Societe\u{301}'), 'Societé', 'accent décomposé recomposé');
  assert.equal(texteChamp('SOCIETE\u{2010}EXEMPLE \u{2212} bloc\u{200B}B'), 'SOCIETE-EXEMPLE - blocB', 'tiret typographique, moins, espace de largeur nulle');
  assert.equal(texteChamp('\u{FB01}ne \u{FB02}eur'), 'fine fleur', 'ligatures défaites');
  assert.equal(texteChamp('a\u{85}b\u{7F}c'), 'abc', 'caractères de contrôle retirés');
  assert.equal(texteChamp('1 rue\u{A0}Exemple'), '1 rue Exemple', 'espace insécable réduite');
  assert.equal(texteChamp('\u{634}\u{631}\u{643}\u{629}'), '', 'arabe');
  assert.equal(texteChamp('Tunis \u{1F334}'), '', 'émoji');
  assert.equal(texteChamp(null), '');
  assert.equal(imprimable('\u{152}uvre \u{2014} \u{AB} test \u{BB} \u{20AC}'), true);
  assert.equal(imprimable('a\u{85}b'), false, 'caractère de contrôle brut');
  for (const ok of ['1234567A', '1234567A/A/M/000']) assert.equal(MATRICULE_LU.test(ok), true, ok);
  for (const ko of ['1234567', '1234567/A/M/000', '1234567/A/M/006', '123456A', '1234567A/A/M', '1234567a']) assert.equal(MATRICULE_LU.test(ko), false, ko);
});
