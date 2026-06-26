import { useEffect, useState, useMemo } from 'react';
import api from '../../api/client';
import HistoryFilterBar, { FilterField, FilterInput } from '../common/HistoryFilterBar';

interface Domaine { id: number; nom: string }

const ACCENT = '#b45309';
const ACCENT_DARK = '#78350f';

export default function AdminDomainesPage() {
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Domaine | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/api/domaines')
      .then(({ data }) => setDomaines(data))
      .catch(() => setDomaines([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setNom(''); setErr(''); setShowForm(true); };
  const openEdit = (d: Domaine) => { setEditing(d); setNom(d.nom); setErr(''); setShowForm(true); };

  const save = async () => {
    if (!nom.trim()) { setErr('Nom requis.'); return; }
    setSaving(true); setErr('');
    try {
      if (editing) await api.put(`/api/domaines/${editing.id}`, { nom: nom.trim() });
      else await api.post('/api/domaines', { nom: nom.trim() });
      setShowForm(false); load();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Erreur lors de l'enregistrement.");
    } finally { setSaving(false); }
  };

  const remove = async (d: Domaine) => {
    if (!window.confirm(`Supprimer le domaine « ${d.nom} » ?`)) return;
    try {
      await api.delete(`/api/domaines/${d.id}`);
      setDomaines((prev) => prev.filter((x) => x.id !== d.id));
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Suppression impossible.');
    }
  };

  const filtered = useMemo(
    () => domaines.filter((d) => !search || d.nom.toLowerCase().includes(search.toLowerCase())),
    [domaines, search]
  );

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #451a03 0%, #b45309 55%, #f59e0b 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(180,83,9,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 11, padding: '8px 10px', fontSize: '1.3rem', lineHeight: 1 }}>🗂️</div>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff', margin: 0 }}>Domaines d'activités</h1>
            <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.82rem', margin: '4px 0 0' }}>Catalogue global des domaines proposés aux clients</p>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 76 }}>
          <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{domaines.length}</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>domaine{domaines.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Filtres (composant partagé, mode direct) */}
      <HistoryFilterBar
        accent={ACCENT} accentDark={ACCENT_DARK}
        subtitle={`${filtered.length} domaine${filtered.length !== 1 ? 's' : ''}`}
        onReset={() => setSearch('')} showReset={!!search}
        actions={<button onClick={openCreate} style={{ height: 36, background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, padding: '0 18px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>+ Nouveau domaine</button>}
      >
        <FilterField label="🔍 Recherche">
          <FilterInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom du domaine…" />
        </FilterField>
      </HistoryFilterBar>

      {/* Liste */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : domaines.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '2px dashed #fcd34d', borderRadius: 18, padding: '44px 32px', textAlign: 'center', color: '#92400e' }}>
          <div style={{ fontSize: '2.6rem', marginBottom: 12 }}>🗂️</div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Aucun domaine d'activité</div>
          <div style={{ fontSize: '0.88rem' }}>Créez le premier domaine proposé aux clients.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((d) => (
            <div key={d.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${ACCENT}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.95rem' }}>🗂️ {d.nom}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => openEdit(d)} title="Modifier" style={iconBtn}>✏️</button>
                <button onClick={() => remove(d)} title="Supprimer" style={iconBtn}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(69,26,3,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, padding: '18px 24px' }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>{editing ? 'Modifier le domaine' : 'Nouveau domaine'}</h2>
            </div>
            <div style={{ padding: '22px 24px' }}>
              <label style={lbl}>Nom du domaine *</label>
              <input value={nom} autoFocus onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder="ex : Restauration rapide" style={inp} />
              {err && <div style={{ marginTop: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '0.84rem' }}>{err}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowForm(false)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
                <button onClick={save} disabled={saving} style={{ background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 22px', fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: '0.9rem' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box' };
