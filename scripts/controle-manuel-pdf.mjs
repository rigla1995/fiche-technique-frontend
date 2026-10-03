#!/usr/bin/env node
// Contrôle du PDF du manuel (lot 2c, spec fiche-technique-backend/docs/lot-2c-spec.md §2.6, R2.6.2, P8) —
//
//   node scripts/controle-manuel-pdf.mjs --brut <manuel-client-B.json> [--domaine restauration|hotellerie|ceramique]
//        [--reference <restauration.json>] [--origine <dossier>] [--base <ref>]
//
// Le PDF du manuel est construit DANS LE NAVIGATEUR (GuidePage → buildManuelPdf(sections, voc), src/utils/manuelPdf.ts) :
// l'oracle du serveur ne le voit pas. Ce script le construit sous Node (jsPDF, date figée, /ID et /CreationDate masqués,
// `save` remplacé par une capture de `output()`, `text` capté par instance) :
//   - restauration (défaut), NON à vide : PDF A = manuelPdf.ts de develop (`--base`, défaut 1683d7b, avec ses imports, comme
//     controle-avenant.mjs) nourri des fiches d'ORIGINE (fiche-technique-backend/scripts/manuel/origine/manuel/, écrites à
//     l'étape M0) dans l'ordre manuel.lecteurs['client.B'] de la référence de l'oracle ; PDF B = manuelPdf.ts COURANT nourri
//     de la réponse brute, non masquée, du client B (`--brut`, écrite par capture-vocab-baseline.js --brut <dossier>). A et B
//     doivent être identiques à l'octet après masquage. Deux sources (fichiers d'origine, serveur du 2c), deux versions du
//     code : le contrôle n'est pas à vide (règle de controle-avenant.mjs) ;
//   - hotellerie / ceramique (réponse brute du client B d'un passage du domaine, vocabulaire résolu du lexique d'essai,
//     scripts/vocab-lexiques-test.json, R3.1.1) : chaînes écrites recollées par appel à text(), cherchées avec formesDans
//     (formes par défaut que le domaine change, passages exclus au balisage retirés) : aucune ; aucun « [[ » ; aucune marque
//     de clé inconnue « ‹clé› » ; aucune chaîne codée sur deux octets. Le « ‹ » seul est permis (pdfTexte : « ← », « ↔ »).
// Dans les deux cas, deux constructions du PDF courant sont identiques (déterminisme).
// Écrit à l'étape O ; lancé pour la PREMIÈRE fois à la sortie de M0 (§2.7, point 2) : avant M0, l'origine n'existe pas.
// Dépendance : rolldown (livré avec vite). Sortie 0 = contrôle réussi ; 1 = écart ; 2 = usage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(ICI, '..');
const BACK = path.resolve(process.env.LABFLOW_BACK || path.join(FRONT, '..', 'fiche-technique-backend'));
const args = process.argv.slice(2);
const opt = (nom, defaut = null) => { const i = args.indexOf(`--${nom}`); return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : defaut; };
const DOMAINE = opt('domaine', 'restauration');
const BRUT = opt('brut');
const REFERENCE = path.resolve(opt('reference', path.join(BACK, 'scripts', 'vocab-baseline', 'restauration.json')));
const ORIGINE = path.resolve(opt('origine', path.join(BACK, 'scripts', 'manuel', 'origine', 'manuel')));
const BASE = opt('base', '1683d7b');
const usage = (m) => { console.error(`controle-manuel-pdf : ${m}\nusage : node scripts/controle-manuel-pdf.mjs --brut <manuel-client-B.json> [--domaine restauration|hotellerie|ceramique] [--reference <f>] [--origine <dossier>] [--base <ref>]`); process.exit(2); };
if (!['restauration', 'hotellerie', 'ceramique'].includes(DOMAINE)) usage(`domaine inconnu « ${DOMAINE} »`);
if (!BRUT || !fs.existsSync(BRUT)) usage('--brut <fichier> obligatoire (réponse brute de GET /api/manuel du client B : capture-vocab-baseline.js --brut <dossier>)');

