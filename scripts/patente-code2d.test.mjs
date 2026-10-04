// Lot 3, étape 7 : couche « cachet » de la lecture de la patente — code « 2D-DOC » (DataMatrix signé).
// Fonctions pures de src/components/admin/patente/code2d/ : structure du code, signature, champs proposés.
//   node --test scripts/patente-code2d.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
// Données SYNTHÉTIQUES seulement : société et identifiant fictifs, paire de clés P-256 générée ici. Aucun document
// réel n'entre dans le dépôt. La lecture optique (zxing, pdf.js, canvas) se recette dans un navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyser2dDoc, dateDepuisJours, interpreterCode2d } from '../src/components/admin/patente/code2d/analyse2ddoc.ts';
import { CLES_PUBLIQUES, octetsBase64, signatureBrute, verifierSignature } from '../src/components/admin/patente/code2d/signature.ts';

const US = '\x1f';
const utf8 = (s) => new TextEncoder().encode(s);
const hex = (octets) => [...octets].map((o) => o.toString(16).padStart(2, '0').toUpperCase()).join('');
const base64SansBourrage = (octets) => Buffer.from(octets).toString('base64').replace(/=+$/, '');

// ---- fabrique d'un code fictif ----
const joursHex = (iso) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(2000, 0, 1)) / 86_400_000).toString(16).toUpperCase().padStart(4, '0');
const entete = ({ autorite = 'ZZ01', certificat = '0001', emission = '2025-03-10', signature = '2025-03-11', type = 'H1' } = {}) =>
  `DC04${autorite}${certificat}${joursHex(emission)}${joursHex(signature)}${type}01TN`;
const tlv = (etiquette, valeur) => {
  const v = utf8(valeur);
  assert.ok(etiquette.length === 2 && v.length < 256);
  return hex([etiquette.charCodeAt(0), etiquette.charCodeAt(1), v.length, ...v]);
};

const DENOMINATION_ARABE = 'شركة مثال'; // « société exemple »
const NOM_ARABE = 'فلان الفلاني'; // « Untel »
const ADRESSE_ARABE = 'نهج المثال عدد 1 تونس';
const GERANT_ARABE = 'وكيل';
const DONNEES_EXTRAIT = [
  ['37', '1234567A'], ['Y8', 'ER0000000001'], ['Y9', '10-03-2025'], ['YD', DENOMINATION_ARABE], ['YE', 'SOCIETE EXEMPLE'],
  ['BI', '1000'], ['YF', ADRESSE_ARABE], ['00', NOM_ARABE], ['0J', GERANT_ARABE],
];
const DONNEES_CARTE = [['37', '1234567A'], ['6X', 'فلان'], ['70', 'الفلاني'], ['0N', 'نشاط مثال'], ['09', ADRESSE_ARABE], ['SD', '2025-03-10']];
const message = (donnees) => donnees.map(([e, v]) => tlv(e, v)).join('');

// ---- paire de clés de test et signature « DER en base64 sans bourrage », comme dans un vrai code ----
const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const CLES_TEST = { 'ZZ01/0001': Buffer.from(await crypto.subtle.exportKey('spki', paire.publicKey)).toString('base64') };

const entierDer = (octets) => {
  let i = 0;
  while (i < octets.length - 1 && octets[i] === 0) i++;
  const v = octets.subarray(i);
  return v[0] & 0x80 ? [0x02, v.length + 1, 0, ...v] : [0x02, v.length, ...v];
};
const derDepuisBrut = (brut) => {
  const corps = [...entierDer(brut.subarray(0, 32)), ...entierDer(brut.subarray(32))];
  return new Uint8Array([0x30, corps.length, ...corps]);
};
const signer = async (donneesSignees) => {
  const brut = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, paire.privateKey, utf8(donneesSignees)));
  return base64SansBourrage(derDepuisBrut(brut));
};
const codeSigne = async (donnees, optionsEntete) => {
  const donneesSignees = entete(optionsEntete) + message(donnees);
  return donneesSignees + US + (await signer(donneesSignees));
};

