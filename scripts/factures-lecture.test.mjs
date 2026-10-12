// Tests des fonctions PURES de la lecture de l'en-tête d'une facture fournisseur (étape F2 —
// src/components/client/factures/lecture/). node --test scripts/factures-lecture.test.mjs (Node ≥ 23.6 : types effacés).
// Pages construites à la main (mots et positions) : aucune reconnaissance de caractères ici ; la mesure sur le jeu de
// factures fictives (PDF, scans, photos) est dans labflow-reprise/achats-compta/ESSAI-FACTURES.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datesDuTexte, lireNombre, nombresDeRangee } from '../src/components/client/factures/lecture/nombres.ts';
import { construireRangees, motsDePdf, motsDeTesseract, rangee, segments, separerLigne } from '../src/components/client/factures/lecture/rangees.ts';
import { lireEntete, matriculesVus, nomPropre } from '../src/components/client/factures/lecture/entete.ts';
import { nomComparable, rapprocher, ressemblance } from '../src/components/client/factures/lecture/rapprocher.ts';
import { completer, decouper, incomplete, zonesDePage } from '../src/components/client/factures/lecture/chaineOcr.ts';
import { cleAttendue } from '../src/components/admin/patente/ocr/matricule.ts';

// Matricules fictifs à clé cohérente.
const mf = (id, fin = '/A/M/000') => `${id}${cleAttendue(id)}${fin}`;
const MF_FOURNISSEUR = mf('1384297');
const MF_CLIENT = mf('1658423');

// Une ligne de page : [x, texte] par bloc, mots de 6 unités par caractère, hauteur h.
const mots = (y, blocs, h = 10) => blocs.flatMap(([x, texte]) => {
  let cx = x;
  return texte.split(' ').filter(Boolean).map((t) => {
    const m = { t, x0: cx, x1: cx + t.length * 6, y0: y, y1: y + h };
    cx += (t.length + 1) * 6;
    return m;
  });
});
const page = (lignes, hauteur = 842, largeur = 595) => ({
  largeur, hauteur,
  rangees: construireRangees(lignes.flatMap(([y, blocs, h]) => mots(y, blocs, h))),
});

test('lireNombre : écritures tunisiennes des montants', () => {
  assert.equal(lireNombre('1 234,567'), 1234.567);
  assert.equal(lireNombre('1.234,567'), 1234.567);
  assert.equal(lireNombre('1,234.567'), 1234.567);
  assert.equal(lireNombre('1234.567'), 1234.567);
  assert.equal(lireNombre('1.250'), 1.25); // millimes : un seul séparateur suivi de 3 chiffres
  assert.equal(lireNombre('1.234.567'), 1234567); // milliers seuls
  assert.equal(lireNombre('19'), 19);
  assert.equal(lireNombre('(12,500)'), -12.5);
  assert.equal(lireNombre('12,'), null);
  assert.equal(lireNombre('1,2,3.4.5'), null);
  assert.equal(lireNombre('abc'), null);
});

test('nombresDeRangee : milliers séparés par une espace, monnaie, pourcentages, dates écartées', () => {
  const r = rangee(mots(0, [[0, 'Total HT : 1 234,567 DT'], [300, 'TVA 19 % le 03/10/2026']]));
  const ns = nombresDeRangee(r);
  assert.deepEqual(ns.map((n) => [n.valeur, n.pourcent]), [[1234.567, false], [19, true]]);
});

test('datesDuTexte : formats numériques et en lettres, dates impossibles écartées', () => {
  assert.deepEqual(datesDuTexte('Tunis, le 03/10/2026').map((d) => d.iso), ['2026-10-03']);
  assert.deepEqual(datesDuTexte('du 3-10-26 au 2026-10-05').map((d) => d.iso), ['2026-10-03', '2026-10-05']);
  assert.deepEqual(datesDuTexte('Sousse, le 1er septembre 2026').map((d) => d.iso), ['2026-09-01']);
  assert.deepEqual(datesDuTexte('31/02/2026 et 12.13.2026').map((d) => d.iso), []);
});

test('motsDePdf : morceaux collés réunis, mots coupés, y retourné', () => {
  const ms = motsDePdf([
    { str: 'Fac', transform: [10, 0, 0, 10, 100, 800], width: 18, height: 10 },
    { str: 'ture N° 12', transform: [10, 0, 0, 10, 118, 800], width: 60, height: 10 },
  ], 842);
  assert.deepEqual(ms.map((m) => m.t), ['Facture', 'N°', '12']);
  assert.ok(ms[0].y0 < 50 && ms[0].y0 > 30, 'y vers le bas');
});

