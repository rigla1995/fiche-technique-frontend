import { useState, useEffect } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Fournisseur, FournisseurApproActivite, Activite, Labo } from '../../types';

interface FournisseurFormData {
  nom: string;
  adresse: string;
  telephone: string;
  activiteIds: number[];
  laboIds: number[];
}

const empty: FournisseurFormData = { nom: '', adresse: '', telephone: '', activiteIds: [], laboIds: [] };

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

const thStyle: React.CSSProperties = {
  fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase',
  padding: '12px 14px', color: '#fff', background: 'transparent',
};

export default function FournisseursPage() {
  const { user, canWrite } = useAuth();
  const isIndep = user?.compteType === 'independant';

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: Fournisseur } | null>(null);
  const [form, setForm] = useState<FournisseurFormData>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [foPage, setFoPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Fournisseur | null>(null);

  const FOURN_PAGE_SIZE = 10;

  const load = async () => {
    setLoading(true);
    try {
      if (isIndep) {
        const fr = await api.get('/api/fournisseurs');
        setFournisseurs(fr.data as Fournisseur[]);
      } else {
        const [fr, ac, lb] = await Promise.all([
          api.get('/api/entreprise/fournisseurs'),
          api.get('/api/entreprise/activites'),
          api.get('/api/labo'),
        ]);
        setFournisseurs(fr.data as Fournisseur[]);
        setActivites(ac.data as Activite[]);
        setLabos(lb.data as Labo[]);
      }
    } catch {
      setFournisseurs([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [isIndep]);

  const openCreate = () => {
    setForm(isIndep ? empty : { ...empty, activiteIds: activites.map((a) => a.id) });
    setError('');
    setModal({ mode: 'create' });
  };

  const openEdit = (f: Fournisseur) => {
    setForm({ nom: f.nom, adresse: f.adresse ?? '', telephone: f.telephone ?? '', activiteIds: f.activiteIds, laboIds: f.laboIds ?? [] });
    setError('');
    setModal({ mode: 'edit', item: f });
  };

  const toggleActivite = (id: number) =>
    setForm((prev) => ({ ...prev, activiteIds: prev.activiteIds.includes(id) ? prev.activiteIds.filter((x) => x !== id) : [...prev.activiteIds, id] }));

  const toggleLabo = (id: number) =>
    setForm((prev) => ({ ...prev, laboIds: prev.laboIds.includes(id) ? prev.laboIds.filter((x) => x !== id) : [...prev.laboIds, id] }));

  const save = async () => {
    if (!form.nom.trim()) { setError('Le nom est requis.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = isIndep
        ? { nom: form.nom.trim(), adresse: form.adresse.trim() || null, telephone: form.telephone.trim() || null }
        : { nom: form.nom.trim(), adresse: form.adresse.trim() || null, telephone: form.telephone.trim() || null, activiteIds: form.activiteIds, laboIds: form.laboIds };

      const base = isIndep ? '/api/fournisseurs' : '/api/entreprise/fournisseurs';
      if (modal?.mode === 'edit' && modal.item) {
        await api.put(`${base}/${modal.item.id}`, payload);
      } else {
        await api.post(base, payload);
        window.dispatchEvent(new Event('fournisseur-created'));
      }
      setModal(null);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Erreur serveur');
    }
    setSaving(false);
  };

  const handleDelete = async (f: Fournisseur) => {
    try {
      const base = isIndep ? '/api/fournisseurs' : '/api/entreprise/fournisseurs';
      await api.delete(`${base}/${f.id}`);
      setDeleteConfirm(null);
      load();
    } catch { /* ignore */ }
  };

  const activiteLabel = (id: number) => activites.find((a) => a.id === id)?.nom ?? `#${id}`;
  const laboLabel = (id: number) => labos.find((l) => l.id === id)?.nom ?? `Labo #${id}`;

  const nonLaboFournisseurs = fournisseurs.filter((f) => !f.isLabo);
  const laboFournisseurs = fournisseurs.filter((f) => f.isLabo);
  const filteredFournisseurs = search.trim()
    ? nonLaboFournisseurs.filter((f) =>
        f.nom.toLowerCase().includes(search.toLowerCase()) ||
        (f.telephone ?? '').includes(search) ||
        (f.adresse ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : nonLaboFournisseurs;
  const foTotalPages = Math.max(1, Math.ceil(filteredFournisseurs.length / FOURN_PAGE_SIZE));
  const pagedFournisseurs = filteredFournisseurs.slice((foPage - 1) * FOURN_PAGE_SIZE, foPage * FOURN_PAGE_SIZE);

  return (
    <div className="page">
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 55%, #f97316 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(234,88,12,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏪</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Fournisseurs {isIndep ? 'Activité' : ''}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Gérez vos fournisseurs et leurs associations
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{fournisseurs.length}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fournisseurs</div>
          </div>
          {canWrite && (
          <button
            onClick={openCreate}
            style={{
              background: 'rgba(255,255,255,0.2)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
              borderRadius: 10, border: '1px solid rgba(255,255,255,0.35)',
              color: '#fff', fontWeight: 800, padding: '10px 22px',
              cursor: 'pointer', fontSize: '0.9rem', backdropFilter: 'blur(4px)',
            }}
          >
            + Nouveau fournisseur
          </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '16px 20px',
        border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>Filtres</span>
          {search && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setSearch(''); setFoPage(1); }}>✕ Réinitialiser</button>
          )}
        </div>
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Recherche</span>
          <input
            type="text" className="input" placeholder="Nom, téléphone, adresse…" value={search}
            onChange={(e) => { setSearch(e.target.value); setFoPage(1); }}
            style={{ maxWidth: 320 }}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Chargement…</p>
      ) : fournisseurs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🚚</div>
          <p style={{ fontSize: '0.95rem' }}>Aucun fournisseur enregistré. Créez-en un pour pouvoir l'associer aux approvisionnements.</p>
        </div>
      ) : (
        <>
          {/* Labo fournisseurs (entreprise only, auto-managed) */}
          {!isIndep && laboFournisseurs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>
                🏭 Fournisseurs Labo (auto-gérés)
              </h2>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)' }}>
                      <th style={thStyle}>Nom</th>
                      <th style={thStyle}>Téléphone</th>
                      <th style={thStyle}>Activités liées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laboFournisseurs.map((f, idx) => (
                      <tr key={f.id} style={{ background: idx % 2 === 0 ? 'var(--surface)' : 'rgba(234,88,12,0.03)', borderLeft: '4px solid #ea580c' }}>
                        <td style={{ fontWeight: 700, padding: '10px 14px' }}>🏭 {f.nom}</td>
                        <td style={{ color: 'var(--text-muted)', padding: '10px 14px' }}>{f.telephone ?? '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div className="fournisseur-card-acts">
                            {f.activiteIds.length === 0
                              ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                              : f.activiteIds.map((id) => <span key={id} className="act-chip">{activiteLabel(id)}</span>)}
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
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)' }}>
                  <th style={thStyle}>Nom</th>
                  <th style={thStyle}>Téléphone</th>
                  <th style={thStyle}>Adresse</th>
                  {!isIndep && (
                    <>
                      <th style={thStyle}>Activités liées</th>
                      <th style={thStyle}>Labos liés</th>
                    </>
                  )}
                  <th style={{ ...thStyle, textAlign: 'center' }}>Appros</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {pagedFournisseurs.map((f, idx) => (
                  <tr
                    key={f.id}
                    style={{
                      background: idx % 2 === 0 ? 'var(--surface)' : 'rgba(234,88,12,0.03)',
                      borderLeft: '4px solid #ea580c',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(234,88,12,0.07)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface)' : 'rgba(234,88,12,0.03)')}
                  >
                    <td style={{ fontWeight: 700, padding: '10px 14px' }}>{f.nom}</td>
                    <td style={{ color: 'var(--text-muted)', padding: '10px 14px' }}>{f.telephone ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 14px' }}>{f.adresse ?? '—'}</td>
                    {!isIndep && (
                      <>
                        <td style={{ padding: '10px 14px' }}>
                          <div className="fournisseur-card-acts">
                            {f.activiteIds.length === 0
                              ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                              : f.activiteIds.map((id) => <span key={id} className="act-chip">{activiteLabel(id)}</span>)}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div className="fournisseur-card-acts">
                            {(f.laboIds ?? []).length === 0
                              ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                              : (f.laboIds ?? []).map((id) => <span key={id} className="act-chip" style={{ background: '#ede9fe', color: '#7c3aed', borderColor: '#c4b5fd' }}>🏭 {laboLabel(id)}</span>)}
                          </div>
                        </td>
                      </>
                    )}
                    <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                      {(f.approCount ?? 0) === 0 ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <div>
                          <span style={{
                            display: 'inline-block', background: '#fff7ed', color: '#c2410c',
                            border: '1px solid #fed7aa', borderRadius: 20,
                            padding: '2px 10px', fontSize: '0.82rem', fontWeight: 800,
                          }}>
                            {f.approCount}
                          </span>
                          {!isIndep && (f.approByActivite ?? []).length > 0 && (
                            <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                              {(f.approByActivite as FournisseurApproActivite[]).map((a) => (
                                <span key={a.activiteId} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  background: '#eff6ff', color: '#1d4ed8',
                                  border: '1px solid #bfdbfe', borderRadius: 12,
                                  padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700,
                                }}>
                                  {a.nom} <span style={{ fontWeight: 900 }}>{a.count}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', padding: '10px 14px' }}>
                      {canWrite && (
                        <button
                          onClick={() => openEdit(f)}
                          style={{
                            marginRight: 6, background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.2)',
                            borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem',
                            color: '#ea580c', fontWeight: 700,
                          }}
                        >✏️</button>
                      )}
                      {canWrite && !f.hasAppros && (
                        <button
                          onClick={() => setDeleteConfirm(f)}
                          style={{
                            background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.18)',
                            borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem',
                            color: 'var(--danger)', fontWeight: 700,
                          }}
                        >🗑️</button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredFournisseurs.length === 0 && (
                  <tr>
                    <td colSpan={isIndep ? 5 : 7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 24px' }}>
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
                      <div>{search ? 'Aucun résultat.' : 'Aucun fournisseur. Cliquez sur "+ Nouveau fournisseur".'}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {foTotalPages > 1 && (
              <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{filteredFournisseurs.length} fournisseur{filteredFournisseurs.length > 1 ? 's' : ''}{search ? ` (filtré${filteredFournisseurs.length > 1 ? 's' : ''})` : ''}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" disabled={foPage === 1} onClick={() => setFoPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{foPage} / {foTotalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={foPage === foTotalPages} onClick={() => setFoPage((p) => Math.min(foTotalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)', borderRadius: '12px 12px 0 0', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>⚠️ Confirmer la suppression</h2>
              <button onClick={() => setDeleteConfirm(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                Voulez-vous vraiment supprimer le fournisseur <strong>"{deleteConfirm.nom}"</strong> ?
              </p>
              <p style={{ margin: '10px 0 0', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                Cette action est irréversible.
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Annuler</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, padding: '10px 22px', cursor: 'pointer' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)', borderRadius: '12px 12px 0 0', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                {modal.mode === 'create' ? 'Nouveau fournisseur' : 'Modifier le fournisseur'}
              </h2>
              <button
                onClick={() => setModal(null)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}
              >×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nom *</label>
                <input className="input" style={{ width: '100%' }} placeholder="Nom du fournisseur" value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Téléphone</label>
                <input className="input" style={{ width: '100%' }} placeholder="+216 …" value={form.telephone} onChange={(e) => setForm((p) => ({ ...p, telephone: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Adresse</label>
                <input className="input" style={{ width: '100%' }} placeholder="Adresse (optionnel)" value={form.adresse} onChange={(e) => setForm((p) => ({ ...p, adresse: e.target.value }))} />
              </div>
              {!isIndep && (
                <>
                  <div>
                    <label style={labelStyle}>Activités liées</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                      {activites.length === 0
                        ? <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucune activité</span>
                        : activites.map((a) => (
                          <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                            <input type="checkbox" checked={form.activiteIds.includes(a.id)} onChange={() => toggleActivite(a.id)} />
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
                            <input type="checkbox" checked={form.laboIds.includes(l.id)} onChange={() => toggleLabo(l.id)} />
                            🏭 {l.nom} {l.refLabo ? <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({l.refLabo})</span> : null}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Annuler</button>
              <button
                onClick={save}
                disabled={saving || !canWrite}
                style={{
                  background: 'linear-gradient(135deg, #ea580c, #f97316)',
                  boxShadow: '0 4px 14px rgba(234,88,12,0.35)',
                  borderRadius: 10, border: 'none', color: '#fff',
                  fontWeight: 800, padding: '10px 22px', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
