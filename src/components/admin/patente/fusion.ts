// Fusion des lectures des trois couches (lot 3, étape 7) et tri des champs lus face à la fiche. Fonctions pures
// (testées par scripts/patente-fusion.test.mjs).
// Priorité : cachet électronique VÉRIFIÉ, puis texte du PDF, puis reconnaissance de caractères. Un cachet qui n'a pas
// pu être vérifié (certificat inconnu) passe après le texte du PDF ; un cachet à signature invalide ne donne rien.
import type {
  Cachet, ChampIdentite, ChampLu, LectureCode2d, LecturePatente, LectureTextePdf, ResultatCouche, SourceLecture,
} from './types.ts';

export const NOM_COUCHE: Record<SourceLecture, string> = { cachet: 'le cachet électronique', pdf: 'le texte du PDF', ocr: 'la reconnaissance de caractères' };

const racine = (matricule: string): string => matricule.slice(0, 8); // 7 chiffres + lettre de clé

export function fusionner(
  code: LectureCode2d | null, texte: LectureTextePdf | null, ocr: ResultatCouche | null, avertissementsLecture: string[] = [],
): LecturePatente {
  const cachet: Cachet | null = code?.cachet ?? null;
  // Signature invalide : rien de ce que porte le code n'est repris (ni champ, ni texte, ni type de document).
  const lectureCode: ResultatCouche | null = code && cachet?.etat !== 'invalide' ? code : null;
  const parPriorite: [SourceLecture, ResultatCouche | null][] = cachet?.etat === 'valide'
    ? [['cachet', lectureCode], ['pdf', texte], ['ocr', ocr]]
    : [['pdf', texte], ['cachet', lectureCode], ['ocr', ocr]];
  const presentes = parPriorite.filter((c): c is [SourceLecture, ResultatCouche] => c[1] !== null);
  const champs: Partial<Record<ChampIdentite, ChampLu>> = {};
  const avertissements: string[] = [...avertissementsLecture];
  for (const [source, couche] of presentes) {
    for (const [cle, lu] of Object.entries(couche.champs) as [ChampIdentite, ChampLu][]) {
      if (!lu?.valeur) continue;
      const garde = champs[cle];
      if (!garde) { champs[cle] = lu; continue; }
      // Même valeur, lue plus sûrement par une autre couche : la pastille n'a pas à dire « à relire ».
      if (lu.valeur === garde.valeur && garde.aRelire && !lu.aRelire) { champs[cle] = lu; continue; }
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
  if (cachet?.etat === 'invalide') {
    avertissements.unshift(`Cachet électronique INVALIDE${cachet.motif ? ` (${cachet.motif})` : ''} : ce document a pu être modifié, ses données ne sont pas reprises. Vérifiez-le sur le site du RNE.`);
  }
  const lignes = [...(texte?.lignes ?? []), ...(ocr?.lignes ?? []), ...(lectureCode?.lignes ?? [])];
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

const vide = (v: string | null | undefined): boolean => !(v ?? '').trim();

/**
 * Tri des champs lus face à la fiche : seuls les champs VIDES de la fiche sont à remplir ; une valeur lue pour un
 * champ déjà rempli autrement est seulement proposée ; une valeur identique à celle de la fiche n'est rien.
 * Un matricule lu qui n'est que le début de celui de la fiche (racine contre matricule complet) n'est pas proposé.
 */
export function repartir(
  fiche: Partial<Record<ChampIdentite, string | null>>, champsLus: Partial<Record<ChampIdentite, ChampLu>>,
): { aRemplir: Partial<Record<ChampIdentite, ChampLu>>; aProposer: Partial<Record<ChampIdentite, ChampLu>> } {
  const aRemplir: Partial<Record<ChampIdentite, ChampLu>> = {};
  const aProposer: Partial<Record<ChampIdentite, ChampLu>> = {};
  for (const [cle, lu] of Object.entries(champsLus) as [ChampIdentite, ChampLu][]) {
    if (!lu?.valeur) continue;
    const actuelle = (fiche[cle] ?? '').trim();
    if (vide(actuelle)) { aRemplir[cle] = lu; continue; }
    if (actuelle === lu.valeur) continue;
    if (cle === 'matriculeFiscal' && actuelle.length > lu.valeur.length && actuelle.startsWith(lu.valeur)) continue;
    aProposer[cle] = lu;
  }
  return { aRemplir, aProposer };
}

/**
 * Recopie d'une ligne du texte lu dans un champ : le libellé « Libellé : » est retiré ; pour le matricule, l'ordre
 * imprimé sur la carte (« 000 M A 1234567A ») est remis dans l'ordre de saisie (« 1234567A/A/M/000 »).
 */
export function valeurRecopiee(champ: ChampIdentite, ligne: string): string {
  const valeur = ligne.replace(/^[^:]{1,40}:\s*/, '').trim() || ligne.trim();
  if (champ !== 'matriculeFiscal') return valeur;
  const m = valeur.match(/^(\d{3})\s+([A-Z])\s+([A-Z])\s+(\d{7}[A-Z])$/);
  return m ? `${m[4]}/${m[3]}/${m[2]}/${m[1]}` : valeur;
}
