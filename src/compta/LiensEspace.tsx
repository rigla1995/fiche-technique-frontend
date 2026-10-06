import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { aDesComptabilites, allerVers, type Destination } from './passage';

// Boutons de passage d'un espace à l'autre (étape S3a), dans les barres du haut : « 📒 Comptabilité » dans LabFlow pour
// qui a au moins une comptabilité ; « 📦 Stock / Vente » dans LabFlow Compta pour un client ou un gérant. Le libellé se
// cache sur téléphone (classe de la barre), l'icône reste.
function BoutonPassage({ destination, icone, libelle, classeTexte }: { destination: Destination; icone: string; libelle: string; classeTexte: string }) {
  const [envoi, setEnvoi] = useState(false);
  const partir = async () => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await allerVers(destination);
    } catch {
      setEnvoi(false);
    }
  };
  return (
    <button type="button" onClick={partir} disabled={envoi} title={`Aller à ${libelle}`} aria-label={`Aller à ${libelle}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, cursor: envoi ? 'default' : 'pointer',
        background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff',
        fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', opacity: envoi ? 0.7 : 1,
      }}>
      <span>{envoi ? '…' : icone}</span>
      <span className={classeTexte}>{libelle}</span>
    </button>
  );
}

// Barre de LabFlow (app.) : visible si la personne a au moins une comptabilité ouverte.
export function LienComptabilite() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const peutAvoir = user?.role === 'client' || user?.role === 'gerant';
  useEffect(() => {
    if (!peutAvoir) return;
    let annule = false;
    aDesComptabilites().then((oui) => { if (!annule) setVisible(oui); });
    return () => { annule = true; };
  }, [user?.id, peutAvoir]);
  if (!peutAvoir || !visible) return null;
  return <BoutonPassage destination="compta" icone="📒" libelle="Comptabilité" classeTexte="bureau-seul" />;
}

// Barre de LabFlow Compta (compta.) : un client ou un gérant a aussi son espace Stock / Vente.
export function LienStockVente() {
  const { user } = useAuth();
  if (user?.role !== 'client' && user?.role !== 'gerant') return null;
  return <BoutonPassage destination="app" icone="📦" libelle="Stock / Vente" classeTexte="compta-bureau-seul" />;
}
