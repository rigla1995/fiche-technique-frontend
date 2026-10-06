import type { ManuelProduit } from '../components/client/GuidePage';

// Manuel de LabFlow Compta, servi par la page du manuel de LabFlow (même affichage) : fiches du produit « compta »,
// sous-titre et textes du PDF propres au produit. Constante de module : la page ne recharge pas les fiches à chaque rendu.
export const MANUEL_COMPTA: ManuelProduit = {
  produit: 'compta',
  sousTitre: 'Guide complet de LabFlow Compta',
  pdf: {
    sousTitre: 'LabFlow Compta — Guide complet de l\'application',
    intro: 'Ce manuel présente LabFlow Compta, écran par écran. La version en ligne, accessible depuis le menu '
      + '« Manuel d\'utilisation » et le bouton « ? » de chaque page, reste la référence la plus à jour.',
    pied: 'LabFlow Compta — Manuel d\'utilisation',
    fichier: 'LabFlow-Compta-Manuel-utilisation.pdf',
  },
};
