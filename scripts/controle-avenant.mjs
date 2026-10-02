#!/usr/bin/env node
// Contrôle de l'avenant PDF (lot 2, spec §2.3 : contractPdf.ts reçoit le lexique du client) —
//   node scripts/controle-avenant.mjs [--base <ref>]
//
// Génère l'avenant avec le contractPdf.ts COURANT (lexique par défaut) et avec celui du commit de référence
// (scripts/vocab-reference-lot2 = avant le lot 2, ou --base), sur 5 jeux de postes, et exige des PDF identiques à l'octet près
// (hors identifiant de fichier et date de création, masqués ; Date figée pour le numéro AVN et la date du jour).
// Un compte restauration reçoit donc exactement l'avenant d'aujourd'hui. Ce contrôle aurait vu la ligne
// « Option Acheteurs → palier » (flèche hors police, ligne illisible) que la référence avait corrigée en « : ».
// Puis un rendu Hôtellerie (lexique d'essai) doit rester lisible : aucune chaîne codée sur deux octets.
// Non-vacuité : le contractPdf.ts de la référence doit DIFFÉRER du courant (sinon le contrôle compare un fichier à
// lui-même et réussit à vide : c'est ce que donnait une référence réépinglée sur la tête du lot 2a).
// Dépendance : rolldown (livré avec vite, dans node_modules de ce dépôt). Sortie 0 = identique ; 1 = écart.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(ICI, '..');
const args = process.argv.slice(2);
const iBase = args.indexOf('--base');
// Référence d'AVANT le lot 2 : scripts/vocab-reference-lot2 (spec lot 2b §3.1), jamais scripts/vocab-check.base
// (référence de l'outil de preuve, réépinglée à chaque sous-lot : le contrôle comparerait le 2a au 2a, à vide).
const BASE = (iBase !== -1 && args[iBase + 1]) || fs.readFileSync(path.join(ICI, 'vocab-reference-lot2'), 'utf8').trim();

