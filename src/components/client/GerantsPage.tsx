import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Gerant, Activite, Labo, AbonnementConfig } from '../../types';
import { useEmailCheck } from '../../hooks/useEmailCheck';
import { useConfirm } from '../common/ConfirmDialog';

interface GerantForm {
  nom: string;
  telephone: string;
  email: string;
  activiteIds: number[];
  laboIds: number[];
  accesAcheteurs: boolean;
}

const EMPTY_FORM: GerantForm = { nom: '', telephone: '', email: '', activiteIds: [], laboIds: [], accesAcheteurs: false };

export default function GerantsPage() {
  const [gerants, setGerants] = useState<Gerant[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<GerantForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [inviteSent, setInviteSent] = useState<{ nom: string; email: string } | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [abonnementConfig, setAbonnementConfig] = useState<AbonnementConfig | null>(null);
  const [moduleAcheteursActif, setModuleAcheteursActif] = useState(false);
  // L'email n'est pas éditable : le contrôle d'unicité ne sert qu'à la création.
  const { emailExists: gerantEmailExists, emailChecking: gerantEmailChecking } = useEmailCheck(editingId ? '' : form.email);
  const { confirm } = useConfirm();

  const freeLimit = 3;
  const freeCount = gerants.filter((g) => g.estGratuit).length;
  const canAddFree = freeCount < freeLimit;
  const maxGerants = abonnementConfig?.nbGerants ?? null;
  const atGerantLimit = maxGerants !== null && gerants.length >= maxGerants;

  useEffect(() => {
    const calls: Promise<unknown>[] = [
      api.get('/api/abonnements/gerants'),
      api.get('/api/abonnements/mon-abonnement').catch(() => null),
      api.get('/api/entreprise/activites'),
      api.get('/api/labo/'),
      api.get('/api/entreprise').catch(() => null),
    ];
    Promise.all(calls).then(([gerantRes, aboRes, activiteRes, laboRes, entRes]) => {
      setGerants((gerantRes as { data: Gerant[] }).data);
      if ((aboRes as { data?: { config?: AbonnementConfig } } | null)?.data?.config) {
        setAbonnementConfig((aboRes as { data: { config: AbonnementConfig } }).data.config);
      }
      if (activiteRes) setActivites((activiteRes as { data: Activite[] }).data || []);
      if (laboRes) setLabos((laboRes as { data: Labo[] }).data || []);
      setModuleAcheteursActif(!!(entRes as { data?: { module_acheteurs_actif?: boolean } } | null)?.data?.module_acheteurs_actif);
    }).finally(() => setLoading(false));
  }, []);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError('');
    setForm(EMPTY_FORM);
  };

  const startEdit = (g: Gerant) => {
    // Pré-remplissage avec le même repli legacy que l'affichage (mono-affectation ancienne).
    const actIds = g.activiteIds && g.activiteIds.length ? g.activiteIds : (g.activiteType !== 'labo' && g.activiteId ? [g.activiteId] : []);
    const labIds = g.laboIds && g.laboIds.length ? g.laboIds : (g.activiteType === 'labo' && g.activiteId ? [g.activiteId] : []);
    setForm({
      nom: g.nom,
      telephone: g.telephone || '',
      email: g.email,
      activiteIds: actIds,
      laboIds: labIds,
      accesAcheteurs: !!g.accesAcheteurs,
    });
    setEditingId(g.id);
    setShowForm(true);
    setInviteSent(null);
    setError('');
  };

  const submitForm = async () => {
    if (!form.nom || !form.telephone || (!editingId && !form.email)) { setError('Nom, téléphone et email requis'); return; }
    if (!editingId && gerantEmailExists) { setError('Cet email est déjà utilisé.'); return; }
    if (form.activiteIds.length === 0 && form.laboIds.length === 0) { setError('Affectez au moins une activité ou un labo'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        const res = await api.put(`/api/abonnements/gerants/${editingId}`, {
          nom: form.nom,
          telephone: form.telephone,
          activiteIds: form.activiteIds,
          laboIds: form.laboIds,
          accesAcheteurs: form.accesAcheteurs,
        });
        setGerants((gs) => gs.map((x) => x.id === editingId ? { ...x, ...res.data } : x));
        closeForm();
      } else {
        const res = await api.post('/api/abonnements/gerants', {
          nom: form.nom,
          telephone: form.telephone,
          email: form.email,
          activiteIds: form.activiteIds,
          laboIds: form.laboIds,
          accesAcheteurs: form.accesAcheteurs,
        });
        setGerants((g) => [...g, res.data]);
        setInviteSent({ nom: res.data.nom, email: res.data.email });
        closeForm();
      }
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const toggleActif = async (g: Gerant) => {
    await api.put(`/api/abonnements/gerants/${g.id}`, { actif: !g.actif });
    setGerants((gs) => gs.map((x) => x.id === g.id ? { ...x, actif: !g.actif } : x));
  };

  const deleteGerant = async (g: Gerant) => {
    const ok = await confirm({
      title: `Supprimer le gérant « ${g.nom} » ?`,
      message: 'Son compte et son accès à ses espaces seront supprimés.',
      tone: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    await api.delete(`/api/abonnements/gerants/${g.id}`);
    setGerants((gs) => gs.filter((x) => x.id !== g.id));
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
    const actIds = g.activiteIds && g.activiteIds.length ? g.activiteIds : (g.activiteType !== 'labo' && g.activiteId ? [g.activiteId] : []);
    const laboIds = g.laboIds && g.laboIds.length ? g.laboIds : (g.activiteType === 'labo' && g.activiteId ? [g.activiteId] : []);
    const names = [
      ...actIds.map((id) => activites.find((x) => x.id === id)?.nom ?? `Activité #${id}`),
      ...laboIds.map((id) => `Labo : ${labos.find((x) => x.id === id)?.nom ?? id}`),
    ];
    return names.length ? names.join(' · ') : '—';
  };
  const hasAffectation = (g: Gerant) => (g.activiteIds?.length || g.laboIds?.length || g.activiteId);

  const activeCount = gerants.filter((g) => g.actif).length;
  const pendingInvites = gerants.filter((g) => !g.activatedAt).length;

  return (
    <div className="page">
      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(3,105,161,0.28)',
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
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); setInviteSent(null); setError(''); }}
              style={{ padding: '10px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.25)' } as React.CSSProperties}>
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
            <span style={{ fontSize: '1rem' }}>{editingId ? '✏️' : '👤'}</span>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0369a1' }}>
              {editingId
                ? 'Modifier le gérant — accès et affectations'
                : `Nouveau gérant ${!canAddFree ? '— payant (80 DT/mois)' : '— inclus dans votre abonnement'}`}
            </span>
          </div>
          <div style={{ padding: '20px' }}>
            {!canAddFree && !editingId && (
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
                <input
                  type="email"
                  value={form.email}
                  disabled={!!editingId}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemple.com"
                  style={{ ...inp, borderColor: gerantEmailExists ? '#fca5a5' : (inp as React.CSSProperties).borderColor, background: editingId ? '#f8fafc' : (gerantEmailExists ? '#fff5f5' : (inp as React.CSSProperties).background), color: editingId ? '#94a3b8' : (inp as React.CSSProperties).color }}
                />
                {editingId ? (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>L'email de connexion n'est pas modifiable.</div>
                ) : (
                  <>
                    {gerantEmailChecking && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Vérification…</div>}
                    {!gerantEmailChecking && gerantEmailExists && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>Cet email est déjà utilisé.</div>}
                  </>
                )}
              </div>
              {(() => {
                const allActIds = activites.map((a) => a.id);
                const allLaboIds = labos.map((l) => l.id);
                const allChecked = form.activiteIds.length === allActIds.length && form.laboIds.length === allLaboIds.length && (allActIds.length + allLaboIds.length) > 0;
                const toggleAct = (id: number) => setForm((f) => ({ ...f, activiteIds: f.activiteIds.includes(id) ? f.activiteIds.filter((x) => x !== id) : [...f.activiteIds, id] }));
                // Retirer le dernier labo révoque l'accès base acheteurs (il exige ≥ 1 labo).
                const toggleLabo = (id: number) => setForm((f) => {
                  const laboIds = f.laboIds.includes(id) ? f.laboIds.filter((x) => x !== id) : [...f.laboIds, id];
                  return { ...f, laboIds, accesAcheteurs: laboIds.length > 0 ? f.accesAcheteurs : false };
                });
                const pill = (checked: boolean): React.CSSProperties => ({
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 600, border: `1.5px solid ${checked ? '#6ee7b7' : '#e2e8f0'}`,
                  background: checked ? '#ecfdf5' : '#f8fafc', color: checked ? '#065f46' : '#64748b',
                });
                return (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label style={lbl}>Activités &amp; labos assignés <span style={{ color: '#ef4444' }}>*</span></label>
                      {(allActIds.length + allLaboIds.length) > 0 && (
                        <button type="button"
                          onClick={() => setForm((f) => allChecked ? { ...f, activiteIds: [], laboIds: [], accesAcheteurs: false } : { ...f, activiteIds: allActIds, laboIds: allLaboIds })}
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                          {allChecked ? 'Tout décocher' : '✓ Tout'}
                        </button>
                      )}
                    </div>
                    {activites.length > 0 && (
                      <>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0' }}>📍 Activités</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                          {activites.map((a) => (
                            <span key={a.id} style={pill(form.activiteIds.includes(a.id))} onClick={() => toggleAct(a.id)}>
                              {form.activiteIds.includes(a.id) ? '✓ ' : ''}{a.nom}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {labos.length > 0 && (
                      <>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0' }}>🏭 Labos</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                          {labos.map((l) => (
                            <span key={l.id} style={pill(form.laboIds.includes(l.id))} onClick={() => toggleLabo(l.id)}>
                              {form.laboIds.includes(l.id) ? '✓ ' : ''}{l.nom}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {moduleAcheteursActif && (() => {
                      const canAcheteurs = form.laboIds.length > 0;
                      return (
                        <div style={{
                          marginTop: 14, padding: '12px 14px', borderRadius: 10,
                          border: `1.5px solid ${form.accesAcheteurs ? '#c4b5fd' : '#e2e8f0'}`,
                          background: form.accesAcheteurs ? '#f5f3ff' : '#f8fafc',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                        }}>
                          <div>
                            <div style={{ fontSize: '0.83rem', fontWeight: 800, color: form.accesAcheteurs ? '#5b21b6' : '#374151' }}>
                              🛒 Gestion de la base acheteurs
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                              {canAcheteurs
                                ? 'Le gérant accède à l\'Espace Acheteurs (carnet, tarifs, ventes, commandes de ses labos).'
                                : 'Assignez au moins un labo pour pouvoir accorder cet accès.'}
                            </div>
                          </div>
                          <button type="button"
                            disabled={!canAcheteurs}
                            onClick={() => setForm((f) => ({ ...f, accesAcheteurs: !f.accesAcheteurs }))}
                            style={{
                              padding: '7px 16px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700,
                              cursor: canAcheteurs ? 'pointer' : 'not-allowed',
                              border: `1.5px solid ${form.accesAcheteurs ? '#8b5cf6' : '#e2e8f0'}`,
                              background: form.accesAcheteurs ? '#8b5cf6' : '#fff',
                              color: form.accesAcheteurs ? '#fff' : (canAcheteurs ? '#374151' : '#cbd5e1'),
                            }}>
                            {form.accesAcheteurs ? '✓ Accès accordé' : 'Accorder l\'accès'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 13px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 14 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submitForm} disabled={saving}
                style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg,#1e3a5f,#0369a1)', color: saving ? '#9ca3af' : '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Enregistrement…' : (editingId ? '✓ Enregistrer les modifications' : '✓ Créer et envoyer l\'invitation')}
              </button>
              <button onClick={closeForm}
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
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); setInviteSent(null); setError(''); }}
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
                    {g.accesAcheteurs && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f5f3ff', color: '#6d28d9' }}>🛒 Base acheteurs</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    📧 {g.email}{g.telephone ? ` · 📞 ${g.telephone}` : ''}
                  </div>
                  {hasAffectation(g) && (
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
                  <button onClick={() => startEdit(g)}
                    style={{ padding: '6px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', color: '#0369a1', fontWeight: 700 }}>
                    ✏️ Modifier
                  </button>
                  <button onClick={() => toggleActif(g)}
                    style={{ padding: '6px 12px', background: g.actif ? '#fff' : '#f0fdf4', border: `1px solid ${g.actif ? '#e2e8f0' : '#bbf7d0'}`, borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', color: g.actif ? '#374151' : '#166534', fontWeight: 700 }}>
                    {g.actif ? '⏸ Désactiver' : '▶ Activer'}
                  </button>
                  <button onClick={() => deleteGerant(g)}
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
