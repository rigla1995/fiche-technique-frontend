import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../common/ConfirmDialog';
import Pagination from '../common/Pagination';

const PER_PAGE = 10;

interface AdminRow {
  id: number;
  nom: string;
  email: string;
  role: 'super_admin' | 'boss';
  actif: boolean;
  createdAt: string;
  isSelf?: boolean;
}

type ModalState = null | { mode: 'create' } | { mode: 'edit'; admin: AdminRow };

const apiErr = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box',
  outline: 'none', background: '#f8fafc', color: '#0f172a',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569',
  marginBottom: 6, letterSpacing: '0.02em',
};
const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = '#6366f1';
  e.currentTarget.style.background = '#fff';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
};
const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = '#e2e8f0';
  e.currentTarget.style.background = '#f8fafc';
  e.currentTarget.style.boxShadow = 'none';
};

// ── Modal ajout / modification — même esprit que les modals de l'app ──────────
function AdminModal({ state, onClose, onSaved }: {
  state: Exclude<ModalState, null>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = state.mode === 'edit';
  const [nom, setNom] = useState(isEdit ? state.admin.nom : '');
  const [email, setEmail] = useState(isEdit ? state.admin.email : '');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isEdit) {
        const body: { email?: string; password?: string } = {};
        if (email && email !== state.admin.email) body.email = email;
        if (password) body.password = password;
        if (!body.email && !body.password) { onClose(); return; }
        await api.put(`/api/boss/admins/${state.admin.id}`, body);
        onSaved('Compte mis à jour.');
      } else {
        await api.post('/api/boss/admins', { nom, email, password });
        onSaved('Compte super admin créé.');
      }
    } catch (err) {
      setError(apiErr(err) || 'Échec de l\'enregistrement.');
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: 440, maxWidth: '100%', boxShadow: '0 24px 70px rgba(15,23,42,0.35)', overflow: 'hidden' }}>
        {/* En-tête */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}>
            {isEdit ? '✏️' : '🛡️'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
              {isEdit ? 'Modifier le compte admin' : 'Ajouter un compte admin'}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
              {isEdit ? state.admin.nom : 'Nouveau super administrateur'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748b', fontSize: '0.9rem', fontWeight: 700 }}>
            ✕
          </button>
        </div>

        {/* Corps */}
        <form onSubmit={submit} style={{ padding: '20px 24px 24px' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '10px 13px', fontSize: '0.82rem', marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          {!isEdit && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Nom</label>
              <input style={inputStyle} value={nom} onChange={(e) => setNom(e.target.value)}
                onFocus={onFocus} onBlur={onBlur} required autoFocus placeholder="Nom et prénom" />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Adresse email</label>
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onFocus={onFocus} onBlur={onBlur} required={!isEdit} placeholder="admin@labflow-tn.com" autoFocus={isEdit} />
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>{isEdit ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inputStyle, paddingRight: 42 }} type={showPwd ? 'text' : 'password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                onFocus={onFocus} onBlur={onBlur} required={!isEdit}
                placeholder={isEdit ? 'Laisser vide pour ne pas changer' : '••••••••'} />
              <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                aria-label={showPwd ? 'Masquer' : 'Afficher'}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, fontSize: '0.9rem' }}>
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0 0 20px' }}>
            Min. 8 caractères — majuscule, minuscule, chiffre et caractère spécial.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={busy}>
              Annuler
            </button>
            <button type="submit" disabled={busy}
              style={{
                flex: 2, padding: '11px', border: 'none', borderRadius: 10, color: '#fff',
                fontWeight: 800, fontSize: '0.9rem', cursor: busy ? 'wait' : 'pointer',
                background: 'linear-gradient(135deg,#4338ca,#6366f1)',
                boxShadow: '0 8px 20px rgba(67,56,202,0.3)', opacity: busy ? 0.7 : 1,
              }}>
              {busy ? 'Enregistrement…' : isEdit ? 'Enregistrer' : '＋ Créer le compte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BossAdminsPage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'super_admin' | 'boss'>('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/boss/admins')
      .then(({ data }) => setRows(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, roleFilter]);

  const filtered = useMemo(() => {
    let list = roleFilter ? rows.filter((r) => r.role === roleFilter) : rows;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.nom.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
    return list;
  }, [rows, search, roleFilter]);

  if (user && user.role !== 'boss') return <Navigate to="/admin/dashboard" replace />;

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    window.setTimeout(() => setMsg(null), 4500);
  };

  const onSaved = (text: string) => {
    setModal(null);
    flash('ok', text);
    load();
  };

  const remove = async (r: AdminRow) => {
    const ok = await confirm({
      title: `Supprimer ${r.nom} ?`,
      message: `Le compte super admin « ${r.email} » sera définitivement supprimé.`,
      confirmLabel: 'Supprimer', tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/boss/admins/${r.id}`);
      flash('ok', 'Compte supprimé.');
      load();
    } catch (err) {
      flash('err', apiErr(err) || 'Échec de la suppression.');
    }
  };

  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const pills: { value: '' | 'super_admin' | 'boss'; label: string; count: number }[] = [
    { value: '', label: 'Tous', count: rows.length },
    { value: 'super_admin', label: '🛡️ Super admins', count: rows.filter(r => r.role === 'super_admin').length },
    { value: 'boss', label: '👑 Boss', count: rows.filter(r => r.role === 'boss').length },
  ];

  return (
    <div className="page">
      {modal && <AdminModal state={modal} onClose={() => setModal(null)} onSaved={onSaved} />}

      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #6366f1 100%)',
        borderRadius: 18, padding: '20px 24px', marginBottom: 18,
        boxShadow: '0 8px 32px rgba(49,46,129,0.28)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '8px 11px', fontSize: '1.3rem' }}>🛡️</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1 }}>Comptes Admin</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5, maxWidth: 620 }}>
            Créez, modifiez ou supprimez les comptes super administrateur. Espace réservé au compte Boss.
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#c7d2fe', lineHeight: 1 }}>{rows.length}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>Comptes</div>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: '0.86rem', fontWeight: 600,
          background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'ok' ? '#166534' : '#991b1b',
        }}>{msg.text}</div>
      )}

      {/* ── Barre filtres + action ── */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '12px 16px',
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        boxShadow: '0 2px 12px rgba(15,23,42,0.05)',
      }}>
        {pills.map(({ value, label, count }) => {
          const active = roleFilter === value;
          return (
            <button key={value || 'tous'} onClick={() => setRoleFilter(value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 20,
                border: `1.5px solid ${active ? '#4338ca' : '#e5e7eb'}`,
                background: active ? '#4338ca' : '#fff',
                color: active ? '#fff' : '#475569',
                fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {label}
              <span style={{
                fontSize: '0.68rem', fontWeight: 800, padding: '1px 7px', borderRadius: 10,
                background: active ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                color: active ? '#fff' : '#64748b',
              }}>{count}</span>
            </button>
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 Nom ou email…"
          style={{
            flex: 1, minWidth: 180, marginLeft: 'auto',
            padding: '8px 13px', borderRadius: 20, border: '1.5px solid #e5e7eb',
            fontSize: '0.8rem', color: '#334155', outline: 'none',
          }}
        />
        <button onClick={() => setModal({ mode: 'create' })}
          style={{
            padding: '9px 18px', border: 'none', borderRadius: 10, color: '#fff',
            fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap',
            background: 'linear-gradient(135deg,#4338ca,#6366f1)',
            boxShadow: '0 6px 16px rgba(67,56,202,0.3)',
          }}>
          ＋ Ajouter un compte admin
        </button>
      </div>

      {/* ── Liste ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            {rows.length === 0 ? 'Aucun compte.' : 'Aucun compte ne correspond au filtre.'}
          </div>
        ) : paged.map((r) => (
          <div key={r.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              background: r.role === 'boss' ? 'linear-gradient(135deg,#ede9fe,#ddd6fe)' : 'linear-gradient(135deg,#eef2ff,#e0e7ff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
            }}>
              {r.role === 'boss' ? '👑' : '🛡️'}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>
                {r.nom}
                <span style={{
                  marginLeft: 8, fontSize: '0.64rem', fontWeight: 800, padding: '2px 8px', borderRadius: 20,
                  background: r.role === 'boss' ? '#ede9fe' : '#e0e7ff',
                  color: r.role === 'boss' ? '#6d28d9' : '#3730a3',
                }}>{r.role === 'boss' ? 'BOSS' : 'SUPER ADMIN'}</span>
                {r.isSelf && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#94a3b8' }}>(vous)</span>}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{r.email}</div>
            </div>
            {r.role === 'super_admin' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ mode: 'edit', admin: r })}>✏️ Modifier</button>
                <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => remove(r)}>🗑️ Supprimer</button>
              </div>
            )}
          </div>
        ))}
        {filtered.length > PER_PAGE && (
          <Pagination total={filtered.length} page={safePage} perPage={PER_PAGE} onChange={setPage} />
        )}
      </div>
    </div>
  );
}
