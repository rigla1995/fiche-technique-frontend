import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Gerant, Activite, Labo, AbonnementConfig } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface GerantForm {
  nom: string;
  telephone: string;
  email: string;
  activiteId: string;
  activiteType: 'franchise' | 'labo' | 'activite_distincte' | '';
  franchiseGroup: string;
}

const EMPTY_FORM: GerantForm = { nom: '', telephone: '', email: '', activiteId: '', activiteType: '', franchiseGroup: '' };

export default function GerantsPage() {
  const { user } = useAuth();
  const isEntreprise = user?.compteType === 'entreprise' || !user?.compteType;

  const [gerants, setGerants] = useState<Gerant[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GerantForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [inviteSent, setInviteSent] = useState<{ nom: string; email: string } | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [abonnementConfig, setAbonnementConfig] = useState<AbonnementConfig | null>(null);

  const freeLimit = isEntreprise ? 3 : 1;
  const freeCount = gerants.filter((g) => g.estGratuit).length;
  const canAddFree = freeCount < freeLimit;
  const maxGerants = abonnementConfig?.nbGerants ?? null;
  const atGerantLimit = maxGerants !== null && gerants.length >= maxGerants;

  useEffect(() => {
    const calls: Promise<unknown>[] = [
      api.get('/api/abonnements/gerants'),
      api.get('/api/abonnements/mon-abonnement').catch(() => null),
    ];
    if (isEntreprise) {
      calls.push(api.get('/api/entreprise/activites'));
      calls.push(api.get('/api/labo/'));
    }
    Promise.all(calls).then(([gerantRes, aboRes, activiteRes, laboRes]) => {
      setGerants((gerantRes as { data: Gerant[] }).data);
      if ((aboRes as { data?: { config?: AbonnementConfig } } | null)?.data?.config) {
        setAbonnementConfig((aboRes as { data: { config: AbonnementConfig } }).data.config);
      }
      if (activiteRes) setActivites((activiteRes as { data: Activite[] }).data || []);
      if (laboRes) setLabos((laboRes as { data: Labo[] }).data || []);
    }).finally(() => setLoading(false));
  }, [isEntreprise]);

  const submitForm = async () => {
    if (!form.nom || !form.telephone || !form.email) { setError('Nom, téléphone et email requis'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/abonnements/gerants', {
        nom: form.nom,
        telephone: form.telephone,
        email: form.email,
        activiteId: form.activiteId ? Number(form.activiteId) : undefined,
        activiteType: form.activiteType || undefined,
      });
      setGerants((g) => [...g, res.data]);
      setInviteSent({ nom: res.data.nom, email: res.data.email });
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const toggleActif = async (g: Gerant) => {
    await api.put(`/api/abonnements/gerants/${g.id}`, { actif: !g.actif });
    setGerants((gs) => gs.map((x) => x.id === g.id ? { ...x, actif: !g.actif } : x));
  };

  const deleteGerant = async (id: number) => {
    if (!confirm('Supprimer ce gérant ?')) return;
    await api.delete(`/api/abonnements/gerants/${id}`);
    setGerants((gs) => gs.filter((g) => g.id !== id));
  };

  const handleResendInvite = async (id: number, email: string) => {
    setResendingId(id);
    try {
      await api.post(`/auth/invite/resend/${id}`);
      alert(`Invitation renvoyée à ${email}`);
    } catch {
      alert('Erreur lors de l\'envoi');
    } finally {
      setResendingId(null);
    }
  };

  const activiteLabel = (g: Gerant) => {
    if (!g.activiteId) return '—';
    if (g.activiteType === 'labo') {
      const l = labos.find((x) => x.id === g.activiteId);
      return l ? `Labo : ${l.nom}` : `Labo #${g.activiteId}`;
    }
    const a = activites.find((x) => x.id === g.activiteId);
    return a ? `${g.activiteType === 'franchise' ? 'Franchise' : 'Distincte'} : ${a.nom}` : `Activité #${g.activiteId}`;
  };

  const activeCount = gerants.filter((g) => g.actif).length;
  const pendingInvites = gerants.filter((g) => !g.activatedAt).length;

  return (
    <div className="page">
      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #0369a1 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(3,105,161,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>👥</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Comptes gérants</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: 0 }}>
            Gérez les accès de vos collaborateurs à leurs espaces activités
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {maxGerants !== null && (
            <div style={{
              background: atGerantLimit ? '#fef2f2' : '#f0fdf4',
              borderRadius: 12, padding: '10px 20px', textAlign: 'center', minWidth: 90,
              border: `1px solid ${atGerantLimit ? '#fecaca' : '#bbf7d0'}`,
            }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Gérants</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: atGerantLimit ? '#dc2626' : '#16a34a', lineHeight: 1 }}>
                {gerants.length}<span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280' }}> / {maxGerants}</span>
              </div>
            </div>
          )}
          {activeCount > 0 && (
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: '10px 20px', textAlign: 'center', minWidth: 80, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Actifs</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1e40af', lineHeight: 1 }}>{activeCount}</div>
            </div>
          )}
          {atGerantLimit ? (
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 16px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)' }}>
              🔒 Limite atteinte ({maxGerants})
            </div>
          ) : (
            <button onClick={() => { setShowForm(true); setInviteSent(null); setError(''); }}
              style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.25)' } as React.CSSProperties}>
              + Nouveau gérant
            </button>
          )}
        </div>
      </div>

      {/* Invite sent banner */}
      {inviteSent && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.2rem' }}>✉️</span>
            <span style={{ color: '#166534', fontWeight: 600, fontSize: '0.88rem' }}>
              Invitation envoyée à <strong>{inviteSent.nom}</strong> ({inviteSent.email}) — le compte sera activé dès qu'il cliquera sur le lien.
            </span>
          </div>
          <button onClick={() => setInviteSent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: '1rem', padding: 4 }}>✕</button>
        </div>
      )}

      {pendingInvites > 0 && !inviteSent && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
          ⏳ {pendingInvites} invitation{pendingInvites > 1 ? 's' : ''} en attente d'activation
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 24 }}>
          <div style={{ background: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', padding: '14px 20px', borderBottom: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>👤</span>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0369a1' }}>
              Nouveau gérant {!canAddFree ? '— payant (80 DT/mois)' : '— inclus dans votre abonnement'}
            </span>
          </div>
          <div style={{ padding: '20px' }}>
            {!canAddFree && (
              <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', color: '#92400e', marginBottom: 16 }}>
                ⚠ Vous avez atteint la limite de {freeLimit} gérant(s) gratuit(s). Ce compte sera facturé <strong>80 DT/mois</strong> et nécessite une validation admin.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Nom *</label>
                <input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} style={inp} placeholder="Nom complet" />
              </div>
              <div>
                <label style={lbl}>Téléphone *</label>
                <input value={form.telephone} onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))} style={inp} placeholder="+216 …" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={inp} placeholder="email@exemple.com" />
              </div>
              {isEntreprise && (
                <>
                  <div>
                    <label style={lbl}>Type d'activité assignée</label>
                    <select value={form.activiteType} onChange={(e) => setForm((f) => ({ ...f, activiteType: e.target.value as GerantForm['activiteType'], activiteId: '', franchiseGroup: '' }))} style={inp}>
                      <option value="">— Sélectionner —</option>
                      <option value="franchise">Franchise</option>
                      <option value="activite_distincte">Activité distincte</option>
                      <option value="labo">Labo</option>
                    </select>
                  </div>
                  {form.activiteType === 'franchise' && (() => {
                    const groups = Array.from(new Set(activites.filter((a) => a.type === 'franchise').map((a) => (a as any).franchiseGroup || a.nom))).sort();
                    return groups.length > 1 ? (
                      <div>
                        <label style={lbl}>Groupe Franchise</label>
                        <select value={form.franchiseGroup} onChange={(e) => setForm((f) => ({ ...f, franchiseGroup: e.target.value, activiteId: '' }))} style={inp}>
                          <option value="">— Tous les groupes —</option>
                          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    ) : null;
                  })()}
                  {form.activiteType && (
                    <div>
                      <label style={lbl}>{form.activiteType === 'labo' ? 'Labo' : 'Activité'}</label>
                      <select value={form.activiteId} onChange={(e) => setForm((f) => ({ ...f, activiteId: e.target.value }))} style={inp}>
                        <option value="">— Sélectionner —</option>
                        {form.activiteType === 'labo'
                          ? labos.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)
                          : activites.filter((a) => a.type === (form.activiteType === 'franchise' ? 'franchise' : 'distincte'))
                              .filter((a) => !form.franchiseGroup || ((a as any).franchiseGroup || a.nom) === form.franchiseGroup)
                              .map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)
                        }
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 13px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 14 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submitForm} disabled={saving}
                style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg,#1e3a5f,#0369a1)', color: saving ? '#9ca3af' : '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Création…' : '✓ Créer et envoyer l\'invitation'}
              </button>
              <button onClick={() => { setShowForm(false); setError(''); setForm(EMPTY_FORM); }}
                style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Gérants list ── */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 60 }}>Chargement…</div>
      ) : gerants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 56, background: '#f8fafc', borderRadius: 18, border: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: '3rem', marginBottom: 14 }}>👥</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', marginBottom: 8 }}>Aucun compte gérant</div>
          <p style={{ fontSize: '0.86rem', color: '#6b7280', lineHeight: 1.7, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
            {maxGerants !== null
              ? `Votre abonnement inclut ${maxGerants} compte(s) gérant. Créez un premier compte pour donner accès à un collaborateur.`
              : 'Créez un compte gérant pour donner accès à un collaborateur.'}
          </p>
          {!atGerantLimit && (
            <button onClick={() => { setShowForm(true); setInviteSent(null); setError(''); }}
              style={{ padding: '11px 28px', background: 'linear-gradient(135deg,#1e3a5f,#0369a1)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              + Créer un gérant
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gerants.map((g) => {
            const initials = g.nom.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
            return (
              <div key={g.id} style={{
                background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${g.actif ? '#22c55e' : '#e5e7eb'}`,
                padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                {/* Avatar */}
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: g.actif ? 'linear-gradient(135deg,#1e3a5f,#0369a1)' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, color: g.actif ? '#fff' : '#6b7280', flexShrink: 0 }}>
                  {initials}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>{g.nom}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: g.actif ? '#dcfce7' : '#fee2e2', color: g.actif ? '#166534' : '#991b1b' }}>
                      {g.actif ? '● Actif' : '○ Inactif'}
                    </span>
                    {!g.activatedAt && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>⏳ Invitation en attente</span>
                    )}
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: g.estGratuit ? '#eff6ff' : '#fefce8', color: g.estGratuit ? '#1d4ed8' : '#854d0e' }}>
                      {g.estGratuit ? 'Gratuit' : `${g.montantMensuel} DT/mois`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    📧 {g.email}{g.telephone ? ` · 📞 ${g.telephone}` : ''}
                  </div>
                  {isEntreprise && g.activiteId && (
                    <div style={{ fontSize: '0.78rem', color: '#7c3aed', marginTop: 3, fontWeight: 600 }}>📍 {activiteLabel(g)}</div>
                  )}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                  {!g.activatedAt && (
                    <button onClick={() => handleResendInvite(g.id, g.email)} disabled={resendingId === g.id}
                      style={{ padding: '6px 12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', color: '#4338ca', fontWeight: 700 }}>
                      {resendingId === g.id ? '…' : '✉️ Renvoyer'}
                    </button>
                  )}
                  <button onClick={() => toggleActif(g)}
                    style={{ padding: '6px 12px', background: g.actif ? '#fff' : '#f0fdf4', border: `1px solid ${g.actif ? '#e2e8f0' : '#bbf7d0'}`, borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', color: g.actif ? '#374151' : '#166534', fontWeight: 700 }}>
                    {g.actif ? '⏸ Désactiver' : '▶ Activer'}
                  </button>
                  <button onClick={() => deleteGerant(g.id)}
                    style={{ padding: '6px 12px', background: '#fff', border: '1px solid #fecdd3', borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', color: '#be123c', fontWeight: 700 }}>
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
