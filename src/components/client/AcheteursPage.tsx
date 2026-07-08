import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';

interface Acheteur {
  id: number;
  nom: string;
  entreprise: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  matriculeFiscal: string | null;
  remisePct: number;
  notes: string | null;
  actif: boolean;
  compte: 'aucun' | 'invite' | 'actif';
}

interface AddRow {
  nom: string; entreprise: string; email: string; telephone: string; remisePct: string; creerCompte: boolean;
}
const emptyRow = (): AddRow => ({ nom: '', entreprise: '', email: '', telephone: '', remisePct: '0', creerCompte: false });

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 };

const COMPTE_BADGE: Record<Acheteur['compte'], { label: string; bg: string; color: string }> = {
  aucun: { label: 'Sans compte', bg: '#f1f5f9', color: '#64748b' },
  invite: { label: '✉️ Invité', bg: '#fef3c7', color: '#92400e' },
  actif: { label: '✅ Compte actif', bg: '#dcfce7', color: '#166534' },
};

export default function AcheteursPage() {
  const [acheteurs, setAcheteurs] = useState<Acheteur[]>([]);
  const [quota, setQuota] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [globalError, setGlobalError] = useState('');

  // Multi-ajout
  const [addOpen, setAddOpen] = useState(false);
  const [rows, setRows] = useState<AddRow[]>([emptyRow()]);
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  // Édition
  const [editItem, setEditItem] = useState<Acheteur | null>(null);
  const [editForm, setEditForm] = useState<Partial<Acheteur>>({});
  const [editError, setEditError] = useState('');

  // Actions par ligne (invitation / suppression)
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/acheteurs')
      .then(({ data }) => { setAcheteurs(data.acheteurs); setQuota(data.quota); })
      .catch(() => setGlobalError('Erreur de chargement du carnet'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = acheteurs.filter(a => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [a.nom, a.entreprise, a.email, a.telephone].some(v => (v || '').toLowerCase().includes(q));
  });

  const updateRow = (i: number, k: keyof AddRow, v: string | boolean) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  const submitAdd = async () => {
    const valid = rows.filter(r => r.nom.trim());
    if (valid.length === 0) { setAddError('Renseignez au moins un nom'); return; }
    for (const r of valid) {
      if (r.creerCompte && !r.email.trim()) { setAddError(`« ${r.nom} » : un email est requis pour créer un compte`); return; }
    }
    setSaving(true); setAddError('');
    try {
      const { data } = await api.post('/api/acheteurs', {
        acheteurs: valid.map(r => ({
          nom: r.nom.trim(), entreprise: r.entreprise.trim(), email: r.email.trim(),
          telephone: r.telephone.trim(), remisePct: r.remisePct, creerCompte: r.creerCompte,
        })),
      });
      setAddOpen(false); setRows([emptyRow()]);
      const w = (data.warnings || []) as string[];
      setFlash(`${valid.length} acheteur${valid.length > 1 ? 's' : ''} ajouté${valid.length > 1 ? 's' : ''}${data.invitations ? ` · ${data.invitations} invitation${data.invitations > 1 ? 's' : ''} envoyée${data.invitations > 1 ? 's' : ''}` : ''}${w.length ? ` · ⚠️ ${w.join(' — ')}` : ''}`);
      load();
    } catch (e: unknown) {
      setAddError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'ajout');
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!editItem) return;
    setSaving(true); setEditError('');
    try {
      await api.put(`/api/acheteurs/${editItem.id}`, editForm);
      setEditItem(null); load();
    } catch (e: unknown) {
      setEditError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const toggleActif = async (a: Acheteur) => {
    setBusyId(a.id);
    try {
      await api.put(`/api/acheteurs/${a.id}`, { actif: !a.actif });
      setAcheteurs(prev => prev.map(x => x.id === a.id ? { ...x, actif: !a.actif } : x));
    } catch { setGlobalError('Erreur lors de la mise à jour'); }
    finally { setBusyId(null); }
  };

  const inviter = async (a: Acheteur) => {
    setBusyId(a.id); setGlobalError('');
    try {
      const { data } = await api.post(`/api/acheteurs/${a.id}/inviter`);
      setFlash(data.message); load();
    } catch (e: unknown) {
      setGlobalError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'invitation');
    } finally { setBusyId(null); }
  };

  const supprimer = async (a: Acheteur) => {
    if (!window.confirm(`Supprimer « ${a.nom} » de votre carnet ?${a.compte !== 'aucun' ? ' Son compte de connexion sera aussi supprimé.' : ''}`)) return;
    setBusyId(a.id); setGlobalError('');
    try {
      await api.delete(`/api/acheteurs/${a.id}`);
      setFlash(`« ${a.nom} » supprimé`); load();
    } catch (e: unknown) {
      setGlobalError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de la suppression');
    } finally { setBusyId(null); }
  };

  const quotaAtteint = quota > 0 && acheteurs.length >= quota;

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #8b5cf6 100%)`, borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(109,40,217,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🤝</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Carnet d'Acheteurs</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Vos clients B2B — ajoutez-les, invitez-les et préparez vos ventes depuis le stock labo
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 90 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{acheteurs.length}<span style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.7 }}> / {quota}</span></div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>acheteurs</div>
        </div>
      </div>

      {flash && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{flash}</span>
          <button onClick={() => setFlash('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontWeight: 800 }}>✕</button>
        </div>
      )}
      {globalError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{globalError}</span>
          <button onClick={() => setGlobalError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* Barre d'actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher (nom, entreprise, email…)"
          style={{ ...inp, maxWidth: 320, width: '100%' }} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link to="/client/acheteurs/import" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${CB}`, background: CL, color: C, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>
            📥 Ajout Dynamique
          </Link>
          <button onClick={() => { setAddOpen(true); setRows([emptyRow()]); setAddError(''); }} disabled={quotaAtteint}
            title={quotaAtteint ? 'Quota atteint — demandez une augmentation de capacité' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: 'none', background: quotaAtteint ? '#cbd5e1' : `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: quotaAtteint ? 'not-allowed' : 'pointer', boxShadow: quotaAtteint ? 'none' : '0 4px 14px rgba(109,40,217,0.3)' }}>
            ➕ Ajouter des acheteurs
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🤝</div>
            <div style={{ fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              {acheteurs.length === 0 ? 'Votre carnet est vide' : 'Aucun résultat'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {acheteurs.length === 0 ? 'Ajoutez vos premiers acheteurs manuellement ou importez-les depuis Excel.' : 'Modifiez votre recherche.'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                  {['Acheteur', 'Contact', 'Remise', 'Compte portail', 'Actif', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: CD, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const badge = COMPTE_BADGE[a.compte];
                  const busy = busyId === a.id;
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: a.actif ? 1 : 0.55 }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{a.nom}</div>
                        {a.entreprise && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{a.entreprise}</div>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div>{a.email || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                        {a.telephone && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{a.telephone}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: a.remisePct > 0 ? C : '#94a3b8' }}>
                        {a.remisePct > 0 ? `${a.remisePct} %` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: badge.bg, color: badge.color }}>{badge.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => toggleActif(a)} disabled={busy} title={a.actif ? 'Désactiver' : 'Activer'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          <div style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', background: a.actif ? '#059669' : '#cbd5e1', transition: 'background 0.2s' }}>
                            <div style={{ position: 'absolute', top: 2, left: a.actif ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                          </div>
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => { setEditItem(a); setEditForm({ nom: a.nom, entreprise: a.entreprise || '', email: a.email || '', telephone: a.telephone || '', adresse: a.adresse || '', matriculeFiscal: a.matriculeFiscal || '', remisePct: a.remisePct, notes: a.notes || '' }); setEditError(''); }}
                          title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px' }}>✏️</button>
                        {a.compte !== 'actif' && (
                          <button onClick={() => inviter(a)} disabled={busy || !a.email}
                            title={!a.email ? 'Renseignez un email pour inviter' : a.compte === 'invite' ? 'Renvoyer l\'invitation' : 'Créer le compte et inviter'}
                            style={{ background: 'none', border: 'none', cursor: !a.email ? 'not-allowed' : 'pointer', fontSize: '1rem', padding: '4px 6px', opacity: !a.email ? 0.35 : 1 }}>
                            {busy ? '…' : '✉️'}
                          </button>
                        )}
                        <button onClick={() => supprimer(a)} disabled={busy} title="Supprimer"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px' }}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale multi-ajout */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: CD }}>➕ Ajouter des acheteurs</h2>
              <button onClick={() => setAddOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Une ligne par acheteur. Cochez « Compte » pour envoyer une invitation par email (l'acheteur pourra se connecter au portail de commande).
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.4fr 1fr 70px 88px 30px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input placeholder="Nom *" value={r.nom} onChange={e => updateRow(i, 'nom', e.target.value)} style={inp} />
                <input placeholder="Entreprise" value={r.entreprise} onChange={e => updateRow(i, 'entreprise', e.target.value)} style={inp} />
                <input placeholder="Email" type="email" value={r.email} onChange={e => updateRow(i, 'email', e.target.value)} style={inp} />
                <input placeholder="Téléphone" value={r.telephone} onChange={e => updateRow(i, 'telephone', e.target.value)} style={inp} />
                <input placeholder="Rem. %" value={r.remisePct} onChange={e => updateRow(i, 'remisePct', e.target.value)} style={inp} title="Remise %" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', fontWeight: 600, color: r.creerCompte ? C : '#64748b', cursor: 'pointer' }}>
                  <input type="checkbox" checked={r.creerCompte} onChange={e => updateRow(i, 'creerCompte', e.target.checked)} style={{ accentColor: C }} />
                  Compte
                </label>
                <button onClick={() => setRows(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)} title="Retirer la ligne"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontWeight: 800 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setRows(prev => [...prev, emptyRow()])}
              style={{ background: 'none', border: `1.5px dashed ${CB}`, color: C, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, marginBottom: 16 }}>
              + Ajouter une ligne
            </button>
            {addError && <div style={{ color: '#dc2626', fontSize: '0.82rem', marginBottom: 12, fontWeight: 600 }}>{addError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setAddOpen(false)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Annuler</button>
              <button onClick={submitAdd} disabled={saving}
                style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', cursor: saving ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale édition */}
      {editItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: CD }}>✏️ {editItem.nom}</h2>
              <button onClick={() => setEditItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Nom *</label><input value={String(editForm.nom ?? '')} onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Entreprise</label><input value={String(editForm.entreprise ?? '')} onChange={e => setEditForm(f => ({ ...f, entreprise: e.target.value }))} style={inp} /></div>
              <div>
                <label style={lbl}>Email {editItem.compte !== 'aucun' && <span style={{ color: '#94a3b8', fontWeight: 500 }}>(compte lié — non modifiable)</span>}</label>
                <input value={String(editForm.email ?? '')} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} style={inp} disabled={editItem.compte !== 'aucun'} />
              </div>
              <div><label style={lbl}>Téléphone</label><input value={String(editForm.telephone ?? '')} onChange={e => setEditForm(f => ({ ...f, telephone: e.target.value }))} style={inp} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Adresse</label><input value={String(editForm.adresse ?? '')} onChange={e => setEditForm(f => ({ ...f, adresse: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Matricule fiscal</label><input value={String(editForm.matriculeFiscal ?? '')} onChange={e => setEditForm(f => ({ ...f, matriculeFiscal: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Remise (%)</label><input value={String(editForm.remisePct ?? '0')} onChange={e => setEditForm(f => ({ ...f, remisePct: e.target.value as unknown as number }))} style={inp} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Notes</label><textarea value={String(editForm.notes ?? '')} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inp, minHeight: 60, resize: 'vertical' }} /></div>
            </div>
            {editError && <div style={{ color: '#dc2626', fontSize: '0.82rem', margin: '12px 0 0', fontWeight: 600 }}>{editError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={() => setEditItem(null)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Annuler</button>
              <button onClick={submitEdit} disabled={saving}
                style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', cursor: saving ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
