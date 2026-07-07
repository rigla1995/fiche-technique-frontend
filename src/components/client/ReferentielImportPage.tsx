import { useState, useRef } from 'react';
import api from '../../api/client';
import GuideButton from './GuideButton';

const COLOR = '#16a34a';
const GRADIENT = 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 100%)';

interface RowDetail {
  row: number;
  article: string;
  status: 'ok' | 'error';
  error?: string;
  created: string[];
  existing: string[];
  autoAssigned?: boolean;
}

interface ImportResult {
  processed: number;
  stats: { familles: number; categories: number; unites: number; articles: number; autoAssigned: number };
  errors: number;
  details: RowDetail[];
}

export default function ReferentielImportPage() {
  const [downloading, setDownloading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/api/referentiel/template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modele_referentiel.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      setUploadError('Format non supporté — utilisez un fichier .xlsx');
      return;
    }
    setFile(f);
    setResult(null);
    setUploadError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/api/referentiel/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      setFile(null);
      // Les articles importés sont auto-affectés aux activités/labos du client : on notifie
      // le Sidebar pour qu'il rafraîchisse son résumé et débloque dynamiquement les espaces
      // (Espace Activités, Espace Labo si le client a des labos, Espace Produits).
      window.dispatchEvent(new Event('articles-changed'));
      window.dispatchEvent(new Event('activites-changed'));
      window.dispatchEvent(new Event('labos-changed'));
    } catch (e: unknown) {
      setUploadError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors du traitement');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => { setFile(null); setResult(null); setUploadError(''); };

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: GRADIENT, borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(22,163,74,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📥</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Ajout Dynamique</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Importez vos articles, unités, catégories et familles en masse depuis un fichier Excel
          </p>
        </div>
        <GuideButton section="referentiel-import" />
      </div>

      {/* Assignation automatique en gestion de stock */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
        <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>🔗</span>
        <div style={{ fontSize: '0.84rem', color: '#1e3a8a', lineHeight: 1.55 }}>
          <strong>Gestion de stock automatique</strong> — chaque nouvel article importé (ou article existant
          encore sans affectation) est assigné en gestion de stock à l'ensemble de vos activités et labos ;
          les articles déjà affectés conservent leur configuration. Vous pouvez le modifier à tout moment
          depuis la fiche de l'article (Référentiel → Articles) ou le Catalogue Global.
        </div>
      </div>

      {/* Step 1 — Download template */}
      <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>1️⃣</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Téléchargez le modèle</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Fichier Excel avec les colonnes : Article / Unité / Catégorie / Famille</div>
          </div>
        </div>
        <button
          onClick={downloadTemplate}
          disabled={downloading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, fontSize: '0.88rem', cursor: downloading ? 'wait' : 'pointer' }}
        >
          {downloading ? '⏳ Téléchargement…' : '📄 Télécharger modele_referentiel.xlsx'}
        </button>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '10px 0 0' }}>
          Remplissez chaque ligne avec un article. Les colonnes Unité, Catégorie et Famille créent automatiquement les données manquantes dans votre référentiel.
        </p>
      </div>

      {/* Step 2 — Upload */}
      {!result && (
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>2️⃣</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Uploadez votre fichier rempli</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Limite : 1 000 lignes par fichier</div>
            </div>
          </div>

          {!file ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? COLOR : '#86efac'}`,
                borderRadius: 14, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#f0fdf4' : '#fafff9', transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📂</div>
              <div style={{ fontWeight: 700, color: '#14532d', marginBottom: 4 }}>Glissez votre fichier ici</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>ou cliquez pour sélectionner un fichier .xlsx</div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '14px 18px' }}>
              <span style={{ fontSize: '1.5rem' }}>📊</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#14532d', fontSize: '0.9rem' }}>{file.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#16a34a' }}>{(file.size / 1024).toFixed(1)} Ko</div>
              </div>
              <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8', padding: 4 }}>✕</button>
            </div>
          )}

          {uploadError && (
            <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: '0.85rem' }}>{uploadError}</div>
          )}

          {file && (
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button onClick={() => setFile(null)} className="btn btn-ghost">Changer de fichier</button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, fontSize: '0.9rem', cursor: uploading ? 'wait' : 'pointer', flex: 1 }}
              >
                {uploading ? '⏳ Traitement en cours…' : '🚀 Lancer l\'import'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Result */}
      {result && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: result.errors > 0 ? '#fef3c7' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
              {result.errors > 0 ? '⚠️' : '✅'}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Import terminé</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{result.processed} ligne{result.processed !== 1 ? 's' : ''} traitée{result.processed !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
            {([
              { label: 'Articles', value: result.stats.articles, icon: '🧂' },
              { label: 'Auto-affectés', value: result.stats.autoAssigned ?? 0, icon: '🔗', isInfo: true },
              { label: 'Catégories', value: result.stats.categories, icon: '🏷️' },
              { label: 'Familles', value: result.stats.familles, icon: '🗂️' },
              { label: 'Unités', value: result.stats.unites, icon: '📏' },
              { label: 'Erreurs', value: result.errors, icon: '❌', isError: true },
            ] as { label: string; value: number; icon: string; isError?: boolean; isInfo?: boolean }[]).map(s => (
              <div key={s.label} style={{ background: s.isError && s.value > 0 ? '#fff7ed' : s.isInfo && s.value > 0 ? '#eff6ff' : '#f0fdf4', borderRadius: 12, padding: '12px 16px', textAlign: 'center', border: `1px solid ${s.isError && s.value > 0 ? '#fed7aa' : s.isInfo && s.value > 0 ? '#bfdbfe' : '#bbf7d0'}` }}>
                <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.isError && s.value > 0 ? '#c2410c' : s.isInfo && s.value > 0 ? '#1d4ed8' : '#15803d', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{s.isInfo ? 'article' + (s.value !== 1 ? 's' : '') : 'créé' + (s.value !== 1 ? 's' : '')}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 20px' }}>
            🔗 Les nouveaux articles (et les existants sans affectation) sont gérés en stock dans toutes
            vos activités et labos ; les articles déjà affectés conservent leur configuration —
            modifiable à tout moment depuis la fiche de l'article (Référentiel → Articles).
          </p>

          {/* Details table */}
          {result.details.length > 0 && (
            <div className="table-responsive" style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>Ligne</th>
                    <th>Article</th>
                    <th>Créé</th>
                    <th>Existant</th>
                    <th style={{ width: 90, textAlign: 'center' }}>Affectation</th>
                    <th style={{ width: 70, textAlign: 'center' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {result.details.map(d => (
                    <tr key={d.row} style={{ background: d.status === 'error' ? '#fff5f5' : undefined }}>
                      <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{d.row}</td>
                      <td style={{ fontWeight: 600 }}>{d.article}</td>
                      <td>
                        {d.created.length > 0
                          ? <span style={{ color: COLOR, fontWeight: 600 }}>{d.created.join(', ')}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        {d.existing.length > 0
                          ? <span style={{ color: '#64748b' }}>{d.existing.join(', ')}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {d.autoAssigned
                          ? <span title="Article existant non affecté — assigné automatiquement" style={{ color: '#1d4ed8', fontWeight: 700, fontSize: '0.75rem', cursor: 'help' }}>🔗 auto</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {d.status === 'error'
                          ? <span title={d.error} style={{ color: '#dc2626', fontWeight: 700, cursor: 'help' }}>❌</span>
                          : <span style={{ color: COLOR }}>✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button onClick={reset} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              Importer un autre fichier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
