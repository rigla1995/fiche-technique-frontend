// Lot 3, étape 7 : couche « cachet » de la lecture de la patente — code « 2D-DOC » (DataMatrix signé).
// Fonctions pures de src/components/admin/patente/code2d/ : structure du code, signature, champs proposés, fenêtres
// de recherche et garde de temps de la lecture optique.
//   node --test scripts/patente-code2d.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
// Données SYNTHÉTIQUES seulement : société et identifiant fictifs, paire de clés P-256 générée ici. Aucun document
// réel n'entre dans le dépôt. La lecture optique elle-même (zxing, pdf.js, canvas) se recette dans un navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { analyser2dDoc, dateDepuisJours, interpreterCode2d } from '../src/components/admin/patente/code2d/analyse2ddoc.ts';
import { FENETRES_BALAYAGE_MAX, echeance, fenetresBalayage, fenetresImage } from '../src/components/admin/patente/code2d/fenetres.ts';
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
const sequenceDer = (...entiers) => {
  const corps = entiers.flat();
  // Longueur DER : sur un octet sous 128 ; « 0x81 » puis un octet à partir de 128 (deux entiers de P-521).
  return new Uint8Array([0x30, ...(corps.length < 128 ? [corps.length] : [0x81, corps.length]), ...corps]);
};
// « r || s » (64 octets pour P-256, 96 pour P-384, 132 pour P-521) → DER.
const derDepuisBrut = (brut) => sequenceDer(entierDer(brut.subarray(0, brut.length / 2)), entierDer(brut.subarray(brut.length / 2)));
const signatureBruteDe = async (donneesSignees) =>
  new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, paire.privateKey, utf8(donneesSignees)));
const signer = async (donneesSignees) => base64SansBourrage(derDepuisBrut(await signatureBruteDe(donneesSignees)));
const codeSigne = async (donnees, optionsEntete) => {
  const donneesSignees = entete(optionsEntete) + message(donnees);
  return donneesSignees + US + (await signer(donneesSignees));
};

// Ordre n de la courbe P-256, et entiers de 32 octets pour fabriquer des signatures dégénérées.
const ORDRE = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const octets32 = (n) => Uint8Array.from(n.toString(16).padStart(64, '0').match(/../g), (o) => parseInt(o, 16));
const entierDe = (octets) => BigInt(`0x${hex(octets)}`);
const signatureB64 = (r, s) => base64SansBourrage(sequenceDer(entierDer(octets32(r)), entierDer(octets32(s))));

// Signature d'une AUTRE courbe que P-256 (un futur certificat), en DER et base64 sans bourrage : paire générée ici.
const HACHAGES = { 'P-384': 'SHA-384', 'P-521': 'SHA-512' };
const signerSurCourbe = async (courbe, donneesSignees) => {
  const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: courbe }, false, ['sign']);
  const brut = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: HACHAGES[courbe] }, privateKey, utf8(donneesSignees)));
  return base64SansBourrage(derDepuisBrut(brut));
};
// Entier de `taille` octets exactement (premier octet non nul, bit de poids fort à zéro), pour les limites de forme.
const entierDeTaille = (taille) => new Uint8Array(taille).fill(0x5a).fill(0x01, 0, 1);
const NON_VERIFIABLE = { etat: 'non_verifiable', motif: 'certificat_inconnu' };
const ILLISIBLE = { etat: 'invalide', motif: 'signature_illisible' };

const NOTE = "racine seulement : le complément (/A/M/000) figure sur la carte d'identification fiscale";
const champ = (valeur, note, aRelire = false) => (note ? { valeur, source: 'cachet', aRelire, note } : { valeur, source: 'cachet', aRelire });
const ARABE = /\p{Script=Arabic}/u;
// Textes vus par l'admin : « cachet électronique », jamais le nom technique du code ni le jargon de la lecture.
const JARGON = /2D|\bOCR\b|\bTLV\b|\bcouches?\b|\bpasses?\b|\bvotes?\b/i;
const textesVus = (lecture) => [
  ...lecture.avertissements, ...lecture.lignes, lecture.cachet.motif ?? '', ...Object.values(lecture.champs).map((c) => c.note ?? ''),
];

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
  // Petits entiers : remis sur 32 octets.
  assert.deepEqual([...signatureBrute(sequenceDer([0x02, 1, 5], [0x02, 2, 0, 0x80]))], [...new Uint8Array(31), 5, ...new Uint8Array(31), 0x80]);
});

