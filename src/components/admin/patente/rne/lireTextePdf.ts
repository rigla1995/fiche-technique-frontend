// Couche « pdf » de la lecture de la patente (lot 3, étape 7) : texte d'un extrait RNE (PDF officiel), lu PAR
// POSITIONS dans le navigateur — sans IA, sans rien envoyer à un tiers. Ce fichier est le seul du dossier à parler à
// pdf.js ; l'analyse est faite par les fonctions pures d'analyseur.ts, de tables.ts et de dessins.ts.
// pdfjs-dist est figé en 6.4.299 : la forme des opérateurs de dessin (cases à cocher) dépend de la version.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { LectureTextePdf } from '../types.ts';
import type { Morceau, PageTexte } from './analyseur.ts';
import { CARACTERES_MAX, MORCEAUX_MAX, PAGES_MAX, lectureExtraitRne, reconnaitre } from './analyseur.ts';
import { lireCasesACocher, origineDuTexte } from './dessins.ts';

/**
 * Lit la couche texte d'un PDF déjà ouvert par l'appelant (qui le fermera lui-même). Seules les PAGES_MAX premières
 * pages sont lues : un extrait tient en quelques pages.
 * @param pdfjs le module pdf.js chargé par l'appelant (seule sa table d'opérateurs `OPS` sert ici)
 * @returns `null` si le PDF n'a pas de couche texte (scan), si sa couche texte est celle d'un scanner (page numérisée
 *   dont le texte a été reconnu par le scanner), s'il n'est pas reconnu comme un extrait RNE, ou si une page porte
 *   plus de MORCEAUX_MAX morceaux de texte ou plus de CARACTERES_MAX caractères (fichier fabriqué). L'appelant passe
 *   alors à la reconnaissance de caractères.
 */
export async function lireTextePdf(pdfjs: { OPS: object }, pdf: PDFDocumentProxy): Promise<LectureTextePdf | null> {
  const nbPages = Math.min(pdf.numPages, PAGES_MAX);
  const pages: PageTexte[] = [];
  const vues: number[][] = [];
  for (let n = 1; n <= nbPages; n++) {
    const page = await pdf.getPage(n);
    const contenu = await page.getTextContent();
    const morceaux: Morceau[] = [];
    let caracteres = 0;
    for (const it of contenu.items) {
      if (!('str' in it) || it.str === '') continue; // contenu balisé, marqueurs de fin de ligne
      morceaux.push({ str: it.str, x: Number(it.transform[4]), y: Number(it.transform[5]), largeur: it.width });
      caracteres += it.str.length;
    }
    if (morceaux.length > MORCEAUX_MAX || caracteres > CARACTERES_MAX) return null;
    const [x0, y0, x1, y1] = page.view;
    vues.push([x0, y0, x1, y1]);
    pages.push({ largeur: x1 - x0, hauteur: y1 - y0, morceaux, cases: null });
  }
  if (!reconnaitre(pages).estExtraitRne) return null;

  // Les dessins ne sont lus que pour un extrait reconnu. Ils donnent les cases à cocher (état du registre) et disent
  // d'où vient le texte de la page : celui d'un scanner n'est pas lu comme celui de l'extrait officiel.
  for (let n = 1; n <= nbPages; n++) {
    const lue = pages[n - 1];
    if (!lue.morceaux.length) continue;
    try {
      const page = await pdf.getPage(n);
      const ops = await page.getOperatorList();
      const origine = origineDuTexte(pdfjs.OPS, ops, vues[n - 1]);
      if (origine === 'scanner') {
        // page numérisée : son texte est écarté ; sans elle, le reste n'est peut-être plus un extrait
        pages[n - 1] = { ...lue, morceaux: [] };
        if (!reconnaitre(pages).estExtraitRne) return null;
        continue;
      }
      if (origine === 'incertain') lue.texteDouteux = true;
      lue.cases = lireCasesACocher(pdfjs.OPS, ops, lue.morceaux);
    } catch {
      // dessins illisibles : l'état du registre sera signalé « non lu », et l'origine du texte n'est pas établie
      lue.texteDouteux = true;
    }
  }
  return lectureExtraitRne(pages);
}
