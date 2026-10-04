// Lot 3, étape 7 — lecture de la patente : fusion des trois couches (cachet, puis texte du PDF, puis OCR).
//   node --test scripts/patente-fusion.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
// Données fictives seulement (société « SOCIETE EXEMPLE », identifiant 1234567A).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionner } from '../src/components/admin/patente/fusion.ts';
import { MATRICULE_LU, imprimable, texteChamp } from '../src/components/admin/patente/types.ts';

const lu = (valeur, source, aRelire = false) => ({ valeur, source, aRelire });
const cachet = (etat = 'valide') => ({ etat, autorite: 'TN01', certificat: '0148', typeDocument: 'H1', emisLe: '22/09/2026', identifiant: '1234567A' });
const code = (champs = {}, etat) => ({ document: 'extrait_rne', champs: { matriculeFiscal: lu('1234567A', 'cachet'), rne: lu('1234567A', 'cachet'), ...champs }, lignes: ['Identifiant unique : 1234567A'], avertissements: [], cachet: cachet(etat) });
const texte = (champs = {}) => ({ document: 'extrait_rne', champs: { raisonSociale: lu('SOCIETE EXEMPLE', 'pdf'), matriculeFiscal: lu('1234567A', 'pdf'), ...champs }, lignes: ['Dénomination sociale: SOCIETE EXEMPLE'], avertissements: [], verification: { code: 'ABCDEF12GHIJKL', lien: 'https://www.registre-entreprises.tn/rne-public/#/qr-code/validation' } });
const ocr = (champs = {}, document = 'carte_fiscale') => ({ document, champs, lignes: ['SOCIETE EXEMPLE'], avertissements: [] });

test('priorité : le cachet l\'emporte sur le PDF, le PDF sur l\'OCR ; chaque champ garde sa source', () => {
  const r = fusionner(code({ raisonSociale: lu('SOCIETE EXEMPLE', 'cachet') }), texte({ raisonSociale: lu('Société Exemple', 'pdf'), formeJuridique: lu('SARL', 'pdf') }), ocr({ adresse: lu('1 rue Exemple', 'ocr', true), formeJuridique: lu('SA', 'ocr', true) }));
  assert.equal(r.champs.raisonSociale.source, 'cachet');
  assert.equal(r.champs.raisonSociale.valeur, 'SOCIETE EXEMPLE');
  assert.deepEqual(r.champs.formeJuridique, lu('SARL', 'pdf'));
  assert.deepEqual(r.champs.adresse, lu('1 rue Exemple', 'ocr', true));
  assert.deepEqual(r.couches, ['cachet', 'pdf', 'ocr']);
  assert.equal(r.document, 'extrait_rne');
  assert.equal(r.cachet.etat, 'valide');
  assert.equal(r.verification.code, 'ABCDEF12GHIJKL');
  assert.deepEqual(r.avertissements, []);
});

test('matricule : même racine et suffixe lu par l\'OCR → le matricule complet est pris (à relire)', () => {
  const r = fusionner(code(), null, ocr({ matriculeFiscal: lu('1234567A/A/M/000', 'ocr', true) }));
  assert.deepEqual(r.champs.matriculeFiscal, lu('1234567A/A/M/000', 'ocr', true));
  assert.equal(r.champs.rne.valeur, '1234567A');
  assert.deepEqual(r.avertissements, []);
});

test('désaccord sur l\'identifiant : la lecture la plus sûre est gardée, l\'admin est prévenu', () => {
  const r = fusionner(code(), null, ocr({ matriculeFiscal: lu('1234567B/A/M/000', 'ocr', true), rne: lu('1234567B', 'ocr', true) }, 'carte_auto_entrepreneur'));
  assert.equal(r.champs.matriculeFiscal.valeur, '1234567A');
  assert.equal(r.champs.rne.valeur, '1234567A');
  assert.equal(r.avertissements.length, 1, 'un seul avertissement pour le même désaccord (matricule et RNE)');
  assert.match(r.avertissements[0], /Désaccord sur l'identifiant : le cachet électronique donne 1234567A, la reconnaissance de caractères donne 1234567B/);
});

test('cachet invalide : avertissement en tête ; non vérifiable : pas d\'avertissement de fusion', () => {
  const invalide = fusionner(code({}, 'invalide'), texte(), null);
  assert.match(invalide.avertissements[0], /signature du cachet électronique est INVALIDE/);
  assert.equal(invalide.cachet.etat, 'invalide');
  const inconnu = fusionner(code({}, 'non_verifiable'), null, null);
  assert.deepEqual(inconnu.avertissements, []);
  assert.equal(inconnu.cachet.etat, 'non_verifiable');
});

test('une seule couche, aucune couche, avertissements de lecture et lignes sans doublon', () => {
  const seul = fusionner(null, null, ocr({ raisonSociale: lu('SOCIETE EXEMPLE', 'ocr', true) }));
  assert.equal(seul.document, 'carte_fiscale');
  assert.equal(seul.cachet, null);
  assert.equal(seul.verification, null);
  assert.deepEqual(seul.couches, ['ocr']);
  const rien = fusionner(null, null, null, ['La lecture par le texte du PDF a échoué : les autres lectures ont été gardées.']);
  assert.equal(rien.document, 'inconnu');
  assert.deepEqual(rien.champs, {});
  assert.equal(rien.avertissements.length, 1);
  const lignes = fusionner(code(), { ...texte(), lignes: ['A', ' A ', '', 'B'] }, { ...ocr(), lignes: ['B', 'C'], avertissements: ['x', 'x'] });
  assert.deepEqual(lignes.lignes, ['A', 'B', 'C', 'Identifiant unique : 1234567A']);
  assert.deepEqual(lignes.avertissements, ['x']);
  assert.equal(lignes.document, 'extrait_rne', 'le type du document vient de la couche la plus sûre qui le reconnaît');
  const inconnuPuisOcr = fusionner({ ...code(), document: 'inconnu' }, null, ocr({}, 'carte_auto_entrepreneur'));
  assert.equal(inconnuPuisOcr.document, 'carte_auto_entrepreneur');
});

test('texteChamp / imprimable : l\'arabe et les émojis ne sont jamais proposés ; MATRICULE_LU exige la clé', () => {
  assert.equal(texteChamp('  Société   Décor  '), 'Société Décor');
  assert.equal(texteChamp('Societé'), 'Societé', 'accent décomposé recomposé');
  assert.equal(texteChamp('شركة'), '');
  assert.equal(texteChamp('Tunis 🌴'), '');
  assert.equal(texteChamp(null), '');
  assert.equal(imprimable('Œuvre — « test » €'), true);
  assert.equal(imprimable('a\u0085b'), false, 'caractère de contrôle C1');
  for (const ok of ['1234567A', '1234567A/A/M/000']) assert.equal(MATRICULE_LU.test(ok), true, ok);
  for (const ko of ['1234567', '1234567/A/M/000', '1961453/A/M/006', '123456A', '1234567A/A/M', '1234567a']) assert.equal(MATRICULE_LU.test(ko), false, ko);
});
