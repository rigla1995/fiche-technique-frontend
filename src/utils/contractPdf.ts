import jsPDF from 'jspdf';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AvenantPdfParams {
  clientNom: string;
  clientEmail?: string;
  nbActivitesAdded: number;
  nbLabosAdded: number;
  nbGerantsAdded: number;
  /** Option Acheteurs : QUOTA TOTAL cible demandé (palier 10/20/50/100) — absent = pas de changement. */
  acheteursCible?: number;
  /** Formule d'activités du compte (affichée sur la ligne Activités). */
  formuleActivites?: 'basique' | 'premium';
  nbActivites: number;
  nbLabos: number;
  nbGerants: number;
  ancienMensuel: number;
  nouveauMensuel: number;
  effectifMensuel?: number;
  notesAdmin?: string;
  appName: string;
  dateAvenant?: string; // ISO date string
  /** Coûts mensuels TOTAUX par poste (fournis par le backend). Absents → aucun prix affiché. */
  activiteCost?: number;
  laboCost?: number;
  gerantCost?: number;
  /** Option Acheteurs : quota souscrit (absent → ligne affichée sans quantité). */
  nbAcheteurs?: number;
  /** Option Acheteurs : coût mensuel du palier (0 ou absent → pas de ligne). */
  acheteursCost?: number;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

// Custom formatter — avoids toLocaleString's non-breaking space ( )
// which jsPDF renders as '/' in some environments
const fmt = (n: number) => {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${s} DT`;
};
const todayFr = () => new Date().toLocaleDateString('fr-FR');

function makeDoc() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW = 210;
  const PH = 297;
  const ML = 18;
  const MR = 18;
  const CW = PW - ML - MR;
  const RX = PW - MR;

  const hex2rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];

  const setFont = (size: number, style: 'normal' | 'bold' = 'normal', color = '#111827') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(...hex2rgb(color));
  };

  const txt = (text: string, x: number, y: number, opts?: { align?: 'left' | 'center' | 'right' }) =>
    doc.text(text, x, y, opts);

  const rect = (x: number, y: number, w: number, h: number, hexFill: string) => {
    doc.setFillColor(...hex2rgb(hexFill));
    doc.rect(x, y, w, h, 'F');
  };

  const hrule = (y: number, hexCol = '#e2e8f0', x1 = ML, x2 = RX) => {
    doc.setDrawColor(...hex2rgb(hexCol));
    doc.setLineWidth(0.25);
    doc.line(x1, y, x2, y);
  };

  const sectionHeader = (label: string, y: number): number => {
    rect(ML, y, CW, 7, '#f0f4ff');
    hrule(y, '#c7d2fe');
    hrule(y + 7, '#c7d2fe');
    setFont(8, 'bold', '#3730a3');
    txt(label, ML + 4, y + 5);
    return y + 12;
  };

  return { doc, PW, PH, ML, MR, CW, RX, setFont, txt, rect, hrule, sectionHeader };
}

// ── Avenant PDF ───────────────────────────────────────────────────────────────

export function generateAvenantPdf(params: AvenantPdfParams): string {
  const {
    clientNom, clientEmail = '',
    nbActivitesAdded, nbLabosAdded, nbGerantsAdded, acheteursCible,
    nbActivites, nbLabos, nbGerants,
    ancienMensuel, nouveauMensuel, effectifMensuel,
    notesAdmin = '', appName,
    dateAvenant,
    activiteCost, laboCost, gerantCost,
    formuleActivites, nbAcheteurs, acheteursCost,
  } = params;

  const { doc, PW, PH, ML, CW, RX, setFont, txt, rect, hrule, sectionHeader } = makeDoc();
  const dateFr = dateAvenant
    ? new Date(dateAvenant).toLocaleDateString('fr-FR')
    : todayFr();
  let y = 0;

  // ── HEADER (amber/orange accent for avenant) ───────────────────────────────
  rect(0, 0, PW, 42, '#1e1b4b');
  rect(0, 38, PW, 4, '#d97706');
  setFont(22, 'bold', '#ffffff');   txt(appName, ML, 17);
  setFont(10, 'normal', '#fde68a'); txt('AVENANT AU CONTRAT D\'ABONNEMENT', ML, 27);
  setFont(8, 'normal', '#fbbf24');  txt(`Réf. AVN-${Date.now().toString().slice(-8)}`, RX, 17, { align: 'right' });
  setFont(8, 'normal', '#fcd34d');  txt(`Émis le ${dateFr}`, RX, 24, { align: 'right' });
  y = 54;

  // ── OBJET ──────────────────────────────────────────────────────────────────
  y = sectionHeader('OBJET DE L\'AVENANT', y);
  rect(ML, y, CW, 14, '#fffbeb');
  hrule(y, '#fde68a'); hrule(y + 14, '#fde68a');
  setFont(8, 'normal', '#78350f');
  const objetLines = doc.splitTextToSize(
    `Le présent avenant modifie le contrat d'abonnement en vigueur entre ${appName} et le client ${clientNom}. ` +
    `Il prend effet à compter du ${dateFr} et complète les termes initiaux du contrat sans les remplacer.`,
    CW - 8
  );
  for (const l of objetLines) { txt(l, ML + 4, y + 5); y += 5; }
  y = (y < 54 + 12 + 14 + 5) ? 54 + 12 + 14 + 5 : y + 5;
  y += 4;

  // ── CLIENT ─────────────────────────────────────────────────────────────────
  y = sectionHeader('CLIENT', y);
  rect(ML, y, CW, 16, '#f8fafc');
  hrule(y, '#e2e8f0'); hrule(y + 16, '#e2e8f0');
  setFont(9, 'bold', '#0f172a');  txt(clientNom, ML + 4, y + 7);
  setFont(7, 'normal', '#64748b');
  if (clientEmail) txt(clientEmail, ML + 4, y + 13);
  y += 22;

  // ── MODIFICATION APPORTÉE ──────────────────────────────────────────────────
  y = sectionHeader('MODIFICATION APPORTÉE', y);

  const addedParts: string[] = [];
  if (nbActivitesAdded > 0) addedParts.push(`+${nbActivitesAdded} activité${nbActivitesAdded > 1 ? 's' : ''}`);
  if (nbLabosAdded > 0)     addedParts.push(`+${nbLabosAdded} labo${nbLabosAdded > 1 ? 's' : ''}`);
  if (nbGerantsAdded > 0)   addedParts.push(`+${nbGerantsAdded} gérant${nbGerantsAdded > 1 ? 's' : ''}`);
  if (acheteursCible && acheteursCible > 0) addedParts.push(`Option Acheteurs → palier ${acheteursCible}`);

  // Green highlight for added capacity
  rect(ML, y, CW, 16, '#f0fdf4');
  hrule(y, '#bbf7d0'); hrule(y + 16, '#bbf7d0');
  setFont(7, 'bold', '#15803d');   txt('CAPACITÉ AJOUTÉE', ML + 4, y + 6);
  setFont(12, 'bold', '#14532d'); txt(addedParts.join('   ·   '), ML + 4, y + 13);
  y += 22;

  // ── NOUVELLE CONFIGURATION ─────────────────────────────────────────────────
  y = sectionHeader('NOUVELLE CONFIGURATION', y);
  rect(ML, y, CW, 7, '#eef2ff');
  setFont(7, 'bold', '#4338ca');
  txt('Poste', ML + 4, y + 5); txt('Qté', ML + 70, y + 5);
  txt('Tarif mensuel', RX - 4, y + 5, { align: 'right' });
  y += 7; hrule(y, '#c7d2fe'); y += 2;

  // Coûts mensuels par poste fournis par le backend (barème formules) ;
  // absents → aucun prix affiché (on n'invente jamais de montant côté front).
  const posteTarif = (cost?: number): string => (cost != null ? `${fmt(cost)} / mois` : '—');
  const formuleSuffix = nbActivites >= 1 && formuleActivites
    ? ` (${formuleActivites === 'basique' ? 'Basique' : 'Premium'})`
    : '';
  const newRows: { label: string; qty: string; price: string }[] = [
    { label: `${nbActivites > 1 ? 'Activités' : 'Activité'}${formuleSuffix}`, qty: String(nbActivites), price: posteTarif(activiteCost) },
  ];
  if (nbLabos > 0)   newRows.push({ label: 'Labo(s)', qty: String(nbLabos), price: posteTarif(laboCost) });
  if (nbGerants > 0) newRows.push({ label: 'Gérant(s) sup.', qty: String(nbGerants), price: posteTarif(gerantCost) });
  // Option Acheteurs : sans cette ligne, les postes ne sommeraient pas au nouveau mensuel affiché.
  if (acheteursCost != null && acheteursCost > 0) {
    newRows.push({ label: 'Option Acheteurs', qty: nbAcheteurs != null ? String(nbAcheteurs) : '—', price: posteTarif(acheteursCost) });
  }

  for (let i = 0; i < newRows.length; i++) {
    const row = newRows[i];
    if (i % 2 === 0) rect(ML, y, CW, 8, '#fafbff');
    setFont(9, 'normal', '#0f172a'); txt(row.label, ML + 4, y + 5.5);
    setFont(9, 'bold', '#4338ca');   txt(row.qty, ML + 70, y + 5.5);
    setFont(8, 'normal', '#374151'); txt(row.price, RX - 4, y + 5.5, { align: 'right' });
    hrule(y + 8, '#f1f5f9');
    y += 8;
  }
  y += 4;

  // ── IMPACT FINANCIER ───────────────────────────────────────────────────────
  y = sectionHeader('IMPACT FINANCIER', y);

  // Ancien mensuel (grey, 12mm)
  rect(ML, y, CW, 12, '#f8fafc');
  hrule(y, '#e2e8f0');
  setFont(8, 'normal', '#64748b'); txt('Mensualité précédente', ML + 4, y + 8);
  setFont(10, 'normal', '#94a3b8'); txt(fmt(ancienMensuel), RX - 4, y + 8, { align: 'right' });
  hrule(y + 12, '#e2e8f0');
  y += 12;

  // Nouveau mensuel: label LEFT + price RIGHT on same y
  rect(ML, y, CW, 16, '#dbeafe');
  hrule(y, '#93c5fd');
  setFont(9, 'bold', '#1e40af');
  txt('Nouvelle mensualite', ML + 4, y + 7);
  setFont(11, 'bold', '#1d4ed8');
  txt(fmt(nouveauMensuel) + ' /mois', RX - 4, y + 7, { align: 'right' });
  setFont(7, 'normal', '#3b82f6');
  txt(effectifMensuel && effectifMensuel < nouveauMensuel ? `Promo active : ${fmt(effectifMensuel)} /mois effectif` : 'Facturation mensuelle recurrente', ML + 4, y + 12);
  hrule(y + 16, '#1d4ed8');
  y += 22;

  // ── NOTE ADMIN ─────────────────────────────────────────────────────────────
  if (notesAdmin.trim()) {
    y = sectionHeader('NOTE', y);
    rect(ML, y, CW, 10, '#f8fafc'); hrule(y, '#e2e8f0'); hrule(y + 10, '#e2e8f0');
    setFont(8, 'normal', '#374151');
    const noteLines = doc.splitTextToSize(notesAdmin, CW - 8);
    let ny = y + 5;
    for (const l of noteLines) { txt(l, ML + 4, ny); ny += 4.5; }
    y = ny + 8;
  }

  // ── SIGNATURES ─────────────────────────────────────────────────────────────
  y = sectionHeader('SIGNATURES', y);
  const sw = (CW - 8) / 2;
  const sx1 = ML;
  const sx2 = ML + sw + 8;

  rect(sx1, y, sw, 32, '#f8fafc'); hrule(y, '#e2e8f0', sx1, sx1 + sw); hrule(y + 32, '#e2e8f0', sx1, sx1 + sw);
  setFont(7, 'bold', '#374151');   txt('PRESTATAIRE', sx1 + 4, y + 6);
  setFont(8, 'normal', '#64748b'); txt(appName, sx1 + 4, y + 12);
  setFont(7, 'normal', '#64748b'); txt(`Date : ${dateFr}`, sx1 + 4, y + 18);
  hrule(y + 26, '#9ca3af', sx1 + 4, sx1 + sw - 4);
  setFont(7, 'normal', '#9ca3af'); txt('Signature & cachet', sx1 + 4, y + 31);

  rect(sx2, y, sw, 32, '#f8fafc'); hrule(y, '#e2e8f0', sx2, sx2 + sw); hrule(y + 32, '#e2e8f0', sx2, sx2 + sw);
  setFont(7, 'bold', '#374151');   txt('CLIENT', sx2 + 4, y + 6);
  setFont(8, 'normal', '#64748b'); txt(clientNom, sx2 + 4, y + 12);
  setFont(7, 'normal', '#64748b'); txt(`Date : ${dateFr}`, sx2 + 4, y + 18);
  hrule(y + 26, '#9ca3af', sx2 + 4, sx2 + sw - 4);
  setFont(7, 'normal', '#9ca3af'); txt(`Signature — ${clientNom}`, sx2 + 4, y + 31);
  y += 40;

  // ── ACCEPTATION ────────────────────────────────────────────────────────────
  rect(ML, y, CW, 10, '#fefce8');
  hrule(y, '#fde68a'); hrule(y + 10, '#fde68a');
  setFont(7.5, 'normal', '#92400e');
  txt('Validation numérique : la validation par le client de cet avenant vaut acceptation des nouvelles conditions.', ML + 4, y + 6.5);

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  rect(0, PH - 12, PW, 12, '#1e1b4b');
  setFont(7, 'normal', '#fbbf24');
  txt(`${appName}  ·  Avenant généré le ${todayFr()}  ·  Document confidentiel`, PW / 2, PH - 5.5, { align: 'center' });

  return doc.output('datauristring').split(',')[1];
}