const NOTE = "racine seulement : le complément (/A/M/000) figure sur la carte d'identification fiscale";
const champ = (valeur, note) => (note ? { valeur, source: 'cachet', aRelire: false, note } : { valeur, source: 'cachet', aRelire: false });
const ARABE = /\p{Script=Arabic}/u;

test('dates : jours depuis le 01/01/2000', () => {
  assert.equal(dateDepuisJours('0000'), '2000-01-01');
  assert.equal(dateDepuisJours('0001'), '2000-01-02');
  assert.equal(dateDepuisJours('016E'), '2001-01-01'); // 366 jours : 2000 est bissextile
  assert.equal(dateDepuisJours(joursHex('2025-03-10')), '2025-03-10');
  assert.equal(dateDepuisJours('FFFF'), null); // « pas de date »
  assert.equal(dateDepuisJours('12G4'), null);
  assert.equal(dateDepuisJours('123'), null);
});

test('analyse : en-tête de 26 caractères et TLV, sans octet résiduel', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const a = analyser2dDoc(code);
  assert.equal(a.ok, true);
  assert.deepEqual(a.entete, {
    version: '04', autorite: 'ZZ01', certificat: '0001', dateEmission: '2025-03-10', dateSignature: '2025-03-11',
    typeDocument: 'H1', perimetre: '01', pays: 'TN',
  });
  assert.deepEqual(a.donnees, DONNEES_EXTRAIT.map(([etiquette, valeur]) => ({ etiquette, valeur })));
  // Aucun octet résiduel : les triplets relus couvrent exactement la zone de message.
  const relu = a.donnees.reduce((n, d) => n + 3 + utf8(d.valeur).length, 0);
  assert.equal(relu * 2, a.donneesSignees.length - 26);
  assert.equal(a.donneesSignees, code.slice(0, code.indexOf(US)));
  assert.equal(a.signature, code.slice(code.indexOf(US) + 1));
  assert.ok(!a.signature.includes('='), 'signature en base64 sans bourrage');
});

test('analyse : zone de message vide, code sans signature', () => {
  const a = analyser2dDoc(entete());
  assert.equal(a.ok, true);
  assert.deepEqual(a.donnees, []);
  assert.equal(a.signature, null);
  assert.equal(analyser2dDoc(entete() + US).signature, null);
});

test('analyse : message tronqué ou mal formé → erreur propre, jamais d’exception', () => {
  const zone = message(DONNEES_EXTRAIT);
  const cas = [
    ['', null], // vide
    ['BONJOUR', null], // pas un 2D-DOC
    ['DC04ZZ01', null], // en-tête tronqué
    [`DC04ZZ010001${'zzzz'}0000H101TN`, null], // date d'émission illisible
    [`DC03${entete().slice(4)}${zone}`, null], // version non prise en charge
    [entete() + zone.slice(0, -1), 'tronquée ou non hexadécimale'], // demi-octet
    [entete() + zone.slice(0, -4), 'tronquée'], // dernière donnée amputée de 2 octets
    [entete() + zone + '3337', 'tronquée'], // étiquette sans longueur
    [`${entete()}${zone}XYZ1`, 'non hexadécimale'],
    [entete() + tlv('37', '1234567A').replace(/^3337/, '0A37'), 'étiquette'], // étiquette hors [0-9A-Z]
  ];
  for (const [texte, erreur] of cas) {
    const a = analyser2dDoc(texte);
    assert.equal(a.ok, false, JSON.stringify(texte.slice(0, 40)));
    assert.equal(typeof a.erreur, 'string');
    if (erreur === null) assert.equal(a.entete, null, `pas un 2D-DOC : ${JSON.stringify(texte.slice(0, 40))}`);
    else {
      assert.equal(a.entete.autorite, 'ZZ01');
      assert.match(a.erreur, new RegExp(erreur));
    }
  }
  for (const entree of [undefined, null, 42, {}]) assert.equal(analyser2dDoc(entree).ok, false);
});