let ok = true;
const dire = (bon, texte) => { ok = ok && bon; console.log(`${bon ? 'OK   ' : 'ÉCHEC'} ${texte}`); };
const lf = (s) => s.replace(/\r\n?/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'controle-manuel-pdf-'));
const fin = (code) => { fs.rmSync(tmp, { recursive: true, force: true }); process.exit(code); };

// ── Code : manuelPdf.ts de la référence (develop) et courant, regroupés par rolldown ─────────────────────────
const FICHIERS_PDF = ['src/utils/manuelPdf.ts', 'src/utils/pdfTexte.ts', 'src/components/common/MarkdownView.tsx'];
const REF = path.join(tmp, 'reference');
const gitShow = (f) => execFileSync('git', ['-C', FRONT, 'show', `${BASE}:${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
for (const f of FICHIERS_PDF) {
  let source;
  try { source = gitShow(f); } catch { console.log(`ÉCHEC ${f} absent de ${BASE}`); fin(1); }
  fs.mkdirSync(path.dirname(path.join(REF, f)), { recursive: true });
  fs.writeFileSync(path.join(REF, f), source);
}
const memeCode = FICHIERS_PDF.every((f) => lf(fs.readFileSync(path.join(REF, f), 'utf8')) === lf(fs.readFileSync(path.join(FRONT, f), 'utf8')));
console.log(`référence ${BASE} : ${FICHIERS_PDF.map((f) => path.basename(f)).join(', ')} ${memeCode ? 'identiques au courant (attendu : le 2c ne les modifie pas, P13)' : 'DIFFÉRENTS du courant'}`);

const { build } = await import(pathToFileURL(path.join(FRONT, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);
const bundler = async (entree, sortie) => build({
  input: entree, platform: 'node', external: ['jspdf', 'jspdf-autotable', 'react', 'react/jsx-runtime'],
  output: { file: sortie, format: 'cjs' }, logLevel: 'warn',
});
await bundler(path.join(REF, 'src', 'utils', 'manuelPdf.ts'), path.join(tmp, 'reference.cjs'));
await bundler(path.join(FRONT, 'src', 'utils', 'manuelPdf.ts'), path.join(tmp, 'courant.cjs'));

// Date figée : date d'édition de la couverture, CreationDate de jsPDF (masquée de toute façon).
const FIXE = new Date('2026-10-03T10:00:00Z').getTime();
const VraieDate = Date;
globalThis.Date = class extends VraieDate {
  constructor(...a) { super(...(a.length ? a : [FIXE])); }
  static now() { return FIXE; }
};
const requireFront = createRequire(path.join(FRONT, 'package.json'));
const { jsPDF } = requireFront('jspdf');
// jsPDF capté : `text` est une méthode d'instance (posée par le constructeur) → enveloppée après super() ; `save` → output().
let produits = [];
class JsPdfCapte extends jsPDF {
  constructor(...a) {
    super(...a);
    const textes = [];
    const texteOrigine = this.text;
    this.text = function texteCapte(t, ...reste) {
      if (t != null) textes.push(Array.isArray(t) ? t.map(String).join(' ') : String(t));
      return texteOrigine.call(this, t, ...reste);
    };
    this.save = function saveCapte(nom) { produits.push({ nom, pdf: this.output(), textes }); return this; };
  }
}
const autoTable = requireFront('jspdf-autotable').default;
const req = (n) => (n === 'jspdf' ? JsPdfCapte : n === 'jspdf-autotable' ? autoTable : requireFront(n));
const charger = (fichier) => { const m = { exports: {} }; new Function('module', 'exports', 'require', fs.readFileSync(fichier, 'utf8'))(m, m.exports, req); return m.exports; };
const reference = charger(path.join(tmp, 'reference.cjs'));
const courant = charger(path.join(tmp, 'courant.cjs'));
const construire = (module, sections, voc) => {
  produits = [];
  module.buildManuelPdf(sections, voc);
  if (produits.length !== 1) throw new Error(`buildManuelPdf : ${produits.length} PDF produit(s) (1 attendu)`);
  return produits[0];
};

const { vocabDefaut, vocabDuLexique, resoudreLexique } = await import(pathToFileURL(path.join(FRONT, 'src', 'vocab', 'vocab.ts')).href);
const { LEXIQUE_DEFAUT } = await import(pathToFileURL(path.join(FRONT, 'src', 'vocab', 'lexiqueDefaut.ts')).href);
const { formesDans } = await import(pathToFileURL(path.join(ICI, 'vocab-check.mjs')).href);
const masquer = (pdf) => pdf.replace(/\/ID \[[^\]]*\]/g, '/ID [masqué]').replace(/\/CreationDate \([^)]*\)/g, '/CreationDate (masquée)');
// Chaîne écrite sur deux octets (octet nul devant chaque lettre) : ligne illisible (controle-avenant.mjs).
const deuxOctets = (pdf) => (pdf.match(/\((?:[^()\\]|\\.)*\)\s*Tj/g) || []).filter((t) => t.includes('\x00')).length;
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const brut = JSON.parse(fs.readFileSync(BRUT, 'utf8'));
if (!Array.isArray(brut) || !brut.length) { console.log(`ÉCHEC ${BRUT} : liste de sections attendue, non vide`); fin(1); }

if (DOMAINE === 'restauration') {
  // ── A : develop + origine, dans l'ordre de la référence ; B : courant + réponse brute ────────────────────
  if (!fs.existsSync(ORIGINE)) { console.log(`ÉCHEC origine absente (${ORIGINE}) : écrite par l'étape M0 (extraire-origine.js) ; avant, le contrôle tournerait à vide`); fin(1); }
  const ref = JSON.parse(fs.readFileSync(REFERENCE, 'utf8'));
  const ordre = ref.captures && ref.captures.manuel && ref.captures.manuel.lecteurs && ref.captures.manuel.lecteurs['client.B'];
  if (!Array.isArray(ordre) || !ordre.length) { console.log(`ÉCHEC ${REFERENCE} : manuel.lecteurs['client.B'] absent (référence d'avant le lot 2c)`); fin(1); }
  dire(JSON.stringify(brut.map((s) => s.slug)) === JSON.stringify(ordre), `réponse brute du client B : ${brut.length} fiches, mêmes slugs dans le même ordre que la référence (${ordre.length})`);
  const sectionsA = [];
  for (const slug of ordre) {
    const fj = path.join(ORIGINE, `${slug}.json`);
    const fm = path.join(ORIGINE, `${slug}.md`);
    if (!fs.existsSync(fj) || !fs.existsSync(fm)) { dire(false, `origine de « ${slug} » absente (${slug}.json / ${slug}.md)`); continue; }
    const o = JSON.parse(fs.readFileSync(fj, 'utf8'));
    const contenu = fs.readFileSync(fm, 'utf8');
    if (o.md5Contenu && md5(contenu) !== o.md5Contenu) dire(false, `origine de « ${slug} » : md5 du .md ≠ md5Contenu du .json`);
    sectionsA.push({ id: 0, slug, titre: o.titre, icone: o.icone ?? null, partie: o.partie, ordre: o.ordre, contenu, motsCles: o.mots_cles ?? null });
  }
  const a = construire(reference, sectionsA, vocabDefaut);
  const b = construire(courant, brut, vocabDefaut);
  const b2 = construire(courant, brut, vocabDefaut);
  const ma = masquer(a.pdf);
  const mb = masquer(b.pdf);
  let i = 0; while (i < ma.length && ma[i] === mb[i]) i += 1;
  dire(ma === mb, `PDF A (${BASE} + origine, ${sectionsA.length} fiches) et PDF B (courant + serveur) identiques à l'octet après masquage (${mb.length} octets)${ma === mb ? '' : ` — première différence à l'octet ${i} : « ${ma.slice(Math.max(0, i - 40), i + 40).replace(/\n/g, '⏎')} » / « ${mb.slice(Math.max(0, i - 40), i + 40).replace(/\n/g, '⏎')} »`}`);
  dire(masquer(b2.pdf) === mb, 'deux constructions du PDF courant identiques');
  dire(deuxOctets(mb) === 0, `aucune ligne codée sur deux octets (${b.textes.length} appels à text())`);
} else {
  // ── H / C : réponse brute du passage, vocabulaire du lexique d'essai résolu ─────────────────────────────
  const essais = JSON.parse(fs.readFileSync(path.join(ICI, 'vocab-lexiques-test.json'), 'utf8'));
  if (!essais[DOMAINE]) { console.log(`ÉCHEC lexique d'essai « ${DOMAINE} » absent de scripts/vocab-lexiques-test.json`); fin(1); }
  const voc = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, essais[DOMAINE]));
  // Formes par défaut que le domaine change (mêmes formes que l'oracle, check-invariant-vocab.js formesCherchees).
  const formes = (v, k) => [v.Nom(k), v.Pl(k), v.Court(k), v.Court(k, 2)].map(String);
  const rendusX = new Set(Object.keys(LEXIQUE_DEFAUT).flatMap((k) => formes(voc, k).map((f) => f.toLowerCase())));
  const F = [...new Set(Object.keys(LEXIQUE_DEFAUT).flatMap((k) => {
    const d = formes(vocabDefaut, k); const x = formes(voc, k);
    return d.filter((f, i) => f !== x[i] && !rendusX.has(f.toLowerCase()));
  }))];
  // Passages exclus au balisage (scripts/manuel/balise/manuel/<slug>.json et variantes/<domaine>/<slug>.json) : remplacés
  // par un jeton neutre AVANT une seconde construction, qui ne sert qu'à la recherche des formes.
  const extraits = (f) => { try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return (o.exclusions || []).map((x) => x && x.extrait).filter((x) => typeof x === 'string' && x); } catch { return []; } };
  const exclus = (slug) => [path.join(BACK, 'scripts', 'manuel', 'balise', 'manuel', `${slug}.json`), path.join(BACK, 'scripts', 'manuel', 'variantes', DOMAINE, `${slug}.json`)].filter((f) => fs.existsSync(f)).flatMap(extraits);
  let nExclus = 0;
  const sansExclus = brut.map((s) => {
    const l = exclus(s.slug);
    const retirer = (t) => l.reduce((x, e) => { const n = x.split(e).length - 1; nExclus += n; return x.split(e).join('EXCLU'); }, t);
    return { ...s, titre: retirer(s.titre), contenu: retirer(s.contenu) };
  });
  const p = construire(courant, brut, voc);
  const p2 = construire(courant, brut, voc);
  const scan = construire(courant, sansExclus, voc);
  dire(masquer(p2.pdf) === masquer(p.pdf), 'deux constructions du PDF identiques');
  const trouvees = [];
  for (const t of scan.textes) for (const f of formesDans(t, F)) trouvees.push({ f, t });
  dire(!trouvees.length, `${DOMAINE} : ${F.length} forme(s) par défaut cherchée(s) dans ${scan.textes.length} chaîne(s), ${nExclus} passage(s) exclu(s) retiré(s) — ${trouvees.length} trouvée(s)`);
  for (const x of trouvees.slice(0, 30)) console.log(`      « ${x.f} » : ${x.t.length > 160 ? `${x.t.slice(0, 160)}…` : x.t}`);
  const balises = p.textes.filter((t) => /\[\[|\]\]/.test(t));
  dire(!balises.length, `aucun « [[ » ni « ]] » (${balises.length})${balises.length ? ` : ${balises[0].slice(0, 120)}` : ''}`);
  const marques = p.textes.filter((t) => /‹[a-z0-9_]+›/.test(t));
  dire(!marques.length, `aucune marque de clé inconnue « ‹clé› » (${marques.length})${marques.length ? ` : ${marques[0].slice(0, 120)}` : ''}`);
  dire(deuxOctets(p.pdf) === 0, `aucune ligne codée sur deux octets (${p.textes.length} appels à text())`);
}
console.log(ok ? `\ncontrole-manuel-pdf : ${DOMAINE} — réussi` : `\ncontrole-manuel-pdf : ${DOMAINE} — ÉCART`);
fin(ok ? 0 : 1);
