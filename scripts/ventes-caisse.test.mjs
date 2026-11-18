// V1a « Importer un fichier de caisse » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) : fonctions
// pures des écrans — lecture d'un export de caisse (Excel, PDF), clés d'apprentissage, produit proposé, répartition par
// canal, corps de l'envoi. Jeu FICTIF fabriqué ici (jamais les documents réels du client).
// Lancer : node --test scripts/ventes-caisse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lireFeuilleCaisse, lirePagesCaisse, jourDuFichier, roleDuTitre } from '../src/components/client/ventes/caisse/lireCaisse.ts';
import {
  CANAL_DIRECT, cleCategorie, cleCorrespondance, livraisonProposee, proposerProduit, lireQuantite, repartir, bilan, corpsImport,
} from '../src/components/client/ventes/caisse/importCaisse.ts';
import { construireRangees } from '../src/components/client/factures/lecture/rangees.ts';

// ── Jeu fictif : un export « Products / Revenue » de deux cartes, le même plat dans les deux à deux prix ──
const TITRES = [, 'Name', 'Total quantity', 'Unit price (TND)', 'Gross turnover (TND)', 'Discounts (TND)', 'TVA (TND)', 'Net turnover (excl. tax) (TND)'];
const rang = (nom, q, pu, brut, remises = 0) => [, nom, q, pu, brut, remises, 0, brut - remises];
const TABLEAU = [
  rang('Category : DELIVERY', 12, undefined, 273.5, 2),
  rang(' Sub-category : PLATS', 12, undefined, 273.5, 2),
  rang(' Tajine Agneau du chef', 7, 25, 173.5),        // 7 × 25 = 175 : 1,500 d'offert déjà retiré
  rang(' Brik Thon', 5, 20, 100, 2),                     // 2 de remise : montant 98
  rang('Category : SUR PLACE', 9, undefined, 149),
  rang(' Sub-category : PLATS', 6, undefined, 131),
  rang(' TAJINE AGNEAU DU CHEF', 5, 22, 110),
  rang(' Salade du jardin', 1, 21, 21),
  rang(' Sub-category : BOISSONS', 3, undefined, 18),
  rang(' Soda 0,33L', 3, 6, 18),
];
const feuille = (jours = [['04-11-2026', 0], ['05-11-2026', 420.5], ['06-11-2026', 0]]) => {
  const lignes = [{ n: 1, cellules: [, 'Turnover', 422] }, { n: 2, cellules: [, 'Net turnover (excl. tax)', 420.5] }, { n: 5, cellules: [, 'Number of orders', 9] },
    { n: 10, cellules: [, 'Products / Revenue'] }, { n: 11, cellules: TITRES }];
  TABLEAU.forEach((cellules, i) => lignes.push({ n: 12 + i, cellules }));
  lignes.push({ n: 25, cellules: [, 'Day / Dt', 'Day / Dt'] }, { n: 26, cellules: [, 'Day', 'Dt'] });
  jours.forEach(([jour, montant], i) => lignes.push({ n: 27 + i, cellules: [, jour, montant] }));
  return lignes;
};

test('roleDuTitre : titres français et anglais', () => {
  assert.equal(roleDuTitre('Name'), 'designation');
  assert.equal(roleDuTitre('Désignation'), 'designation');
  assert.equal(roleDuTitre('Total quantity'), 'quantite');
  assert.equal(roleDuTitre('Qté'), 'quantite');
  assert.equal(roleDuTitre('Unit price (TND)'), 'prixUnitaire');
  assert.equal(roleDuTitre('Gross turnover (TND)'), 'brut');
  assert.equal(roleDuTitre('Discounts (TND)'), 'remises');
  assert.equal(roleDuTitre('TVA (TND)'), 'tva');
  assert.equal(roleDuTitre('Net turnover (excl. tax) (TND)'), 'net');
  assert.equal(roleDuTitre('CA'), 'brut');
  assert.equal(roleDuTitre('Remarque'), null);
});

