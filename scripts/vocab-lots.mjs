#!/usr/bin/env node
// Lots du balayage 2a (spec §3) — `node scripts/vocab-lots.mjs [--json] [<lot>]`
//
// SOURCE UNIQUE de la répartition : la table LOTS ci-dessous (propriété exclusive : un fichier = un lot).
// La charge d'un lot = unités que le mode `residuels` de vocab-check signale dans ses fichiers (écarts communs de
// scripts/vocab-allow/_global.json déjà admis) : elle est RECALCULÉE à chaque passage, jamais recopiée.
//   sans argument : table des 12 lots (charge, fichiers) ;
//   <lot>         : les fichiers du lot, un par ligne (chemins relatifs au dépôt, prêts pour vocab-check) ;
//   --json        : [{ lot, charge, fichiers: [{ fichier, charge }] }].
// Code de sortie 1 si un fichier à unités n'appartient à aucun lot, appartient à deux lots, ou n'existe pas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeResiduels, chargerAllow, DEPOT_FRONT } from './vocab-check.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const C = 'src/components/client/';
const K = 'src/components/common/';
const P = 'src/components/portail/';

export const LOTS = {
  F1: [`${K}Sidebar.tsx`, `${K}Header.tsx`, `${K}AssistantChat.tsx`, `${C}OnboardingChecklist.tsx`],
  F2: [`${C}ActivitesPage.tsx`, `${C}GerantsPage.tsx`],
  F3: [`${C}StockPage.tsx`, `${C}ApproPreviewPanel.tsx`, `${C}InvoiceConfirmModal.tsx`, `${C}HistoriqueApproPage.tsx`],
  F4: [`${C}StockLaboPage.tsx`, `${C}LaboHistoriqueApproPage.tsx`, `${C}PortionsModal.tsx`],
  // Pages jumelles FacturesApproPage / LaboFacturesApproPage : réunies ici (elles affichent les transferts).
  F5: [`${C}TransferPage.tsx`, `${C}TransferConfirmModal.tsx`, `${C}TransferHistoriquePage.tsx`, `${C}LaboVentesPage.tsx`, `${K}TypeApproFilter.tsx`,
    `${C}FacturesApproPage.tsx`, `${C}LaboFacturesApproPage.tsx`],
  F6: [`${C}ProductList.tsx`, `${C}ProductForm.tsx`, `${C}ProductCard.tsx`, `${C}RecipeTree.tsx`],
  F7: [`${C}ValorisesPage.tsx`, `${C}ComposedValoriseModal.tsx`, `${C}FicheTechniqueModal.tsx`, `${C}ConfigurationVentePage.tsx`],
  F8: [`${C}ClientDashboard.tsx`, `${C}dashboardV2Widgets.tsx`],
  // ProductCategoriesPage : avec le référentiel (catégories), pour alléger F6.
  F9: [`${C}ReferentielArticlesPage.tsx`, `${C}ReferentielCategoriesPage.tsx`, `${C}ReferentielFamillesPage.tsx`, `${C}ReferentielImportPage.tsx`, `${C}ReferentielUnitesPage.tsx`,
    `${C}FournisseursPage.tsx`, `${C}FournisseursImportPage.tsx`, `${C}ProductCategoriesPage.tsx`],
  F10: [`${C}InventairePage.tsx`, `${C}HistoriqueInventairePage.tsx`, `${C}HistoriquepertesPage.tsx`, `${C}LaboHistoriquepertesPage.tsx`, `${C}VentesPage.tsx`],
  F11: [`${C}AcheteursPage.tsx`, `${C}AcheteursImportPage.tsx`, `${C}TarifsAcheteursPage.tsx`, `${C}CommandesAcheteursPage.tsx`, `${C}VenteAcheteurPage.tsx`,
    `${P}PortailAcheteurPage.tsx`, `${P}PortailCommandesPage.tsx`, `${P}PortailShell.tsx`],
  // ConfigPrestatairesPage et sa jumelle ConfigChargesPage ; AdminSupportPage et GuidePage pour les SEULS points
  // d'appel de contractPdf (AvenantPdfParams.lexique) et de manuelPdf (voc en paramètre).
  F12: [`${C}AcheteursGuard.tsx`, `${C}FormuleGuard.tsx`, `${C}VenteGuard.tsx`, `${C}MonAbonnementPage.tsx`, `${C}AbonnementGerantPage.tsx`, `${C}SupportPage.tsx`,
    `${C}ConfigPrestatairesPage.tsx`, `${C}ConfigChargesPage.tsx`, 'src/utils/manuelPdf.ts', 'src/components/admin/AdminSupportPage.tsx', `${C}GuidePage.tsx`],
};

/** Charge par lot, mesurée maintenant : { lots: [{ lot, charge, fichiers: [{ fichier, charge }] }], problemes }. */
export function mesurer(root = DEPOT_FRONT) {
  const { entrees } = chargerAllow(path.join(root, 'scripts', 'vocab-allow'));
  const { parFichier } = modeResiduels({ root, fichiers: [], entrees });
  const proprietaire = new Map();
  const problemes = [];
  for (const [lot, fichiers] of Object.entries(LOTS)) {
    for (const f of fichiers) {
      if (!fs.existsSync(path.join(root, f))) problemes.push(`${lot} : ${f} n'existe pas`);
      if (proprietaire.has(f)) problemes.push(`${f} : dans ${proprietaire.get(f)} et dans ${lot}`);
      proprietaire.set(f, lot);
    }
  }
  for (const [f, n] of Object.entries(parFichier)) if (!proprietaire.has(f)) problemes.push(`${f} : ${n} unité(s), aucun lot`);
  const lots = Object.entries(LOTS).map(([lot, fichiers]) => {
    const detail = fichiers.map((fichier) => ({ fichier, charge: parFichier[fichier] ?? 0 }));
    return { lot, charge: detail.reduce((n, x) => n + x.charge, 0), fichiers: detail };
  });
  return { lots, problemes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ICI, 'vocab-lots.mjs')) {
  const args = process.argv.slice(2);
  const demande = args.find((a) => !a.startsWith('--'));
  if (demande) {
    if (!LOTS[demande]) { console.error(`lot inconnu : ${demande} (${Object.keys(LOTS).join(', ')})`); process.exit(2); }
    console.log(LOTS[demande].join('\n'));
  } else {
    const { lots, problemes } = mesurer();
    if (args.includes('--json')) console.log(JSON.stringify(lots, null, 2));
    else {
      for (const l of lots) console.log(`${l.lot.padEnd(4)} ${String(l.charge).padStart(4)}  ${l.fichiers.map((x) => path.basename(x.fichier).replace(/\.tsx?$/, '')).join(', ')}`);
      console.log(`total ${lots.reduce((n, l) => n + l.charge, 0)} unité(s), ${lots.reduce((n, l) => n + l.fichiers.length, 0)} fichier(s), ${lots.length} lots`);
    }
    problemes.forEach((p) => console.error(`PROBLÈME ${p}`));
    process.exit(problemes.length ? 1 : 0);
  }
}
