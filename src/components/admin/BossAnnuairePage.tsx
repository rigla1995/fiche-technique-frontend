import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AnnuaireRow {
  id: number;
  nom: string;
  email: string;
  role: 'client' | 'gerant' | 'acheteur';
  actif: boolean;
  parentNom: string | null;
  motDePasseHash: string | null;
  revealable: boolean;
  createdAt: string;
}

const apiErr = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

const ROLE_LABEL: Record<string, string> = { client: 'Client', gerant: 'Gérant', acheteur: 'Acheteur' };
const ROLE_FILTERS = [
  { key: '', label: 'Tous' },
  { key: 'client', label: 'Clients' },
  { key: 'gerant', label: 'Gérants' },
  { key: 'acheteur', label: 'Acheteurs' },
];

export default function BossAnnuairePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<AnnuaireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cryptoConfigured, setCryptoConfigured] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');

  // Flux de révélation
  const [target, setTarget] = useState<AnnuaireRow | null>(null);
  const [step, setStep] = useState<'code' | 'shown'>('code');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealError, setRevealError] = useState('');
  const [plaintext, setPlaintext] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  const closeReveal = useCallback(() => {
    setTarget(null); setStep('code'); setCode(''); setSentTo('');
    setRevealError(''); setPlaintext(''); setSecondsLeft(0); setBusy(false);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (role) params.set('role', role);
    api.get(`/api/boss/annuaire?${params.toString()}`)
      .then(({ data }) => { setItems(data.items || []); setCryptoConfigured(!!data.cryptoConfigured); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, role]);

  useEffect(() => {
    const h = window.setTimeout(load, 300);
    return () => window.clearTimeout(h);
  }, [load]);

  // Compte à rebours d'affichage du mot de passe en clair (masqué à 0).
  useEffect(() => {
    if (step !== 'shown') return;
    if (secondsLeft <= 0) { closeReveal(); return; }
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [step, secondsLeft, closeReveal]);

  if (user && user.role !== 'boss') return <Navigate to="/admin/dashboard" replace />;

  const requestCode = async (row: AnnuaireRow) => {
    setTarget(row); setStep('code'); setCode(''); setRevealError(''); setPlaintext(''); setBusy(true);
    try {
      const { data } = await api.post('/api/boss/reveal/request', { targetUserId: row.id });
      setSentTo(data.to || '');
    } catch (err) {
      setRevealError(apiErr(err) || 'Impossible d\'envoyer le code.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!target || !/^\d{6}$/.test(code)) { setRevealError('Entrez le code à 6 chiffres.'); return; }
    setBusy(true); setRevealError('');
    try {
      const { data } = await api.post('/api/boss/reveal/verify', { targetUserId: target.id, code });
      setPlaintext(data.password);
      setSecondsLeft(data.expiresInSec || 120);
      setStep('shown');
    } catch (err) {
      setRevealError(apiErr(err) || 'Code incorrect.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '8px 4px 40px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>🔑 Annuaire identifiants</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 16px' }}>
        Emails et mots de passe (hashés) des comptes clients, gérants et acheteurs. Révélation d'un mot de passe protégée par code envoyé à votre email.
      </p>

      {!cryptoConfigured && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem' }}>
          ⚠️ La clé de chiffrement <code>PASSWORD_ENC_KEY</code> n'est pas configurée sur le serveur — aucune révélation n'est possible.
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input
          style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
          placeholder="Rechercher un nom ou un email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setRole(f.key)}
              className="btn btn-sm"
              style={{
                background: role === f.key ? '#4338ca' : '#eef2ff',
                color: role === f.key ? '#fff' : '#4338ca', fontWeight: 600,
              }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th style={{ padding: '10px 14px' }}>Nom</th>
              <th style={{ padding: '10px 14px' }}>Email</th>
              <th style={{ padding: '10px 14px' }}>Rôle</th>
              <th style={{ padding: '10px 14px' }}>Mot de passe (hashé)</th>
              <th style={{ padding: '10px 14px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Chargement…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Aucun compte.</td></tr>
            ) : items.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a' }}>
                  {r.nom}
                  {r.parentNom && <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>↳ {r.parentNom}</div>}
                </td>
                <td style={{ padding: '11px 14px', color: '#475569' }}>{r.email}</td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
                    {ROLE_LABEL[r.role] || r.role}
                  </span>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <code style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {r.motDePasseHash ? `${r.motDePasseHash.slice(0, 22)}…` : '— (non défini)'}
                  </code>
                </td>
                <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                  {r.revealable ? (
                    <button className="btn btn-sm" style={{ background: '#4338ca', color: '#fff', fontWeight: 600 }} onClick={() => requestCode(r)}>
                      👁 Révéler
                    </button>
                  ) : (
                    <span title="Mot de passe défini avant l'activation de la fonction — non récupérable." style={{ fontSize: '0.74rem', color: '#cbd5e1', cursor: 'help' }}>
                      non récupérable
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de révélation */}
      {target && (
        <div
          onClick={closeReveal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 420, maxWidth: '100%', padding: 26, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', marginBottom: 4 }}>
              {step === 'shown' ? '🔓 Mot de passe' : '🔐 Vérification requise'}
            </div>
            <div style={{ fontSize: '0.84rem', color: '#64748b', marginBottom: 18 }}>
              {target.nom} — {target.email}
            </div>

            {step === 'code' ? (
              <>
                <p style={{ fontSize: '0.86rem', color: '#334155', lineHeight: 1.6, margin: '0 0 16px' }}>
                  Un code de vérification à 6 chiffres a été envoyé à <strong>{sentTo || 'votre email'}</strong>. Saisissez-le pour afficher le mot de passe.
                </p>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter') verifyCode(); }}
                  placeholder="______"
                  inputMode="numeric"
                  style={{ width: '100%', textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.4rem', fontWeight: 800, padding: '12px', borderRadius: 10, border: '1px solid #cbd5e1', boxSizing: 'border-box', marginBottom: 12 }}
                />
                {revealError && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: 12 }}>{revealError}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={verifyCode} disabled={busy || code.length !== 6}>
                    {busy ? 'Vérification…' : 'Valider'}
                  </button>
                  <button className="btn btn-ghost" onClick={closeReveal}>Annuler</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all' }}>
                    {plaintext}
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.82rem', color: '#dc2626', fontWeight: 600, marginBottom: 16 }}>
                  ⏳ Masqué dans {secondsLeft}s
                </div>
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={closeReveal}>Fermer maintenant</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