test('Excel : catégories, sous-catégories, produits ; montant = brut moins remises ; sommes vérifiées', () => {
  const lu = lireFeuilleCaisse(feuille());
  assert.equal(lu.lignes.length, 5);
  assert.deepEqual(lu.categories, ['DELIVERY', 'SUR PLACE']);
  assert.deepEqual(lu.lignes.map((l) => [l.categorie, l.sousCategorie, l.designation, l.quantite, l.montant]), [
    ['DELIVERY', 'PLATS', 'Tajine Agneau du chef', 7, 173.5],
    ['DELIVERY', 'PLATS', 'Brik Thon', 5, 98],
    ['SUR PLACE', 'PLATS', 'TAJINE AGNEAU DU CHEF', 5, 110],
    ['SUR PLACE', 'PLATS', 'Salade du jardin', 1, 21],
    ['SUR PLACE', 'BOISSONS', 'Soda 0,33L', 3, 18],
  ]);
  assert.equal(lu.lignes[1].brut, 100);
  assert.equal(lu.lignes[1].remises, 2);
  // 5 sommes imprimées (2 catégories, 3 sous-catégories) et le total : toutes justes.
  assert.equal(lu.controles.length, 6);
  assert.ok(lu.controles.every((c) => c.juste), JSON.stringify(lu.controles));
  // Total sur la base des lignes : brut des catégories moins leurs remises (ici la catégorie n'en imprime pas → 420,5).
  assert.equal(lu.totalLu, 420.5);
  assert.deepEqual(lu.jours.map((j) => j.date), ['2026-11-04', '2026-11-05', '2026-11-06']);
  assert.equal(lu.periode, null);
});

test('Excel : une somme imprimée fausse est signalée ; une feuille sans tableau rend null', () => {
  const fausse = feuille();
  fausse.find((l) => l.cellules[1] === ' Sub-category : BOISSONS').cellules = rang(' Sub-category : BOISSONS', 4, undefined, 24);
  const lu = lireFeuilleCaisse(fausse);
  assert.deepEqual(lu.controles.filter((c) => !c.juste).map((c) => c.quoi), ['Sous-catégorie BOISSONS']);
  assert.equal(lireFeuilleCaisse([{ n: 1, cellules: [, 'Bonjour'] }, { n: 2, cellules: [, 'Total', 12] }]), null);
  assert.equal(lireFeuilleCaisse([]), null);
});

test('jourDuFichier : le seul jour qui porte du chiffre ; plusieurs jours = refus ; aucun = à saisir', () => {
  assert.deepEqual(jourDuFichier(lireFeuilleCaisse(feuille())), { date: '2026-11-05', etat: 'trouvee', jours: ['2026-11-05'] });
  const deux = jourDuFichier(lireFeuilleCaisse(feuille([['04-11-2026', 200], ['05-11-2026', 220.5]])));
  assert.equal(deux.etat, 'plusieurs');
  assert.deepEqual(deux.jours, ['2026-11-04', '2026-11-05']);
  assert.deepEqual(jourDuFichier({ jours: [], periode: null }), { date: null, etat: 'inconnue', jours: [] });
  assert.equal(jourDuFichier({ jours: [], periode: { du: '2026-11-05', au: '2026-11-05' } }).date, '2026-11-05');
  assert.equal(jourDuFichier({ jours: [], periode: { du: '2026-11-05', au: '2026-11-06' } }).etat, 'inconnue');
});

// ── PDF : les mêmes lignes, en mots placés (désignations coupées sur deux ou trois rangées, la rangée chiffrée au milieu) ──
const X = { nom: 60, q: 175, pu: 235, brut: 292, rem: 364, tva: 432, net: 482 };
const mot = (t, x, y) => ({ t, x0: x, x1: x + 5 * t.length, y0: y, y1: y + 8 });
const chiffres = (y, q, pu, brut, rem = '0.00') => [mot(String(q), X.q, y), ...(pu ? [mot(pu, X.pu, y)] : []), mot(brut, X.brut, y), mot(rem, X.rem, y), mot('0.00', X.tva, y), mot(brut, X.net, y)];
const bandeau = (y) => [mot('Unit', X.pu, y), mot('Gross', X.brut, y), mot('Net', X.net, y), mot('turnover', X.net + 22, y),
  mot('Total', X.q, y + 7), mot('Discounts', X.rem, y + 7), mot('TVA', X.tva, y + 7),
  mot('Name', 41, y + 14), mot('price', X.pu, y + 14), mot('turnover', X.brut, y + 14), mot('(excl.', X.net, y + 14), mot('tax)', X.net + 32, y + 14),
  mot('quantity', X.q, y + 21), mot('(TND)', X.rem, y + 21), mot('(TND)', X.tva, y + 21), mot('(TND)', X.pu, y + 29), mot('(TND)', X.brut, y + 29), mot('(TND)', X.net, y + 29)];
