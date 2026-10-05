// Bouton « Lire la patente » et compte rendu de la lecture (lot 3, étape 7 — spec backend docs/lot-3-spec.md §5).
// L'admin dépose une carte d'identification fiscale, une carte auto-entrepreneur ou un extrait RNE (PDF ou image) :
// le document est lu DANS LE NAVIGATEUR (cachet électronique, texte du PDF, reconnaissance de caractères), sans IA.
// Rien n'est envoyé au serveur ni à un tiers ; rien n'est conservé. Seuls les champs VIDES de la fiche sont remplis ;
// une valeur lue pour un champ déjà rempli est montrée à côté, avec un bouton pour la prendre.
// Espace admin : vocabulaire LabFlow (I4). Les bibliothèques de lecture ne se chargent qu'au premier clic.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { estErreurDeChunk } from '../../../utils/chunkReload';
import { formeIndividuelle, libelleForme, type IdentiteLegale } from '../../../utils/identiteLegale';
import { repartir } from './fusion';
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
  /** Début (true) et fin (false) d'une lecture : la fenêtre bloque « Suivant » / « Enregistrer » entre les deux. */
  onLecture?: (enCours: boolean) => void;
}

const SITE_RNE = 'https://www.registre-entreprises.tn/';
// Le HEIC est proposé au choix pour que son refus soit expliqué (« convertissez-la en JPEG »).
const ACCEPTE = '.pdf,application/pdf,image/jpeg,image/png,image/webp,.heic,.heif';
const NOM_DOCUMENT: Record<TypeDocument, string> = {
  extrait_rne: 'Extrait du registre national des entreprises (RNE)',
  carte_fiscale: "Carte d'identification fiscale (patente)",
  carte_auto_entrepreneur: 'Carte auto-entrepreneur',
  inconnu: 'Document non reconnu',
};
const NOM_SOURCE: Record<SourceLecture, string> = { cachet: 'cachet', pdf: 'PDF', ocr: 'image' };
const NOM_CHAMP: Record<ChampIdentite, string> = {
  raisonSociale: 'Raison sociale', nomCommercial: 'Nom commercial', formeJuridique: 'Forme juridique',
  matriculeFiscal: 'Matricule fiscal', rne: 'Identifiant RNE', adresse: 'Adresse', ville: 'Ville',
  representantNom: 'Représentant légal', representantQualite: 'Qualité',
};

const encart = (fond: string, bord: string, texte: string): React.CSSProperties => ({
  background: fond, border: `1px solid ${bord}`, color: texte, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.5,
});

