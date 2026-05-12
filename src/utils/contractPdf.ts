import jsPDF from 'jspdf';

export interface ContractPdfParams {
  clientNom: string;
  clientEmail: string;
  clientTel: string;
  nbActivites: number;
  nbLabos: number;
  nbGerants: number;
  montantOnboarding: number;
  totalMensuel: number;
  promos?: unknown[];
  appName: string;
}

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} DT`;
const todayFr = () => new Date().toLocaleDateString('fr-FR');

export function generateContractPdf(params: ContractPdfParams): string {
  const { clientNom, clientEmail, clientTel, nbActivites, nbLabos, nbGerants,
          montantOnboarding, totalMensuel, appName } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const PL = 20; const PR = 20;
  const TW = W - PL - PR;
  let y = 0;

  const line = (text: string, x: number, yy: number, size = 10, style: 'normal' | 'bold' = 'normal', color = '#111827') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(color);
    doc.text(text, x, yy);
  };

  const hRule = (yy: number, col = '#e2e8f0') => {
    doc.setDrawColor(col);
    doc.setLineWidth(0.3);
    doc.line(PL, yy, W - PR, yy);
  };

  const fillRect = (x: number, yy: number, w: number, h: number, col: string) => {
    doc.setFillColor(col);
    doc.rect(x, yy, w, h, 'F');
  };

  // Header
  fillRect(0, 0, W, 38, '#1e1b4b');
  line(appName, PL, 18, 20, 'bold', '#ffffff');
  line('CONTRAT D\'ABONNEMENT', PL, 28, 11, 'normal', '#c7d2fe');
  line(`Ref: CTR-${Date.now().toString().slice(-8)}`, W - PR, 28, 8, 'normal', '#a5b4fc');
  y = 50;

  // Parties
  fillRect(PL, y, TW, 7, '#f8fafc');
  line('PARTIES', PL + 3, y + 5, 9, 'bold', '#374151');
  y += 12;
  line('Prestataire', PL, y, 9, 'bold', '#6366f1');
  line(appName + ' — Plateforme de gestion des fiches techniques', PL + 35, y, 9, 'normal', '#1f2937');
  y += 7;
  line('Client', PL, y, 9, 'bold', '#6366f1');
  line(clientNom, PL + 35, y, 9, 'normal', '#1f2937');
  y += 5;
  line('', PL, y, 9);
  if (clientEmail) { line(`Email : ${clientEmail}`, PL + 35, y, 8, 'normal', '#6b7280'); y += 5; }
  if (clientTel)   { line(`Tél   : ${clientTel}`,   PL + 35, y, 8, 'normal', '#6b7280'); y += 5; }
  y += 5;
  hRule(y); y += 8;

  // Configuration
  fillRect(PL, y, TW, 7, '#f8fafc');
  line('CONFIGURATION SOUSCRITE', PL + 3, y + 5, 9, 'bold', '#374151');
  y += 12;

  const rows: [string, string, string][] = [
    ['Activité(s)', `${nbActivites} activité${nbActivites > 1 ? 's' : ''}`,
      nbActivites === 1 ? '200 DT/mois' : nbActivites === 2 ? '350 DT/mois' : `${nbActivites} × 120 = ${nbActivites * 120} DT/mois`],
    ...(nbLabos > 0 ? [['Labo(s)', `${nbLabos} labo${nbLabos > 1 ? 's' : ''}`, `${nbLabos} × 160 = ${nbLabos * 160} DT/mois`] as [string, string, string]] : []),
    ...(nbGerants > 0 ? [['Gérant(s)', `${nbGerants} gérant${nbGerants > 1 ? 's' : ''}`, `${nbGerants} × 80 = ${nbGerants * 80} DT/mois`] as [string, string, string]] : []),
  ];

  for (const [label, detail, prix] of rows) {
    line('•', PL + 2, y, 10, 'normal', '#6366f1');
    line(label, PL + 7, y, 9, 'bold', '#1f2937');
    line(detail, PL + 45, y, 9, 'normal', '#374151');
    line(prix, W - PR - 5, y, 9, 'normal', '#374151');
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  y += 3;

  // Totals box
  fillRect(PL, y, TW, 24, '#eff6ff');
  hRule(y, '#bfdbfe');
  line('Frais d\'onboarding (une fois) :', PL + 4, y + 8, 9, 'normal', '#374151');
  line(fmt(montantOnboarding), W - PR - 4, y + 8, 10, 'bold', '#1d4ed8');
  line('Mensualité (abonnement récurrent) :', PL + 4, y + 17, 9, 'normal', '#374151');
  line(fmt(totalMensuel), W - PR - 4, y + 17, 10, 'bold', '#1d4ed8');
  hRule(y + 24, '#bfdbfe');
  y += 32;

  // Terms
  fillRect(PL, y, TW, 7, '#f8fafc');
  line('CONDITIONS', PL + 3, y + 5, 9, 'bold', '#374151');
  y += 12;

  const terms = [
    `1. Le présent contrat prend effet à compter de la date d'activation du compte.`,
    `2. L'abonnement est facturé mensuellement. Le paiement est dû en début de mois.`,
    `3. Toute demande de supplément (activité, labo, gérant) fait l'objet d'un avenant.`,
    `4. Le prestataire se réserve le droit de suspendre l'accès en cas de non-paiement.`,
    `5. La résiliation doit être notifiée 30 jours à l'avance par email.`,
  ];
  for (const t of terms) {
    const lines = doc.splitTextToSize(t, TW - 4);
    for (const l of lines) {
      line(l, PL + 2, y, 8, 'normal', '#374151');
      y += 5;
    }
  }
  y += 5;

  // Signatures
  hRule(y); y += 10;
  fillRect(PL, y, TW, 7, '#f8fafc');
  line('SIGNATURES', PL + 3, y + 5, 9, 'bold', '#374151');
  y += 14;

  const col1 = PL; const col2 = PL + TW / 2 + 5;
  line('Prestataire', col1, y, 9, 'bold', '#374151');
  line('Client', col2, y, 9, 'bold', '#374151');
  y += 6;
  line(appName, col1, y, 8, 'normal', '#6b7280');
  line(clientNom, col2, y, 8, 'normal', '#6b7280');
  y += 5;
  line(`Date : ${todayFr()}`, col1, y, 8, 'normal', '#6b7280');
  line(`Date : ${todayFr()}`, col2, y, 8, 'normal', '#6b7280');
  y += 14;
  hRule(y - 4, '#9ca3af');
  hRule(y - 4 + (col2 - col1), '#9ca3af');
  line('Signature & cachet', col1, y + 2, 7, 'normal', '#9ca3af');
  line(`Signature — ${clientNom}`, col2, y + 2, 7, 'normal', '#9ca3af');
  y += 12;

  // Acceptance note
  fillRect(PL, y, TW, 11, '#fefce8');
  line('⚡ Validation numérique : l\'activation du compte par le client vaut acceptation du présent contrat.', PL + 3, y + 7, 7.5, 'normal', '#713f12');

  // Footer
  fillRect(0, 290, W, 10, '#f1f5f9');
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor('#9ca3af');
  doc.text(`${appName} — Contrat généré le ${todayFr()} — Confidentiel`, W / 2, 296, { align: 'center' });

  return doc.output('datauristring').split(',')[1]; // base64 only
}
