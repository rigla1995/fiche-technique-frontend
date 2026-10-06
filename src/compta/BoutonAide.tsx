// Bouton « ? » du bandeau d'une page de LabFlow Compta : celui de LabFlow (src/components/client/GuideButton.tsx), qui
// ouvre le manuel de LabFlow Compta à la fiche `section` (slug d'une fiche du produit « compta ») dans un NOUVEL onglet.
// Règle du projet : un seul « ? » par page.
export default function BoutonAide({ section }: { section: string }) {
  return (
    <a
      href={`/manuel#${section}`}
      target="_blank"
      rel="noopener"
      title="Voir le guide (nouvel onglet)"
      aria-label="Voir le guide (nouvel onglet)"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: '50%',
        background: 'rgba(255,255,255,0.20)', border: '1.5px solid rgba(255,255,255,0.5)',
        color: '#fff', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none',
        flexShrink: 0, transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.35)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.20)'; }}
    >
      ?
    </a>
  );
}