test('motsDeTesseract : filets du tableau retirés, lignes numérotées', () => {
  const { mots: ms, lignes } = motsDeTesseract({ blocks: [{ paragraphs: [{ lines: [
    { words: [{ text: '|', confidence: 90, bbox: { x0: 0, y0: 0, x1: 2, y1: 40 } }, { text: '[Total', confidence: 90, bbox: { x0: 5, y0: 0, x1: 40, y1: 10 } }] },
    { words: [{ text: 'HT|', confidence: 90, bbox: { x0: 45, y0: 0, x1: 60, y1: 10 } }] },
  ] }] }] });
  assert.deepEqual(ms.map((m) => m.t), ['Total', 'HT']);
  assert.deepEqual(lignes, [1, 2]);
});

test('segments : un grand blanc sépare deux blocs d\'une même rangée', () => {
  const r = rangee(mots(0, [[0, 'SOCIETE EXEMPLE'], [400, 'FACTURE N° 12']]));
  assert.deepEqual(segments(r).map((s) => s.texte), ['SOCIETE EXEMPLE', 'FACTURE N° 12']);
});

// Facture type « logiciel de gestion » : fournisseur à gauche, cadre « FACTURE » à droite, client en bloc.
const factureLogiciel = () => page([
  [40, [[40, 'SOCIÉTÉ MÉDITERRANÉENNE DE'], [400, 'FACTURE']], 15],
  [58, [[40, 'DISTRIBUTION ALIMENTAIRE']], 15],
  [68, [[400, 'N° : FV-2026-00437']]],
  [80, [[40, 'Zone industrielle Charguia II — 2035 Tunis'], [400, 'Date : 21/08/2026']]],
  [93, [[40, 'Tél : 71 940 225 E-mail : commandes@smda-exemple.tn']]],
  [106, [[40, `M.F : ${MF_FOURNISSEUR} R.C : B0141992013`]]],
  [130, [[300, 'Client']]],
  [143, [[300, 'RESTAURANT LE JASMIN SARL']]],
  [157, [[300, '12, rue des Orangers, 2080 Ariana']]],
  [170, [[300, `M.F : ${MF_CLIENT}`]]],
  [215, [[40, 'N° Désignation Unité Qté P.U. HT TVA Montant HT']]],
  [232, [[40, '1 Beurre doux plaque 1 kg kg 2 24,600 19% 49,200']]],
  [249, [[40, '2 Levure boulangère 500 g paquet 4 3,950 19% 15,800']]],
  [300, [[345, 'Total HT'], [500, '65,000']]],
  [314, [[345, 'TVA 19%'], [500, '12,350']]],
  [328, [[345, 'Timbre fiscal'], [500, '1,000']]],
  [342, [[345, 'Total TTC'], [500, '78,350']]],
]);

test('lireEntete : facture de logiciel de gestion (PDF) — tout est lu, rien n\'est « à relire »', () => {
  const e = lireEntete([factureLogiciel()], 'pdf', { matricule: MF_CLIENT, noms: ['RESTAURANT LE JASMIN'] });
  assert.equal(e.matricule?.valeur, MF_FOURNISSEUR);
  assert.equal(e.matricule?.aRelire, false);
  assert.equal(e.nom?.valeur, 'SOCIÉTÉ MÉDITERRANÉENNE DE DISTRIBUTION ALIMENTAIRE');
  assert.equal(e.numero?.valeur, 'FV-2026-00437');
  assert.equal(e.date?.valeur, '2026-08-21');
  assert.equal(e.email?.valeur, 'commandes@smda-exemple.tn');
  assert.equal(e.telephone?.valeur, '71940225');
  assert.deepEqual([e.totaux.ht, e.totaux.tva, e.totaux.timbre, e.totaux.ttc, e.totaux.coherents], [65, 12.35, 1, 78.35, true]);
  assert.deepEqual(e.totaux.parTaux, [{ taux: 19, base: null, montant: 12.35 }]);
  assert.deepEqual(e.avertissements, []);
});

test('lireEntete : le matricule du client n\'est jamais pris pour celui du fournisseur', () => {
  const p = factureLogiciel();
  // Sans connaître le client : son matricule, dans le bloc « Client », est écarté quand même.
  const vus = matriculesVus([p], 'pdf');
  assert.deepEqual(vus.map((m) => [m.valeur, m.duClient]), [[MF_FOURNISSEUR, false], [MF_CLIENT, true]]);
  assert.equal(lireEntete([p], 'pdf').matricule?.valeur, MF_FOURNISSEUR);
  // Fournisseur sans matricule imprimé : seul celui du client est lu → aucun matricule proposé, avertissement.
  const sans = page([[40, [[40, 'PRIMEURS TRABELSI']], 16], [130, [[300, 'Client : RESTAURANT LE JASMIN']]], [143, [[300, `MF : ${MF_CLIENT}`]]]]);
  const e = lireEntete([sans], 'pdf', { matricule: MF_CLIENT });
  assert.equal(e.matricule, null);
  assert.match(e.avertissements.join(' '), /matricule fiscal du client/);
});