test('signature : base64 sans bourrage, DER → r||s de 64 octets', () => {
  assert.deepEqual([...octetsBase64('AQID')], [1, 2, 3]);
  assert.deepEqual([...octetsBase64('AQI')], [1, 2]); // sans bourrage
  assert.deepEqual([...octetsBase64('AQ==')], [1]); // avec
  assert.equal(octetsBase64(''), null);
  assert.equal(octetsBase64('A'), null);
  assert.equal(octetsBase64('AQ*D'), null);

  const r = new Uint8Array(32).fill(0x11);
  const s = new Uint8Array(32).fill(0x22);
  r[0] = 0x80; // bit de poids fort : le DER ajoute un zéro de tête, à retirer
  s[0] = 0; // zéro de tête : le DER le retire, à remettre
  const brut = new Uint8Array([...r, ...s]);
  const der = derDepuisBrut(brut);
  assert.equal(der.length, 2 + (2 + 33) + (2 + 31));
  assert.deepEqual([...signatureBrute(der)], [...brut]);
  assert.equal(signatureBrute(der.subarray(0, der.length - 1)), null); // tronquée
  assert.equal(signatureBrute(new Uint8Array([...der, 0])), null); // octet en trop
  assert.equal(signatureBrute(new Uint8Array([0x31, ...der.subarray(1)])), null); // pas une SEQUENCE
  assert.equal(signatureBrute(new Uint8Array([0x30, 37, 0x02, 33, 1, ...new Uint8Array(32), 0x02, 1, 1])), null); // r de 33 octets
  assert.equal(signatureBrute(new Uint8Array(0)), null);
});

