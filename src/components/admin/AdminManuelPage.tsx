import { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../../api/client';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import MarkdownView from '../common/MarkdownView';

interface ManuelSection {
  id: number;
  slug: string;
  titre: string;
  icone: string | null;
  partie: string;
  ordre: number;
  contenu: string;
  motsCles: string | null;
  visibleGerant: boolean;
  actif: boolean;
  modifie: boolean;
  updatedAt: string;
}

const emptyForm = {
  slug: '', titre: '', icone: '', partie: '', ordre: 0,
  contenu: '', motsCles: '', visibleGerant: true, actif: true,
};

const MD_HELP = '## Titre · ### Sous-titre · **gras** · *italique* · `code` · [lien](#slug) · - liste · 1. étapes · | tableau | · :::astuce / :::attention / :::regle / :::exemple … ::: · :::formule Libellé … note: … :::';

export default function AdminManuelPage() {
  const [sections, setSections] = useState<ManuelSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ManuelSection | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [partieFilter, setPartieFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/manuel')
      .then(({ data }) => setSections(data))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const parties = useMemo(() => {
    const seen: string[] = [];
    for (const s of sections) if (!seen.includes(s.partie)) seen.push(s.partie);
    return seen;
  }, [sections]);

  const openCreate = () => {
    const maxOrdre = sections.reduce((m, s) => Math.max(m, s.ordre), 0);
    setEditing(null);
    setForm({ ...emptyForm, ordre: maxOrdre + 1 });
    setErr(''); setPreview(false); setShowForm(true);
  };
  const openEdit = (s: ManuelSection) => {
    setEditing(s);
    setForm({
      slug: s.slug, titre: s.titre, icone: s.icone || '', partie: s.partie, ordre: s.ordre,
      contenu: s.contenu, motsCles: s.motsCles || '', visibleGerant: s.visibleGerant, actif: s.actif,
    });
    setErr(''); setPreview(false); setShowForm(true);
  };

  const save = async () => {
    if (!form.slug.trim() || !form.titre.trim() || !form.partie.trim() || !form.contenu.trim()) {
      setErr('Slug, titre, partie et contenu sont requis.'); return;
    }
    setSaving(true); setErr('');
    const payload = {
      slug: form.slug.trim(), titre: form.titre.trim(), icone: form.icone.trim() || null,
      partie: form.partie.trim(), ordre: Number(form.ordre) || 0, contenu: form.contenu,
      motsCles: form.motsCles.trim() || null, visibleGerant: form.visibleGerant, actif: form.actif,
    };
    try {
      if (editing) await api.put(`/admin/manuel/${editing.id}`, payload);
      else await api.post('/admin/manuel', payload);
      setShowForm(false); load();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement.');
    } finally { setSaving(false); }
  };

  const toggleActif = async (s: ManuelSection) => {
    await api.put(`/admin/manuel/${s.id}`, { actif: !s.actif }).catch(() => window.alert('La mise à jour a échoué.'));
    load();
  };

  const restore = async (s: ManuelSection) => {
    if (!window.confirm(`Restaurer la version d'origine de « ${s.titre} » ? Vos modifications de contenu seront perdues.`)) return;
    await api.post(`/admin/manuel/${s.id}/restore`).catch(() => window.alert('La restauration a échoué.'));
    load();
  };

  const remove = async (s: ManuelSection) => {
    if (!window.confirm(`Supprimer la section « ${s.titre} » du manuel ?`)) return;
    await api.delete(`/admin/manuel/${s.id}`).catch(() => window.alert('La suppression a échoué.'));
    load();
  };

  const filtered = sections.filter((s) =>
    (!partieFilter || s.partie === partieFilter) &&
    (!search || `${s.titre} ${s.slug} ${s.partie} ${s.motsCles || ''}`.toLowerCase().includes(search.toLowerCase())));

  const grouped = useMemo(() => {
    const map = new Map<string, ManuelSection[]>();
    for (const s of filtered) {
      if (!map.has(s.partie)) map.set(s.partie, []);
      map.get(s.partie)!.push(s);
    }
    return [...map.entries()];
  }, [filtered]);

  const activeCount = sections.filter((s) => s.actif).length;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0 }}>📖 Gestion du Manuel</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', margin: '4px 0 0' }}>
            Le manuel d'utilisation affiché aux clients et gérants ({activeCount} section{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''} / {sections.length}).
          </p>
        </div>
        <button onClick={openCreate} style={{ background: '#fff', color: '#2563eb', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
          + Nouvelle section
        </button>
      </div>

      <HistoryFilterBar
        accent="#2563eb" accentDark="#1e40af"
        subtitle={`${filtered.length} section${filtered.length !== 1 ? 's' : ''}`}
        onReset={() => { setSearch(''); setPartieFilter(''); }} showReset={!!search || !!partieFilter}
      >
        <FilterField label="🔍 Recherche">
          <FilterInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titre, slug, mots-clés…" />
        </FilterField>
        <FilterField label="📂 Partie">
          <FilterSelect value={partieFilter} onChange={(e) => setPartieFilter(e.target.value)}>
            <option value="">— Toutes —</option>
            {parties.map((p) => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {loading ? <div className="loading-text">Chargement…</div> : (
        <div style={{ display: 'grid', gap: 16 }}>
          {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>Aucune section.</div>}
          {grouped.map(([partie, items]) => (
            <div key={partie}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 8px' }}>{partie}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((s) => (
                  <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${s.actif ? '#2563eb' : '#cbd5e1'}`, borderRadius: 12, padding: '12px 16px', opacity: s.actif ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15 }}>{s.icone || '📄'}</span>
                          <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '0.92rem' }}>{s.titre}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', borderRadius: 20, padding: '2px 9px', fontFamily: 'monospace' }}>#{s.slug}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8' }}>ordre {s.ordre}</span>
                          {s.modifie && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 20, padding: '2px 9px' }}>modifié</span>}
                          {!s.visibleGerant && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', borderRadius: 20, padding: '2px 9px' }}>masqué gérant</span>}
                          {!s.actif && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 20, padding: '2px 9px' }}>inactif</span>}
                        </div>
                        {s.motsCles && <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>🔑 {s.motsCles}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => toggleActif(s)} title={s.actif ? 'Désactiver' : 'Activer'} style={iconBtn}>{s.actif ? '🟢' : '⚪'}</button>
                        <button onClick={() => openEdit(s)} title="Modifier" style={iconBtn}>✏️</button>
                        {s.modifie && <button onClick={() => restore(s)} title="Restaurer la version d'origine" style={iconBtn}>↩️</button>}
                        <button onClick={() => remove(s)} title="Supprimer" style={iconBtn}>🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal édition */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,12,41,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 980, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', padding: '18px 24px', borderTopLeftRadius: 16, borderTopRightRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>{editing ? 'Modifier la section' : 'Nouvelle section'}</h2>
              <button onClick={() => setPreview(!preview)} style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 9, padding: '7px 14px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                {preview ? '✏️ Éditer' : '👁 Aperçu'}
              </button>
            </div>
            <div style={{ padding: '22px 24px' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={lbl}>Titre *</label>
                  <input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="ex : Transferts labo → activités" style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={lbl}>Slug * (ancre #)</label>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="ex : transferts" style={{ ...inp, fontFamily: 'monospace' }} />
                </div>
                <div style={{ width: 80 }}>
                  <label style={lbl}>Icône</label>
                  <input value={form.icone} onChange={(e) => setForm({ ...form, icone: e.target.value })} placeholder="🔁" style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={lbl}>Partie * (groupe de navigation)</label>
                  <input value={form.partie} onChange={(e) => setForm({ ...form, partie: e.target.value })} placeholder="ex : Stock & Appro" style={inp} list="manuel-parties" />
                  <datalist id="manuel-parties">
                    {parties.map((p) => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div style={{ width: 100 }}>
                  <label style={lbl}>Ordre</label>
                  <input type="number" value={form.ordre} onChange={(e) => setForm({ ...form, ordre: Number(e.target.value) })} style={inp} />
                </div>
                <div style={{ flex: 2, minWidth: 220 }}>
                  <label style={lbl}>Mots-clés (recherche, séparés par des virgules)</label>
                  <input value={form.motsCles} onChange={(e) => setForm({ ...form, motsCles: e.target.value })} placeholder="stock, transfert, labo…" style={inp} />
                </div>
              </div>

              <label style={lbl}>Contenu * (markdown)</label>
              {preview ? (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 9, padding: '16px 18px', minHeight: 280, maxHeight: 440, overflowY: 'auto', background: '#fff' }}>
                  <MarkdownView content={form.contenu} />
                </div>
              ) : (
                <textarea
                  value={form.contenu}
                  onChange={(e) => setForm({ ...form, contenu: e.target.value })}
                  rows={16}
                  placeholder={'## 🔁 Titre de la section\n\nParagraphe…\n\n- point 1\n- point 2\n\n:::astuce\nUne astuce utile.\n:::'}
                  style={{ ...inp, resize: 'vertical', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.82rem', lineHeight: 1.6 }}
                />
              )}
              <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.6 }}>{MD_HELP}</p>

              <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
                  Active (visible dans le manuel)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.visibleGerant} onChange={(e) => setForm({ ...form, visibleGerant: e.target.checked })} />
                  Visible par les gérants
                </label>
              </div>

              {err && <div style={{ marginTop: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '0.84rem' }}>{err}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowForm(false)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
                <button onClick={save} disabled={saving} style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 22px', fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
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
