// Fusion des lectures des trois couches (lot 3, étape 7), par priorité : cachet électronique, puis texte du PDF,
// puis reconnaissance de caractères. Fonction pure (testée par scripts/patente-fusion.test.mjs).
import type {
  Cachet, ChampIdentite, ChampLu, LectureCode2d, LecturePatente, LectureTextePdf, ResultatCouche, SourceLecture,
} from './types.ts';

export const NOM_COUCHE: Record<SourceLecture, string> = { cachet: 'le cachet électronique', pdf: 'le texte du PDF', ocr: 'la reconnaissance de caractères' };

const racine = (matricule: string): string => matricule.slice(0, 8); // 7 chiffres + lettre-clé

/** Fusion des couches, par priorité (cachet, puis pdf, puis ocr). */
export function fusionner(
  code: LectureCode2d | null, texte: LectureTextePdf | null, ocr: ResultatCouche | null, avertissementsLecture: string[] = [],
): LecturePatente {
  const parPriorite: [SourceLecture, ResultatCouche | null][] = [['cachet', code], ['pdf', texte], ['ocr', ocr]];
  const presentes = parPriorite.filter((c): c is [SourceLecture, ResultatCouche] => c[1] !== null);
  const champs: Partial<Record<ChampIdentite, ChampLu>> = {};
  const avertissements: string[] = [...avertissementsLecture];
  for (const [source, couche] of presentes) {
    for (const [cle, lu] of Object.entries(couche.champs) as [ChampIdentite, ChampLu][]) {
      if (!lu?.valeur) continue;
      const garde = champs[cle];
      if (!garde) { champs[cle] = lu; continue; }
      if (cle === 'matriculeFiscal' || cle === 'rne') {
        if (racine(lu.valeur) !== racine(garde.valeur)) {
          avertissements.push(`Désaccord sur l'identifiant : ${NOM_COUCHE[garde.source]} donne ${racine(garde.valeur)}, ${NOM_COUCHE[source]} donne ${racine(lu.valeur)}. La première lecture est gardée : à vérifier.`);
        } else if (cle === 'matriculeFiscal' && lu.valeur.length > garde.valeur.length) {
          champs[cle] = lu; // même racine, matricule complet (/A/M/000) lu par une couche moins sûre : on le prend, à relire
        }
      }
    }
    avertissements.push(...couche.avertissements);
  }
  const cachet: Cachet | null = code?.cachet ?? null;
  if (cachet?.etat === 'invalide') avertissements.unshift('La signature du cachet électronique est INVALIDE : ce document a pu être modifié. Vérifiez-le sur le site du RNE.');
  const lignes = [...(texte?.lignes ?? []), ...(ocr?.lignes ?? []), ...(code?.lignes ?? [])];
  return {
    document: presentes.find(([, c]) => c.document !== 'inconnu')?.[1].document ?? 'inconnu',
    champs,
    lignes: [...new Set(lignes.map((l) => l.trim()).filter(Boolean))],
    avertissements: [...new Set(avertissements)],
    cachet,
    verification: texte?.verification ?? null,
    couches: presentes.map(([source]) => source),
  };
}