test('signature valide avec la clé du test ; un caractère modifié → invalide', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const [donneesSignees, signature] = code.split(US);
  assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001', CLES_TEST), { etat: 'valide', motif: null });

  // Une donnée modifiée (l'identifiant « …7A » devient « …7B ») : la structure reste lisible, la signature non.
  const modifie = donneesSignees.replace(tlv('37', '1234567A'), tlv('37', '1234567B'));
  assert.notEqual(modifie, donneesSignees);
  assert.deepEqual(await verifierSignature(modifie, signature, 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_fausse' });
  // Un caractère de l'en-tête (le type de document), puis un caractère de la signature.
  assert.equal((await verifierSignature(donneesSignees.replace('H101TN', 'H201TN'), signature, 'ZZ01', '0001', CLES_TEST)).etat, 'invalide');
  const i = 20;
  const autreSignature = signature.slice(0, i) + (signature[i] === 'A' ? 'B' : 'A') + signature.slice(i + 1);
  assert.equal((await verifierSignature(donneesSignees, autreSignature, 'ZZ01', '0001', CLES_TEST)).etat, 'invalide');
  // Signature absente ou illisible, clé connue : invalide.
  assert.deepEqual(await verifierSignature(donneesSignees, null, 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_absente' });
  assert.deepEqual(await verifierSignature(donneesSignees, 'pas du base64 !', 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_illisible' });
  assert.deepEqual(await verifierSignature(donneesSignees, 'AQID', 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_illisible' });
});

test('certificat absent de la table → non vérifiable (jamais « faux »)', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const [donneesSignees, signature] = code.split(US);
  // Table intégrée par défaut : elle ne connaît pas le certificat du test.
  assert.deepEqual(Object.keys(CLES_PUBLIQUES), ['TN01/0148']);
  assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001'), { etat: 'non_verifiable', motif: 'certificat_inconnu' });
  assert.equal((await verifierSignature(donneesSignees, signature, 'ZZ01', '0002', CLES_TEST)).etat, 'non_verifiable');
  assert.equal((await verifierSignature(donneesSignees, null, 'ZZ01', '0002', CLES_TEST)).etat, 'non_verifiable');
  // Clé de la table inutilisable : on ne sait pas vérifier, on ne dit pas « invalide ».
  assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001', { 'ZZ01/0001': 'AQID' }), { etat: 'non_verifiable', motif: 'verification_indisponible' });

  const lecture = await interpreterCode2d(code);
  assert.equal(lecture.cachet.etat, 'non_verifiable');
  assert.equal(lecture.avertissements.length, 1);
  assert.match(lecture.avertissements[0], /Certificat ZZ01\/0001 inconnu/);
  assert.doesNotMatch(lecture.avertissements.join(' '), /faux|invalide/i);
  // Le code reste lu : ses données sont proposées.
  assert.equal(lecture.champs.raisonSociale.valeur, 'SOCIETE EXEMPLE');
  assert.equal(lecture.champs.matriculeFiscal.valeur, '1234567A');
});

test('clé connue de la table intégrée, signature d’une autre clé → invalide', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT, { autorite: 'TN01', certificat: '0148' });
  const lecture = await interpreterCode2d(code);
  assert.equal(lecture.cachet.etat, 'invalide');
  assert.equal(lecture.cachet.identifiant, '1234567A');
  assert.deepEqual(lecture.champs, {}, 'un code dont la signature est fausse ne remplit pas la fiche');
  assert.deepEqual(lecture.avertissements, ['Signature du code 2D invalide : ses données ne sont pas reprises.']);
});

test('WebCrypto absent (page hors HTTPS) → non vérifiable', async (t) => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const [donneesSignees, signature] = code.split(US);
  const origine = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  t.after(() => Object.defineProperty(globalThis, 'crypto', origine));
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001', CLES_TEST), { etat: 'non_verifiable', motif: 'verification_indisponible' });
});

test('extrait RNE (H1) : cachet, champs en lettres latines, lignes ; l’arabe est écarté', async () => {
  const lecture = await interpreterCode2d(await codeSigne(DONNEES_EXTRAIT), CLES_TEST);
  assert.deepEqual(lecture.cachet, {
    etat: 'valide', autorite: 'ZZ01', certificat: '0001', typeDocument: 'H1', emisLe: '10/03/2025', identifiant: '1234567A',
  });
  assert.equal(lecture.document, 'extrait_rne');
  assert.deepEqual(lecture.champs, {
    matriculeFiscal: champ('1234567A', NOTE),
    rne: champ('1234567A'),
    raisonSociale: champ('SOCIETE EXEMPLE'),
    representantQualite: champ('Gérant'), // « وكيل », par la table arabe → français
  });
  assert.deepEqual(lecture.lignes, [
    'Identifiant unique : 1234567A',
    "N° d'extrait : ER0000000001",
    'Date : 10/03/2025',
    'Dénomination : SOCIETE EXEMPLE',
    'Capital social : 1000',
    'Qualité du représentant : Gérant',
  ]);
  assert.deepEqual(lecture.avertissements, []);
  assert.doesNotMatch(JSON.stringify(lecture), ARABE, 'aucune valeur arabe dans le résultat');
});

test('valeur arabe écartée : dénomination en arabe seulement, qualité inconnue', async () => {
  const donnees = [['37', '1234567A'], ['YD', DENOMINATION_ARABE], ['YE', DENOMINATION_ARABE], ['00', NOM_ARABE], ['0J', 'مدير'], ['ZZ', 'TEXTE LIBRE']];
  const lecture = await interpreterCode2d(await codeSigne(donnees), CLES_TEST);
  assert.equal(lecture.cachet.etat, 'valide');
  assert.deepEqual(Object.keys(lecture.champs).sort(), ['matriculeFiscal', 'rne']);
  assert.deepEqual(lecture.lignes, ['Identifiant unique : 1234567A', 'Donnée « ZZ » : TEXTE LIBRE']);
  assert.doesNotMatch(JSON.stringify(lecture), ARABE);
});

test('carte d’auto-entrepreneur (DP) → AUTO_ENTREPRENEUR ; type inconnu → document inconnu', async () => {
  const carte = await interpreterCode2d(await codeSigne(DONNEES_CARTE, { type: 'DP' }), CLES_TEST);
  assert.equal(carte.document, 'carte_auto_entrepreneur');
  assert.equal(carte.cachet.etat, 'valide');
  assert.equal(carte.cachet.typeDocument, 'DP');
  assert.deepEqual(carte.champs, {
    matriculeFiscal: champ('1234567A', NOTE),
    rne: champ('1234567A'),
    formeJuridique: champ('AUTO_ENTREPRENEUR'),
  });
  assert.deepEqual(carte.lignes, ['Identifiant unique : 1234567A', 'Date : 10/03/2025']);
  assert.doesNotMatch(JSON.stringify(carte), ARABE);

  const autre = await interpreterCode2d(await codeSigne(DONNEES_CARTE, { type: 'X9' }), CLES_TEST);
  assert.equal(autre.document, 'inconnu');
  assert.equal(autre.champs.formeJuridique, undefined);
  assert.equal(autre.champs.rne.valeur, '1234567A');
});

test('identifiant absent ou de forme inattendue : pas de matricule proposé', async () => {
  const sans = await interpreterCode2d(await codeSigne([['YE', 'SOCIETE EXEMPLE']]), CLES_TEST);
  assert.equal(sans.cachet.identifiant, null);
  assert.deepEqual(Object.keys(sans.champs), ['raisonSociale']);
  assert.deepEqual(sans.avertissements, ["Le code 2D ne donne pas d'identifiant unique."]);
  const court = await interpreterCode2d(await codeSigne([['37', '12345A']]), CLES_TEST);
  assert.equal(court.cachet.identifiant, null);
  assert.deepEqual(court.champs, {});
  assert.deepEqual(court.lignes, ['Identifiant unique : 12345A']);
});

test('point d’entrée de l’analyse : jamais d’exception sur un texte tronqué, mal formé ou modifié', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const [donneesSignees, signature] = code.split(US);
  // Ce qui n'est pas un code 2D-DOC : null.
  for (const texte of ['', 'BONJOUR', 'DC04ZZ01', `DC03${code.slice(4)}`, undefined, null]) {
    assert.equal(await interpreterCode2d(texte, CLES_TEST), null);
  }
  // Zone de message amputée (la signature ne correspond plus) : cachet invalide, rien n'est proposé.
  const ampute = await interpreterCode2d(donneesSignees.slice(0, -3) + US + signature, CLES_TEST);
  assert.equal(ampute.cachet.etat, 'invalide');
  assert.equal(ampute.cachet.identifiant, null);
  assert.deepEqual(ampute.champs, {});
  assert.deepEqual(ampute.lignes, []);
  assert.deepEqual(ampute.avertissements, ['Signature du code 2D invalide : ses données ne sont pas reprises.', "Le contenu du code 2D n'a pas pu être lu."]);
  // Zone de message illisible mais signée telle quelle (variante inconnue) : cachet valide, aucun champ.
  const illisible = `${entete()}CECI N'EST PAS DE L'HEXADECIMAL`;
  const variante = await interpreterCode2d(illisible + US + (await signer(illisible)), CLES_TEST);
  assert.equal(variante.cachet.etat, 'valide');
  assert.deepEqual(variante.champs, {});
  assert.deepEqual(variante.avertissements, ["Le contenu du code 2D n'a pas pu être lu."]);
  // Texte coupé avant ou dans la signature.
  assert.equal((await interpreterCode2d(donneesSignees, CLES_TEST)).cachet.etat, 'invalide');
  assert.equal((await interpreterCode2d(code.slice(0, -10), CLES_TEST)).cachet.etat, 'invalide');
  // Toutes les coupes possibles du code : jamais d'exception, jamais « valide ».
  for (let n = 0; n < code.length; n++) {
    const lecture = await interpreterCode2d(code.slice(0, n), CLES_TEST);
    assert.ok(lecture === null || lecture.cachet.etat === 'invalide', `coupe à ${n}`);
  }
});
