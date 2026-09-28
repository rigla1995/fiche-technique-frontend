import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import type { DomaineProfil } from '../../types';
import HistoryFilterBar, { FilterField, FilterInput } from '../common/HistoryFilterBar';
import { useConfirm } from '../common/ConfirmDialog';

const ACCENT = '#b45309';
const ACCENT_DARK = '#78350f';

type ApiErr = { response?: { status?: number; data?: { message?: string; code?: string; nbClients?: number; nbSurcharges?: number } } };

/** Slug généré depuis le nom (minuscules, accents translittérés, [^a-z0-9]+ → '-'). */
function slugify(nom: string): string {
  return nom
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export default function AdminDomainesPage() {
  const navigate = useNavigate();
  const [domaines, setDomaines] = useState<DomaineProfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouche, setSlugTouche] = useState(false);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { confirm, alerte } = useConfirm();

  const load = () => {
    setLoading(true);
    api.get('/api/domaines')
      .then(({ data }) => setDomaines(Array.isArray(data) ? data : []))
      .catch(() => setDomaines([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setNom(''); setSlug(''); setSlugTouche(false); setDescription(''); setErr(''); setShowForm(true); };

  const onNomChange = (val: string) => {
    setNom(val);
    if (!slugTouche) setSlug(slugify(val));
  };

  const save = async () => {
    if (!nom.trim()) { setErr('Nom requis.'); return; }
    const slugFinal = slug.trim() || slugify(nom);
    if (slugFinal && !/^[a-z0-9-]{2,50}$/.test(slugFinal)) { setErr('Slug invalide : lettres minuscules, chiffres et tirets (2 à 50 caractères).'); return; }
    setSaving(true); setErr('');
    try {
      const { data } = await api.post('/api/domaines', { nom: nom.trim(), slug: slugFinal || undefined, description: description.trim() || undefined });
      setShowForm(false);
      const newId = (data as { id?: number } | undefined)?.id;
      if (newId) navigate(`/admin/domaines/${newId}`);
      else load();
    } catch (e: unknown) {
      const r = (e as ApiErr)?.response;
      setErr(r?.status === 409
        ? (r.data?.message || 'Un domaine porte déjà ce nom ou ce slug.')
        : (r?.data?.message || "Erreur lors de l'enregistrement."));
    } finally { setSaving(false); }
  };

  const remove = async (d: DomaineProfil) => {
    const ok = await confirm({
      title: `Supprimer le domaine « ${d.nom} » ?`,
      message: 'Les composants du domaine seront supprimés avec lui. Un domaine utilisé par un compte ou portant des surcharges tarifaires ne peut pas être supprimé.',
      tone: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/domaines/${d.id}`);
      setDomaines((prev) => prev.filter((x) => x.id !== d.id));
    } catch (e: unknown) {
      const r = (e as ApiErr)?.response;
      if (r?.status === 409) {
        const nbClients = r.data?.nbClients ?? d.nbClients ?? 0;
        const nbSurcharges = r.data?.nbSurcharges ?? 0;
        alerte({
          title: 'Suppression impossible',
          message: `Domaine utilisé par ${nbClients} compte${nbClients !== 1 ? 's' : ''} et ${nbSurcharges} surcharge${nbSurcharges !== 1 ? 's' : ''} tarifaire${nbSurcharges !== 1 ? 's' : ''}. Rattachez les comptes à un autre domaine et supprimez les surcharges avant de le supprimer.`,
          tone: 'danger',
        });
        return;
      }
      alerte({ title: 'Suppression impossible', message: r?.data?.message || 'Suppression impossible.', tone: 'danger' });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return domaines.filter((d) => !q || d.nom.toLowerCase().includes(q) || (d.slug || '').toLowerCase().includes(q));
  }, [domaines, search]);

  const totalClients = domaines.reduce((s, d) => s + (d.nbClients || 0), 0);

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #451a03 0%, #b45309 55%, #f59e0b 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(180,83,9,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 11, padding: '8px 10px', fontSize: '1.3rem', lineHeight: 1 }}>🗂️</div>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff', margin: 0 }}>Domaines d'activités</h1>
            <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.82rem', margin: '4px 0 0' }}>Profils métier : composants, lexique, règles et grille tarifaire par domaine</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 76 }}>
            <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{domaines.length}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>domaine{domaines.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 76 }}>
            <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{totalClients}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>compte{totalClients !== 1 ? 's' : ''} rattaché{totalClients !== 1 ? 's' : ''}</div>
          </div>
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
          <FilterInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou slug du domaine…" />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map((d) => {
            const nbComposants = (d.composants || []).filter((c) => c.actif !== false).length;
            const nbClients = d.nbClients || 0;
            return (
              <div
                key={d.id}
                onClick={() => navigate(`/admin/domaines/${d.id}`)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `4px solid ${ACCENT}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', transition: 'transform 0.12s, box-shadow 0.12s' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 22px rgba(180,83,9,0.16)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🗂️</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nom}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{d.slug || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => navigate(`/admin/domaines/${d.id}`)} title="Modifier le profil" style={iconBtn}>✏️</button>
                    <button onClick={() => remove(d)} title="Supprimer" style={iconBtn}>🗑</button>
                  </div>
                </div>
                {d.description && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.description}</div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                  <span style={chip('#fef3c7', '#92400e')}>🧩 {nbComposants} composant{nbComposants !== 1 ? 's' : ''}</span>
                  <span style={chip(nbClients > 0 ? '#dcfce7' : '#f1f5f9', nbClients > 0 ? '#166534' : '#64748b')}>👥 {nbClients} client{nbClients !== 1 ? 's' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal création */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(69,26,3,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, padding: '18px 24px' }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>Nouveau domaine</h2>
              <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>Le domaine est créé avec 4 composants identité (Activité, Labo, Gérant, Base acheteurs) que vous pourrez adapter ensuite.</p>
            </div>
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Nom du domaine *</label>
                <input value={nom} autoFocus onChange={(e) => onNomChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder="ex : Hôtellerie" style={inp} />
              </div>
              <div>
                <label style={lbl}>Slug (identifiant technique)</label>
                <input value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouche(true); }} placeholder="généré depuis le nom" style={{ ...inp, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>Minuscules, chiffres et tirets. Unique.</div>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Courte description affichée au choix du domaine (wizard client)" rows={3} style={{ ...inp, resize: 'vertical' }} />
              </div>
              {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '0.84rem' }}>{err}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button onClick={() => setShowForm(false)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
                <button onClick={save} disabled={saving} style={{ background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 22px', fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Création…' : 'Créer le domaine'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const chip = (bg: string, color: string): React.CSSProperties => ({ fontSize: '0.74rem', fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: bg, color });
const iconBtn: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: '0.9rem' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box' };
