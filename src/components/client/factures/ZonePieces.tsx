// Factures fournisseur, étape F1 : zone de dépôt de la facture du fournisseur (PDF, scan, photo — HEIC compris), avec
// vignettes et retrait avant l'envoi. Sur un téléphone, le sélecteur propose aussi l'appareil photo.
import { useEffect, useRef, useState } from 'react';
import { useVocabulaire } from '../../../hooks/useVocabulaire';
import { ACCEPT, PIECES_MAX, preparerFichier, taille, type FichierChoisi } from './pieces';

interface Props {
  fichiers: FichierChoisi[];
  onChange: (fichiers: FichierChoisi[]) => void;
  /** Places encore libres (5 moins les pièces déjà jointes). */
  places?: number;
  disabled?: boolean;
  /** Couleur du cadre (bleu des activités, violet des labos). */
  accent?: string;
  /** Une seule pièce (remplacement). */
  unique?: boolean;
}

export default function ZonePieces({ fichiers, onChange, places = PIECES_MAX, disabled = false, accent = '#1e40af', unique = false }: Props) {
  const voc = useVocabulaire();
  const entree = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [preparation, setPreparation] = useState(0);
  const [erreurs, setErreurs] = useState<string[]>([]);
  // Vignettes : les adresses locales des fichiers retirés sont libérées ; toutes au démontage.
  const vues = useRef<Set<string>>(new Set());
  useEffect(() => {
    const presentes = new Set(fichiers.map((f) => f.vignette).filter((v): v is string => !!v));
    for (const v of vues.current) if (!presentes.has(v)) URL.revokeObjectURL(v);
    vues.current = presentes;
  }, [fichiers]);
  useEffect(() => () => { for (const v of vues.current) URL.revokeObjectURL(v); }, []);

  const max = unique ? 1 : places;
  const restant = Math.max(0, max - fichiers.length);

  const ajouter = async (liste: FileList | File[]) => {
    const choisis = Array.from(liste);
    if (!choisis.length || disabled) return;
    const refus: string[] = [];
    const retenus = choisis.slice(0, restant);
    if (choisis.length > restant) refus.push(restant === 0 ? `${max} fichier${max > 1 ? 's' : ''} au plus.` : `${choisis.length - restant} fichier(s) en trop : ${max} au plus.`);
    setPreparation((n) => n + retenus.length);
    const prets: FichierChoisi[] = [];
    for (const f of retenus) {
      const r = await preparerFichier(f);
      setPreparation((n) => n - 1);
      if ('erreur' in r) refus.push(r.erreur); else prets.push(r);
    }
    setErreurs(refus);
    if (prets.length) onChange(unique ? prets.slice(0, 1) : [...fichiers, ...prets]);
  };

  const retirer = (cle: string) => onChange(fichiers.filter((f) => f.cle !== cle));

  return (
    <div style={{ width: '100%' }}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => { if (!disabled && restant > 0) entree.current?.click(); }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled && restant > 0) { e.preventDefault(); entree.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); ajouter(e.dataTransfer.files); }}
        style={{
          border: `1.5px dashed ${survol ? accent : '#94a3b8'}`, borderRadius: 10, padding: '10px 14px',
          background: survol ? '#eff6ff' : disabled ? '#f1f5f9' : '#f8fafc', cursor: disabled || restant === 0 ? 'default' : 'pointer',
          opacity: disabled ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '1.2rem' }}>📎</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: accent }}>
          {unique ? 'Nouveau fichier' : `Facture ${voc.du('fournisseur')}`}
        </span>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {restant > 0
            ? `Glissez le PDF, le scan ou la photo ici, ou touchez pour choisir${unique ? '' : ` — facultatif, ${max} fichier${max > 1 ? 's' : ''} au plus`} (15 Mo chacun).`
            : `${max} fichier${max > 1 ? 's' : ''} au plus : retirez-en un pour en ajouter.`}
        </span>
        {preparation > 0 && <span style={{ fontSize: '0.74rem', color: accent, fontWeight: 600 }}>Préparation…</span>}
        <input
          ref={entree} type="file" accept={ACCEPT} multiple={!unique} hidden
          onChange={(e) => { if (e.target.files) ajouter(e.target.files); e.target.value = ''; }}
        />
      </div>
      {erreurs.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--danger)', fontSize: '0.76rem' }}>
          {erreurs.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      {fichiers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {fichiers.map((f) => (
            <div key={f.cle} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', background: '#fff', maxWidth: 280 }}>
              {f.vignette
                ? <img src={f.vignette} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                : <span style={{ fontSize: '1.4rem' }}>{f.type === 'application/pdf' ? '📄' : '🖼️'}</span>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.fichier.name}>{f.fichier.name}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {taille(f.fichier.size)}{f.type === 'image/heic' || f.type === 'image/heif' ? (f.apercu ? ' · photo HEIC' : ' · photo HEIC (aperçu indisponible)') : ''}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" title="Retirer ce fichier" aria-label={`Retirer ${f.fichier.name}`}
                onClick={() => retirer(f.cle)} disabled={disabled} style={{ padding: '2px 6px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
