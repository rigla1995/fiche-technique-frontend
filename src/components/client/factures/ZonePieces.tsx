// Factures fournisseur, étape F1 : zone de dépôt de la facture du fournisseur (PDF, scan, photo — HEIC compris), avec
// vignettes et retrait avant l'envoi. Sur un téléphone, le sélecteur propose aussi l'appareil photo.
// La liste appartient au parent (`onChange` accepte une fonction : les fichiers prêts s'ajoutent toujours à la liste à
// jour) ; il libère les vignettes quand il la vide (`libererFichiers`). Pour abandonner une préparation en cours
// (réinitialisation, enregistrement réussi), il change la `key` de la zone : un fichier prêt après le démontage est jeté.
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useVocabulaire } from '../../../hooks/useVocabulaire';
import { ACCEPT, PIECES_MAX, libererFichiers, preparerFichier, taille, type FichierChoisi } from './pieces';

interface Props {
  fichiers: FichierChoisi[];
  onChange: Dispatch<SetStateAction<FichierChoisi[]>>;
  /** Places encore libres (5 moins les pièces déjà jointes). */
  places?: number;
  disabled?: boolean;
  /** Couleur du cadre (bleu des activités, violet des labos). */
  accent?: string;
  /** Une seule pièce (remplacement). */
  unique?: boolean;
  /** Préparation en cours (lecture, copie d'une photo HEIC) : le parent bloque l'envoi tant qu'elle dure. */
  onPreparation?: (enCours: boolean) => void;
}

export default function ZonePieces({ fichiers, onChange, places = PIECES_MAX, disabled = false, accent = '#1e40af', unique = false, onPreparation }: Props) {
  const voc = useVocabulaire();
  const entree = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [preparation, setPreparation] = useState(0);
  const [erreurs, setErreurs] = useState<string[]>([]);
  // Liste et préparations vues par les traitements asynchrones (jamais lues pendant le rendu).
  const courant = useRef(fichiers);
  const reserves = useRef(0);
  const montee = useRef(false);
  useEffect(() => { courant.current = fichiers; }, [fichiers]);
  useEffect(() => {
    montee.current = true;
    return () => {
      montee.current = false;
      if (reserves.current > 0) onPreparation?.(false);
    };
  // onPreparation : celui du montage (la zone est remontée par sa clé quand le parent change).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const max = unique ? 1 : places;
  const restant = Math.max(0, max - fichiers.length - preparation);

  const ajouter = async (liste: FileList | File[]) => {
    const choisis = Array.from(liste);
    if (!choisis.length || disabled) return;
    const refus: string[] = [];
    const libres = unique ? 1 : Math.max(0, max - courant.current.length - reserves.current);
    const retenus = choisis.slice(0, libres);
    if (choisis.length > libres) {
      refus.push(libres === 0 ? `${max} fichier${max > 1 ? 's' : ''} au plus.` : `${choisis.length - libres} fichier(s) en trop : ${max} au plus.`);
    }
    if (!retenus.length) { setErreurs(refus); return; }
    reserves.current += retenus.length;
    setPreparation((n) => n + retenus.length);
    onPreparation?.(true);
    for (const f of retenus) {
      const r = await preparerFichier(f);
      reserves.current -= 1;
      if (!montee.current) {
        if (!('erreur' in r)) libererFichiers([r]);
        continue;
      }
      setPreparation((n) => n - 1);
      if ('erreur' in r) refus.push(r.erreur);
      else if (unique) {
        libererFichiers(courant.current);
        onChange([r]);
      } else {
        onChange((prev) => [...prev, r]);
      }
    }
    if (!montee.current) return;
    if (reserves.current === 0) onPreparation?.(false);
    setErreurs(refus);
  };

  const retirer = (f: FichierChoisi) => {
    libererFichiers([f]);
    onChange((prev) => prev.filter((x) => x.cle !== f.cle));
  };

  const pleine = restant === 0 && preparation === 0;
  const inactive = disabled || restant === 0;
  return (
    <div style={{ width: '100%' }}>
      <div
        role="button"
        tabIndex={inactive ? -1 : 0}
        aria-disabled={inactive}
        aria-label={`Facture ${voc.du('fournisseur')} : choisir un fichier`}
        onClick={() => { if (!inactive) entree.current?.click(); }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !inactive) { e.preventDefault(); entree.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); ajouter(e.dataTransfer.files); }}
        style={{
          border: `1.5px dashed ${survol ? accent : '#94a3b8'}`, borderRadius: 10, padding: '10px 14px',
          background: survol ? '#eff6ff' : disabled ? '#f1f5f9' : '#f8fafc', cursor: inactive ? 'default' : 'pointer',
          opacity: disabled ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '1.2rem' }} aria-hidden="true">📎</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: accent }}>
          {unique ? 'Nouveau fichier' : `Facture ${voc.du('fournisseur')}`}
        </span>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {!pleine
            ? `Glissez le PDF, le scan ou la photo ici, ou touchez pour choisir${unique ? '' : ` — facultatif, ${max} fichier${max > 1 ? 's' : ''} au plus`} (15 Mo chacun).`
            : `${max} fichier${max > 1 ? 's' : ''} au plus : retirez-en un pour en ajouter.`}
        </span>
        <input
          ref={entree} type="file" accept={ACCEPT} multiple={!unique} hidden
          onChange={(e) => { if (e.target.files) ajouter(e.target.files); e.target.value = ''; }}
        />
      </div>
      <div aria-live="polite">
        {preparation > 0 && <p style={{ fontSize: '0.74rem', color: accent, fontWeight: 600, margin: '6px 0 0' }}>Préparation du fichier…</p>}
        {erreurs.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--danger)', fontSize: '0.76rem' }}>
            {erreurs.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
      </div>
      {fichiers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {fichiers.map((f) => (
            <div key={f.cle} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', background: '#fff', maxWidth: 280 }}>
              {f.vignette
                ? <img src={f.vignette} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                : <span style={{ fontSize: '1.4rem' }} aria-hidden="true">{f.type === 'application/pdf' ? '📄' : '🖼️'}</span>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.fichier.name}>{f.fichier.name}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {taille(f.fichier.size)}{f.type === 'image/heic' || f.type === 'image/heif' ? (f.apercu ? ' · photo HEIC' : ' · photo HEIC (aperçu indisponible)') : ''}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" title="Retirer ce fichier" aria-label={`Retirer ${f.fichier.name}`}
                onClick={() => retirer(f)} disabled={disabled} style={{ padding: '2px 6px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