// Référence : contractPdf.ts et ses imports relatifs (./pdfTexte, ../vocab/*) au commit BASE, hors dépôt.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'controle-avenant-'));
const REF = path.join(tmp, 'reference');
const gitShow = (f) => execFileSync('git', ['-C', FRONT, 'show', `${BASE}:${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const existe = (f) => { try { gitShow(f); return true; } catch { return false; } };
for (const f of ['src/utils/contractPdf.ts', 'src/utils/pdfTexte.ts', 'src/vocab/vocab.ts', 'src/vocab/lexiqueDefaut.ts', 'src/vocab/rendre.ts']) {
  if (!existe(f)) continue;
  fs.mkdirSync(path.dirname(path.join(REF, f)), { recursive: true });
  fs.writeFileSync(path.join(REF, f), gitShow(f));
}

// Non-vacuité (spec lot 2b §3.1) : une référence où contractPdf.ts est celui d'aujourd'hui ne prouve rien.
const lf = (s) => s.replace(/\r\n?/g, '\n');
const sourceRef = fs.existsSync(path.join(REF, 'src', 'utils', 'contractPdf.ts')) ? lf(fs.readFileSync(path.join(REF, 'src', 'utils', 'contractPdf.ts'), 'utf8')) : null;
if (sourceRef === null || sourceRef === lf(fs.readFileSync(path.join(FRONT, 'src', 'utils', 'contractPdf.ts'), 'utf8'))) {
  console.log(`ÉCHEC contrôle à vide : contractPdf.ts de la référence ${BASE.slice(0, 7)} ${sourceRef === null ? 'absent' : 'identique au courant'} — la référence doit être le commit d'avant le lot 2 (scripts/vocab-reference-lot2)`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
console.log(`référence ${BASE.slice(0, 7)} : contractPdf.ts différent du courant (le contrôle n'est pas à vide)`);

const { build } = await import(pathToFileURL(path.join(FRONT, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);
const bundler = async (entree, sortie) => build({
  input: entree, platform: 'node', external: ['jspdf'], output: { file: sortie, format: 'cjs' }, logLevel: 'warn',
});
await bundler(path.join(REF, 'src', 'utils', 'contractPdf.ts'), path.join(tmp, 'reference.cjs'));
await bundler(path.join(FRONT, 'src', 'utils', 'contractPdf.ts'), path.join(tmp, 'courant.cjs'));

// Date figée : numéro AVN (Date.now), date du jour, CreationDate de jsPDF.
const FIXE = new Date('2026-09-30T10:00:00Z').getTime();
const VraieDate = Date;
globalThis.Date = class extends VraieDate {
  constructor(...a) { super(...(a.length ? a : [FIXE])); }
  static now() { return FIXE; }
};
const requireFront = createRequire(path.join(FRONT, 'package.json'));
// `import jsPDF from 'jspdf'` en mode Node = module.exports : la classe elle-même.
const req = (n) => (n === 'jspdf' ? requireFront('jspdf').jsPDF : requireFront(n));
const charger = (fichier) => { const m = { exports: {} }; new Function('module', 'exports', 'require', fs.readFileSync(fichier, 'utf8'))(m, m.exports, req); return m.exports; };
const reference = charger(path.join(tmp, 'reference.cjs'));
const courant = charger(path.join(tmp, 'courant.cjs'));
const { resoudreLexique } = await import(pathToFileURL(path.join(FRONT, 'src', 'vocab', 'vocab.ts')).href);
const { LEXIQUE_DEFAUT } = await import(pathToFileURL(path.join(FRONT, 'src', 'vocab', 'lexiqueDefaut.ts')).href);
const ESSAIS = JSON.parse(fs.readFileSync(path.join(ICI, 'vocab-lexiques-test.json'), 'utf8'));

const base = {
  clientNom: 'Société Test', clientEmail: 'client@test.local', appName: 'LabFlow',
  nbActivites: 3, nbLabos: 1, nbGerants: 2, ancienMensuel: 250, nouveauMensuel: 330, effectifMensuel: 330,
  activiteCost: 40, laboCost: 60, gerantCost: 15, formuleActivites: 'premium', dateAvenant: '2026-09-30',
  notesAdmin: 'Avenant de test',
};
const JEUX = {
  'A activités seules': { nbActivitesAdded: 2, nbLabosAdded: 0, nbGerantsAdded: 0 },
  'B activités + labos + gérants': { nbActivitesAdded: 1, nbLabosAdded: 1, nbGerantsAdded: 2 },
  'C option acheteurs seule': { nbActivitesAdded: 0, nbLabosAdded: 0, nbGerantsAdded: 0, acheteursCible: 20, nbAcheteurs: 20, acheteursCost: 30 },
  'D tout': { nbActivitesAdded: 1, nbLabosAdded: 1, nbGerantsAdded: 1, acheteursCible: 50, nbAcheteurs: 50, acheteursCost: 60 },
  'E gérants + acheteurs': { nbActivitesAdded: 0, nbLabosAdded: 0, nbGerantsAdded: 3, acheteursCible: 100, nbAcheteurs: 100, acheteursCost: 90 },
};
const decoder = (b64) => Buffer.from(b64, 'base64').toString('latin1');
const masquer = (pdf) => pdf.replace(/\/ID \[[^\]]*\]/g, '/ID [masqué]').replace(/\/CreationDate \([^)]*\)/g, '/CreationDate (masquée)');
// Chaîne écrite sur deux octets (un octet nul devant chaque lettre : « \0O\0p\0t… ») : un caractère hors
// police a fait basculer toute la ligne, que les lecteurs PDF affichent en charabia.
const deuxOctets = (pdf) => (pdf.match(/\((?:[^()\\]|\\.)*\)\s*Tj/g) || []).filter((t) => t.includes('\x00')).length;

let ok = true;
const dire = (bon, texte) => { ok = ok && bon; console.log(`${bon ? 'OK   ' : 'ÉCHEC'} ${texte}`); };
for (const [nom, postes] of Object.entries(JEUX)) {
  const a = masquer(decoder(reference.generateAvenantPdf({ ...base, ...postes })));
  const b = masquer(decoder(courant.generateAvenantPdf({ ...base, ...postes, lexique: null })));
  let i = 0; while (i < a.length && a[i] === b[i]) i += 1;
  dire(a === b, `${nom} : lexique par défaut, PDF identique à la référence ${BASE.slice(0, 7)} (${b.length} octets)${a === b ? '' : ` — première différence à l'octet ${i} : « ${a.slice(Math.max(0, i - 30), i + 40).replace(/\n/g, '⏎')} » / « ${b.slice(Math.max(0, i - 30), i + 40).replace(/\n/g, '⏎')} »`}`);
  dire(deuxOctets(b) === 0, `${nom} : aucune ligne illisible (codée sur deux octets) — défaut`);
  const h = decoder(courant.generateAvenantPdf({ ...base, ...postes, lexique: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie) }));
  dire(deuxOctets(h) === 0, `${nom} : aucune ligne illisible — Hôtellerie`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok ? `\ncontrole-avenant : identique à ${BASE.slice(0, 7)} sur ${Object.keys(JEUX).length} jeux, lisible en Hôtellerie` : '\ncontrole-avenant : ÉCART');
process.exit(ok ? 0 : 1);
