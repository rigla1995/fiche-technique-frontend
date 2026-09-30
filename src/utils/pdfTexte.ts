// Texte sûr pour les PDF générés par jsPDF avec ses polices standard (Helvetica, Courier).
//
// Ces polices (codage WinAnsi) n'écrivent que le Latin-1 et les signes typographiques de
// Windows-1252 (— – … € ’ œ • ‹ ›). UN SEUL caractère hors de ce jeu (« → », « − », « ✓ », espace
// fine insécable…) fait basculer TOUTE la chaîne en codage sur deux octets, que les lecteurs PDF
// affichent lettre par lettre, en charabia. Tout texte écrit dans un PDF passe donc par pdfTexte() :
//   • un équivalent lisible pour les signes porteurs de sens (flèches, moins, ≤, Σ…) ;
//   • rien pour les signes décoratifs (coches, puces, icônes de badge), comme pour les emojis ;
//   • « ? » pour tout le reste (alphabet non latin…) : la ligne reste lisible quoi qu'il arrive.
// À appeler AVANT splitTextToSize / getTextWidth, pour que les largeurs mesurées soient justes.

const HORS_POLICE = /[^\t\n\r\x20-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu;

const EQUIVALENTS: Record<string, string> = {
  // Flèches de parcours et de sens : « Référentiel › Unités », « Reçu ‹ X »
  '→': '›', '➜': '›', '➔': '›', '⇒': '›', '▸': '›', '←': '‹', '⇐': '‹', '↔': '‹›',
  // Mathématiques
  '−': '–', '≤': '<=', '≥': '>=', '≠': '<>', '≈': '~', 'Σ': 'Somme', '∑': 'Somme', '∞': 'infini',
  // Évolution d'un indicateur
  '▲': '+', '▼': '–',
  // Décoratifs : retirés (icônes de boutons, de badges, coches, puces)
  '✓': '', '✔': '', '✕': '', '✖': '', '✗': '', '◆': '', '◇': '', '●': '', '○': '', '■': '', '□': '', '▪': '',
  '⇄': '', '⇆': '', '↑': '', '↓': '', '↳': '', '↺': '', '↻': '',
  // Espaces que la police ne connaît pas
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '﻿': '',
};

export const pdfTexte = (texte: string): string =>
  texte
    .replace(HORS_POLICE, (c) => EQUIVALENTS[c] ?? '?')
    // Un signe décoratif retiré peut laisser des parenthèses ou des guillemets vides
    .replace(/\(\s*\)/g, '')
    .replace(/«\s*»/g, '');