test('lireEntete : lettre-clé incohérente → matricule « à relire », avec la raison', () => {
  const faux = '1384297A/A/M/000'; // la bonne clé de 1384297 n'est pas A
  assert.notEqual(cleAttendue('1384297'), 'A');
  const e = lireEntete([page([[40, [[40, 'SOCIETE EXEMPLE']], 16], [60, [[40, `MF : ${faux}`]]]])], 'pdf');
  assert.equal(e.matricule?.valeur, faux);
  assert.equal(e.matricule?.aRelire, true);
  assert.match(e.matricule?.note ?? '', /lettre-clé/);
});

test('lireEntete : forme courte du matricule seulement près de son libellé', () => {
  const id = mf('1876245', '');
  const avec = lireEntete([page([[40, [[40, 'PRIMEURS TRABELSI']], 16], [60, [[40, `M.F : ${id} — Régime forfaitaire`]]]])], 'pdf');
  assert.equal(avec.matricule?.valeur, id);
  const sans = lireEntete([page([[40, [[40, 'PRIMEURS TRABELSI']], 16], [60, [[40, `Commande ${id} livrée`]]]])], 'pdf');
  assert.equal(sans.matricule, null);
});

test('lireEntete : numéro et date — « Facture n° X du … », titres de colonnes, « Tunis, le … »', () => {
  const a = lireEntete([page([[40, [[40, 'ETS BEN SALEM FRÈRES']], 17], [105, [[40, 'Facture n° 2026/0815'], [360, 'La Manouba, le 3 septembre 2026']]]])], 'pdf');
  assert.equal(a.numero?.valeur, '2026/0815');
  assert.equal(a.date?.valeur, '2026-09-03');
  const b = lireEntete([page([
    [40, [[40, 'SOTUBOC BOISSONS']], 13],
    [140, [[40, 'N° Facture'], [170, 'Date'], [270, 'Code client']]],
    [158, [[40, 'F0026361'], [170, '02/10/2026'], [270, 'C-0418']]],
  ])], 'pdf');
  assert.equal(b.numero?.valeur, 'F0026361');
  assert.equal(b.date?.valeur, '2026-10-02');
  // La date d'échéance n'est pas la date de la facture.
  const c = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [80, [[40, 'Facture N° 77 — Échéance : 30/11/2026']]], [94, [[40, 'Date : 01/10/2026']]]])], 'pdf');
  assert.equal(c.date?.valeur, '2026-10-01');
});

test('lireEntete : numéro tronqué (« FV-2026- ») signalé, numéro coupé par une espace recollé', () => {
  const tronque = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [40, [[400, 'FACTURE']]], [60, [[400, 'N° FV-2026-']]]])], 'ocr');
  assert.equal(tronque.numero?.valeur, 'FV-2026');
  assert.equal(tronque.numero?.aRelire, true);
  assert.match(tronque.numero?.note ?? '', /incomplet/);
  const coupe = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [60, [[40, 'Facture N° FV-2026- 00437']]]])], 'pdf');
  assert.equal(coupe.numero?.valeur, 'FV-2026-00437');
  assert.equal(coupe.numero?.note, undefined);
});

test('relecture F2 : la colonne « N° » du tableau des lignes n\'est pas le numéro de la facture', () => {
  const e = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [40, [[400, 'FACTURE']]],
    [58, [[400, 'N° : FV-2026-00437']]],
    [200, [[40, 'N°'], [80, 'Désignation'], [300, 'Qté'], [400, 'Montant HT']]],
    [217, [[40, '1'], [80, 'Farine'], [300, '2'], [400, '45,000']]],
  ])], 'pdf');
  assert.equal(e.numero?.valeur, 'FV-2026-00437');
  const seul = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [200, [[40, 'N°'], [80, 'Article']]],
    [217, [[40, '1'], [80, 'Farine 12,000 45,000']]],
  ])], 'pdf');
  assert.equal(seul.numero, null);
});

test('relecture F2 : la date d\'édition ne passe pas devant la colonne « Date » ; une date à l\'heure près non plus', () => {
  const e = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [140, [[40, 'N° Facture'], [170, 'Date']]],
    [158, [[40, 'F0026361'], [170, '03/09/2026']]],
    [800, [[40, 'Édité le 10/10/2026 à 14:32']]],
  ])], 'pdf');
  assert.equal(e.date?.valeur, '2026-09-03');
  const ticket = lireEntete([page([[20, [[10, 'HYPER MARKET']], 11], [84, [[10, 'DATE: 27/09/2026 18:42 CAISSE 07']]]], 600, 226)], 'pdf');
  assert.equal(ticket.date?.valeur, '2026-09-27', 'un libellé « DATE » explicite garde sa date, même avec l\'heure');
});

