import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';

interface ImportDetail { row: number; nom: string; status: 'ok' | 'warning' | 'error'; error?: string; compte?: boolean }
interface ImportResult { processed: number; stats: { crees: number; comptes: number; invitations: number }; errors: number; details: ImportDetail[] }

export default function AcheteursImportPage() {
  const [creerComptes, setCreerComptes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/api/acheteurs/template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'modele_acheteurs.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Erreur lors du téléchargement du modèle'); }
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true); setError(''); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('creerComptes', String(creerComptes));
      const { data } = await api.post('/api/acheteurs/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
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
      <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #8b5cf6 100%)`, borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(109,40,217,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📥</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Ajout Dynamique — Acheteurs</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Importez votre carnet d'acheteurs en masse depuis un fichier Excel
          </p>
        </div>
        <Link to="/client/acheteurs" style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '9px 16px' }}>
          ← Retour au carnet
        </Link>
      </div>

      {/* Étape 1 — modèle */}
      <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: CL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>1️⃣</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Téléchargez le modèle</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Colonnes : Nom / Entreprise / Email / Téléphone / Adresse / Matricule fiscal</div>
          </div>
        </div>
        <button onClick={downloadTemplate}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, fontSize: '0.87rem', cursor: 'pointer' }}>
          📄 Télécharger modele_acheteurs.xlsx
        </button>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10 }}>
          Seul le <strong>Nom</strong> est obligatoire. L'email est requis uniquement pour créer un compte portail.
        </div>
      </div>

      {/* Étape 2 — option comptes */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: creerComptes ? CL : '#f8fafc', border: `1.5px solid ${creerComptes ? CB : '#e2e8f0'}`, borderRadius: 14, padding: '14px 18px', marginBottom: 20, transition: 'all 0.2s' }}>
        <button onClick={() => setCreerComptes(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>
          <div style={{ width: 40, height: 22, borderRadius: 11, position: 'relative', background: creerComptes ? C : '#cbd5e1', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 2, left: creerComptes ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
          </div>
        </button>
        <div style={{ fontSize: '0.84rem', color: creerComptes ? CD : '#334155', lineHeight: 1.55 }}>
          <strong>Créer les comptes portail</strong> — chaque acheteur importé avec un email recevra une
          invitation pour activer son compte et accéder au futur portail de commande. Sans cette option,
          seules les fiches sont créées (vous pourrez inviter plus tard depuis le carnet).
        </div>
      </div>

      {/* Étape 3 — upload */}
      <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: CL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>2️⃣</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Uploadez votre fichier rempli</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Limite : 500 lignes par fichier — l'import doit tenir dans votre quota d'acheteurs</div>
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
              {result.processed} acheteur{result.processed > 1 ? 's' : ''} importé{result.processed > 1 ? 's' : ''}
              {result.stats?.invitations ? ` · ${result.stats.invitations} invitation${result.stats.invitations > 1 ? 's' : ''} envoyée${result.stats.invitations > 1 ? 's' : ''}` : ''}
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
                        {d.status === 'ok' && <span style={{ color: '#166534', fontWeight: 600 }}>✅ Créé{d.compte ? ' + invité' : ''}</span>}
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
            <Link to="/client/acheteurs" style={{ color: C, fontWeight: 700, fontSize: '0.86rem' }}>→ Voir le carnet</Link>
          </div>
        </div>
      )}
    </div>
  );
}