const page1 = [
  mot('From', 34, 52), mot('05-11-2026', 66, 52), mot('01:00', 118, 52), mot('to', 144, 52), mot('06-11-2026', 157, 52), mot('11:59', 209, 52),
  mot('Net', 99, 150), mot('turnover', 119, 150), mot('Turnover', 41, 157), mot('Offers', 463, 157), mot('Number', 367, 150), mot('of', 410, 150), mot('orders', 367, 164),
  mot('422.00', 42, 188), mot('420.50', 100, 188), mot('9', 368, 188), mot('1.50', 464, 188),
  ...bandeau(457),
  mot('Category', 42, 510), mot(':', 99, 510), mot('DELIVERY', 111, 510), ...chiffres(510, 12, null, '273.50', '2.00'),
  mot('Sub-category', 49, 534), mot(':', 119, 534), ...chiffres(541, 12, null, '273.50', '2.00'), mot('PLATS', 49, 549),
  mot('Tajine', X.nom, 573), mot('Agneau', 96, 573), mot('du', 140, 573), ...chiffres(580, 7, '25.00', '173.50'), mot('chef', X.nom, 588),
  mot('Brik', X.nom, 612), mot('Thon', 88, 612), ...chiffres(612, 5, '20.00', '100.00', '2.00'),
];
const page2 = [
  ...bandeau(41),
  mot('Category', 42, 94), mot(':', 98, 94), mot('SUR', 110, 94), ...chiffres(101, 9, null, '149.00'), mot('PLACE', 42, 108),
  mot('Sub-category', 49, 133), mot(':', 123, 133), mot('PLATS', 134, 133), ...chiffres(133, 6, null, '131.00'),
  mot('TAJINE', X.nom, 158), mot('AGNEAU', X.nom, 172), mot('DU', 111, 172), ...chiffres(172, 5, '22.00', '110.00'), mot('CHEF', X.nom, 186),
  mot('Salade', X.nom, 211), mot('du', 100, 211), mot('jardin', 116, 211), ...chiffres(211, 1, '21.00', '21.00'),
  mot('Sub-category', 49, 236), mot(':', 119, 236), ...chiffres(243, 3, null, '18.00'), mot('BOISSONS', 49, 250),
  mot('Soda', X.nom, 275), mot('0,33L', 86, 275), ...chiffres(275, 3, '6.00', '18.00'),
];
const page3 = [mot('Period', 41, 43), mot('Net', 286, 43), mot('turnover', 308, 43), mot('04-11-2026', 42, 67), mot('0', 287, 67), mot('05-11-2026', 42, 91), mot('420.5', 287, 91), mot('06-11-2026', 42, 116), mot('0', 287, 116)];
const pages = () => [page1, page2, page3].map((mots, i) => ({ rangees: construireRangees(mots, i + 1) }));

test('PDF : même lecture que l\'Excel — désignations coupées recollées, colonnes trouvées par positions', () => {
  const pdf = lirePagesCaisse(pages());
  const excel = lireFeuilleCaisse(feuille());
  assert.equal(pdf.lignes.length, 5);
  for (const champ of ['categorie', 'sousCategorie', 'designation', 'quantite', 'prixUnitaire', 'brut', 'remises', 'montant']) {
    assert.deepEqual(pdf.lignes.map((l) => l[champ]), excel.lignes.map((l) => l[champ]), champ);
  }
  assert.deepEqual(pdf.categories, ['DELIVERY', 'SUR PLACE']);
  assert.ok(pdf.controles.length === 6 && pdf.controles.every((c) => c.juste), JSON.stringify(pdf.controles));
  assert.deepEqual(pdf.periode, { du: '2026-11-05', au: '2026-11-06' });
  assert.deepEqual(jourDuFichier(pdf), { date: '2026-11-05', etat: 'trouvee', jours: ['2026-11-05'] });
  // Un PDF sans tableau de ventes (une facture, un courrier) n'est pas lu.
  assert.equal(lirePagesCaisse([{ rangees: construireRangees([mot('Facture', 40, 40), mot('Total', 40, 80), mot('12.000', 300, 80)], 1) }]), null);
});

