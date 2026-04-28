import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Fournisseur, Activite } from '../../types';

interface FournisseurFormData {
  nom: string;
  adresse: string;
  telephone: string;
  activiteIds: number[];
}

const empty: FournisseurFormData = { nom: '', adresse: '', telephone: '', activiteIds: [] };

export default function FournisseursPage() {
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: Fournisseur } | null>(null);
  const [form, setForm] = useState<FournisseurFormData>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [fr, ac] = await Promise.all([
        api.get('/api/entreprise/fournisseurs'),
        api.get('/api/entreprise/activites'),
      ]);
      setFournisseurs(fr.data as Fournisseur[]);
      setActivites(ac.data as Activite[]);
    } catch {
      setFournisseurs([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(empty);
    setError('');
    setModal({ mode: 'create' });
  };

  const openEdit = (f: Fournisseur) => {
    setForm({ nom: f.nom, adresse: f.adresse ?? '', telephone: f.telephone ?? '', activiteIds: f.activiteIds });
    setError('');
    setModal({ mode: 'edit', item: f });
  };

  const toggleActivite = (id: number) => {
    setForm((prev) => ({
      ...prev,
      activiteIds: prev.activiteIds.includes(id)
        ? prev.activiteIds.filter((x) => x !== id)
        : [...prev.activiteIds, id],
    }));
  };

  const save = async () => {
    if (!form.nom.trim()) { setError('Le nom est requis.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        nom: form.nom.trim(),
        adresse: form.adresse.trim() || null,
        telephone: form.telephone.trim() || null,
        activiteIds: form.activiteIds,
      };
      if (modal?.mode === 'edit' && modal.item) {
        await api.put(`/api/entreprise/fournisseurs/${modal.item.id}`, payload);
      } else {
        await api.post('/api/entreprise/fournisseurs', payload);
      }
      setModal(null);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Erreur serveur');
    }
    setSaving(false);
  };

  const deleteFournisseur = async (f: Fournisseur) => {
    if (!window.confirm(`Supprimer "${f.nom}" ?`)) return;
    try {
      await api.delete(`/api/entreprise/fournisseurs/${f.id}`);
      load();
    } catch { /* ignore */ }
  };

  const activiteLabel = (id: number) => activites.find((a) => a.id === id)?.nom ?? `#${id}`;

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>🚚 Fournisseurs</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Nouveau fournisseur</button>
      </div>

      {loading ? (
        <p className="text-muted">Chargement…</p>
      ) : fournisseurs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🚚</span>
          <p>Aucun fournisseur enregistré. Créez-en un pour pouvoir l'associer aux approvisionnements.</p>
        </div>
      ) : (
        <div className="table-responsive card th-cyan">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Adresse</th>
                <th>Activités liées</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fournisseurs.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 700 }}>{f.nom}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{f.telephone ?? '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{f.adresse ?? '—'}</td>
                  <td>
                    <div className="fournisseur-card-acts">
                      {f.activiteIds.length === 0
                        ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                        : f.activiteIds.map((id) => (
                          <span key={id} className="act-chip">{activiteLabel(id)}</span>
                        ))}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" style={{ marginRight: 6 }} onClick={() => openEdit(f)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteFournisseur(f)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modal.mode === 'create' ? 'Nouveau fournisseur' : 'Modifier le fournisseur'}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nom *</label>
                <input
                  className="input" style={{ width: '100%' }}
                  placeholder="Nom du fournisseur"
                  value={form.nom}
                  onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Téléphone</label>
                <input
                  className="input" style={{ width: '100%' }}
                  placeholder="+216 …"
                  value={form.telephone}
                  onChange={(e) => setForm((p) => ({ ...p, telephone: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Adresse</label>
                <input
                  className="input" style={{ width: '100%' }}
                  placeholder="Adresse (optionnel)"
                  value={form.adresse}
                  onChange={(e) => setForm((p) => ({ ...p, adresse: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Activités liées</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {activites.map((a) => (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={form.activiteIds.includes(a.id)}
                        onChange={() => toggleActivite(a.id)}
                      />
                      {a.nom}
                    </label>
                  ))}
                </div>
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
