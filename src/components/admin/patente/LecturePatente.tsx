// Bouton « Lire la patente » et compte rendu de la lecture (lot 3, étape 7 — spec backend docs/lot-3-spec.md §5).
// L'admin dépose une carte d'identification fiscale, une carte auto-entrepreneur ou un extrait RNE (PDF ou image) :
// le document est lu DANS LE NAVIGATEUR (cachet électronique, texte du PDF, reconnaissance de caractères), sans IA.
// Rien n'est envoyé au serveur ni à un tiers ; rien n'est conservé. Seuls les champs VIDES de la fiche sont remplis ;
// une valeur lue pour un champ déjà rempli est montrée à côté, avec un bouton pour la prendre.
// Espace admin : vocabulaire LabFlow (I4). Les bibliothèques de lecture ne se chargent qu'au premier clic.
import { useRef, useState } from 'react';
import type { IdentiteLegale } from '../../../utils/identiteLegale';
import type { ChampIdentite, ChampLu, LecturePatente as Lecture, SourceLecture, TypeDocument } from './types';

interface Props {
  valeur: IdentiteLegale;
  disabled?: boolean;
  /** Champ où le curseur se trouvait en dernier (pour la recopie d'une ligne), ou null. */
  champActif: ChampIdentite | null;
  /** Écrit des champs dans la fiche ; `lus` dit d'où vient chaque valeur (pastille « lu »). */
  onRemplir: (champs: Partial<IdentiteLegale>, lus: Partial<Record<ChampIdentite, ChampLu>>) => void;
  /** Recopie une ligne du texte lu dans le champ actif. */
  onRecopier: (ligne: string) => void;
}

const SITE_RNE = 'https://www.registre-entreprises.tn/';
const ACCEPTE = '.pdf,application/pdf,image/jpeg,image/png,image/webp';
const NOM_DOCUMENT: Record<TypeDocument, string> = {
  extrait_rne: 'Extrait du registre national des entreprises (RNE)',
  carte_fiscale: "Carte d'identification fiscale (patente)",
  carte_auto_entrepreneur: 'Carte auto-entrepreneur',
  inconnu: 'Document non reconnu',
};
const NOM_SOURCE: Record<SourceLecture, string> = { cachet: 'cachet', pdf: 'PDF', ocr: 'OCR' };
const NOM_CHAMP: Record<ChampIdentite, string> = {
  raisonSociale: 'Raison sociale', nomCommercial: 'Nom commercial', formeJuridique: 'Forme juridique',
  matriculeFiscal: 'Matricule fiscal', rne: 'Identifiant RNE', adresse: 'Adresse', ville: 'Ville',
  representantNom: 'Représentant légal', representantQualite: 'Qualité',
};

const vide = (v: string | null | undefined) => !(v ?? '').trim();
const encart = (fond: string, bord: string, texte: string): React.CSSProperties => ({
  background: fond, border: `1px solid ${bord}`, color: texte, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.5,
});