test('relecture F2 : « Votre réf » n\'est pas le numéro ; « 2026 - 437 » recollé', () => {
  const v = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [80, [[40, 'Votre réf : CMD-118']]]])], 'pdf');
  assert.equal(v.numero, null);
  const c = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [80, [[40, 'Facture N° 2026 - 437']]]])], 'pdf');
  assert.equal(c.numero?.valeur, '2026-437');
});

test('relecture F2 : « MR BRICOLAGE » n\'est pas un bloc client ; « Total TTC » passe devant « Net à payer » ; « Montant total HT » est un HT', () => {
  const vus = matriculesVus([page([[40, [[40, 'MR BRICOLAGE']], 14], [60, [[40, `MF : ${MF_FOURNISSEUR}`]]]])], 'pdf');
  assert.equal(vus[0]?.duClient, false);
  const e = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [500, [[345, 'Montant total HT'], [500, '1000,000']]],
    [514, [[345, 'TVA'], [500, '190,000']]],
    [528, [[345, 'Timbre'], [500, '1,000']]],
    [542, [[345, 'Total TTC'], [500, '1191,000']]],
    [556, [[345, 'Retenue à la source 1,5 %'], [500, '17,865']]],
    [570, [[345, 'Net à payer'], [500, '1173,135']]],
  ])], 'pdf');
  assert.deepEqual([e.totaux.ht, e.totaux.ttc, e.totaux.coherents], [1000, 1191, true]);
});

test('contre-relecture F2 : « Total TTC » avant le timbre, puis « Net à payer » : le TTC est celui qui recoupe', () => {
  const e = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [500, [[345, 'Total HT'], [500, '1000,000']]],
    [514, [[345, 'TVA 19%'], [500, '190,000']]],
    [528, [[345, 'Total TTC'], [500, '1190,000']]],
    [542, [[345, 'Timbre fiscal'], [500, '1,000']]],
    [556, [[345, 'Net à payer'], [500, '1191,000']]],
  ])], 'pdf');
  assert.deepEqual([e.totaux.ttc, e.totaux.coherents], [1191, true]);
  assert.ok(!e.avertissements.some((m) => /Totaux lus/.test(m)));
});

test('contre-relecture F2 : dates — facture récapitulative, date avec l\'heure, numéro suivi d\'une date', () => {
  const recap = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [80, [[40, 'Facture N° 45 du 30/09/2026']]],
    [200, [[40, 'Date'], [120, 'N° BL'], [200, 'Désignation'], [400, 'Montant']]],
    [217, [[40, '02/09/2026'], [120, 'BL-12'], [200, 'Farine'], [400, '45,000']]],
  ])], 'pdf');
  assert.equal(recap.date?.valeur, '2026-09-30');
  const heure = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [80, [[40, 'Facture N° 77 du 01/10/2026 10:30']]]])], 'pdf');
  assert.equal(heure.date?.valeur, '2026-10-01');
  const ticket = lireEntete([page([[20, [[10, 'HYPER MARKET']], 11], [84, [[10, '27/09/2026 18:42 CAISSE 07']]]], 600, 226)], 'pdf');
  assert.equal(ticket.date?.valeur, '2026-09-27');
  const tiret = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [80, [[40, 'Facture N° 12 - 03/10/2026']]]])], 'pdf');
  assert.deepEqual([tiret.numero?.valeur, tiret.date?.valeur], ['12', '2026-10-03']);
});

test('contre-relecture F2 : bloc client en libellé long, téléphone à points, « N° » seul, « Réf client » puis « Réf »', () => {
  const nom = lireEntete([page([
    [40, [[40, 'GROSSISTE NORD']], 12],
    [130, [[300, 'Coordonnées client']]],
    [143, [[300, 'RESTAURANT EXEMPLE SARL']], 16],
  ])], 'pdf');
  assert.equal(nom.nom?.valeur, 'GROSSISTE NORD');
  const vus = matriculesVus([page([[40, [[40, 'SOCIETE X']], 14], [60, [[40, `M.F Client ${MF_CLIENT}`]]]])], 'pdf');
  assert.equal(vus[0]?.duClient, true);
  const tel = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [60, [[40, 'Tél : 71.234.567 Fax : 71.234.568']]],
    [80, [[400, 'FACTURE']]],
    [96, [[400, 'N° 437']]],
  ])], 'pdf');
  assert.equal(tel.numero?.valeur, '437');
  const seul = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [100, [[40, 'N°'], [140, 'Date']]], [116, [[40, '45'], [140, '03/10/2026']]]])], 'pdf');
  assert.equal(seul.numero?.valeur, '45');
  const ref = lireEntete([page([[40, [[40, 'SOCIETE X']], 14], [80, [[40, 'Réf client : C001 Réf : FV-437']]]])], 'pdf');
  assert.equal(ref.numero?.valeur, 'FV-437');
});

