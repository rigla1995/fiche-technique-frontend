// Marque de LabFlow Compta, posée à côté du logo LabFlow : pages de connexion (fond nuit) et barre du haut de la
// coquille Compta (fond dégradé de LabFlow).
export default function PastilleCompta({ taille = 'normale', fond = 'nuit' }: { taille?: 'normale' | 'petite'; fond?: 'nuit' | 'degrade' }) {
  const petite = taille === 'petite';
  const degrade = fond === 'degrade';
  return (
    <span style={{
      fontSize: petite ? '0.68rem' : '0.78rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: degrade ? '#ffffff' : '#E0E7FF', padding: petite ? '3px 8px' : '5px 10px', borderRadius: 999,
      border: degrade ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(165,180,252,0.45)',
      background: degrade ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.18)', whiteSpace: 'nowrap',
    }}>
      Compta
    </span>
  );
}
