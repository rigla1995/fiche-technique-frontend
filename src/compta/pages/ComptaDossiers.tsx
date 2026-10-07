import BoutonAide from '../BoutonAide';
import ListeDossiers from '../ListeDossiers';
import { useAccesCompta } from '../accesCompta';

// « Dossiers » (LabFlow Compta, étape S4a) : les dossiers du cabinet du titulaire — liste, recherche, archivés, assistant
// « Nouveau dossier ». Réservée au titulaire (ReserveCabinet) ; un collaborateur voit ses dossiers sur la page « Cabinet ».
export default function ComptaDossiers() {
  const { acces } = useAccesCompta();
  const cabinet = acces?.cabinets.find((c) => c.role === 'titulaire');

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📁</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Dossiers</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Les entreprises dont votre cabinet tient la comptabilité</p>
        </div>
        <BoutonAide section="compta-dossiers" />
      </div>
      {cabinet ? <ListeDossiers espaceId={cabinet.id} /> : <div className="loading-text">Chargement…</div>}
    </div>
  );
}
