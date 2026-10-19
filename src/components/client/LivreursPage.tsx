import { useState, useEffect } from 'react';
import api from '../../api/client';
import GuideButton from './GuideButton';
import type { Livreur } from '../../types';
import { useConfirm } from '../common/ConfirmDialog';
import { useVocabulaire } from '../../hooks/useVocabulaire';

// Module Livreurs, étape L1 (labflow-reprise/livreurs/PLAN-LIVREURS.md) : comptes livreurs du compte, créés par le
// client ou un gérant ayant l'accès à la base acheteurs. Calquée sur GerantsPage ; « livreur » n'a pas de clé de
// vocabulaire (libellés fixes), les autres mots passent par le vocabulaire du compte.

interface LivreurForm { nom: string; telephone: string; email: string }
const EMPTY_FORM: LivreurForm = { nom: '', telephone: '', email: '' };
interface Secret { nom: string; motDePasse: string }

const TEL_OK = /^(\+216|00216|216)?[\s.-]*[24579](?:[\s.-]*\d){7}$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LivreursPage() {
  const voc = useVocabulaire();
  const { confirm, alerte } = useConfirm();
  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [max, setMax] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<LivreurForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inviteSent, setInviteSent] = useState<{ nom: string; email: string; envoye: boolean } | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [copie, setCopie] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const charger = () => api.get('/api/livreurs').then(({ data }) => {
    setLivreurs((data as { livreurs: Livreur[] }).livreurs || []);
    setMax((data as { max: number | null }).max ?? null);
  });
  useEffect(() => { charger().finally(() => setLoading(false)); }, []);

  const atLimit = max !== null && livreurs.length >= max;
  const actifs = livreurs.filter((l) => l.actif).length;
  const enAttente = livreurs.filter((l) => l.inviteEnAttente).length;

  const ouvrir = () => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); setError(''); setInviteSent(null); setSecret(null); };
  const fermer = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setError(''); };
  const modifier = (l: Livreur) => { setShowForm(true); setEditingId(l.id); setForm({ nom: l.nom, telephone: l.telephone, email: l.email || '' }); setError(''); setSecret(null); setInviteSent(null); };

  const montrerSecret = (nom: string, motDePasse: string) => { setSecret({ nom, motDePasse }); setCopie(false); };
  const copier = async () => {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret.motDePasse); setCopie(true); } catch { setCopie(false); }
  };

  const soumettre = async () => {
    const nom = form.nom.trim();
    const telephone = form.telephone.trim();
    const email = form.email.trim();
    if (!nom) { setError('Le nom est obligatoire.'); return; }
    if (!TEL_OK.test(telephone)) { setError('Téléphone tunisien attendu : 8 chiffres (ex. 22 345 678).'); return; }
    if (email && !EMAIL_OK.test(email)) { setError('Adresse e-mail invalide.'); return; }
    setSaving(true); setError('');
    try {
      if (editingId) {
        const { data } = await api.put(`/api/livreurs/${editingId}`, { nom, telephone });
        setLivreurs((ls) => ls.map((x) => (x.id === editingId ? { ...x, ...(data as Livreur) } : x)));
        fermer();
      } else {
        const { data } = await api.post('/api/livreurs', { nom, telephone, email: email || null });
        const cree = data as Livreur & { emailEnvoye: boolean; motDePasseInitial: string | null };
        setLivreurs((ls) => [...ls, cree]);
        fermer();
        if (cree.motDePasseInitial) montrerSecret(cree.nom, cree.motDePasseInitial);
        else setInviteSent({ nom: cree.nom, email: cree.email || email, envoye: cree.emailEnvoye });
      }
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const basculerActif = async (l: Livreur) => {
    setBusyId(l.id);
    try {
      const { data } = await api.put(`/api/livreurs/${l.id}`, { actif: !l.actif });
      setLivreurs((ls) => ls.map((x) => (x.id === l.id ? { ...x, ...(data as Livreur) } : x)));
    } catch (e: unknown) {
      alerte({ title: 'Modification impossible', message: (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur', tone: 'danger' });
    } finally { setBusyId(null); }
  };

  const supprimer = async (l: Livreur) => {
    const ok = await confirm({
      title: `Supprimer le livreur « ${l.nom} » ?`,
      message: 'Son compte et son accès seront supprimés. Il ne pourra plus se connecter.',
      tone: 'danger', confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    setBusyId(l.id);
    try {
      await api.delete(`/api/livreurs/${l.id}`);
      setLivreurs((ls) => ls.filter((x) => x.id !== l.id));
    } catch (e: unknown) {
      alerte({ title: 'Suppression impossible', message: (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur', tone: 'danger' });
    } finally { setBusyId(null); }
  };

  const renvoyer = async (l: Livreur) => {
    setBusyId(l.id);
    try {
      await api.post(`/api/livreurs/${l.id}/inviter`);
      await alerte({ title: 'Invitation envoyée', message: `Invitation renvoyée à ${l.email}`, tone: 'primary', icon: '✉️' });
    } catch (e: unknown) {
      alerte({ title: 'Envoi impossible', message: (e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Erreur lors de l'envoi", tone: 'danger' });
    } finally { setBusyId(null); }
  };

  const nouveauMotDePasse = async (l: Livreur) => {
    const ok = await confirm({
      title: `Nouveau mot de passe pour « ${l.nom} » ?`,
      message: "Un nouveau mot de passe initial sera généré et affiché une seule fois. Les sessions ouvertes du livreur seront fermées ; il devra le remplacer à sa prochaine connexion.",
      tone: 'primary', confirmLabel: 'Générer',
    });
    if (!ok) return;
    setBusyId(l.id);
    try {
      const { data } = await api.post(`/api/livreurs/${l.id}/mot-de-passe`);
      const r = data as { motDePasseInitial: string; livreur: Livreur };
      setLivreurs((ls) => ls.map((x) => (x.id === l.id ? { ...x, ...r.livreur } : x)));
      setInviteSent(null);
      montrerSecret(l.nom, r.motDePasseInitial);
    } catch (e: unknown) {
      alerte({ title: 'Génération impossible', message: (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur', tone: 'danger' });
    } finally { setBusyId(null); }
  };

  return (
    <div className="page">
      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg, #064e3b 0%, #047857 55%, #10b981 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(4,120,87,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏍️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Livreurs</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Les personnes qui livrent vos commandes {voc.court('acheteur', true)} et les valident depuis leur téléphone
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {max !== null && (
            <div style={{ background: atLimit ? '#fef2f2' : '#f0fdf4', borderRadius: 12, padding: '10px 20px', textAlign: 'center', minWidth: 90, border: `1px solid ${atLimit ? '#fecaca' : '#bbf7d0'}` }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Livreurs</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: atLimit ? '#dc2626' : '#16a34a', lineHeight: 1 }}>
                {livreurs.length}<span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280' }}> / {max}</span>
              </div>
            </div>
          )}
          {actifs > 0 && (
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: '10px 20px', textAlign: 'center', minWidth: 80, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Actifs</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1e40af', lineHeight: 1 }}>{actifs}</div>
            </div>
          )}
          {atLimit ? (
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 16px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.2)' }}>
              🔒 Limite atteinte ({max})
            </div>
          ) : (
            <button onClick={ouvrir}
              style={{ padding: '10px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.25)' } as React.CSSProperties}>
              + Nouveau livreur
            </button>
          )}
          <GuideButton section="livreurs" />
        </div>
      </div>

      {/* Mot de passe initial : affiché UNE fois */}
      {secret && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: '0.92rem', marginBottom: 6 }}>🔑 Mot de passe initial de {secret.nom} — affiché une seule fois</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <code style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.08em', background: '#fff', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 14px', color: '#111827' }}>{secret.motDePasse}</code>
                <button onClick={copier} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: copie ? '#f59e0b' : '#fff', color: copie ? '#fff' : '#92400e', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                  {copie ? '✓ Copié' : 'Copier'}
                </button>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#92400e', marginTop: 8 }}>
                Remettez-le au livreur de vive voix. Il se connecte avec son <strong>numéro de téléphone</strong> et ce mot de passe, puis en choisit un nouveau. Ce mot de passe n'est envoyé ni par e-mail ni par SMS.
              </div>
            </div>
            <button onClick={() => setSecret(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: '1rem', padding: 4 }}>✕</button>
          </div>
        </div>
      )}

      {inviteSent && (
        <div style={{ background: inviteSent.envoye ? '#f0fdf4' : '#fef2f2', border: `1px solid ${inviteSent.envoye ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: inviteSent.envoye ? '#166534' : '#991b1b', fontWeight: 600, fontSize: '0.88rem' }}>
            {inviteSent.envoye
              ? <>✉️ Invitation envoyée à <strong>{inviteSent.nom}</strong> ({inviteSent.email}) — le compte sera activé dès qu'il cliquera sur le lien (48 h).</>
              : <>⚠ Le compte de <strong>{inviteSent.nom}</strong> est créé mais l'e-mail n'a pas pu partir : utilisez ✉️ Renvoyer dans un instant.</>}
          </span>
          <button onClick={() => setInviteSent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: '1rem', padding: 4 }}>✕</button>
        </div>
      )}

      {enAttente > 0 && !inviteSent && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
          ⏳ {enAttente} invitation{enAttente > 1 ? 's' : ''} en attente d'activation
        </div>
      )}

      {/* Formulaire */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 24 }}>
          <div style={{ background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', padding: '14px 20px', borderBottom: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>{editingId ? '✏️' : '🏍️'}</span>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#047857' }}>{editingId ? 'Modifier le livreur' : 'Nouveau livreur'}</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Nom *</label>
                <input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} style={inp} placeholder="Nom complet" />
              </div>
              <div>
                <label style={lbl}>Téléphone * <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#6b7280' }}>(identifiant de connexion)</span></label>
                <input value={form.telephone} onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))} style={inp} placeholder="22 345 678" inputMode="tel" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>E-mail <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#6b7280' }}>(facultatif)</span></label>
                <input type="email" value={form.email} disabled={!!editingId} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="prenom@societe.tn"
                  style={{ ...inp, background: editingId ? '#f8fafc' : '#fff', color: editingId ? '#94a3b8' : '#0f172a' }} />
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
                  {editingId
                    ? "L'adresse de connexion n'est pas modifiable."
                    : <>Avec une adresse : le livreur reçoit une <strong>invitation par e-mail</strong> et choisit son mot de passe. Sans adresse : un <strong>mot de passe initial</strong> s'affiche une seule fois, à lui remettre de vive voix.</>}
                </div>
              </div>
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 13px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 14 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={soumettre} disabled={saving}
                style={{ flex: 2, padding: 10, borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg,#065f46,#059669)', color: saving ? '#9ca3af' : '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Enregistrement…' : editingId ? '✓ Enregistrer les modifications' : form.email.trim() ? "✓ Créer et envoyer l'invitation" : '✓ Créer et obtenir le mot de passe'}
              </button>
              <button onClick={fermer} style={{ flex: 1, padding: 10, borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 60 }}>Chargement…</div>
      ) : livreurs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 56, background: '#f8fafc', borderRadius: 18, border: '1.5px dashed #e2e8f0' }}>
          <div style={{ fontSize: '3rem', marginBottom: 14 }}>🏍️</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', marginBottom: 8 }}>Aucun livreur</div>
          <p style={{ fontSize: '0.86rem', color: '#6b7280', lineHeight: 1.7, maxWidth: 440, margin: '0 auto 24px' }}>
            {max !== null ? `Votre abonnement comprend ${max} comptes livreurs. ` : ''}Créez un compte par livreur : il se connectera avec son téléphone et validera ses livraisons depuis son téléphone.
          </p>
          {!atLimit && (
            <button onClick={ouvrir} style={{ padding: '11px 28px', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              + Créer un livreur
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {livreurs.map((l) => {
            const initials = l.nom.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
            const busy = busyId === l.id;
            return (
              <div key={l.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', borderLeft: `4px solid ${l.actif ? '#10b981' : '#e5e7eb'}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', opacity: busy ? 0.6 : 1 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: l.actif ? 'linear-gradient(135deg,#065f46,#059669)' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, color: l.actif ? '#fff' : '#6b7280', flexShrink: 0 }}>{initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>{l.nom}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: l.actif ? '#dcfce7' : '#fee2e2', color: l.actif ? '#166534' : '#991b1b' }}>{l.actif ? '● Actif' : '○ Inactif'}</span>
                    {l.inviteEnAttente && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>⏳ Invitation en attente</span>}
                    {l.doitChangerMdp && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef9c3', color: '#854d0e' }}>🔑 Mot de passe à changer</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    📞 {l.telephone}{l.email ? ` · 📧 ${l.email}` : ''}{l.creePar ? ` · créé par ${l.creePar}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                  {l.inviteEnAttente && (
                    <button onClick={() => renvoyer(l)} disabled={busy} style={btn('#eef2ff', '#c7d2fe', '#4338ca')}>✉️ Renvoyer</button>
                  )}
                  <button onClick={() => nouveauMotDePasse(l)} disabled={busy} style={btn('#fffbeb', '#fde68a', '#92400e')} title="Générer un nouveau mot de passe initial">🔑 Nouveau mot de passe</button>
                  <button onClick={() => modifier(l)} disabled={busy} style={btn('#ecfdf5', '#a7f3d0', '#047857')}>✏️ Modifier</button>
                  <button onClick={() => basculerActif(l)} disabled={busy} style={btn(l.actif ? '#fff' : '#f0fdf4', l.actif ? '#e2e8f0' : '#bbf7d0', l.actif ? '#374151' : '#166534')}>{l.actif ? '⏸ Désactiver' : '▶ Activer'}</button>
                  <button onClick={() => supprimer(l)} disabled={busy} style={btn('#fff', '#fecdd3', '#be123c')}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btn = (bg: string, bord: string, couleur: string): React.CSSProperties => ({ padding: '6px 12px', background: bg, border: `1px solid ${bord}`, borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', color: couleur, fontWeight: 700 });
const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
