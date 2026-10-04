// Lot 3 (spec backend docs/lot-3-spec.md §1.3) : la copie écran du matricule fiscal suit les mêmes vecteurs que le serveur.
//   node --test scripts/matricule-fiscal.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliserMatriculeFiscal, controlerMatriculeFiscal } from '../src/components/admin/matriculeFiscal.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (p) => fs.readFileSync(p, 'utf8');
const { vecteurs } = JSON.parse(lire(path.join(ICI, 'matricule-fiscal-vecteurs.json')));

test('matricule fiscal (écran) : vecteurs écrits à la main', () => {
  assert.ok(vecteurs.length >= 20);
  for (const v of vecteurs) {
    assert.equal(normaliserMatriculeFiscal(v.entree), v.normalise, `normaliser(${JSON.stringify(v.entree)})`);
    const c = controlerMatriculeFiscal(v.entree);
    assert.equal(c.ok, v.ok, `ok(${JSON.stringify(v.entree)})`);
    assert.equal(Boolean(c.avertissement), v.avertissement, `avertissement(${JSON.stringify(v.entree)})`);
  }
});

test('vecteurs identiques à ceux du serveur (si le dépôt backend est à côté)', (t) => {
  const back = path.join(ICI, '..', '..', 'fiche-technique-backend', 'test', 'matricule-fiscal-vecteurs.json');
  if (!fs.existsSync(back)) { t.skip('dépôt backend absent'); return; }
  assert.deepEqual(JSON.parse(lire(back)), JSON.parse(lire(path.join(ICI, 'matricule-fiscal-vecteurs.json'))));
});