test('lireEntete : totaux en titres de colonnes (valeurs dessous), FODEC, récapitulatif de TVA à plusieurs taux', () => {
  const colonnes = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [500, [[40, 'Total HT'], [180, 'TVA'], [300, 'Timbre'], [420, 'Net à payer']]],
    [520, [[40, '180,900'], [180, '22,107'], [300, '1,000'], [420, '204,007']]],
  ])], 'pdf');
  assert.deepEqual([colonnes.totaux.ht, colonnes.totaux.tva, colonnes.totaux.timbre, colonnes.totaux.ttc, colonnes.totaux.coherents], [180.9, 22.107, 1, 204.007, true]);
  const fodec = lireEntete([page([
    [40, [[40, 'INDUSTRIES PLASTIQUES']], 14],
    [500, [[345, 'Total HT'], [500, '1091,100']]],
    [514, [[345, 'FODEC 1%'], [500, '10,911']]],
    [528, [[345, 'TVA 19%'], [500, '209,382']]],
    [542, [[345, 'Timbre fiscal'], [500, '1,000']]],
    [556, [[345, 'Total TTC'], [500, '1312,393']]],
  ])], 'pdf');
  assert.deepEqual([fodec.totaux.ht, fodec.totaux.fodec, fodec.totaux.tva, fodec.totaux.ttc, fodec.totaux.coherents], [1091.1, 10.911, 209.382, 1312.393, true]);
  const recap = lireEntete([page([
    [40, [[40, 'EPICERIE FINE EL AMEN']], 18],
    [200, [[40, 'Désignation Qté P.U HT Taux TVA Montant HT']]],
    [217, [[40, 'Dattes 11 11,500 7% 126,500']]],
    [500, [[40, 'Taux Base HT Montant TVA'], [345, 'Total HT'], [500, '400,000']]],
    [517, [[40, '7% 200,000 14,000'], [345, 'Total TVA'], [500, '40,000']]],
    [534, [[40, '13% 200,000 26,000'], [345, 'Timbre fiscal'], [500, '1,000']]],
    [551, [[345, 'Net à payer TTC'], [500, '441,000']]],
  ])], 'pdf');
  assert.deepEqual([recap.totaux.ht, recap.totaux.tva, recap.totaux.ttc, recap.totaux.coherents], [400, 40, 441, true]);
  assert.deepEqual(recap.totaux.parTaux, [{ taux: 7, base: 200, montant: 14 }, { taux: 13, base: 200, montant: 26 }]);
});

test('lireEntete : totaux incohérents signalés, jamais corrigés', () => {
  const e = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [500, [[345, 'Total HT'], [500, '100,000']]],
    [514, [[345, 'TVA'], [500, '19,000']]],
    [528, [[345, 'Total TTC'], [500, '125,000']]],
  ])], 'pdf');
  assert.equal(e.totaux.coherents, false);
  assert.equal(e.totaux.ttc, 125);
  assert.match(e.avertissements.join(' '), /Totaux lus incohérents/);
});

test('lireEntete : image (ocr) → tout est « à relire » ; tolérance des totaux de 10 millimes', () => {
  const e = lireEntete([page([
    [40, [[40, 'SOCIETE X']], 14],
    [60, [[40, `MF : ${MF_FOURNISSEUR}`]]],
    [500, [[345, 'Total HT'], [500, '100,000']]],
    [514, [[345, 'TVA'], [500, '19,000']]],
    [528, [[345, 'Total TTC'], [500, '119,008']]],
  ])], 'ocr');
  assert.equal(e.matricule?.aRelire, true);
  assert.equal(e.nom?.aRelire, true);
  assert.equal(e.totaux.coherents, true);
});

test('lireEntete : le nom n\'est ni un titre de tableau, ni le client, ni une forme juridique seule', () => {
  const e = lireEntete([page([
    [30, [[300, 'RESTAURANT LE JASMIN']], 18],
    [40, [[40, 'INDUSTRIES PLASTIQUES DU SAHEL (IPS)']], 14],
    [56, [[40, 'SARL']], 14],
    [200, [[40, 'Désignation Quantité Prix Montant']], 20],
  ])], 'pdf', { noms: ['Restaurant le Jasmin'] });
  assert.equal(e.nom?.valeur, 'INDUSTRIES PLASTIQUES DU SAHEL (IPS) SARL');
});

