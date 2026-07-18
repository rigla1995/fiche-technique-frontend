// Stepper d'états d'une commande acheteur : En attente → Expédiée → Livrée,
// l'annulation venant remplacer l'étape suivante (elle peut survenir à tout
// moment du flux). Utilisé dans le détail des commandes côté client
// (CommandesAcheteursPage) et côté portail (PortailCommandesPage).

export interface StepperHisto {
  statut: string;
  dateEffet: string | null;
  motif: string | null;
  parNom?: string | null;
}

interface Props {
  statut: string;               // statut courant de la commande
  historique: StepperHisto[];   // trace complète des transitions
  dateCommande?: string | null; // repli pour dater l'étape « En attente »
  showAuteur?: boolean;         // vue client : affiche « par X » sous l'étape
}

const FLOW = ['en_attente', 'expediee', 'livree'] as const;

const STEP_STYLE: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  en_attente: { label: 'En attente', icon: '⏳', color: '#92400e', bg: '#fef3c7' },
  expediee: { label: 'Expédiée', icon: '🚚', color: '#1d4ed8', bg: '#dbeafe' },
  livree: { label: 'Livrée', icon: '✓', color: '#166534', bg: '#dcfce7' },
  annulee: { label: 'Annulée', icon: '✕', color: '#991b1b', bg: '#fee2e2' },
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '';
  const [y, m, j] = d.split('-');
  return `${j}/${m}/${y}`;
};

export default function CommandeStepper({ statut, historique, dateCommande, showAuteur }: Props) {
  // Dernière trace par statut (dates, motif, auteur)
  const trace = new Map<string, StepperHisto>();
  for (const h of historique || []) trace.set(h.statut, h);

  // Position atteinte dans le flux nominal (une vente manuelle démarre à
  // « Expédiée » sans trace en_attente : on se base sur le statut ET la trace)
  const idxOf = (s: string) => FLOW.indexOf(s as (typeof FLOW)[number]);
  let reached = idxOf(statut);
  if (statut === 'annulee') {
    reached = 0;
    for (const h of historique || []) reached = Math.max(reached, idxOf(h.statut));
  }
  if (reached < 0) reached = 0;

  // Étapes affichées : le flux jusqu'à l'état atteint, puis « Annulée » à la
  // place de l'étape suivante si la commande a été annulée ; sinon le flux
  // complet avec les étapes restantes en attente.
  const steps: { statut: string; done: boolean; current: boolean }[] = statut === 'annulee'
    ? [
      ...FLOW.slice(0, reached + 1).map((s) => ({ statut: s as string, done: true, current: false })),
      { statut: 'annulee', done: true, current: true },
    ]
    : FLOW.map((s, i) => ({ statut: s as string, done: i <= reached, current: i === reached }));

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {steps.map((step, i) => {
        const st = STEP_STYLE[step.statut] || { label: step.statut, icon: '•', color: '#475569', bg: '#f1f5f9' };
        const h = trace.get(step.statut);
        const date = h?.dateEffet || (step.statut === 'en_attente' ? dateCommande : null);
        const lien = (done: boolean) => done ? st.color : '#e2e8f0';
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', minWidth: 0 }}>
            {i > 0 && (
              <span style={{ position: 'absolute', top: 16, left: 0, right: 'calc(50% + 22px)', height: 2, borderRadius: 2, background: lien(step.done) }} />
            )}
            {i < steps.length - 1 && (
              <span style={{ position: 'absolute', top: 16, left: 'calc(50% + 22px)', right: 0, height: 2, borderRadius: 2, background: lien(steps[i + 1].done) }} />
            )}
            <span style={{
              width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: step.statut === 'livree' || step.statut === 'annulee' ? '1rem' : '0.95rem', fontWeight: 800,
              background: step.done ? st.bg : '#f8fafc',
              border: step.done ? `2px solid ${st.color}` : '2px dashed #e2e8f0',
              color: step.done ? st.color : '#cbd5e1',
              boxShadow: step.current ? `0 0 0 4px ${st.bg}` : 'none',
              filter: step.done ? 'none' : 'grayscale(1) opacity(0.5)',
              zIndex: 1,
            }}>
              {st.icon}
            </span>
            <span style={{ marginTop: 7, fontSize: '0.74rem', fontWeight: step.done ? 800 : 600, color: step.done ? st.color : '#94a3b8', textAlign: 'center' }}>
              {st.label}
            </span>
            {date && step.done && (
              <span style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2, textAlign: 'center' }}>le {fmtDate(date)}</span>
            )}
            {showAuteur && step.done && h?.parNom && (
              <span style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: 1, textAlign: 'center' }}>par {h.parNom}</span>
            )}
            {step.statut === 'annulee' && h?.motif && (
              <span style={{ fontSize: '0.68rem', color: '#b91c1c', fontWeight: 600, marginTop: 3, textAlign: 'center', maxWidth: 150 }}>{h.motif}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
