import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../common/ConfirmDialog';

interface AdminRow {
  id: number;
  nom: string;
  email: string;
  role: 'super_admin' | 'boss';
  actif: boolean;
  createdAt: string;
  isSelf?: boolean;
}

const apiErr = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box',
};

export default function BossAdminsPage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/boss/admins')
      .then(({ data }) => setRows(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (user && user.role !== 'boss') return <Navigate to="/admin/dashboard" replace />;

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    window.setTimeout(() => setMsg(null), 4500);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/api/boss/admins', { nom, email, password });
      setNom(''); setEmail(''); setPassword('');
      flash('ok', 'Compte super admin créé.');
      load();
    } catch (err) {
      flash('err', apiErr(err) || 'Échec de la création.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (r: AdminRow) => { setEditId(r.id); setEditEmail(r.email); setEditPassword(''); };

  const saveEdit = async (id: number) => {
    const body: { email?: string; password?: string } = {};
    if (editEmail) body.email = editEmail;
    if (editPassword) body.password = editPassword;
    if (!body.email && !body.password) { setEditId(null); return; }
    try {
      await api.put(`/api/boss/admins/${id}`, body);
      setEditId(null);
      flash('ok', 'Compte mis à jour.');
      load();
    } catch (err) {
      flash('err', apiErr(err) || 'Échec de la mise à jour.');
    }
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

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '8px 4px 40px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>🛡️ Comptes Admin</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 20px' }}>
        Gestion des comptes super administrateur (réservé au Boss).
      </p>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.86rem', fontWeight: 600,
          background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'ok' ? '#166534' : '#991b1b',
        }}>{msg.text}</div>
      )}

      {/* Création */}
      <form onSubmit={create} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Créer un super admin</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
          <input style={inputStyle} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
          <input style={inputStyle} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={inputStyle} placeholder="Mot de passe" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 12 }}>
          Min. 8 caractères, avec majuscule, minuscule, chiffre et caractère spécial.
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
          {creating ? 'Création…' : '＋ Créer le compte'}
        </button>
      </form>

      {/* Liste */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Aucun compte.</div>
        ) : rows.map((r) => (
          <div key={r.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '14px 18px' }}>
            {editId === r.id ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <input style={{ ...inputStyle, maxWidth: 240 }} type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" />
                <input style={{ ...inputStyle, maxWidth: 240 }} type="text" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Nouveau mot de passe (optionnel)" />
                <button className="btn btn-primary btn-sm" onClick={() => saveEdit(r.id)}>Enregistrer</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Annuler</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>
                    {r.nom}
                    <span style={{
                      marginLeft: 8, fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: 20,
                      background: r.role === 'boss' ? '#ede9fe' : '#e0e7ff',
                      color: r.role === 'boss' ? '#6d28d9' : '#3730a3',
                    }}>{r.role === 'boss' ? 'BOSS' : 'SUPER ADMIN'}</span>
                    {r.isSelf && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#94a3b8' }}>(vous)</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.email}</div>
                </div>
                {r.role === 'super_admin' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)}>✏️ Modifier</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => remove(r)}>🗑️ Supprimer</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