test('rapprocher : matricule, même entreprise, nom, sigle, nouveau', () => {
  const fiches = [
    { id: 1, nom: 'SMDA distribution', matriculeFiscal: null },
    { id: 2, nom: 'Ben Salem', matriculeFiscal: mf('0897514', '/B/M/000') },
    { id: 3, nom: 'Sotuboc', matriculeFiscal: mf('0512946', '/A/M/001') },
  ];
  assert.deepEqual(rapprocher({ matricule: mf('0897514', '/B/M/000'), nom: 'n\'importe' }, fiches), { etat: 'reconnu', fournisseur: fiches[1], par: 'matricule' });
  const autreEtab = rapprocher({ matricule: mf('0512946', '/A/M/000') }, fiches);
  assert.equal(autreEtab.etat, 'propose');
  assert.equal(autreEtab.etat === 'propose' && autreEtab.par, 'identifiant');
  const sigle = rapprocher({ matricule: MF_FOURNISSEUR, nom: 'SOCIÉTÉ MÉDITERRANÉENNE DE DISTRIBUTION ALIMENTAIRE' }, fiches);
  assert.equal(sigle.etat, 'propose');
  assert.equal(sigle.etat === 'propose' && sigle.fournisseur.id, 1);
  assert.equal(sigle.etat === 'propose' && sigle.ajouterMatricule, true);
  // Un fournisseur qui a déjà un AUTRE matricule n'est pas proposé, même au nom identique.
  assert.deepEqual(rapprocher({ matricule: MF_FOURNISSEUR, nom: 'Ben Salem' }, fiches), { etat: 'nouveau' });
  assert.deepEqual(rapprocher({ nom: 'Primeurs Trabelsi' }, fiches), { etat: 'nouveau' });
});

test('nomComparable et ressemblance', () => {
  assert.equal(nomComparable('Sté BEN SALEM & Frères S.A.R.L.'), 'ben salem freres');
  assert.equal(ressemblance('ETS BEN SALEM FRÈRES', 'Ben Salem'), 0.9);
  assert.ok(ressemblance('Salem Market', 'Ben Salem') < 0.6);
});

test('chaîne image : zones, découpe, complément d\'une lecture par une autre', () => {
  assert.equal(zonesDePage(1000, 1414).length, 3);
  assert.equal(zonesDePage(400, 1600).length, 2); // ticket
  const img = { data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8, 9]), width: 3, height: 3 };
  assert.deepEqual([...decouper(img, 1, 1, 2, 2).data], [5, 6, 8, 9]);
  const vide = lireEntete([page([[40, [[40, 'SOCIETE X']], 14]])], 'ocr');
  assert.equal(incomplete(vide), true);
  const plein = lireEntete([factureLogiciel()], 'ocr', { matricule: MF_CLIENT });
  const c = completer(vide, plein);
  assert.equal(c.numero?.valeur, 'FV-2026-00437');
  assert.equal(c.totaux.coherents, true);
  assert.ok(!c.avertissements.some((m) => /^Numéro/.test(m)));
});

// ── Premier essai du client sur un vrai document (12/10) : un BON DE LIVRAISON de volailles, recopié ici avec des
// valeurs fictives (la pièce réelle reste hors des tests). Ancien matricule imprimé à 6 chiffres, « Caisses: » en gros
// caractères, « HORS TAXE », « NET A PAYE » sans R, aucun timbre, matricule du client sans libellé « Client ».
const ID6 = '273641'; // clé T (sur une image, T se confond avec un 7)
const MF6 = `${ID6}${cleAttendue(`0${ID6}`)}/N/M/000`;
const MF_CLIENT_COURT = mf('1658423', '');
const blVolailles = () => page([
  [30, [[300, 'té. Volailles du Cap Bon']], 16],
  [60, [[300, 'Souk Municipal - Rue des Tanneurs Tunis']]],
  [72, [[300, 'Tel/Fax : 71 222 333 /']]],
  [84, [[300, 'Email :']]],
  [96, [[300, `M.F : ${MF6}`]]],
  [108, [[300, 'R.C. : B111222003']]],
  [130, [[30, 'BON LIVRAISON N° : BL2600123'], [330, '502114']]],
  [150, [[60, 'Date : 02/10/2026'], [330, 'RESTAURANT LE JASMIN']]],
  [165, [[40, 'Commercial : HEDI'], [330, 'AVENUE DE LA REPUBLIQUE, ARIANA']]],
  [180, [[50, 'Véhicule :'], [220, 'Caisses: 0']], 24],
  [210, [[330, `Mat. Fisc : ${MF_CLIENT_COURT}`]]],
  [235, [[20, 'Réf. Désignation Unité Qte P.U. Remise Montant']]],
  [250, [[20, '166 POULET ENTIER KG 20,000 12,520 0% 250,400']]],
  [700, [[20, 'Arrêté le présent BON LIVRAISON à la'], [280, 'Rubrique Base Taux Montant']]],
  [714, [[20, 'somme de : Deux Cent Cinquante Dinars']]],
  [728, [[20, '400 Millimes'], [280, 'HORS TAXE 250,400 250,400']]],
  [745, [[280, 'NET A PAYE'], [480, '250,400']], 14],
  [790, [[280, 'Solde Au 02/10/2026'], [480, '250,400']]],
]);

