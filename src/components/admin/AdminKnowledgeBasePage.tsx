import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';
import HistoryFilterBar, { FilterField, FilterInput } from '../common/HistoryFilterBar';

interface KbEntry {
  id: number;
  titre: string;
  contenu: string;
  motsCles: string | null;
  categorie: string | null;
  actif: boolean;
  updatedAt: string;
}

const empty = { titre: '', contenu: '', motsCles: '', categorie: '', actif: true };

export default function AdminKnowledgeBasePage() {
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<KbEntry | null>(null);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/knowledge-base')
      .then(({ data }) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(empty); setErr(''); setShowForm(true); };
  const openEdit = (e: KbEntry) => {
    setEditing(e);
    setForm({ titre: e.titre, contenu: e.contenu, motsCles: e.motsCles || '', categorie: e.categorie || '', actif: e.actif });
    setErr(''); setShowForm(true);
  };

  const save = async () => {
    if (!form.titre.trim() || !form.contenu.trim()) { setErr('Titre et contenu requis.'); return; }
    setSaving(true); setErr('');
    try {
      if (editing) await api.put(`/admin/knowledge-base/${editing.id}`, form);
      else await api.post('/admin/knowledge-base', form);
      setShowForm(false); load();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement.');
    } finally { setSaving(false); }
  };

  const toggleActif = async (e: KbEntry) => {
    await api.put(`/admin/knowledge-base/${e.id}`, { actif: !e.actif }).catch(() => {});
    load();
  };

  const remove = async (e: KbEntry) => {
    if (!window.confirm(`Supprimer « ${e.titre} » de la base de connaissances ?`)) return;
    await api.delete(`/admin/knowledge-base/${e.id}`).catch(() => {});
    load();
  };

  const filtered = entries.filter((e) =>
    !search || `${e.titre} ${e.categorie || ''} ${e.motsCles || ''}`.toLowerCase().includes(search.toLowerCase()));
  const activeCount = entries.filter((e) => e.actif).length;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #6366f1 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(67,56,202,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0 }}>🧠 Base de connaissances IA</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', margin: '4px 0 0' }}>
            Le savoir métier que les agents Messenger/Telegram utilisent pour répondre ({activeCount} actif{activeCount > 1 ? 's' : ''} / {entries.length}).
          </p>
        </div>
        <button onClick={openCreate} style={{ background: '#fff', color: '#4338ca', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
          + Nouvel article
        </button>
      </div>

      <HistoryFilterBar
        accent="#4338ca" accentDark="#3730a3"
        subtitle={`${filtered.length} article${filtered.length !== 1 ? 's' : ''}`}
        onReset={() => setSearch('')} showReset={!!search}
      >
        <FilterField label="🔍 Recherche">
          <FilterInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titre, catégorie, mots-clés…" />
        </FilterField>
      </HistoryFilterBar>

      {loading ? <div className="loading-text">Chargement…</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>Aucun article.</div>}
          {filtered.map((e) => (
            <div key={e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${e.actif ? '#4338ca' : '#cbd5e1'}`, borderRadius: 12, padding: '14px 16px', opacity: e.actif ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '0.95rem' }}>{e.titre}</span>
                    {e.categorie && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#4338ca', background: '#eef2ff', borderRadius: 20, padding: '2px 9px' }}>{e.categorie}</span>}
                    {!e.actif && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 20, padding: '2px 9px' }}>inactif</span>}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{e.contenu}</p>
                  {e.motsCles && <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>🔑 {e.motsCles}</p>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggleActif(e)} title={e.actif ? 'Désactiver' : 'Activer'} style={iconBtn}>{e.actif ? '🟢' : '⚪'}</button>
                  <button onClick={() => openEdit(e)} title="Modifier" style={iconBtn}>✏️</button>
                  <button onClick={() => remove(e)} title="Supprimer" style={iconBtn}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,12,41,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#4338ca)', padding: '18px 24px', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>{editing ? 'Modifier l\'article' : 'Nouvel article'}</h2>
            </div>
            <div style={{ padding: '22px 24px' }}>
              <label style={lbl}>Titre *</label>
              <input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="ex : Food cost" style={inp} />
              <label style={lbl}>Contenu * (définition / explication concise)</label>
              <textarea value={form.contenu} onChange={(e) => setForm({ ...form, contenu: e.target.value })} rows={5} placeholder="Explication claire que l'agent utilisera pour répondre…" style={{ ...inp, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={lbl}>Catégorie</label>
                  <input value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} placeholder="concept / process…" style={inp} />
                </div>
                <div style={{ flex: 2, minWidth: 220 }}>
                  <label style={lbl}>Mots-clés (séparés par des virgules)</label>
                  <input value={form.motsCles} onChange={(e) => setForm({ ...form, motsCles: e.target.value })} placeholder="food cost, ratio, cout matiere" style={inp} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: '0.88rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
                Actif (utilisé par les agents)
              </label>
              {err && <div style={{ marginTop: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '0.84rem' }}>{err}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowForm(false)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
                <button onClick={save} disabled={saving} style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 22px', fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: '0.9rem' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', margin: '12px 0 5px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: '0.9rem', fontFamily: 'inherit' };