// ── La fenêtre ──
const GLOVO = 'lien-glovo', KOOL = 'lien-kool';
const CARTE = [
  { cle: 'produit:1', articleType: 'produit', articleId: 1, nom: 'Tajine agneau du chef', canaux: [CANAL_DIRECT] },
  { cle: 'produit:5', articleType: 'produit', articleId: 5, nom: 'Tajine agneau du chef — Livraison', canaux: [GLOVO, KOOL] },
  { cle: 'produit:2', articleType: 'produit', articleId: 2, nom: 'Brik au thon', canaux: [CANAL_DIRECT, GLOVO] },
  { cle: 'ingredient:1', articleType: 'ingredient', articleId: 1, nom: 'Eau minérale 0,5 L', canaux: [CANAL_DIRECT] },
];

test('clés : mêmes règles que le serveur ; livraison proposée d\'après le nom de la catégorie', () => {
  assert.equal(cleCategorie(' Delivery '), 'delivery');
  assert.equal(cleCorrespondance('DELIVERY', 'Tajine Agneau du chef'), 'delivery|tajine agneau du chef');
  assert.notEqual(cleCorrespondance('DELIVERY', 'Tajine Agneau du chef'), cleCorrespondance('SUR PLACE', 'TAJINE AGNEAU DU CHEF'));
  assert.equal(cleCorrespondance(null, 'Soda 0,33L'), '|soda 0,33l');
  assert.equal(livraisonProposee('DELIVERY', []), true);
  assert.equal(livraisonProposee('Livraisons', []), true);
  assert.equal(livraisonProposee('Carte Glovo', ['Glovo', 'KOOL']), true);
  assert.equal(livraisonProposee('MENU PRINCIPAL', ['Glovo']), false);
  assert.equal(livraisonProposee('À emporter', ['Glovo']), false);
});

test('proposerProduit : reconnue (apprise), proposée (la variante de livraison pour une catégorie de livraison), à choisir', () => {
  const rien = new Map();
  // Le même plat dans deux catégories : la variante pour la livraison, le plat pour la vente directe.
  assert.deepEqual(proposerProduit({ categorie: 'DELIVERY', designation: 'Tajine Agneau du chef' }, CARTE, rien, [GLOVO, KOOL]), { etat: 'proposee', produit: 'produit:5' });
  assert.deepEqual(proposerProduit({ categorie: 'SUR PLACE', designation: 'TAJINE AGNEAU DU CHEF' }, CARTE, rien, [CANAL_DIRECT]), { etat: 'proposee', produit: 'produit:1' });
  assert.deepEqual(proposerProduit({ categorie: 'DELIVERY', designation: 'Brik Thon' }, CARTE, rien, [GLOVO, KOOL]), { etat: 'proposee', produit: 'produit:2' });
  assert.deepEqual(proposerProduit({ categorie: 'SUR PLACE', designation: 'Salade du jardin' }, CARTE, rien, [CANAL_DIRECT]), { etat: 'a_choisir', produit: null });
  // Apprise : le choix d'avant l'emporte sur la ressemblance, par catégorie.
  const apprises = new Map([
    ['delivery|tajine agneau du chef', { cle: 'delivery|tajine agneau du chef', ignoree: false, cibles: [{ article_type: 'produit', article_id: 2, quantite: 1 }] }],
    ['sur place|salade du jardin', { cle: 'sur place|salade du jardin', ignoree: false, cibles: [{ article_type: 'produit', article_id: 99, quantite: 1 }] }],
  ]);
  assert.deepEqual(proposerProduit({ categorie: 'DELIVERY', designation: 'Tajine Agneau du chef' }, CARTE, apprises, [GLOVO]), { etat: 'reconnue', produit: 'produit:2' });
  assert.deepEqual(proposerProduit({ categorie: 'SUR PLACE', designation: 'TAJINE AGNEAU DU CHEF' }, CARTE, apprises, [CANAL_DIRECT]), { etat: 'proposee', produit: 'produit:1' });
  // Un produit appris qui n'est plus à la carte : la ligne redevient à choisir.
  assert.deepEqual(proposerProduit({ categorie: 'SUR PLACE', designation: 'Salade du jardin' }, CARTE, apprises, [CANAL_DIRECT]), { etat: 'a_choisir', produit: null });
});

test('lireQuantite : nombre au millime, virgule acceptée', () => {
  assert.equal(lireQuantite(''), 0);
  assert.equal(lireQuantite(undefined), 0);
  assert.equal(lireQuantite(' 36 '), 36);
  assert.equal(lireQuantite('2,5'), 2.5);
  assert.equal(lireQuantite('1.125'), 1.125);
  assert.equal(lireQuantite('1.1255'), null);
  assert.equal(lireQuantite('-1'), null);
  assert.equal(lireQuantite('abc'), null);
});

