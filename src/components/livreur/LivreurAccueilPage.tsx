import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import LivreurShell from './LivreurShell';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import { type Livraison, fmtDate, fmtMontant, CD } from './livraisons';

// Module Livreurs, étape L2 : accueil du livreur sur téléphone — ses livraisons à faire (commandes expédiées qui lui
// sont confiées), puis ses dernières livrées. La validation sur place (Livrée / Non livrée) arrive à l'étape L3.
interface Moi { id: number; nom: string; telephone: string; email: string | null; entreprise: string | null; doitChangerMdp: boolean }

export default function LivreurAccueilPage() {
  const voc = useVocabulaire();
  const [moi, setMoi] = useState<Moi | null>(null);
  const [livraisons, setLivraisons] = useState<Livraison[] | null>(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    api.get('/api/livreur/moi').then(({ data }) => setMoi(data as Moi)).catch(() => setErreur('Votre fiche est indisponible pour le moment.'));
    api.get('/api/livreur/commandes').then(({ data }) => setLivraisons(data as Livraison[])).catch(() => { setLivraisons([]); setErreur('Vos livraisons sont indisponibles pour le moment.'); });
  }, []);

  const aLivrer = (livraisons || []).filter((l) => l.statut === 'expediee');
  // Mémoire : livrées, et non livrées en attente de la décision du responsable (L3)
  const livrees = (livraisons || []).filter((l) => l.statut === 'livree' || l.statut === 'livraison_echouee');

  const carte = (l: Livraison, faite: boolean) => (
    <Link key={l.id} to={`/livreur/commandes/${l.id}`}
      style={{ display: 'block', background: '#fff', border: `1px solid ${faite ? '#e5e7eb' : '#a7f3d0'}`, borderLeft: `5px solid ${l.statut === 'livraison_echouee' ? '#ea580c' : faite ? '#9ca3af' : '#059669'}`, borderRadius: 14, padding: '12px 14px', textDecoration: 'none', color: 'inherit', opacity: faite ? 0.8 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>{l.acheteurNom}</div>
          {l.acheteurEntreprise && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{l.acheteurEntreprise}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 900, color: CD }}>{fmtMontant(l.montantTtc)}</div>
          <div style={{ fontSize: '0.74rem', color: '#6b7280' }}>{l.nbLignes} {voc.n('article', l.nbLignes).replace(/^\d+\s*/, '')}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: '0.84rem', color: '#374151', lineHeight: 1.5 }}>
        {l.acheteurAdresse ? <div>📍 {l.acheteurAdresse}</div> : <div style={{ color: '#9ca3af' }}>📍 Adresse non renseignée</div>}
        {l.acheteurTelephone && <div>📞 {l.acheteurTelephone}</div>}
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#6b7280' }}>
        <span>{l.statut === 'livraison_echouee' ? '⚠️ Non livrée — en attente de votre responsable' : faite ? `✅ Livrée le ${fmtDate(l.dateLivraison)}` : `🚚 Expédiée le ${fmtDate(l.dateExpedition)}`}{l.depart && !faite ? ` · départ ${l.depart}` : ''}</span>
        <span style={{ color: CD, fontWeight: 700 }}>Voir ›</span>
      </div>
    </Link>
  );

  return (
    <LivreurShell titre="Mes livraisons">
      {moi && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#065f46,#059669)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
            {moi.nom.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{moi.nom}</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>📞 {moi.telephone}{moi.entreprise ? ` · ${moi.entreprise}` : ''}</div>
          </div>
        </div>
      )}
      {erreur && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#991b1b', fontSize: '0.85rem', marginBottom: 16 }}>{erreur}</div>}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 0 10px' }}>
        <h2 style={{ fontSize: '0.8rem', fontWeight: 800, color: CD, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>À livrer</h2>
        {livraisons && <span style={{ fontSize: '0.78rem', fontWeight: 700, color: aLivrer.length ? CD : '#9ca3af' }}>{aLivrer.length}</span>}
      </div>
      {livraisons === null ? (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>Chargement…</div>
      ) : aLivrer.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', background: '#fff', borderRadius: 16, border: '1.5px dashed #d1d5db' }}>
          <div style={{ fontSize: '2.6rem', marginBottom: 10 }}>📦</div>
          <div style={{ fontWeight: 800, color: '#111827', marginBottom: 6 }}>Aucune livraison pour l'instant</div>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
            Les commandes que votre responsable vous confiera apparaîtront ici, avec l'adresse, le téléphone du client et {voc.le('article', true)} à livrer.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{aLivrer.map((l) => carte(l, false))}</div>
      )}

      {livrees.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#6b7280', margin: '22px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Terminées récemment</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{livrees.map((l) => carte(l, true))}</div>
        </>
      )}

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link to="/livreur/mot-de-passe" style={{ display: 'block', textAlign: 'center', padding: '14px', borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb', color: '#374151', fontWeight: 700, textDecoration: 'none', fontSize: '0.92rem' }}>
          🔑 Changer mon mot de passe
        </Link>
      </div>
    </LivreurShell>
  );
}
