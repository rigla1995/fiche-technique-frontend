// Couche « pdf » de la lecture de la patente (lot 3, étape 7) : texte d'un extrait RNE (PDF officiel), lu PAR
// POSITIONS dans le navigateur — sans IA, sans rien envoyer à un tiers. Ce fichier est le seul du dossier à parler à
// pdf.js ; l'analyse est faite par les fonctions pures d'analyseur.ts, de tables.ts et de dessins.ts.
// pdfjs-dist est figé en 6.4.299 : la forme des opérateurs de dessin (cases à cocher) dépend de la version.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { LectureTextePdf } from '../types.ts';
import type { Morceau, PageTexte } from './analyseur.ts';
import { lectureExtraitRne, reconnaitre } from './analyseur.ts';
import { lireCasesACocher } from './dessins.ts';

// Un extrait tient en quelques pages : on ne lit pas au-delà (un autre PDF, très long, est écarté sans tout parcourir).
const PAGES_MAX = 10;

/**
 * Lit la couche texte d'un PDF déjà ouvert par l'appelant (qui le fermera lui-même).
 * @returns `null` si le PDF n'a pas de couche texte (scan) ou n'est pas reconnu comme un extrait RNE.
 */
export async function lireTextePdf(pdfjs: typeof import('pdfjs-dist'), pdf: PDFDocumentProxy): Promise<LectureTextePdf | null> {
  const nbPages = Math.min(pdf.numPages, PAGES_MAX);
  const pages: PageTexte[] = [];
  for (let n = 1; n <= nbPages; n++) {
    const page = await pdf.getPage(n);
    const contenu = await page.getTextContent();
    const morceaux: Morceau[] = [];
    for (const it of contenu.items) {
      if (!('str' in it) || it.str === '') continue; // contenu balisé, marqueurs de fin de ligne
      morceaux.push({ str: it.str, x: Number(it.transform[4]), y: Number(it.transform[5]), largeur: it.width });
    }
    const [x0, y0, x1, y1] = page.view;
    pages.push({ largeur: x1 - x0, hauteur: y1 - y0, morceaux, cases: null });
  }
  if (!reconnaitre(pages).estExtraitRne) return null;

  // Les cases à cocher (état du registre) sont des dessins : on ne lit la liste d'opérateurs que pour un extrait reconnu.
  for (let n = 1; n <= nbPages; n++) {
    try {
      const page = await pdf.getPage(n);
      pages[n - 1].cases = lireCasesACocher(pdfjs.OPS, await page.getOperatorList(), pages[n - 1].morceaux);
    } catch {
      // dessins illisibles : l'état du registre sera signalé « non lu »
    }
  }
  return lectureExtraitRne(pages);
}