test('repartir : les parts des prestataires sont saisies, le reste est de la vente directe (exemple du client)', () => {
  const tous = [CANAL_DIRECT, GLOVO, KOOL];
  // 100 vendus, 36 Glovo, 14 KOOL : les 50 autres en vente directe.
  const r = repartir(100, { [GLOVO]: '36', [KOOL]: '14' }, false, [GLOVO, KOOL], tous);
  assert.equal(r.erreur, null);
  assert.equal(r.directe, 50);
  assert.deepEqual(r.parts, [{ canal: CANAL_DIRECT, quantite: 50 }, { canal: GLOVO, quantite: 36 }, { canal: KOOL, quantite: 14 }]);
  // Rien de saisi : tout en vente directe.
  assert.deepEqual(repartir(7, {}, false, [GLOVO, KOOL], tous).parts, [{ canal: CANAL_DIRECT, quantite: 7 }]);
  // Tout chez les prestataires : aucune part directe envoyée.
  assert.deepEqual(repartir(7, { [GLOVO]: '7' }, false, [GLOVO, KOOL], tous).parts, [{ canal: GLOVO, quantite: 7 }]);
  // Plus que la quantité du fichier, saisie fausse.
  assert.equal(repartir(7, { [GLOVO]: '5', [KOOL]: '3' }, false, [GLOVO, KOOL], tous).erreur, 'TROP');
  assert.equal(repartir(7, { [GLOVO]: 'x' }, false, [GLOVO, KOOL], tous).erreur, 'SAISIE');
  // Le produit choisi ne se vend pas sur un canal servi.
  const hors = repartir(7, { [KOOL]: '2' }, false, [GLOVO, KOOL], [CANAL_DIRECT, GLOVO]);
  assert.equal(hors.erreur, 'HORS_CANAL');
  assert.deepEqual(hors.horsCanal, [KOOL]);
  assert.equal(repartir(7, {}, false, [GLOVO], [GLOVO]).erreur, 'HORS_CANAL'); // le reste irait en direct, où il ne se vend pas
  // Sans produit choisi, la répartition se calcule quand même.
  assert.equal(repartir(7, { [GLOVO]: '2' }, false, [GLOVO], null).directe, 5);
});

test('repartir : catégorie de livraison — les prestataires seulement, le dernier laissé vide reçoit le reste', () => {
  const liv = [GLOVO, KOOL];
  // Un seul prestataire actif : tout lui revient, sans saisie.
  const seul = repartir(16, {}, true, [GLOVO], [GLOVO]);
  assert.deepEqual([seul.erreur, seul.directe, seul.parts, seul.calcules], [null, 0, [{ canal: GLOVO, quantite: 16 }], [GLOVO]]);
  // Deux prestataires : on saisit l'un, l'autre reçoit le reste.
  const deux = repartir(16, { [GLOVO]: '12' }, true, liv, liv);
  assert.deepEqual([deux.erreur, deux.directe, deux.parts, deux.calcules], [null, 0, [{ canal: GLOVO, quantite: 12 }, { canal: KOOL, quantite: 4 }], [KOOL]]);
  // Rien de saisi avec deux prestataires : il reste tout à répartir.
  const rien = repartir(16, {}, true, liv, liv);
  assert.deepEqual([rien.erreur, rien.reste, rien.parts], ['RESTE', 16, []]);
  // Les deux saisis : la somme doit égaler la quantité.
  assert.equal(repartir(16, { [GLOVO]: '12', [KOOL]: '4' }, true, liv, liv).erreur, null);
  assert.deepEqual([repartir(16, { [GLOVO]: '12', [KOOL]: '3' }, true, liv, liv).erreur, repartir(16, { [GLOVO]: '12', [KOOL]: '3' }, true, liv, liv).reste], ['RESTE', 1]);
  assert.equal(repartir(16, { [GLOVO]: '12', [KOOL]: '5' }, true, liv, liv).erreur, 'TROP');
  // Tout chez un seul des deux : l'autre, vide, ne reçoit rien.
  assert.deepEqual(repartir(16, { [GLOVO]: '16' }, true, liv, liv).parts, [{ canal: GLOVO, quantite: 16 }]);
  // Aucun prestataire actif : la catégorie ne peut pas être répartie.
  assert.equal(repartir(16, {}, true, [], [CANAL_DIRECT]).erreur, 'SANS_PRESTATAIRE');
});