export default function LecturePatente({ valeur, disabled, champActif, onRemplir, onRecopier }: Props) {
  const fichier = useRef<HTMLInputElement>(null);
  const [etape, setEtape] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [remplis, setRemplis] = useState<ChampIdentite[]>([]);

  const lire = async (f: File) => {
    setErreur(null);
    setLecture(null);
    setRemplis([]);
    setEtape('Chargement du lecteur…');
    try {
      const { lirePatente } = await import('./lirePatente');
      const resultat = await lirePatente(f, (e, avancement) => setEtape(avancement === undefined ? e : `${e} ${Math.round(avancement * 100)} %`));
      // Seuls les champs vides de la fiche sont remplis.
      const champs: Partial<IdentiteLegale> = {};
      const lus: Partial<Record<ChampIdentite, ChampLu>> = {};
      for (const [cle, lu] of Object.entries(resultat.champs) as [ChampIdentite, ChampLu][]) {
        if (vide(valeur[cle])) { champs[cle] = lu.valeur; lus[cle] = lu; }
      }
      if (Object.keys(champs).length) onRemplir(champs, lus);
      setRemplis(Object.keys(champs) as ChampIdentite[]);
      setLecture(resultat);
    } catch (e) {
      // Un refus expliqué (format, taille, fichier illisible) porte son message ; le reste est une panne de lecture.
      setErreur(e instanceof Error && e.name === 'LectureImpossible' ? e.message
        : "La lecture n'a pas abouti. Saisissez les champs à la main, ou réessayez avec un autre fichier.");
      if (!(e instanceof Error && e.name === 'LectureImpossible')) console.warn('[patente]', e);
    } finally {
      setEtape(null);
      if (fichier.current) fichier.current.value = ''; // rien n'est gardé ; le même fichier peut être redéposé
    }
  };

  // Valeurs lues pour des champs que la fiche avait déjà : montrées, jamais recopiées d'office.
  const nonRecopies = lecture
    ? (Object.entries(lecture.champs) as [ChampIdentite, ChampLu][]).filter(([cle, lu]) => !remplis.includes(cle) && (valeur[cle] ?? '').trim() !== lu.valeur)
    : [];
  const cachet = lecture?.cachet ?? null;

  return (
    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" disabled={disabled || etape !== null} onClick={() => fichier.current?.click()}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #0d9488', background: disabled || etape !== null ? '#e2e8f0' : '#fff', color: disabled || etape !== null ? '#94a3b8' : '#0f766e', fontSize: 12.5, fontWeight: 700, cursor: disabled || etape !== null ? 'default' : 'pointer' }}>
          📄 Lire la patente
        </button>
        <input ref={fichier} type="file" accept={ACCEPTE} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void lire(f); }} />
        <span style={{ fontSize: 11.5, color: '#64748b', flex: 1, minWidth: 180, lineHeight: 1.4 }}>
          {etape ?? 'Patente, carte auto-entrepreneur ou extrait RNE (PDF ou photo). Lu sur cet ordinateur : rien n\'est envoyé ni conservé.'}
        </span>
      </div>

      {erreur && <div style={encart('#fee2e2', '#fecaca', '#dc2626')}>{erreur}</div>}

      {lecture && (
        <>
          <div style={{ fontSize: 12.5, color: '#0f172a', fontWeight: 700 }}>
            {NOM_DOCUMENT[lecture.document]}
            <span style={{ fontWeight: 400, color: '#64748b' }}>
              {' — '}{remplis.length === 0 ? 'aucun champ rempli' : `${remplis.length} champ${remplis.length > 1 ? 's' : ''} rempli${remplis.length > 1 ? 's' : ''} : ${remplis.map((c) => NOM_CHAMP[c]).join(', ')}`}
            </span>
          </div>

          {cachet && cachet.etat === 'valide' && (
            <div style={encart('#f0fdf4', '#bbf7d0', '#166534')}>
              ✓ Cachet électronique {cachet.autorite}/{cachet.certificat} valide{cachet.emisLe ? `, émis le ${cachet.emisLe}` : ''}
              {cachet.identifiant ? ` — identifiant ${cachet.identifiant}` : ''}.
            </div>
          )}
          {cachet && cachet.etat === 'non_verifiable' && (
            <div style={encart('#f1f5f9', '#cbd5e1', '#475569')}>
              Cachet électronique {cachet.autorite}/{cachet.certificat} lu, mais non vérifiable ici (certificat inconnu) : vérifiez le document sur le site du RNE.
            </div>
          )}

          {lecture.avertissements.map((a) => <div key={a} style={encart('#fffbeb', '#fde68a', '#92400e')}>⚠️ {a}</div>)}

          {nonRecopies.length > 0 && (
            <div style={encart('#fff', '#e2e8f0', '#334155')}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Lu, mais non recopié (champ déjà rempli) :</div>
              {nonRecopies.map(([cle, lu]) => (
                <div key={cle} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                  <span style={{ overflowWrap: 'anywhere' }}>{NOM_CHAMP[cle]} : <strong>{lu.valeur}</strong> <em style={{ color: '#64748b' }}>({NOM_SOURCE[lu.source]})</em></span>
                  <button type="button" disabled={disabled} onClick={() => { onRemplir({ [cle]: lu.valeur }, { [cle]: lu }); setRemplis((r) => [...r, cle]); }}
                    style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f766e', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                    Remplacer
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
            <a href={lecture.verification?.lien || SITE_RNE} target="_blank" rel="noopener noreferrer"
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#1d4ed8', fontWeight: 700, textDecoration: 'none' }}>
              Vérifier sur le RNE ↗
            </a>
            {lecture.verification?.code && (
              <span style={{ color: '#475569' }}>
                Code de vérification : <code style={{ userSelect: 'all', fontWeight: 700, color: '#0f172a' }}>{lecture.verification.code}</code>
              </span>
            )}
          </div>

          {lecture.lignes.length > 0 && (
            <details>
              <summary style={{ fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>Texte lu ({lecture.lignes.length} lignes)</summary>
              <div style={{ fontSize: 11.5, color: '#64748b', margin: '6px 0' }}>
                {champActif ? `Un clic sur une ligne la recopie dans « ${NOM_CHAMP[champActif]} ».` : "Cliquez d'abord dans un champ de la fiche, puis sur une ligne pour l'y recopier."}
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                {lecture.lignes.map((l, i) => (
                  <button key={`${i}-${l}`} type="button" disabled={disabled || !champActif} onClick={() => onRecopier(l)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 10px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'transparent', fontSize: 12, color: '#0f172a', cursor: champActif ? 'pointer' : 'default', overflowWrap: 'anywhere' }}>
                    {l}
                  </button>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Pastille « lu » posée à côté du libellé d'un champ rempli par la lecture. */
export function PastilleLu({ lu }: { lu: ChampLu | undefined }) {
  if (!lu) return null;
  return (
    <span title={lu.note || undefined}
      style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 10, fontSize: 9.5, fontWeight: 700, letterSpacing: 0, textTransform: 'none', background: lu.aRelire ? '#fef3c7' : '#dcfce7', color: lu.aRelire ? '#92400e' : '#166534' }}>
      lu · {NOM_SOURCE[lu.source]}{lu.aRelire ? ' — à relire' : ''}
    </span>
  );
}
