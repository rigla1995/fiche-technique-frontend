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
  const PW = 210; // page width
  const PH = 297; // page height
  const ML = 18;  // margin left
  const MR = 18;  // margin right
  const CW = PW - ML - MR; // content width
  const RX = PW - MR;      // right edge x (for right-aligned text)
  let y = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const setFont = (size: number, style: 'normal' | 'bold' = 'normal', color = '#111827') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    doc.setTextColor(r, g, b);
  };

  const txt = (text: string, x: number, yy: number, opts?: { align?: 'left' | 'center' | 'right' }) =>
    doc.text(text, x, yy, opts);

  const rect = (x: number, yy: number, w: number, h: number, hexFill: string) => {
    const r = parseInt(hexFill.slice(1, 3), 16);
    const g = parseInt(hexFill.slice(3, 5), 16);
    const b = parseInt(hexFill.slice(5, 7), 16);
    doc.setFillColor(r, g, b);
    doc.rect(x, yy, w, h, 'F');
  };

  const hrule = (yy: number, hexCol = '#e2e8f0', x1 = ML, x2 = RX) => {
    const r = parseInt(hexCol.slice(1, 3), 16);
    const g = parseInt(hexCol.slice(3, 5), 16);
    const b = parseInt(hexCol.slice(5, 7), 16);
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.25);
    doc.line(x1, yy, x2, yy);
  };

  const sectionHeader = (label: string, yy: number): number => {
    rect(ML, yy, CW, 7, '#f0f4ff');
    hrule(yy, '#c7d2fe');
    hrule(yy + 7, '#c7d2fe');
    setFont(8, 'bold', '#3730a3');
    txt(label, ML + 4, yy + 5);
    return yy + 12;
  };

  // ── HEADER BAND ───────────────────────────────────────────────────────────

  // Deep navy background
  rect(0, 0, PW, 42, '#1e1b4b');
  // Subtle accent strip
  rect(0, 38, PW, 4, '#4338ca');

  setFont(22, 'bold', '#ffffff');
  txt(appName, ML, 17);

  setFont(10, 'normal', '#c7d2fe');
  txt('CONTRAT D\'ABONNEMENT', ML, 27);

  setFont(8, 'normal', '#818cf8');
  const ref = `Réf. CTR-${Date.now().toString().slice(-8)}`;
  txt(ref, RX, 17, { align: 'right' });

  setFont(8, 'normal', '#a5b4fc');
  txt(`Émis le ${todayFr()}`, RX, 24, { align: 'right' });

  y = 54;

  // ── PARTIES ───────────────────────────────────────────────────────────────

  y = sectionHeader('PARTIES AU CONTRAT', y);

  // Two-column party block
  const mid = ML + CW / 2 + 4;

  // Left: Prestataire
  rect(ML, y, CW / 2 - 4, 26, '#f8fafc');
  hrule(y, '#e2e8f0', ML, ML + CW / 2 - 4);
  hrule(y + 26, '#e2e8f0', ML, ML + CW / 2 - 4);
  setFont(7, 'bold', '#6366f1'); txt('PRESTATAIRE', ML + 4, y + 6);
  setFont(9, 'bold', '#0f172a'); txt(appName, ML + 4, y + 13);
  setFont(7, 'normal', '#64748b'); txt('Plateforme de gestion des fiches techniques', ML + 4, y + 19);

  // Right: Client
  rect(mid, y, CW / 2 - 4, 26, '#f8fafc');
  hrule(y, '#e2e8f0', mid, mid + CW / 2 - 4);
  hrule(y + 26, '#e2e8f0', mid, mid + CW / 2 - 4);
  setFont(7, 'bold', '#6366f1'); txt('CLIENT', mid + 4, y + 6);
  setFont(9, 'bold', '#0f172a'); txt(clientNom, mid + 4, y + 13);
  setFont(7, 'normal', '#64748b');
  if (clientEmail) txt(clientEmail, mid + 4, y + 19);
  if (clientTel)   txt(`Tél : ${clientTel}`, mid + 4, y + 24);

  y += 34;

  // ── CONFIGURATION SOUSCRITE ───────────────────────────────────────────────

  y = sectionHeader('CONFIGURATION SOUSCRITE', y);

  // Table header row
  rect(ML, y, CW, 7, '#eef2ff');
  setFont(7, 'bold', '#4338ca');
  txt('Poste', ML + 4, y + 5);
  txt('Quantité', ML + 70, y + 5);
  txt('Tarif mensuel', RX - 4, y + 5, { align: 'right' });
  y += 7;
  hrule(y, '#c7d2fe');
  y += 2;

  // Build rows
  const configRows: { label: string; qty: string; price: string }[] = [];
  if (nbActivites === 1) {
    configRows.push({ label: 'Activité', qty: '1', price: '200 DT / mois' });
  } else if (nbActivites === 2) {
    configRows.push({ label: 'Activités', qty: '2', price: '350 DT / mois (forfait)' });
  } else {
    configRows.push({ label: 'Activités', qty: String(nbActivites), price: `${nbActivites} × 120 = ${nbActivites * 120} DT / mois` });
  }
  if (nbLabos > 0)   configRows.push({ label: 'Labo(s)', qty: String(nbLabos), price: `${nbLabos} × 160 = ${nbLabos * 160} DT / mois` });
  if (nbGerants > 0) configRows.push({ label: 'Gérant(s) sup.', qty: String(nbGerants), price: `${nbGerants} × 80 = ${nbGerants * 80} DT / mois` });

  for (let i = 0; i < configRows.length; i++) {
    const row = configRows[i];
    if (i % 2 === 0) rect(ML, y, CW, 8, '#fafbff');
    setFont(9, 'normal', '#0f172a'); txt(row.label, ML + 4, y + 5.5);
    setFont(9, 'bold', '#4338ca');   txt(row.qty, ML + 70, y + 5.5);
    setFont(8, 'normal', '#374151'); txt(row.price, RX - 4, y + 5.5, { align: 'right' });
    hrule(y + 8, '#f1f5f9');
    y += 8;
  }
  y += 4;

  // ── RÉCAPITULATIF FINANCIER ────────────────────────────────────────────────

  y = sectionHeader('RÉCAPITULATIF FINANCIER', y);

  // Totals table
  rect(ML, y, CW, 20, '#eff6ff');
  hrule(y, '#bfdbfe');

  setFont(9, 'normal', '#374151'); txt('Frais d\'onboarding (versement unique)', ML + 4, y + 7);
  setFont(10, 'bold', '#1d4ed8');  txt(fmt(montantOnboarding), RX - 4, y + 7, { align: 'right' });

  hrule(y + 10, '#dbeafe', ML + 4, RX - 4);

  setFont(9, 'bold', '#1e40af');  txt('Mensualité (abonnement récurrent)', ML + 4, y + 17);
  setFont(12, 'bold', '#1d4ed8'); txt(fmt(totalMensuel), RX - 4, y + 17, { align: 'right' });

  hrule(y + 20, '#bfdbfe');
  y += 26;

  // ── CONDITIONS GÉNÉRALES ──────────────────────────────────────────────────

  y = sectionHeader('CONDITIONS GÉNÉRALES', y);

  const terms = [
    '1. Ce contrat entre en vigueur à la date d\'activation du compte par le client.',
    '2. L\'abonnement est facturé mensuellement, dû en début de période.',
    '3. Toute modification de configuration (ajout d\'activité, labo ou gérant) fait l\'objet d\'un avenant tarifaire.',
    '4. En cas de non-paiement, le prestataire se réserve le droit de suspendre l\'accès sans préavis.',
    '5. La résiliation doit être notifiée par email avec un préavis de 30 jours calendaires.',
  ];
  setFont(8, 'normal', '#374151');
  for (const t of terms) {
    const lines = doc.splitTextToSize(t, CW - 8);
    for (const l of lines) { txt(l, ML + 4, y); y += 5; }
    y += 1;
  }
  y += 4;

  // ── SIGNATURES ────────────────────────────────────────────────────────────

  y = sectionHeader('SIGNATURES', y);

  const sw = (CW - 8) / 2; // signature box width
  const sx1 = ML;
  const sx2 = ML + sw + 8;

  // Prestataire box
  rect(sx1, y, sw, 32, '#f8fafc');
  hrule(y, '#e2e8f0', sx1, sx1 + sw);
  hrule(y + 32, '#e2e8f0', sx1, sx1 + sw);
  setFont(7, 'bold', '#374151'); txt('PRESTATAIRE', sx1 + 4, y + 6);
  setFont(8, 'normal', '#64748b'); txt(appName, sx1 + 4, y + 12);
  setFont(7, 'normal', '#64748b'); txt(`Date : ${todayFr()}`, sx1 + 4, y + 18);
  hrule(y + 26, '#9ca3af', sx1 + 4, sx1 + sw - 4);
  setFont(7, 'normal', '#9ca3af'); txt('Signature & cachet', sx1 + 4, y + 31);

  // Client box
  rect(sx2, y, sw, 32, '#f8fafc');
  hrule(y, '#e2e8f0', sx2, sx2 + sw);
  hrule(y + 32, '#e2e8f0', sx2, sx2 + sw);
  setFont(7, 'bold', '#374151'); txt('CLIENT', sx2 + 4, y + 6);
  setFont(8, 'normal', '#64748b'); txt(clientNom, sx2 + 4, y + 12);
  setFont(7, 'normal', '#64748b'); txt(`Date : ${todayFr()}`, sx2 + 4, y + 18);
  hrule(y + 26, '#9ca3af', sx2 + 4, sx2 + sw - 4);
  setFont(7, 'normal', '#9ca3af'); txt(`Signature — ${clientNom}`, sx2 + 4, y + 31);

  y += 40;

  // ── ACCEPTATION NUMÉRIQUE ─────────────────────────────────────────────────

  rect(ML, y, CW, 10, '#fefce8');
  hrule(y, '#fde68a');
  hrule(y + 10, '#fde68a');
  setFont(7.5, 'normal', '#92400e');
  txt('Validation numérique : l\'activation du compte par le client vaut acceptation du présent contrat.', ML + 4, y + 6.5);

  // ── FOOTER ────────────────────────────────────────────────────────────────

  rect(0, PH - 12, PW, 12, '#1e1b4b');
  setFont(7, 'normal', '#a5b4fc');
  txt(`${appName}  ·  Contrat généré le ${todayFr()}  ·  Document confidentiel`, PW / 2, PH - 5.5, { align: 'center' });

  return doc.output('datauristring').split(',')[1];
}
