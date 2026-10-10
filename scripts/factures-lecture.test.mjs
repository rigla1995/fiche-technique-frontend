// Tests des fonctions PURES de la lecture de l'en-tête d'une facture fournisseur (étape F2 —
// src/components/client/factures/lecture/). node --test scripts/factures-lecture.test.mjs (Node ≥ 23.6 : types effacés).
// Pages construites à la main (mots et positions) : aucune reconnaissance de caractères ici ; la mesure sur le jeu de
// factures fictives (PDF, scans, photos) est dans labflow-reprise/achats-compta/ESSAI-FACTURES.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datesDuTexte, lireNombre, nombresDeRangee } from '../src/components/client/factures/lecture/nombres.ts';
import { construireRangees, motsDePdf, motsDeTesseract, rangee, segments } from '../src/components/client/factures/lecture/rangees.ts';
import { lireEntete, matriculesVus } from '../src/components/client/factures/lecture/entete.ts';
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
