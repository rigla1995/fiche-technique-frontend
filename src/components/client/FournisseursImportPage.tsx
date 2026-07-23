import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import GuideButton from './GuideButton';

// Thème ambre/orange des pages Fournisseurs
const C = '#ea580c';
const CD = '#92400e';
const CL = '#fff7ed';
const CB = '#fdba74';

interface ImportDetail { row: number; nom: string; status: 'ok' | 'warning' | 'error'; error?: string }
interface ImportResult { processed: number; stats: { crees: number; activites: number; labos: number }; errors: number; details: ImportDetail[] }

export default function FournisseursImportPage() {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/api/entreprise/fournisseurs/template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'modele_fournisseurs.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Erreur lors du téléchargement du modèle'); }
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true); setError(''); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/api/entreprise/fournisseurs/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data);
    } catch (e: unknown) {
      const r = (e as { response?: { data?: ImportResult & { message?: string } } })?.response?.data;
      if (r?.details) setResult(r as ImportResult);
      setError(r?.message ?? 'Erreur lors de l\'import');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #78350f 0%, #92400e 55%, #f59e0b 100%)', borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(146,64,14,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📥</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Ajout Dynamique — Fournisseurs</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Importez vos fournisseurs en masse depuis un fichier Excel
          </p>
        </div>
        <Link to="/client/fournisseurs" style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '9px 16px' }}>
          ← Retour aux fournisseurs
        </Link>
        <GuideButton section="fournisseurs" />
      </div>

      {/* Affectations : information clé de l'import */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: CL, border: `1.5px solid ${CB}`, borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
        <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>🔗</span>
        <div style={{ fontSize: '0.86rem', color: CD, lineHeight: 1.6 }}>
          Les fournisseurs importés seront <strong>assignés à l'ensemble de vos activités et labos</strong> :
          ils apparaîtront partout dans les listes d'approvisionnement. Une fois l'import terminé, vous pourrez
          <strong> ajuster les affectations fournisseur par fournisseur</strong> (✏️ sur la page Fournisseurs).
        </div>
      </div>

      {/* Étape 1 — modèle */}
      <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: CL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>1️⃣</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Téléchargez le modèle</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Colonnes : Nom / Téléphone / Adresse</div>
          </div>
        </div>
        <button onClick={downloadTemplate}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, fontSize: '0.87rem', cursor: 'pointer' }}>
          📄 Télécharger modele_fournisseurs.xlsx
        </button>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10 }}>
          Seul le <strong>Nom</strong> est obligatoire. Les noms déjà présents dans votre répertoire seront ignorés.
        </div>
      </div>

      {/* Étape 2 — upload */}
      <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: CL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>2️⃣</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Uploadez votre fichier rempli</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Limite : 500 lignes par fichier</div>
          </div>
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          onClick={() => fileInput.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? C : CB}`, borderRadius: 14, padding: '38px 20px',
            textAlign: 'center', cursor: 'pointer', background: dragOver ? CL : 'transparent', transition: 'all 0.15s',
          }}>
          <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>📂</div>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
            {uploading ? 'Import en cours…' : 'Glissez votre fichier ici'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ou cliquez pour sélectionner un fichier .xlsx</div>
          <input ref={fileInput} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.86rem', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Résultat */}
      {result && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: '1.4rem' }}>{result.errors > 0 ? '⚠️' : '✅'}</span>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>
              {result.processed} fournisseur{result.processed > 1 ? 's' : ''} importé{result.processed > 1 ? 's' : ''}
              {result.processed > 0 ? ` · assigné${result.processed > 1 ? 's' : ''} à ${result.stats.activites} activité${result.stats.activites > 1 ? 's' : ''} et ${result.stats.labos} labo${result.stats.labos > 1 ? 's' : ''}` : ''}
              {result.errors > 0 ? ` · ${result.errors} ligne${result.errors > 1 ? 's' : ''} en erreur` : ''}
            </div>
          </div>
          {result.details?.length > 0 && (
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Ligne</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Nom</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {result.details.map((d, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{d.row}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 600 }}>{d.nom || '—'}</td>
                      <td style={{ padding: '7px 12px' }}>
                        {d.status === 'ok' && <span style={{ color: '#166534', fontWeight: 600 }}>✅ Créé</span>}
                        {d.status === 'warning' && <span style={{ color: '#92400e', fontWeight: 600 }}>⚠️ {d.error}</span>}
                        {d.status === 'error' && <span style={{ color: '#991b1b', fontWeight: 600 }}>✕ {d.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Link to="/client/fournisseurs" style={{ color: C, fontWeight: 700, fontSize: '0.86rem' }}>→ Voir les fournisseurs et ajuster les affectations</Link>
          </div>
        </div>
      )}
    </div>
  );
}
