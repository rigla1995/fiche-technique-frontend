import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Fournisseur, Activite, Labo } from '../../types';

interface FournisseurFormData {
  nom: string;
  adresse: string;
  telephone: string;
  activiteIds: number[];
  laboIds: number[];
}

const empty: FournisseurFormData = { nom: '', adresse: '', telephone: '', activiteIds: [], laboIds: [] };

export default function FournisseursPage() {
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: Fournisseur } | null>(null);
  const [form, setForm] = useState<FournisseurFormData>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [fr, ac, lb] = await Promise.all([
        api.get('/api/entreprise/fournisseurs'),
        api.get('/api/entreprise/activites'),
        api.get('/api/labo'),
      ]);
      setFournisseurs(fr.data as Fournisseur[]);
      setActivites(ac.data as Activite[]);
      setLabos(lb.data as Labo[]);
    } catch {
      setFournisseurs([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ ...empty, activiteIds: activites.map((a) => a.id) });
    setError('');
    setModal({ mode: 'create' });
  };

  const openEdit = (f: Fournisseur) => {
    setForm({ nom: f.nom, adresse: f.adresse ?? '', telephone: f.telephone ?? '', activiteIds: f.activiteIds, laboIds: f.laboIds ?? [] });
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

  const toggleLabo = (id: number) => {
    setForm((prev) => ({
      ...prev,
      laboIds: prev.laboIds.includes(id)
        ? prev.laboIds.filter((x) => x !== id)
        : [...prev.laboIds, id],
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
        laboIds: form.laboIds,
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
  const laboLabel = (id: number) => labos.find((l) => l.id === id)?.nom ?? `Labo #${id}`;

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  const nonLaboFournisseurs = fournisseurs.filter((f) => !f.isLabo);
  const laboFournisseurs = fournisseurs.filter((f) => f.isLabo);

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
        <>
          {/* Labo fournisseurs (auto-managed) */}
          {laboFournisseurs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>
                🏭 Fournisseurs Labo (auto-gérés)
              </h2>
              <div className="table-responsive card th-indigo">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Téléphone</th>
                      <th>Activités liées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laboFournisseurs.map((f) => (
                      <tr key={f.id} style={{ background: 'var(--primary-light, #e8f0fe)', opacity: 0.9 }}>
                        <td style={{ fontWeight: 700 }}>🏭 {f.nom}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{f.telephone ?? '—'}</td>
                        <td>
                          <div className="fournisseur-card-acts">
                            {f.activiteIds.length === 0
                              ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                              : f.activiteIds.map((id) => (
                                <span key={id} className="act-chip">{activiteLabel(id)}</span>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Regular fournisseurs */}
          <div className="table-responsive card th-cyan">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Adresse</th>
                  <th>Activités liées</th>
                  <th>Labos liés</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {nonLaboFournisseurs.map((f) => (
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
                    <td>
                      <div className="fournisseur-card-acts">
                        {(f.laboIds ?? []).length === 0
                          ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                          : (f.laboIds ?? []).map((id) => (
                            <span key={id} className="act-chip" style={{ background: '#ede9fe', color: '#7c3aed', borderColor: '#c4b5fd' }}>🏭 {laboLabel(id)}</span>
                          ))}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" style={{ marginRight: 6 }} onClick={() => openEdit(f)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteFournisseur(f)}>🗑️</button>
                    </td>
                  </tr>
                ))}
                {nonLaboFournisseurs.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                      Aucun fournisseur manuel. Cliquez sur "+ Nouveau fournisseur".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                  {activites.length === 0
                    ? <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucune activité</span>
                    : activites.map((a) => (
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
              {labos.length > 0 && (
                <div>
                  <label style={labelStyle}>Labos liés</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                    {labos.map((l) => (
                      <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={form.laboIds.includes(l.id)}
                          onChange={() => toggleLabo(l.id)}
                        />
                        🏭 {l.nom} {l.refLabo ? <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({l.refLabo})</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