test('signature : DER strict — longueur fausse, octet en trop, écriture non canonique → illisible', () => {
  const r = new Uint8Array(32).fill(0x11);
  const s = new Uint8Array(32).fill(0x22);
  const corps = [...entierDer(r), ...entierDer(s)]; // 2 x (0x02, 32, valeur)
  const der = new Uint8Array([0x30, corps.length, ...corps]);
  assert.ok(signatureBrute(der), 'le vecteur de départ est lisible');
  const refuses = {
    'vide': [],
    'un seul octet': [0x30],
    'pas une SEQUENCE': [0x31, ...der.subarray(1)],
    'octet en trop après la SEQUENCE': [...der, 0],
    'octet en trop DANS la SEQUENCE': [0x30, corps.length + 1, ...corps, 0],
    'longueur de SEQUENCE trop courte': [0x30, corps.length - 1, ...corps],
    'longueur de SEQUENCE trop longue': [0x30, corps.length + 1, ...corps],
    'longueur en forme longue (0x81)': [0x30, 0x81, corps.length, ...corps],
    'longueur indéfinie (0x80)': [0x30, 0x80, ...corps, 0, 0],
    'r de 33 octets': sequenceDer([0x02, 33, 1, ...new Uint8Array(32)], [0x02, 1, 1]),
    'r de 34 octets, zéro de tête compris': sequenceDer([0x02, 34, 0, 0x80, ...new Uint8Array(32)], [0x02, 1, 1]),
    'r vide': sequenceDer([0x02, 0], entierDer(s)),
    's vide': sequenceDer(entierDer(r), [0x02, 0]),
    's absent': sequenceDer(entierDer(r)),
    'un troisième entier': sequenceDer(entierDer(r), entierDer(s), [0x02, 1, 1]),
    'r qui n’est pas un INTEGER': sequenceDer([0x03, 32, ...r], entierDer(s)),
    's qui n’est pas un INTEGER': sequenceDer(entierDer(r), [0x04, 32, ...s]),
    'r négatif (bit de poids fort sans zéro de tête)': sequenceDer([0x02, 32, 0x80, ...r.subarray(1)], entierDer(s)),
    's négatif': sequenceDer(entierDer(r), [0x02, 32, 0xff, ...s.subarray(1)]),
    'zéro de tête superflu sur r': sequenceDer([0x02, 33, 0, ...r], entierDer(s)),
    'zéro de tête superflu sur s': sequenceDer(entierDer(r), [0x02, 33, 0, ...s]),
    's qui annonce plus d’octets qu’il n’en reste': [0x30, corps.length, ...corps.slice(0, 35), 33, ...s],
    'r qui annonce toute la suite': [0x30, corps.length, 0x02, corps.length - 2, ...corps.slice(2)],
  };
  for (const [cas, octets] of Object.entries(refuses)) assert.equal(signatureBrute(new Uint8Array(octets)), null, cas);
  // Signature tronquée, à n'importe quelle longueur.
  for (let n = 0; n < der.length; n++) assert.equal(signatureBrute(der.subarray(0, n)), null, `tronquée à ${n} octets`);
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
  assert.deepEqual(await verifierSignature(donneesSignees, '', 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_absente' });
  assert.deepEqual(await verifierSignature(donneesSignees, '  ', 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_absente' });
  for (const pasUnTexte of [undefined, 42, {}]) {
    assert.deepEqual(await verifierSignature(donneesSignees, pasUnTexte, 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_absente' });
  }
  assert.deepEqual(await verifierSignature(donneesSignees, 'pas du base64 !', 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_illisible' });
  assert.deepEqual(await verifierSignature(donneesSignees, 'AQID', 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_illisible' });
  // Signature tronquée, à n'importe quelle longueur : jamais « valide ».
  for (let n = 0; n < signature.length; n++) {
    assert.equal((await verifierSignature(donneesSignees, signature.slice(0, n), 'ZZ01', '0001', CLES_TEST)).etat, 'invalide', `tronquée à ${n} caractères`);
  }
});

test('signature : r ou s nul → invalide, quel que soit le certificat ; égal ou supérieur à l’ordre de P-256 → invalide sous une clé connue', async () => {
  const donneesSignees = entete() + message(DONNEES_EXTRAIT);
  const brut = await signatureBruteDe(donneesSignees);
  const r = entierDe(brut.subarray(0, 32));
  const s = entierDe(brut.subarray(32));
  // Témoin : la fabrique donne bien une signature valide à partir de r et s.
  assert.deepEqual(await verifierSignature(donneesSignees, signatureB64(r, s), 'ZZ01', '0001', CLES_TEST), { etat: 'valide', motif: null });
  const max = 2n ** 256n - 1n;
  const degenerees = {
    'r = 0': [0n, s], 's = 0': [r, 0n], 'r = s = 0': [0n, 0n],
    'r = n': [ORDRE, s], 's = n': [r, ORDRE], 'r = n + 1': [ORDRE + 1n, s], 's = n + 1': [r, ORDRE + 1n],
    'r = 2^256 - 1': [max, s], 's = 2^256 - 1': [r, max],
  };
  for (const [cas, [r2, s2]] of Object.entries(degenerees)) {
    const fausse = { etat: 'invalide', motif: 'signature_fausse' };
    assert.deepEqual(await verifierSignature(donneesSignees, signatureB64(r2, s2), 'ZZ01', '0001', CLES_TEST), fausse, cas);
    // Certificat inconnu : la courbe l'est aussi. Un entier nul n'est une signature sur aucune courbe : il ne devient
    // pas « non vérifiable ». Un entier au-delà de l'ordre de P-256 peut être juste sur une autre courbe : non vérifiable.
    const sansCle = r2 === 0n || s2 === 0n ? fausse : NON_VERIFIABLE;
    assert.deepEqual(await verifierSignature(donneesSignees, signatureB64(r2, s2), 'ZZ01', '0002', CLES_TEST), sansCle, `${cas}, certificat inconnu`);
  }
  // Bornes de l'intervalle [1, n-1] : lisibles, mais fausses pour ces données.
  assert.equal((await verifierSignature(donneesSignees, signatureB64(1n, 1n), 'ZZ01', '0001', CLES_TEST)).etat, 'invalide');
  assert.equal((await verifierSignature(donneesSignees, signatureB64(ORDRE - 1n, ORDRE - 1n), 'ZZ01', '0001', CLES_TEST)).etat, 'invalide');
  assert.equal((await verifierSignature(donneesSignees, signatureB64(1n, ORDRE - 1n), 'ZZ01', '0002', CLES_TEST)).etat, 'non_verifiable');
  // Tolérance connue, propre à ECDSA : (r, n - s) vaut (r, s). Les deux écritures sont acceptées, comme par WebCrypto.
  assert.equal((await verifierSignature(donneesSignees, signatureB64(r, ORDRE - s), 'ZZ01', '0001', CLES_TEST)).etat, 'valide');
  // DER non canonique d'une signature par ailleurs juste : jamais « valide ».
  const rDer = entierDer(octets32(r));
  const sDer = entierDer(octets32(s));
  const corps = [...rDer, ...sDer];
  const nonCanoniques = {
    'forme longue': [0x30, 0x81, corps.length, ...corps],
    'octet en trop': [0x30, corps.length, ...corps, 0],
    'octet en trop dans la SEQUENCE': [0x30, corps.length + 1, ...corps, 0],
    'zéro de tête superflu': [...sequenceDer([0x02, rDer[1] + 1, 0, ...rDer.slice(2)], sDer)],
  };
  for (const [cas, octets] of Object.entries(nonCanoniques)) {
    const illisible = { etat: 'invalide', motif: 'signature_illisible' };
    assert.deepEqual(await verifierSignature(donneesSignees, base64SansBourrage(octets), 'ZZ01', '0001', CLES_TEST), illisible, cas);
    assert.deepEqual(await verifierSignature(donneesSignees, base64SansBourrage(octets), 'ZZ01', '0002', CLES_TEST), illisible, `${cas}, certificat inconnu`);
  }
});

test('clé intégrée TN01/0148 : ancrée par son empreinte, importable en P-256', async () => {
  assert.deepEqual(Object.keys(CLES_PUBLIQUES), ['TN01/0148']);
  const spki = octetsBase64(CLES_PUBLIQUES['TN01/0148']);
  assert.equal(spki.length, 91);
  // Empreinte SHA-256 de la clé publique de la table : une clé remplacée par erreur rendrait « invalide » tout document authentique.
  assert.equal(createHash('sha256').update(spki).digest('hex'), 'b68f914055d3bb033e845c39c551c76498a2c3af9a88ecc88c5a570ddfb144fe');
  const cle = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(cle.algorithm.namedCurve, 'P-256');
});

test('certificat absent de la table, signature bien formée → non vérifiable (jamais « faux ») : champs à relire, raison dans le cachet', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const [donneesSignees, signature] = code.split(US);
  // Table intégrée par défaut : elle ne connaît pas le certificat du test.
  assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001'), { etat: 'non_verifiable', motif: 'certificat_inconnu' });
  assert.equal((await verifierSignature(donneesSignees, signature, 'ZZ01', '0002', CLES_TEST)).etat, 'non_verifiable');
  // Clé de la table inutilisable : on ne sait pas vérifier, on ne dit pas « invalide ».
  assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001', { 'ZZ01/0001': 'AQID' }), { etat: 'non_verifiable', motif: 'verification_indisponible' });

  const lecture = await interpreterCode2d(code);
  assert.deepEqual(lecture.cachet, {
    etat: 'non_verifiable', autorite: 'ZZ01', certificat: '0001', typeDocument: 'H1', emisLe: '10/03/2025', identifiant: '1234567A',
    motif: 'certificat inconnu',
  });
  // Un seul message à l'écran : la raison est dans le cachet, pas dans les avertissements.
  assert.deepEqual(lecture.avertissements, []);
  // Le code reste lu : ses données sont proposées, toutes « à relire ».
  assert.equal(lecture.document, 'extrait_rne');
  assert.deepEqual(lecture.champs, {
    matriculeFiscal: champ('1234567A', NOTE, true),
    rne: champ('1234567A', undefined, true),
    raisonSociale: champ('SOCIETE EXEMPLE', undefined, true),
    representantQualite: champ('Gérant', undefined, true),
  });
  assert.equal(lecture.lignes.length, 6);
  assert.doesNotMatch(textesVus(lecture).join(' | '), JARGON);
});

test('certificat inconnu : un code sans signature lisible est invalide, il ne remplit pas la fiche', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const [donneesSignees, signature] = code.split(US);
  // Le certificat annoncé ne change rien : sans signature lisible, « invalide ».
  for (const cles of [undefined, CLES_TEST, {}]) {
    assert.deepEqual(await verifierSignature(donneesSignees, null, 'ZZ01', '0002', cles), { etat: 'invalide', motif: 'signature_absente' });
    assert.deepEqual(await verifierSignature(donneesSignees, '', 'ZZ01', '0002', cles), { etat: 'invalide', motif: 'signature_absente' });
    assert.deepEqual(await verifierSignature(donneesSignees, 'AQID', 'ZZ01', '0002', cles), { etat: 'invalide', motif: 'signature_illisible' });
    assert.deepEqual(await verifierSignature(donneesSignees, signature.slice(0, -4), 'ZZ01', '0002', cles), { etat: 'invalide', motif: 'signature_illisible' });
  }
  // Le scénario du constat : identifiant et dénomination modifiés, certificat changé d'un caractère, signature
  // retirée, vide ou remplacée par n'importe quoi.
  const modifie = entete({ certificat: '0002' }) + message([['37', '7654321B'], ['YE', 'SOCIETE FORGEE'], ['0J', GERANT_ARABE]]);
  const motifs = { [modifie]: 'signature absente', [modifie + US]: 'signature absente', [`${modifie}${US}AQID`]: 'signature illisible' };
  for (const [texte, motif] of Object.entries(motifs)) {
    for (const cles of [undefined, CLES_TEST]) {
      const lecture = await interpreterCode2d(texte, cles);
      assert.equal(lecture.cachet.etat, 'invalide');
      assert.equal(lecture.cachet.motif, motif);
      assert.deepEqual(lecture.champs, {});
      assert.deepEqual(lecture.lignes, []);
      assert.deepEqual(lecture.avertissements, []);
      assert.equal(lecture.document, 'inconnu');
    }
  }
  // La signature d'un AUTRE contenu, recollée : bien formée, donc « non vérifiable » sous un certificat inconnu —
  // mais rien n'est sûr : tout est « à relire ».
  const recolle = await interpreterCode2d(modifie + US + signature, CLES_TEST);
  assert.equal(recolle.cachet.etat, 'non_verifiable');
  assert.ok(Object.keys(recolle.champs).length > 0);
  for (const lu of Object.values(recolle.champs)) assert.equal(lu.aRelire, true);
});

test('certificat inconnu + signature P-384 bien formée → non vérifiable : champs proposés, tous à relire', async () => {
  // Un futur certificat sur une autre courbe que P-256 : ses documents authentiques ne sortent pas « invalides ».
  const donneesSignees = entete({ certificat: '0002' }) + message(DONNEES_EXTRAIT);
  const signature = await signerSurCourbe('P-384', donneesSignees);
  for (const cles of [undefined, CLES_TEST, {}]) {
    assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0002', cles), NON_VERIFIABLE);
  }
  const lecture = await interpreterCode2d(donneesSignees + US + signature, CLES_TEST);
  assert.deepEqual(lecture.cachet, {
    etat: 'non_verifiable', autorite: 'ZZ01', certificat: '0002', typeDocument: 'H1', emisLe: '10/03/2025', identifiant: '1234567A',
    motif: 'certificat inconnu',
  });
  assert.equal(lecture.document, 'extrait_rne');
  assert.deepEqual(lecture.champs, {
    matriculeFiscal: champ('1234567A', NOTE, true),
    rne: champ('1234567A', undefined, true),
    raisonSociale: champ('SOCIETE EXEMPLE', undefined, true),
    representantQualite: champ('Gérant', undefined, true),
  });
  assert.equal(lecture.lignes.length, 6);
  assert.deepEqual(lecture.avertissements, []);
  assert.doesNotMatch(textesVus(lecture).join(' | '), JARGON);
  // P-521 : pareil (SEQUENCE de 128 octets ou plus, donc en forme longue).
  const p521 = await signerSurCourbe('P-521', donneesSignees);
  assert.deepEqual(await verifierSignature(donneesSignees, p521, 'ZZ01', '0002', CLES_TEST), NON_VERIFIABLE);
  assert.equal((await interpreterCode2d(donneesSignees + US + p521, CLES_TEST)).cachet.etat, 'non_verifiable');

  // Limites de la forme, sur des entiers fixes : DER strict, deux entiers non nuls d'au plus 66 octets (P-521).
  const sansCle = (octets) => verifierSignature(donneesSignees, base64SansBourrage(octets), 'ZZ01', '0002', CLES_TEST);
  const [e1, e33, e48, e66, e67] = [1, 33, 48, 66, 67].map((taille) => entierDer(entierDeTaille(taille)));
  const corps48 = [...e48, ...e48];
  const corps66 = [...e66, ...e66];
  assert.ok(corps48.length < 128 && corps66.length >= 128);
  const admises = {
    '33 octets (un de trop pour P-256)': sequenceDer(e33, e1),
    '48 octets (P-384)': sequenceDer(e48, e48),
    '66 octets (P-521), forme longue': sequenceDer(e66, e66),
    '66 octets et un zéro de tête': sequenceDer(entierDer(new Uint8Array(66).fill(0xff)), e66),
  };
  for (const [cas, octets] of Object.entries(admises)) assert.deepEqual(await sansCle(octets), NON_VERIFIABLE, cas);
  assert.deepEqual([...sequenceDer(e66, e66).subarray(0, 3)], [0x30, 0x81, corps66.length]);
  const refusees = {
    'r de 67 octets': sequenceDer(e67, e66),
    's de 67 octets': sequenceDer(e66, e67),
    'longueur de 128 ou plus sur un seul octet': [0x30, corps66.length, ...corps66],
    'forme longue sur deux octets (0x82)': [0x30, 0x82, 0, corps66.length, ...corps66],
    'forme longue, longueur fausse': [0x30, 0x81, corps66.length + 1, ...corps66],
    'forme longue, octet en trop après la SEQUENCE': [...sequenceDer(e66, e66), 0],
    'forme longue, octet en trop DANS la SEQUENCE': [0x30, 0x81, corps66.length + 1, ...corps66, 0],
    'forme longue sous 128 octets': [0x30, 0x81, corps48.length, ...corps48],
    'zéro de tête superflu': sequenceDer([0x02, 49, 0, ...entierDeTaille(48)], e48),
    'entier négatif': sequenceDer([0x02, 48, ...new Uint8Array(48).fill(0x80)], e48),
    'entier vide': sequenceDer([0x02, 0], e48),
    'un seul entier': sequenceDer(e48),
    'trois entiers': sequenceDer(e48, e48, e1),
    'r || s sans DER (96 octets)': [...entierDeTaille(48), ...entierDeTaille(48)],
    'r || s sans DER, premier octet 0x30': [0x30, ...new Uint8Array(63).fill(0x5a)],
  };
  for (const [cas, octets] of Object.entries(refusees)) assert.deepEqual(await sansCle(new Uint8Array(octets)), ILLISIBLE, cas);
  // Tronquée à n'importe quelle longueur : jamais « non vérifiable ».
  const der48 = sequenceDer(e48, e48);
  for (let n = 1; n < der48.length; n++) assert.deepEqual(await sansCle(der48.subarray(0, n)), ILLISIBLE, `tronquée à ${n} octets`);
  // Un entier nul n'est une signature sur aucune courbe.
  for (const octets of [sequenceDer([0x02, 1, 0], e48), sequenceDer(e48, [0x02, 1, 0]), sequenceDer(e66, [0x02, 1, 0])]) {
    assert.deepEqual(await sansCle(octets), { etat: 'invalide', motif: 'signature_fausse' });
  }
});

test('certificat inconnu + signature absente → invalide : rien n’est repris', async () => {
  const donneesSignees = entete({ certificat: '0002' }) + message(DONNEES_EXTRAIT);
  const absente = { etat: 'invalide', motif: 'signature_absente' };
  for (const cles of [undefined, CLES_TEST, {}]) {
    for (const signature of [null, undefined, '', '  ']) {
      assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0002', cles), absente);
    }
  }
  for (const texte of [donneesSignees, donneesSignees + US, `${donneesSignees}${US}  `]) {
    const lecture = await interpreterCode2d(texte, CLES_TEST);
    assert.deepEqual(lecture.cachet, {
      etat: 'invalide', autorite: 'ZZ01', certificat: '0002', typeDocument: 'H1', emisLe: '10/03/2025', identifiant: '1234567A',
      motif: 'signature absente',
    });
    assert.deepEqual([lecture.champs, lecture.lignes, lecture.avertissements, lecture.document], [{}, [], [], 'inconnu']);
  }
  // Témoin : le même code, avec une signature P-384 bien formée, est « non vérifiable ».
  const signe = donneesSignees + US + (await signerSurCourbe('P-384', donneesSignees));
  assert.equal((await interpreterCode2d(signe, CLES_TEST)).cachet.etat, 'non_verifiable');
});

test('certificat connu + signature P-384 → invalide : rien n’est repris', async () => {
  // Les clés connues sont des clés P-256 : la limite de 32 octets par entier tient toujours.
  const donneesSignees = entete() + message(DONNEES_EXTRAIT);
  for (const courbe of ['P-384', 'P-521']) {
    const signature = await signerSurCourbe(courbe, donneesSignees);
    assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001', CLES_TEST), ILLISIBLE, courbe);
    const lecture = await interpreterCode2d(donneesSignees + US + signature, CLES_TEST);
    assert.deepEqual(lecture.cachet, {
      etat: 'invalide', autorite: 'ZZ01', certificat: '0001', typeDocument: 'H1', emisLe: '10/03/2025', identifiant: '1234567A',
      motif: 'signature illisible',
    }, courbe);
    assert.deepEqual([lecture.champs, lecture.lignes, lecture.avertissements, lecture.document], [{}, [], [], 'inconnu'], courbe);
    // Témoin : la même signature, quand la table ne connaît pas le certificat, n'est que « non vérifiable ».
    assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001'), NON_VERIFIABLE, courbe);
  }
  // Un seul octet de trop suffit : 33 octets sous une clé connue.
  const trop = base64SansBourrage(sequenceDer(entierDer(entierDeTaille(33)), entierDer(entierDeTaille(1))));
  assert.deepEqual(await verifierSignature(donneesSignees, trop, 'ZZ01', '0001', CLES_TEST), ILLISIBLE);
  // Clé de la table intégrée : P-256 elle aussi.
  const integre = entete({ autorite: 'TN01', certificat: '0148' }) + message(DONNEES_EXTRAIT);
  const lecture = await interpreterCode2d(integre + US + (await signerSurCourbe('P-384', integre)));
  assert.equal(lecture.cachet.etat, 'invalide');
  assert.equal(lecture.cachet.motif, 'signature illisible');
  assert.deepEqual(lecture.champs, {});
});

test('clé connue de la table intégrée, signature d’une autre clé → invalide : rien n’est repris', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT, { autorite: 'TN01', certificat: '0148' });
  const lecture = await interpreterCode2d(code);
  assert.deepEqual(lecture.cachet, {
    etat: 'invalide', autorite: 'TN01', certificat: '0148', typeDocument: 'H1', emisLe: '10/03/2025', identifiant: '1234567A',
    motif: 'signature incorrecte',
  });
  assert.deepEqual(lecture.champs, {}, 'un code dont la signature est fausse ne remplit pas la fiche');
  assert.deepEqual(lecture.lignes, [], 'ni la liste du texte lu');
  assert.equal(lecture.document, 'inconnu', 'ni le type de document affiché');
  assert.deepEqual(lecture.avertissements, [], 'un seul message, affiché par l’écran d’après l’état du cachet');
});

test('WebCrypto absent (page hors HTTPS) → non vérifiable : champs à relire, raison dans le cachet', async (t) => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const [donneesSignees, signature] = code.split(US);
  const origine = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  t.after(() => Object.defineProperty(globalThis, 'crypto', origine));
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  assert.deepEqual(await verifierSignature(donneesSignees, signature, 'ZZ01', '0001', CLES_TEST), { etat: 'non_verifiable', motif: 'verification_indisponible' });
  // Sans WebCrypto, une signature absente reste « invalide ».
  assert.deepEqual(await verifierSignature(donneesSignees, null, 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_absente' });
  // Clé connue (P-256) : r ou s hors de [1, n-1] reste « invalide », ce contrôle ne dépend pas du navigateur…
  for (const [r, s] of [[0n, 1n], [1n, 0n], [ORDRE, 1n], [1n, ORDRE]]) {
    assert.deepEqual(await verifierSignature(donneesSignees, signatureB64(r, s), 'ZZ01', '0001', CLES_TEST), { etat: 'invalide', motif: 'signature_fausse' }, `r = ${r}, s = ${s}`);
  }
  // … et dans l'intervalle, sans WebCrypto, on ne sait pas trancher.
  assert.deepEqual(await verifierSignature(donneesSignees, signatureB64(1n, ORDRE - 1n), 'ZZ01', '0001', CLES_TEST), { etat: 'non_verifiable', motif: 'verification_indisponible' });
  const lecture = await interpreterCode2d(code, CLES_TEST);
  assert.equal(lecture.cachet.etat, 'non_verifiable');
  assert.equal(lecture.cachet.motif, 'vérification impossible sur ce navigateur');
  assert.deepEqual(lecture.avertissements, []);
  assert.deepEqual(lecture.champs.raisonSociale, champ('SOCIETE EXEMPLE', undefined, true));
  assert.deepEqual(lecture.champs.matriculeFiscal, champ('1234567A', NOTE, true));
});

test('extrait RNE (H1) : cachet, champs en lettres latines, lignes ; l’arabe est écarté', async () => {
  const lecture = await interpreterCode2d(await codeSigne(DONNEES_EXTRAIT), CLES_TEST);
  // Cachet valide : pas de raison (`motif` absent).
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
  assert.doesNotMatch(textesVus(lecture).join(' | '), JARGON);
});

test('valeur arabe écartée : dénomination en arabe seulement, qualité inconnue', async () => {
  const donnees = [['37', '1234567A'], ['YD', DENOMINATION_ARABE], ['YE', DENOMINATION_ARABE], ['00', NOM_ARABE], ['0J', 'مدير'], ['ZZ', 'TEXTE LIBRE']];
  const lecture = await interpreterCode2d(await codeSigne(donnees), CLES_TEST);
  assert.equal(lecture.cachet.etat, 'valide');
  assert.deepEqual(Object.keys(lecture.champs).sort(), ['matriculeFiscal', 'rne']);
  assert.deepEqual(lecture.lignes, ['Identifiant unique : 1234567A', 'Donnée « ZZ » : TEXTE LIBRE']);
  assert.doesNotMatch(JSON.stringify(lecture), ARABE);
});

test('carte d’auto-entrepreneur (DP) → AUTO_ENTREPRENEUR, identifiant complet (sans note)', async () => {
  const carte = await interpreterCode2d(await codeSigne(DONNEES_CARTE, { type: 'DP' }), CLES_TEST);
  assert.equal(carte.document, 'carte_auto_entrepreneur');
  assert.equal(carte.cachet.etat, 'valide');
  assert.equal(carte.cachet.typeDocument, 'DP');
  assert.deepEqual(carte.champs, {
    // Pas de note « racine seulement » : l'identifiant d'un auto-entrepreneur est son matricule entier.
    matriculeFiscal: champ('1234567A'),
    rne: champ('1234567A'),
    formeJuridique: champ('AUTO_ENTREPRENEUR'),
  });
  assert.deepEqual(carte.lignes, ['Identifiant unique : 1234567A', 'Date : 10/03/2025']);
  assert.deepEqual(carte.avertissements, []);
  assert.doesNotMatch(JSON.stringify(carte), ARABE);
});

test('cachet valide d’un type de document inconnu (ni H1 ni DP) : champs proposés, tous à relire', async () => {
  const donnees = [['37', '1234567A'], ['YE', 'SOCIETE EXEMPLE'], ['0J', GERANT_ARABE]];
  const autre = await interpreterCode2d(await codeSigne(donnees, { type: 'X9' }), CLES_TEST);
  assert.equal(autre.cachet.etat, 'valide');
  assert.equal(autre.cachet.typeDocument, 'X9');
  assert.equal(autre.cachet.motif, undefined);
  assert.equal(autre.document, 'inconnu');
  // Le sens des étiquettes n'est établi que pour H1 et DP : rien n'est posé comme sûr, ni note ni forme juridique.
  assert.deepEqual(autre.champs, {
    matriculeFiscal: champ('1234567A', undefined, true),
    rne: champ('1234567A', undefined, true),
    raisonSociale: champ('SOCIETE EXEMPLE', undefined, true),
    representantQualite: champ('Gérant', undefined, true),
  });
  assert.deepEqual(autre.avertissements, []);
  // Témoin : les mêmes données sous un type connu sont sûres.
  const connu = await interpreterCode2d(await codeSigne(donnees, { type: 'H1' }), CLES_TEST);
  for (const lu of Object.values(connu.champs)) assert.equal(lu.aRelire, false);
});

test('identifiant absent ou de forme inattendue : pas de matricule proposé', async () => {
  const sans = await interpreterCode2d(await codeSigne([['YE', 'SOCIETE EXEMPLE']]), CLES_TEST);
  assert.equal(sans.cachet.identifiant, null);
  assert.deepEqual(Object.keys(sans.champs), ['raisonSociale']);
  assert.deepEqual(sans.avertissements, ["Le cachet électronique ne donne pas d'identifiant unique."]);
  const court = await interpreterCode2d(await codeSigne([['37', '12345A']]), CLES_TEST);
  assert.equal(court.cachet.identifiant, null);
  assert.deepEqual(court.champs, {});
  assert.deepEqual(court.lignes, ['Identifiant unique : 12345A']);
  assert.doesNotMatch(textesVus(sans).concat(textesVus(court)).join(' | '), JARGON);
});

test('point d’entrée de l’analyse : jamais d’exception sur un texte tronqué, mal formé ou modifié', async () => {
  const code = await codeSigne(DONNEES_EXTRAIT);
  const [donneesSignees, signature] = code.split(US);
  // Ce qui n'est pas un code 2D-DOC : null.
  for (const texte of ['', 'BONJOUR', 'DC04ZZ01', `DC03${code.slice(4)}`, undefined, null]) {
    assert.equal(await interpreterCode2d(texte, CLES_TEST), null);
  }
  // Zone de message amputée (la signature ne correspond plus) : cachet invalide, rien n'est proposé ni signalé.
  const ampute = await interpreterCode2d(donneesSignees.slice(0, -3) + US + signature, CLES_TEST);
  assert.equal(ampute.cachet.etat, 'invalide');
  assert.equal(ampute.cachet.motif, 'signature incorrecte');
  assert.equal(ampute.cachet.identifiant, null);
  assert.equal(ampute.document, 'inconnu');
  assert.deepEqual(ampute.champs, {});
  assert.deepEqual(ampute.lignes, []);
  assert.deepEqual(ampute.avertissements, []);
  // Zone de message illisible mais signée telle quelle (variante inconnue) : cachet valide, aucun champ.
  const illisible = `${entete()}CECI N'EST PAS DE L'HEXADECIMAL`;
  const variante = await interpreterCode2d(illisible + US + (await signer(illisible)), CLES_TEST);
  assert.equal(variante.cachet.etat, 'valide');
  assert.deepEqual(variante.champs, {});
  assert.deepEqual(variante.avertissements, ["Le contenu du cachet électronique n'a pas pu être lu."]);
  assert.doesNotMatch(textesVus(variante).join(' | '), JARGON);
  // Texte coupé avant ou dans la signature.
  assert.equal((await interpreterCode2d(donneesSignees, CLES_TEST)).cachet.etat, 'invalide');
  assert.equal((await interpreterCode2d(code.slice(0, -10), CLES_TEST)).cachet.etat, 'invalide');
  // Toutes les coupes possibles du code : jamais d'exception, jamais « valide » — et jamais « non vérifiable » non
  // plus, que le certificat soit connu (clés du test) ou non (table intégrée) : un code coupé ne propose rien.
  for (const cles of [CLES_TEST, undefined]) {
    for (let n = 0; n < code.length; n++) {
      const lecture = await interpreterCode2d(code.slice(0, n), cles);
      assert.ok(lecture === null || lecture.cachet.etat === 'invalide', `coupe à ${n}`);
      if (lecture) assert.deepEqual([lecture.champs, lecture.lignes, lecture.avertissements, lecture.document], [{}, [], [], 'inconnu'], `coupe à ${n}`);
    }
  }
});

// ---- lecture optique : où chercher, et pendant combien de temps ----
const A4 = { l: 595.32, h: 841.92 }; // points
const rendue = ({ l, h }, echelle) => ({ l: Math.ceil(l * echelle), h: Math.ceil(h * echelle) });
// Un point de l'image est-il dans au moins une fenêtre ?
const couvert = (fenetres, x, y) => fenetres.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

test('balayage : une page ordinaire garde sa grille (centres tous les 60 points, fenêtres de 260 points)', () => {
  const page = rendue(A4, 4);
  const fenetres = fenetresBalayage(page, 4);
  assert.equal(fenetres.length, 140); // 10 x 14
  assert.deepEqual(fenetres[0], [120 - 520, 120 - 520, 120 + 520, 120 + 520]);
  assert.deepEqual(fenetres[1], [360 - 520, 120 - 520, 360 + 520, 120 + 520]);
  assert.deepEqual(fenetres[10], [120 - 520, 360 - 520, 120 + 520, 360 + 520]);
  // A3, et la même page A4 vue comme une image (scan à 300 ppp) : toujours sous le plafond, grille inchangée.
  assert.equal(fenetresBalayage(rendue({ l: 841.92, h: 1190.64 }, 4), 4).length, 280);
  assert.equal(fenetresBalayage({ l: 2480, h: 3508 }, 2480 / 595).length, 140);
  assert.equal(fenetresImage(page).length, 8);
});

test('balayage : jamais plus de fenêtres que le plafond, quelle que soit la page ; la page reste couverte', () => {
  assert.equal(FENETRES_BALAYAGE_MAX, 400);
  const cas = [
    // [image en pixels, pixels par point] — pages de PDF rendues dans 16 millions de pixels au plus
    [{ l: 4000, h: 4000 }, 4000 / 14_400], // 14 400 points de côté (maximum de la norme PDF)
    [{ l: 4000, h: 4000 }, 4000 / 50_000],
    [{ l: 4000, h: 4000 }, 4000 / 1_000_000], // sans plafond : 278 millions de fenêtres
    [{ l: 4000, h: 4000 }, 1e-300],
    [{ l: 1240, h: 1754 }, 1], // scan où 1 pixel = 1 point
    [{ l: 3024, h: 4032 }, 1],
    [{ l: 16_000, h: 1000 }, 0.05], // pages très allongées
    [{ l: 1000, h: 16_000 }, 0.05],
    [{ l: 3000, h: 200 }, 200 / 595],
    [{ l: 3000, h: 2 }, 2 / 595],
    [{ l: 3000, h: 1 }, 1 / 595], // image d'un pixel de haut : 297 500 fenêtres sans plafond
    [{ l: 1, h: 3000 }, 1 / 595],
  ];
  for (const [image, pxParPoint] of cas) {
    const nom = `${image.l} x ${image.h} px, ${pxParPoint} px par point`;
    const debut = performance.now();
    const fenetres = fenetresBalayage(image, pxParPoint);
    assert.ok(performance.now() - debut < 500, `${nom} : calcul immédiat`);
    assert.ok(fenetres.length <= FENETRES_BALAYAGE_MAX, `${nom} : ${fenetres.length} fenêtres`);
    for (const [x0, y0, x1, y1] of fenetres) {
      assert.ok(Number.isFinite(x0) && Number.isFinite(y0) && x1 > x0 && y1 > y0, `${nom} : fenêtre bien formée`);
      assert.ok(Math.abs((x1 - x0) - (y1 - y0)) < 1e-6, `${nom} : fenêtre carrée`);
    }
    // Le pas et la fenêtre grandissent ensemble : le rapport côté / pas reste 260 / 60, la page reste couverte.
    if (fenetres.length > 1 && image.l > 100 && image.h > 100) {
      const cote = fenetres[0][2] - fenetres[0][0];
      const pas = fenetres[1][0] - fenetres[0][0];
      assert.ok(Math.abs(cote / pas - 260 / 60) < 1e-9, `${nom} : rapport côté / pas`);
      for (let y = 0; y <= image.h; y += image.h / 23) {
        for (let x = 0; x <= image.l; x += image.l / 23) assert.ok(couvert(fenetres, x, y), `${nom} : point (${x}, ${y}) couvert`);
      }
    }
  }
  // Une page carrée immense : le plafond est presque atteint (le balayage reste aussi fin que possible).
  assert.ok(fenetresBalayage({ l: 4000, h: 4000 }, 0.004).length >= 300);
  // Mesures aberrantes : aucune fenêtre, aucune exception.
  for (const [image, pxParPoint] of [
    [{ l: 0, h: 100 }, 1], [{ l: 100, h: 0 }, 1], [{ l: NaN, h: 100 }, 1], [{ l: 100, h: 100 }, 0], [{ l: 100, h: 100 }, -1],
    [{ l: 100, h: 100 }, NaN], [{ l: 100, h: 100 }, Infinity],
  ]) {
    assert.deepEqual(fenetresBalayage(image, pxParPoint), []);
  }
});

test('garde de temps : expire au bout de la durée accordée, pas avant', () => {
  let maintenant = 1000;
  const garde = echeance(15_000, () => maintenant);
  assert.equal(garde.expire(), false);
  assert.equal(garde.reste(), 15_000);
  maintenant += 14_999;
  assert.equal(garde.expire(), false);
  assert.equal(garde.reste(), 1);
  maintenant += 1;
  assert.equal(garde.expire(), true);
  assert.equal(garde.reste(), 0);
  maintenant += 60_000;
  assert.equal(garde.expire(), true);
  assert.equal(garde.reste(), 0);
  // Durée nulle, négative ou aberrante : expirée d'emblée (dans le doute, la recherche s'arrête).
  for (const duree of [0, -1, NaN]) {
    const g = echeance(duree, () => maintenant);
    assert.equal(g.expire(), true, String(duree));
    assert.equal(g.reste(), 0, String(duree));
  }
  // Horloge par défaut : celle du système.
  const reelle = echeance(60_000);
  assert.equal(reelle.expire(), false);
  assert.ok(reelle.reste() > 59_000 && reelle.reste() <= 60_000);
});