test('essai client : bon de livraison — matricule à 6 chiffres, n° du BL, nom sans étiquette, HT = TTC sans timbre', () => {
  for (const source of ['pdf', 'ocr']) {
    const e = lireEntete([blVolailles()], source, { matricule: MF_CLIENT_COURT, noms: ['RESTAURANT LE JASMIN'] });
    assert.equal(e.matricule?.valeur, `0${MF6}`, source);
    assert.match(e.matricule?.note ?? '', /zéro de tête/);
    assert.doesNotMatch(e.matricule?.note ?? '', /lettre-clé|autre/);
    assert.equal(e.nom?.valeur, 'Volailles du Cap Bon', source);
    assert.equal(e.adresse?.valeur, 'Souk Municipal - Rue des Tanneurs Tunis');
    assert.equal(e.telephone?.valeur, '71222333');
    assert.equal(e.numero?.valeur, 'BL2600123');
    assert.match(e.numero?.note ?? '', /bon de livraison/);
    assert.equal(e.date?.valeur, '2026-10-02');
    assert.deepEqual([e.totaux.ht, e.totaux.tva, e.totaux.timbre, e.totaux.ttc, e.totaux.coherents], [250.4, 0, 0, 250.4, true], source);
    assert.deepEqual(e.avertissements, []);
  }
});

test('essai client : matricule à 6 chiffres — forme courte près du libellé, lettre confondue avec un chiffre sur une image', () => {
  const court = `${ID6}${cleAttendue(`0${ID6}`)}`;
  for (const source of ['pdf', 'ocr']) {
    const e = lireEntete([page([[40, [[40, 'PRIMEURS TRABELSI']], 16], [60, [[40, `M.F : ${court}`]]]])], source);
    assert.equal(e.matricule?.valeur, `0${court}`, source);
  }
  // Une forme à 7 chiffres juste n'est jamais lue comme une forme à 6 (la clé départage).
  const e7 = lireEntete([page([[40, [[40, 'SOCIETE EXEMPLE']], 16], [60, [[40, `MF : ${MF_FOURNISSEUR}`]]]])], 'ocr');
  assert.equal(e7.matricule?.valeur, MF_FOURNISSEUR);
  assert.equal(e7.matricule?.note, undefined);
  // « Mat. Fisc » est un libellé de matricule : la forme courte qui le suit est lue (ici, celle du client, écartée).
  const vus = matriculesVus([page([[60, [[40, `Mat. Fisc : ${MF_CLIENT_COURT}`]]]])], 'pdf');
  assert.deepEqual(vus.map((m) => m.valeur), [MF_CLIENT_COURT]);
});

test('essai client : « Hors taxe » seul cède devant « Total HT » ; un « Net à payer » plus élevé empêche de conclure « sans timbre »', () => {
  const a = lireEntete([page([
    [40, [[40, 'SOCIETE EXEMPLE']], 16],
    [600, [[300, 'Hors taxe'], [480, '80,000']]],
    [614, [[300, 'Total HT'], [480, '100,000']]],
    [628, [[300, 'TVA'], [480, '19,000']]],
    [642, [[300, 'Total TTC'], [480, '119,000']]],
  ])], 'pdf');
  assert.deepEqual([a.totaux.ht, a.totaux.ttc, a.totaux.coherents, a.totaux.timbre], [100, 119, true, 0]);
  // Timbre non lu, mais « Net à payer » = TTC + 1 : on ne dit pas « aucun timbre ».
  const b = lireEntete([page([
    [40, [[40, 'SOCIETE EXEMPLE']], 16],
    [614, [[300, 'Total HT'], [480, '100,000']]],
    [628, [[300, 'TVA'], [480, '19,000']]],
    [642, [[300, 'Total TTC'], [480, '119,000']]],
    [656, [[300, 'Net à payer'], [480, '120,000']]],
  ])], 'pdf');
  assert.deepEqual([b.totaux.ttc, b.totaux.coherents, b.totaux.timbre], [119, true, null]);
  // TVA imprimée mais non lue : HT ≠ TTC, rien n'est déduit.
  const c = lireEntete([page([[40, [[40, 'SOCIETE EXEMPLE']], 16], [614, [[300, 'Total HT'], [480, '100,000']]], [642, [[300, 'Net à payer'], [480, '120,000']]]])], 'pdf');
  assert.deepEqual([c.totaux.tva, c.totaux.coherents, c.totaux.timbre], [null, null, null]);
});

