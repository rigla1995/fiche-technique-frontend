import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Gerant, Activite, Labo } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface GerantForm {
  nom: string;
  telephone: string;
  email: string;
  activiteId: string;
  activiteType: 'franchise' | 'labo' | 'activite_distincte' | '';
}

const EMPTY_FORM: GerantForm = { nom: '', telephone: '', email: '', activiteId: '', activiteType: '' };

export default function GerantsPage() {
  const { user } = useAuth();
  const isEntreprise = user?.compteType === 'entreprise';

  const [gerants, setGerants] = useState<Gerant[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GerantForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [createdPwd, setCreatedPwd] = useState<{ nom: string; email: string; pwd: string } | null>(null);
  const [error, setError] = useState('');

  const freeLimit = isEntreprise ? 3 : 1;
  const freeCount = gerants.filter((g) => g.estGratuit).length;
  const canAddFree = freeCount < freeLimit;

  useEffect(() => {
    const calls: Promise<unknown>[] = [api.get('/api/abonnements/gerants')];
    if (isEntreprise) {
      calls.push(api.get('/api/entreprise/activites'));
      calls.push(api.get('/api/labo/'));
    }
    Promise.all(calls).then(([gerantRes, activiteRes, laboRes]) => {
      setGerants((gerantRes as { data: Gerant[] }).data);
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
      setCreatedPwd({ nom: res.data.nom, email: res.data.email, pwd: res.data.temporaryPassword });
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

  const activiteLabel = (g: Gerant) => {
    if (!g.activiteId) return '—';
    if (g.activiteType === 'labo') {
      const l = labos.find((x) => x.id === g.activiteId);
      return l ? `Labo : ${l.nom}` : `Labo #${g.activiteId}`;
    }
    const a = activites.find((x) => x.id === g.activiteId);
    return a ? `${g.activiteType === 'franchise' ? 'Franchise' : 'Distincte'} : ${a.nom}` : `Activité #${g.activiteId}`;
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Comptes gérants</h1>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            {freeCount}/{freeLimit} compte(s) gratuit(s) utilisé(s)
          </div>
        </div>
        <button
          onClick={() => { setShowForm(true); setCreatedPwd(null); setError(''); }}
          style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          + Nouveau gérant
        </button>
      </div>

      {/* Success credential display */}
      {createdPwd && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>Compte gérant créé avec succès</div>
          <div style={{ fontSize: 13, color: '#15803d' }}>
            <strong>Nom :</strong> {createdPwd.nom}<br />
            <strong>Email :</strong> {createdPwd.email}<br />
            <strong>Mot de passe temporaire :</strong>{' '}
            <code style={{ background: '#bbf7d0', padding: '2px 6px', borderRadius: 4 }}>{createdPwd.pwd}</code>
          </div>
          <div style={{ fontSize: 12, color: '#16a34a', marginTop: 6 }}>Communiquez ces identifiants au gérant. Il sera invité à changer son mot de passe.</div>
          <button onClick={() => setCreatedPwd(null)} style={{ marginTop: 8, fontSize: 12, color: '#15803d', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Fermer</button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#111827' }}>
            Nouveau gérant {!canAddFree ? '(payant — 80 DT/mois)' : '(gratuit)'}
          </h3>
          {!canAddFree && (
            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#854d0e', marginBottom: 14 }}>
              Vous avez atteint la limite de {freeLimit} gérant(s) gratuit(s). Ce compte sera facturé 80 DT/mois et nécessite une validation admin.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Nom *</label>
              <input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Téléphone *</label>
              <input value={form.telephone} onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            {isEntreprise && (
              <>
                <div>
                  <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Type d'activité assignée</label>
                  <select value={form.activiteType} onChange={(e) => setForm((f) => ({ ...f, activiteType: e.target.value as GerantForm['activiteType'], activiteId: '' }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}>
                    <option value="">— Sélectionner —</option>
                    <option value="franchise">Franchise</option>
                    <option value="activite_distincte">Activité distincte</option>
                    <option value="labo">Labo</option>
                  </select>
                </div>
                {form.activiteType && (
                  <div>
                    <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>
                      {form.activiteType === 'labo' ? 'Labo' : 'Activité'}
                    </label>
                    <select value={form.activiteId} onChange={(e) => setForm((f) => ({ ...f, activiteId: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}>
                      <option value="">— Sélectionner —</option>
                      {form.activiteType === 'labo'
                        ? labos.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)
                        : activites.filter((a) => a.type === (form.activiteType === 'franchise' ? 'franchise' : 'distincte'))
                            .map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)
                      }
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={submitForm} disabled={saving}
              style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              {saving ? 'Création...' : 'Créer le compte'}
            </button>
            <button onClick={() => { setShowForm(false); setError(''); setForm(EMPTY_FORM); }}
              style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Gérants list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Chargement...</div>
      ) : gerants.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>
          Aucun compte gérant. Créez votre premier gérant.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gerants.map((g) => (
            <div key={g.id} style={{
              background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
              padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{g.nom}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {g.email} · {g.telephone}
                </div>
                {isEntreprise && (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{activiteLabel(g)}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                  background: g.estGratuit ? '#dbeafe' : '#fef9c3',
                  color: g.estGratuit ? '#1d4ed8' : '#854d0e',
                }}>
                  {g.estGratuit ? 'Gratuit' : `${g.montantMensuel} DT/mois`}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                  background: g.actif ? '#dcfce7' : '#fee2e2',
                  color: g.actif ? '#166534' : '#991b1b',
                }}>
                  {g.actif ? 'Actif' : 'Inactif'}
                </span>
                <button onClick={() => toggleActif(g)}
                  style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151' }}>
                  {g.actif ? 'Désactiver' : 'Activer'}
                </button>
                <button onClick={() => deleteGerant(g.id)}
                  style={{ padding: '4px 10px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#991b1b' }}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
