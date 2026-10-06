// Marque de LabFlow Compta, posée à côté du logo LabFlow (pages de connexion et en-tête de la coquille Compta).
export default function PastilleCompta({ taille = 'normale' }: { taille?: 'normale' | 'petite' }) {
  const petite = taille === 'petite';
  return (
    <span style={{
      fontSize: petite ? '0.68rem' : '0.78rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: '#E0E7FF', padding: petite ? '3px 8px' : '5px 10px', borderRadius: 999,
      border: '1px solid rgba(165,180,252,0.45)', background: 'rgba(99,102,241,0.18)', whiteSpace: 'nowrap',
    }}>
      Compta
    </span>
  );
}
