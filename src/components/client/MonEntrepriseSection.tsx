// Section « Mon entreprise » du profil (lot 3, étape 6 — spec backend docs/lot-3-spec.md §4).
// Formulaire SÉPARÉ de celui du profil, avec son propre bouton (l'envoi du profil avance la mise en route).
// Le client modifie l'adresse, la ville et le représentant ; le reste de l'identité légale est en lecture
// (renseigné par l'équipe LabFlow). PUT /api/entreprise/identite ne reçoit que les champs modifiés.
import { useEffect, useState } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { champsModifies, formeIndividuelle, identiteDe, libelleForme, type IdentiteLegale } from '../../utils/identiteLegale';

type ChampClient = 'adresse' | 'ville' | 'representantNom' | 'representantQualite';

const vide = (v: string | null | undefined) => !(v ?? '').trim();

export default function MonEntrepriseSection() {
  const { canWrite } = useAuth();
  const [initiale, setInitiale] = useState<IdentiteLegale | null>(null);
  const [valeur, setValeur] = useState<IdentiteLegale | null>(null);
  const [saving, setSaving] = useState(false);
  const [succes, setSucces] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    api.get('/api/entreprise')
      .then(({ data }) => {
        // Réponse sans identité (serveur d'avant l'étape 6) : pas de section plutôt qu'une section fausse.
        if (!actif || (data && !data.identite)) return;
        const identite = identiteDe(data?.identite);
        setInitiale(identite);
        setValeur(identite);
      })
      .catch(() => { /* réseau coupé : pas de section, le reste du profil reste utilisable */ });
    return () => { actif = false; };
  }, []);

  if (!initiale || !valeur) return null;

  const corps = champsModifies(valeur, initiale);
  const modifie = Object.keys(corps).length > 0;
  const fige = saving || !canWrite; // compte en lecture seule : le serveur refuserait l'enregistrement
  // Ce que seule l'équipe LabFlow renseigne (d'après la patente) / ce que le client renseigne lui-même.
  const manqueLabFlow = vide(initiale.raisonSociale) || vide(initiale.matriculeFiscal);
  const manqueClient = vide(initiale.adresse) || vide(initiale.ville);
  // Adresse déjà renseignée puis modifiée : elle est lue telle quelle par les factures existantes.
  const adresseDejaImprimee = !vide(initiale.adresse) && (valeur.adresse ?? '').trim() !== (initiale.adresse ?? '').trim();

  const set = (k: ChampClient, v: string) => { setValeur({ ...valeur, [k]: v }); setSucces(false); setErreur(null); };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fige || !modifie) return;
    setSaving(true);
    setSucces(false);
    setErreur(null);
    try {
      const { data } = await api.put('/api/entreprise/identite', corps);
      if (data?.identite) {
        const identite = identiteDe(data.identite);
        setInitiale(identite);
        setValeur(identite);
      }
      setSucces(true);
    } catch (err: unknown) {
      setErreur((err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || "Vos informations n'ont pas pu être enregistrées — réessayez.");
    } finally {
      setSaving(false);
    }
  };

  const lecture = (libelle: string, v: string | null | undefined) => (
    <div>
      <span style={lbl}>{libelle}</span>
      <div style={{ fontSize: '0.88rem', color: vide(v) ? '#64748b' : '#0f172a', fontWeight: vide(v) ? 400 : 600, overflowWrap: 'anywhere' }}>
        {vide(v) ? 'Non renseigné' : v}
      </div>
    </div>
  );

  const champ = (k: ChampClient, libelle: string, placeholder: string, maxLength: number) => (
    <div>
      <label htmlFor={`mon-entreprise-${k}`} style={lbl}>{libelle}</label>
      <input id={`mon-entreprise-${k}`} value={valeur[k] ?? ''} onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder} maxLength={maxLength} disabled={fige} style={inp} />
    </div>
  );

  return (
    <form onSubmit={enregistrer} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginTop: 28 }}>
      <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', padding: '14px 20px', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1rem' }}>🏢</span>
        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#92400e' }}>Mon entreprise</span>
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(manqueLabFlow || manqueClient) && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', lineHeight: 1.5 }}>
            {manqueLabFlow && "Identité légale à compléter : l'équipe LabFlow la renseigne à partir de votre patente. "}
            {manqueClient && "Renseignez l'adresse et la ville de votre entreprise : elles sont nécessaires à vos factures."}
          </div>
        )}

        <div style={grille}>
          {lecture(formeIndividuelle(initiale.formeJuridique) ? 'Nom du titulaire' : 'Raison sociale', initiale.raisonSociale)}
          {lecture('Forme juridique', libelleForme(initiale.formeJuridique))}
          {!vide(initiale.nomCommercial) && lecture('Nom commercial', initiale.nomCommercial)}
          {lecture('Matricule fiscal', initiale.matriculeFiscal)}
          {!vide(initiale.rne) && lecture('Identifiant RNE', initiale.rne)}
        </div>
        {!manqueLabFlow && (
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
            Ces informations viennent de votre patente : seule l'équipe LabFlow les modifie.
          </p>
        )}

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={grille}>
            {champ('adresse', 'Adresse', 'Rue, numéro', 300)}
            {champ('ville', 'Ville', 'Code postal et ville', 120)}
          </div>
          <div style={grille}>
            {champ('representantNom', 'Représentant légal', 'Prénom et nom', 150)}
            {champ('representantQualite', 'Fonction du représentant', "Sa fonction dans l'entreprise", 80)}
          </div>
        </div>

        {adresseDejaImprimee && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', lineHeight: 1.5 }}>
            ⚠️ Vos factures déjà émises porteront aussi la nouvelle adresse si vous les téléchargez de nouveau.
            La ville n'y est pas encore imprimée : si elle figure dans votre adresse, laissez-la.
          </div>
        )}
        {succes && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '10px 14px', fontSize: '0.84rem', fontWeight: 600 }}>
            ✓ Informations de l'entreprise enregistrées.
          </div>
        )}
        {erreur && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: '0.84rem', fontWeight: 600 }}>
            ⚠ {erreur}
          </div>
        )}

        <button type="submit" disabled={fige || !modifie}
          style={{ alignSelf: 'flex-end', padding: '11px 22px', borderRadius: 12, border: 'none', background: fige || !modifie ? '#e5e7eb' : 'linear-gradient(135deg,#92400e,#b45309)', color: fige || !modifie ? '#9ca3af' : '#fff', fontSize: '0.9rem', fontWeight: 800, cursor: fige || !modifie ? 'default' : 'pointer' }}>
          {saving ? 'Enregistrement…' : '💾 Enregistrer mon entreprise'}
        </button>
      </div>
    </form>
  );
}

const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
const grille: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 };