test('bilan et corps de l\'envoi', () => {
  const lu = lireFeuilleCaisse(feuille());
  const [tajineLiv, brik, tajine, salade, eau] = lu.lignes;
  const lignes = [
    { ligne: tajineLiv, ignoree: false, produit: CARTE[1], repartition: repartir(7, { [GLOVO]: '5' }, true, [GLOVO, KOOL], CARTE[1].canaux) },
    { ligne: brik, ignoree: false, produit: CARTE[2], repartition: repartir(5, { [GLOVO]: '5' }, true, [GLOVO, KOOL], CARTE[2].canaux) },
    { ligne: tajine, ignoree: false, produit: CARTE[0], repartition: repartir(5, {}, false, [GLOVO, KOOL], CARTE[0].canaux) },
    { ligne: salade, ignoree: true, produit: null, repartition: repartir(1, {}, false, [GLOVO, KOOL], null) },
    { ligne: eau, ignoree: false, produit: CARTE[3], repartition: repartir(3, {}, false, [GLOVO, KOOL], CARTE[3].canaux) },
  ];
  const b = bilan(lignes);
  assert.deepEqual([b.aEnregistrer, b.ignorees, b.sansProduit, b.enErreur, b.pret, b.total], [4, 1, 0, 0, true, 399.5]);
  // Par canal : la ligne de 173,500 répartie 5 et 2 ; la somme des canaux égale le total.
  assert.equal(b.parCanal[GLOVO], 221.929);
  assert.equal(b.parCanal[KOOL], 49.571);
  assert.equal(b.parCanal[CANAL_DIRECT], 128);
  assert.equal(Math.round((b.parCanal[GLOVO] + b.parCanal[KOOL] + b.parCanal[CANAL_DIRECT]) * 1000) / 1000, 399.5);
  // Une ligne sans produit ou mal répartie empêche d'enregistrer.
  assert.equal(bilan([{ ...lignes[0], produit: null }]).pret, false);
  assert.equal(bilan([{ ...lignes[0], repartition: repartir(7, {}, true, [GLOVO, KOOL], CARTE[1].canaux) }]).pret, false);
  assert.equal(bilan([lignes[3]]).pret, false);

  const corps = corpsImport({ activiteId: 3, date: '2026-11-05', source: 'excel', fichierNom: 'caisse.xlsx', empreinte: 'a'.repeat(64), modele: lu.modele, totalLu: lu.totalLu,
    categories: [{ nom: 'DELIVERY', livraison: true }, { nom: 'SUR PLACE', livraison: false }], lignes });
  assert.equal(corps.activite_id, 3);
  assert.equal(corps.total_lu, 420.5);
  assert.deepEqual(corps.lignes[0], { categorie: 'DELIVERY', designation: 'Tajine Agneau du chef', quantite: 7, montant: 173.5, ignoree: false, article_type: 'produit', article_id: 5,
    repartition: [{ canal: GLOVO, quantite: 5 }, { canal: KOOL, quantite: 2 }] });
  assert.deepEqual(corps.lignes[3], { categorie: 'SUR PLACE', designation: 'Salade du jardin', quantite: 1, montant: 21, ignoree: true });
  assert.deepEqual(corps.lignes[4].repartition, [{ canal: CANAL_DIRECT, quantite: 3 }]);
});

test('repartir : livraison — le reste va au seul prestataire où le produit se vend', () => {
  // Deux prestataires actifs, le produit ne se vend que chez KOOL : tout lui revient sans saisie.
  const r = repartir(5, {}, true, [GLOVO, KOOL], [KOOL]);
  assert.deepEqual([r.erreur, r.parts, r.calcules], [null, [{ canal: KOOL, quantite: 5 }], [KOOL]]);
  // Une quantité saisie sur le canal fermé reste signalée.
  assert.equal(repartir(5, { [GLOVO]: '2' }, true, [GLOVO, KOOL], [KOOL]).erreur, 'HORS_CANAL');
  // Le produit ne se vend chez aucun prestataire : rien ne peut être réparti.
  assert.deepEqual([repartir(5, {}, true, [GLOVO, KOOL], [CANAL_DIRECT]).erreur, repartir(5, {}, true, [GLOVO, KOOL], [CANAL_DIRECT]).reste], ['PAS_CHEZ_PRESTATAIRE', 5]);
  // Sans produit choisi, on ne présume de rien : deux prestataires vides, il reste tout à répartir.
  assert.equal(repartir(5, {}, true, [GLOVO, KOOL], null).erreur, 'RESTE');
});