test('essai client : n° de BL en dernier recours seulement ; date d\'un bon de livraison', () => {
  const fac = lireEntete([page([[40, [[40, 'SOCIETE EXEMPLE']], 16], [80, [[40, 'BL N° 4410']]], [95, [[40, 'Facture N° 2026-17 du 05/10/2026']]]])], 'pdf');
  assert.equal(fac.numero?.valeur, '2026-17');
  assert.equal(fac.numero?.note, undefined);
  assert.equal(fac.date?.valeur, '2026-10-05');
  const bl = lireEntete([page([[40, [[40, 'SOCIETE EXEMPLE']], 16], [80, [[40, 'Bon de livraison N° 4410 du 02/10/2026']]]])], 'pdf');
  assert.equal(bl.numero?.valeur, '4410');
  assert.equal(bl.date?.valeur, '2026-10-02');
  // Sur une facture, la date d'un BL cité n'est toujours pas celle de la facture.
  const cite = lireEntete([page([[40, [[40, 'SOCIETE EXEMPLE']], 16], [80, [[40, 'Facture N° 9']]], [95, [[40, 'Selon BL N° 4410 du 01/09/2026']]], [110, [[40, 'Tunis, le 05/10/2026']]]])], 'pdf');
  assert.equal(cite.date?.valeur, '2026-10-05');
});

test('essai client : nom — étiquette de champ écartée, « Raison sociale : » gardée, reste de lecture retiré', () => {
  assert.equal(nomPropre('té. Adli Volailles'), 'Adli Volailles');
  assert.equal(nomPropre('© « Sté. Volailles du Sahel'), 'Sté. Volailles du Sahel');
  assert.equal(nomPropre('SOCIETE EXEMPLE'), 'SOCIETE EXEMPLE');
  assert.equal(nomPropre('ab. Xy'), 'ab. Xy'); // il ne resterait pas 3 lettres
  const e = lireEntete([page([[40, [[40, 'Raison sociale : FROMAGERIE DU NORD']], 14], [60, [[40, 'Livreur : SAMI']], 20]])], 'pdf');
  assert.equal(e.nom?.valeur, 'FROMAGERIE DU NORD');
});

test('essai client : un grand mot de logo ne passe pas devant le nom placé au-dessus du matricule et répété en pied de page', () => {
  const p = page([
    [30, [[40, 'Volcap']], 32],
    [34, [[330, 'Sté. Volailles du Cap Bon']], 13],
    [56, [[330, 'Souk municipal - Rue des Tanneurs Tunis']]],
    [92, [[330, `M.F : ${MF6}`]]],
    [235, [[20, 'Réf. Désignation Unité Qte P.U. Remise Montant']]],
    [790, [[40, 'Société : Volailles du Cap Bon, Souk municipal - Rue des Tanneurs Tunis']]],
  ]);
  assert.equal(lireEntete([p], 'pdf').nom?.valeur, 'Sté. Volailles du Cap Bon');
  // Sans ces indices (ni matricule dessous, ni répétition), le plus grand texte reste le nom : le logo.
  const seul = page([[30, [[40, 'Volcap']], 32], [34, [[330, 'Volailles du Cap Bon']], 13]]);
  assert.equal(lireEntete([seul], 'pdf').nom?.valeur, 'Volcap');
});

test('essai client : rangées — un mot de logo très haut n\'absorbe pas les lignes ; une « ligne » de deux lignes est recoupée', () => {
  const w = (t, x0, y0, x1, y1) => ({ t, x0, y0, x1, y1, c: 90 });
  // Lettre du logo (lue seule, sur toute la hauteur de l'en-tête) à gauche ; adresse et téléphone à droite.
  const r = construireRangees([
    w('DOUeZ', 10, 0, 200, 100),
    w('Souk', 300, 40, 340, 55), w('Municipal', 345, 40, 420, 55),
    w('Tel/Fax', 300, 62, 350, 77), w('71', 355, 62, 370, 77),
  ], 1, [1, 2, 2, 3, 3]);
  assert.deepEqual(r.map((x) => x.texte).sort(), ['DOUeZ', 'Souk Municipal', 'Tel/Fax 71'].sort());
  // Même texte, mais rendu comme UNE ligne par la lecture en bloc : les deux lignes du papier sont séparées.
  const melee = [w('Souk', 300, 40, 340, 55), w('Tel/Fax', 300, 62, 350, 77), w('Municipal', 345, 40, 420, 55), w('71', 355, 62, 370, 77)];
  assert.deepEqual(separerLigne(melee).map((l) => l.map((m) => m.t).sort()), [['Municipal', 'Souk'], ['71', 'Tel/Fax']]);
  // Une vraie ligne, penchée, reste entière.
  const penchee = [w('Total', 0, 100, 40, 112), w('HT', 45, 102, 60, 114), w(':', 62, 104, 64, 116), w('100,000', 70, 106, 120, 118)];
  assert.equal(separerLigne(penchee).length, 1);
});
