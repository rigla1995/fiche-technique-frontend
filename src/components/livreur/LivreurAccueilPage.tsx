import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import LivreurShell from './LivreurShell';
import { useVocabulaire } from '../../hooks/useVocabulaire';

// Module Livreurs, étape L1 : accueil du livreur sur téléphone. Les livraisons affectées arrivent à l'étape L2
// (affectation à l'expédition) et leur validation à l'étape L3 — l'écran le dit, sans rien promettre de plus.
interface Moi { id: number; nom: string; telephone: string; email: string | null; entreprise: string | null; doitChangerMdp: boolean }

export default function LivreurAccueilPage() {
  const voc = useVocabulaire();
  const [moi, setMoi] = useState<Moi | null>(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    api.get('/api/livreur/moi').then(({ data }) => setMoi(data as Moi)).catch(() => setErreur('Votre fiche est indisponible pour le moment.'));
  }, []);

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

      <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 16, border: '1.5px dashed #d1d5db' }}>
        <div style={{ fontSize: '2.6rem', marginBottom: 10 }}>📦</div>
        <div style={{ fontWeight: 800, color: '#111827', marginBottom: 6 }}>Aucune livraison pour l'instant</div>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
          Les commandes que votre responsable vous confiera apparaîtront ici, avec l'adresse, le téléphone du client et les {voc.pl('article')} à livrer.
        </p>
      </div>

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link to="/livreur/mot-de-passe" style={{ display: 'block', textAlign: 'center', padding: '14px', borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb', color: '#374151', fontWeight: 700, textDecoration: 'none', fontSize: '0.92rem' }}>
          🔑 Changer mon mot de passe
        </Link>
      </div>
    </LivreurShell>
  );
}