export default function LecturePatente({ valeur, disabled, champActif, onRemplir, onRecopier, onLecture }: Props) {
  const fichier = useRef<HTMLInputElement>(null);
  const [etape, setEtape] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [remplis, setRemplis] = useState<ChampIdentite[]>([]);
  // La lecture dure de 0,5 à 5 s : à sa fin, la fiche et sa fonction d'écriture sont celles du DERNIER rendu (une
  // saisie faite pendant la lecture est gardée), et rien n'est écrit si l'écran a été quitté entre-temps.
  const courant = useRef({ valeur, onRemplir, onLecture });
  useLayoutEffect(() => { courant.current = { valeur, onRemplir, onLecture }; });
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  const nomChamp = (cle: ChampIdentite): string =>
    (cle === 'raisonSociale' && formeIndividuelle(valeur.formeJuridique) ? 'Nom du titulaire' : NOM_CHAMP[cle]);

  const lire = async (f: File) => {
    setErreur(null);
    setLecture(null);
    setRemplis([]);
    setEtape('Chargement du lecteur…');
    onLecture?.(true);
    try {
      const { lirePatente } = await import('./lirePatente');
      const resultat = await lirePatente(f, (e, avancement) => {
        if (monte.current) setEtape(avancement === undefined ? e : `${e} ${Math.round(avancement * 100)} %`);
      });
      if (!monte.current) return;
      const { valeur: fiche, onRemplir: remplir } = courant.current;
      const { aRemplir } = repartir(fiche, resultat.champs);
      const cles = Object.keys(aRemplir) as ChampIdentite[];
      if (cles.length) remplir(Object.fromEntries(cles.map((c) => [c, aRemplir[c]!.valeur])), aRemplir);
      setRemplis(cles);
      setLecture(resultat);
    } catch (e) {
      if (!monte.current) return;
      const refus = e instanceof Error && e.name === 'LectureImpossible';
      if (!refus) console.warn('[patente] lecture en échec', e instanceof Error ? e.name : '');
      // Un refus expliqué (format, taille, fichier illisible) porte son message ; un module introuvable vient d'une
      // mise à jour pendant que la page était ouverte ; le reste est une panne de lecture.
      setErreur(refus ? (e as Error).message
        : estErreurDeChunk(e) ? 'LabFlow a été mis à jour : rechargez la page pour utiliser la lecture, ou saisissez les champs à la main.'
          : "La lecture n'a pas abouti. Saisissez les champs à la main, ou réessayez avec un autre fichier.");
    } finally {
      if (monte.current) setEtape(null);
      courant.current.onLecture?.(false);
      if (fichier.current) fichier.current.value = ''; // rien n'est gardé ; le même fichier peut être redéposé
    }
  };

  // Valeurs lues pour des champs que la fiche avait déjà : montrées, jamais recopiées d'office.
  const aProposer = lecture
    ? (Object.entries(repartir(valeur, lecture.champs).aProposer) as [ChampIdentite, ChampLu][]).filter(([cle]) => !remplis.includes(cle))
    : [];
  const cachet = lecture?.cachet ?? null;
  const occupe = disabled || etape !== null;
  const bilan = !lecture ? ''
    : remplis.length > 0 ? `${remplis.length} champ${remplis.length > 1 ? 's' : ''} rempli${remplis.length > 1 ? 's' : ''}`
      : Object.keys(lecture.champs).length === 0 ? 'aucun champ lu'
        : aProposer.length === 0 ? 'la fiche contient déjà les valeurs lues' : 'aucun champ rempli';

  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" disabled={occupe} onClick={() => fichier.current?.click()}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #0d9488', background: occupe ? '#e2e8f0' : '#fff', color: occupe ? '#94a3b8' : '#0f766e', fontSize: 12.5, fontWeight: 700, cursor: occupe ? 'default' : 'pointer' }}>
          📄 Lire la patente
        </button>
        <input ref={fichier} type="file" accept={ACCEPTE} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void lire(f); }} />
        <span style={{ fontSize: 11.5, color: '#64748b', flex: 1, minWidth: 180, lineHeight: 1.4 }}>
          {etape ?? 'Patente, carte auto-entrepreneur ou extrait RNE (PDF ou photo). Lu sur cet ordinateur : rien n\'est envoyé ni conservé.'}
        </span>
        <a href={lecture?.verification?.lien || SITE_RNE} target="_blank" rel="noopener noreferrer"
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#1d4ed8', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Vérifier sur le RNE ↗
        </a>
      </div>

      {erreur && <div style={encart('#fee2e2', '#fecaca', '#dc2626')}>{erreur}</div>}

      {lecture && (
        <>
          <div style={{ fontSize: 12.5, color: '#0f172a', fontWeight: 700 }}>
            {NOM_DOCUMENT[lecture.document]}
            <span style={{ fontWeight: 400, color: '#64748b' }}>{' — '}{bilan}</span>
          </div>

          {cachet && cachet.etat === 'valide' && (
            <div style={encart('#f0fdf4', '#bbf7d0', '#166534')}>
              ✓ Cachet électronique valide{cachet.emisLe ? `, émis le ${cachet.emisLe}` : ''}{cachet.identifiant ? ` — identifiant ${cachet.identifiant}` : ''}.
            </div>
          )}
          {cachet && cachet.etat === 'non_verifiable' && (
            <div style={encart('#f1f5f9', '#cbd5e1', '#475569')}>
              Cachet électronique {cachet.autorite}/{cachet.certificat} non vérifié{cachet.motif ? ` (${cachet.motif})` : ''} : vérifiez le document sur le site du RNE.
            </div>
          )}

          {lecture.avertissements.map((a) => <div key={a} style={encart('#fffbeb', '#fde68a', '#92400e')}>⚠️ {a}</div>)}

          {lecture.verification?.code && (
            <div style={{ fontSize: 12, color: '#475569' }}>
              Code de vérification de l'extrait : <code style={{ userSelect: 'all', fontWeight: 700, color: '#0f172a' }}>{lecture.verification.code}</code>
            </div>
          )}

          {aProposer.length > 0 && (
            <div style={encart('#fff', '#e2e8f0', '#334155')}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Lu, mais non recopié (champ déjà rempli) :</div>
              {aProposer.map(([cle, lu]) => (
                <div key={cle} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                  <span style={{ overflowWrap: 'anywhere' }}>
                    {nomChamp(cle)} : <strong>{cle === 'formeJuridique' ? libelleForme(lu.valeur) : lu.valeur}</strong>{' '}
                    <em style={{ color: '#64748b' }}>({NOM_SOURCE[lu.source]}{lu.aRelire ? ', à relire' : ''})</em>
                  </span>
                  <button type="button" disabled={disabled} onClick={() => { onRemplir({ [cle]: lu.valeur }, { [cle]: lu }); setRemplis((r) => [...r, cle]); }}
                    style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f766e', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                    Remplacer
                  </button>
                </div>
              ))}
            </div>
          )}

          {lecture.lignes.length > 0 && (
            // Ouvert d'office quand la lecture vient d'une image : c'est là que l'admin recopie à la main.
            <details open={lecture.couches.includes('ocr')}>
              <summary style={{ fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>Texte lu ({lecture.lignes.length} lignes)</summary>
              <div style={{ fontSize: 11.5, color: '#64748b', margin: '6px 0' }}>
                {champActif ? `Un clic sur une ligne la recopie dans « ${nomChamp(champActif)} ».` : "Cliquez d'abord dans un champ de la fiche, puis sur une ligne pour l'y recopier."}
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
    <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 10, fontSize: 9.5, fontWeight: 700, letterSpacing: 0, textTransform: 'none', background: lu.aRelire ? '#fef3c7' : '#dcfce7', color: lu.aRelire ? '#92400e' : '#166534' }}>
      lu · {NOM_SOURCE[lu.source]}{lu.aRelire ? ' — à relire' : ''}
    </span>
  );
}

/** Note d'un champ lu (ex. « racine seulement », « relisez la lettre de clé »), affichée en clair sous le champ. */
export function NoteLu({ lu }: { lu: ChampLu | undefined }) {
  if (!lu?.note) return null;
  return <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4, color: lu.aRelire ? '#b45309' : '#64748b' }}>{lu.note}</div>;
}
