import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import LivreurShell from './LivreurShell';

// Module Livreurs, étape L1 : le livreur remplace le mot de passe initial remis par son responsable (obligatoire avant
// tout accès à son espace : RequireLivreur l'amène ici tant que doitChangerMdp est vrai), ou en change plus tard.
const REGLE = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&_\-#]).{8,}$/;

export default function LivreurMotDePassePage() {
  const { user, updateUser, ouvrirSession } = useAuth();
  const navigate = useNavigate();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [ok, setOk] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const force = !!user?.doitChangerMdp;

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    if (!actuel) { setErreur('Saisissez le mot de passe actuel.'); return; }
    if (!REGLE.test(nouveau)) { setErreur('Nouveau mot de passe : 8 caractères au moins, avec une majuscule, une minuscule, un chiffre et un caractère spécial (@ $ ! % * ? & _ - #).'); return; }
    if (nouveau !== confirmation) { setErreur('La confirmation ne correspond pas.'); return; }
    if (nouveau === actuel) { setErreur("Le nouveau mot de passe doit être différent de l'actuel."); return; }
    setEnvoi(true);
    try {
      const { data } = await api.put('/auth/profile', { currentPassword: actuel, password: nouveau });
      // Le serveur révoque les anciens jetons et en renvoie un neuf : on rouvre la session avec, sinon la première
      // navigation retomberait sur la page de connexion.
      const token = (data as { token?: string })?.token;
      if (token && user) ouvrirSession({ token, user: { ...user, doitChangerMdp: false } });
      else updateUser({ doitChangerMdp: false });
      setOk(true);
      window.setTimeout(() => navigate('/livreur', { replace: true }), 900);
    } catch (err: unknown) {
      setErreur((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Changement impossible pour le moment.');
    } finally {
      setEnvoi(false);
    }
  };

  const champ: React.CSSProperties = { width: '100%', padding: '13px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '1rem', boxSizing: 'border-box', background: '#fff' };
  const label: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 };

  return (
    <LivreurShell titre={force ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}>
      {force && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 14px', color: '#92400e', fontSize: '0.85rem', lineHeight: 1.55, marginBottom: 16 }}>
          🔑 Le mot de passe que l'on vous a remis est provisoire. Choisissez le vôtre pour accéder à vos livraisons.
        </div>
      )}
      <form onSubmit={soumettre} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={label} htmlFor="mdp-actuel">{force ? 'Mot de passe remis' : 'Mot de passe actuel'}</label>
          <input id="mdp-actuel" type={voir ? 'text' : 'password'} value={actuel} onChange={(e) => setActuel(e.target.value)} style={champ} autoComplete="current-password" />
        </div>
        <div>
          <label style={label} htmlFor="mdp-nouveau">Nouveau mot de passe</label>
          <input id="mdp-nouveau" type={voir ? 'text' : 'password'} value={nouveau} onChange={(e) => setNouveau(e.target.value)} style={champ} autoComplete="new-password" />
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 5 }}>8 caractères au moins : majuscule, minuscule, chiffre et caractère spécial.</div>
        </div>
        <div>
          <label style={label} htmlFor="mdp-confirmation">Confirmation</label>
          <input id="mdp-confirmation" type={voir ? 'text' : 'password'} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} style={champ} autoComplete="new-password" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#374151' }}>
          <input type="checkbox" checked={voir} onChange={(e) => setVoir(e.target.checked)} /> Afficher les mots de passe
        </label>
        {erreur && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', color: '#b91c1c', fontSize: '0.85rem' }}>{erreur}</div>}
        {ok && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 12px', color: '#166534', fontSize: '0.85rem', fontWeight: 700 }}>✓ Mot de passe enregistré.</div>}
        <button type="submit" disabled={envoi || ok} style={{ padding: '15px', borderRadius: 12, border: 'none', background: envoi || ok ? '#e5e7eb' : 'linear-gradient(135deg,#065f46,#059669)', color: envoi || ok ? '#9ca3af' : '#fff', fontWeight: 800, fontSize: '1rem', cursor: envoi || ok ? 'default' : 'pointer' }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {!force && (
          <button type="button" onClick={() => navigate('/livreur')} style={{ padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontWeight: 700, cursor: 'pointer' }}>
            Retour
          </button>
        )}
      </form>
    </LivreurShell>
  );
}
