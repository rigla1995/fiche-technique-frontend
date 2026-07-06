import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseBlocks } from '../components/common/MarkdownView';
import type { Block, CalloutKind } from '../components/common/MarkdownView';
import type { ManuelSection } from '../components/client/GuidePage';

/**
 * Export PDF du manuel d'utilisation : couverture, sommaire paginé, contenu
 * rendu depuis le markdown des sections (même parseur que l'affichage écran).
 * Les polices PDF standard ne rendent pas les emojis : ils sont retirés.
 */

const PW = 210;
const PH = 297;
const ML = 16;
const MR = 16;
const CW = PW - ML - MR;
const FOOT = 16; // marge basse réservée au pied de page

const BLEU = '#1e40af';
const BLEU_CLAIR = '#3b82f6';

const hex2rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const stripEmoji = (s: string) =>
  s.replace(/[\p{Extended_Pictographic}️‍⃣]/gu, '').replace(/\s{2,}/g, ' ').trim();

// Inline markdown → texte brut pour le PDF (**gras**, *ital*, `code`, [lien](#x))
const plain = (s: string) =>
  stripEmoji(
    s
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*\s][^*]*)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
  );

const CALLOUT_PDF: Record<CalloutKind, { bg: string; color: string; label: string }> = {
  astuce: { bg: '#eff6ff', color: '#1d4ed8', label: 'ASTUCE' },
  attention: { bg: '#fff7ed', color: '#c2410c', label: 'ATTENTION' },
  regle: { bg: '#f0fdf4', color: '#15803d', label: 'RÈGLE' },
  exemple: { bg: '#fefce8', color: '#854d0e', label: 'EXEMPLE' },
};

export function buildManuelPdf(sections: ManuelSection[]): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;

  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color = '#334155') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(...hex2rgb(color));
  };
  const fill = (x: number, yy: number, w: number, h: number, hex: string) => {
    doc.setFillColor(...hex2rgb(hex));
    doc.rect(x, yy, w, h, 'F');
  };
  const ensure = (h: number) => {
    if (y + h > PH - FOOT) {
      doc.addPage();
      y = 18;
    }
  };

  // ── Couverture ───────────────────────────────────────────────────────────────
  fill(0, 0, PW, 110, BLEU);
  fill(0, 104, PW, 6, BLEU_CLAIR);
  setFont(30, 'bold', '#ffffff');
  doc.text('Manuel d\'utilisation', PW / 2, 55, { align: 'center' });
  setFont(14, 'normal', '#dbeafe');
  doc.text('LabFlow — Guide complet de l\'application', PW / 2, 68, { align: 'center' });
  setFont(10, 'normal', '#bfdbfe');
  doc.text(`Édition du ${new Date().toLocaleDateString('fr-FR')}`, PW / 2, 80, { align: 'center' });
  setFont(10, 'normal', '#475569');
  const intro = doc.splitTextToSize(
    'Ce manuel présente LabFlow, son vocabulaire, chacun de ses écrans et le détail des calculs '
    + 'utilisés (coûts de revient, valeur de stock, prix moyens pondérés…). La version en ligne, '
    + 'accessible depuis le menu « Manuel d\'utilisation », reste la référence la plus à jour.',
    CW
  );
  doc.text(intro, ML, 130);

  // ── Pages réservées au sommaire ──────────────────────────────────────────────
  const parties: { partie: string; items: ManuelSection[] }[] = [];
  for (const s of sections) {
    const last = parties[parties.length - 1];
    if (last && last.partie === s.partie) last.items.push(s);
    else parties.push({ partie: s.partie, items: [s] });
  }
  const tocLineH = 6.4;
  // Simulation exacte de la pagination du sommaire (mêmes règles que son rendu plus bas)
  let tocPages = 1;
  {
    let ty = 34; // position après le titre « Sommaire »
    for (const g of parties) {
      for (let k = 0; k <= g.items.length; k++) {
        if (ty > PH - FOOT - 6) { tocPages += 1; ty = 20; }
        ty += k === 0 ? 2.5 + tocLineH : tocLineH - 1.2;
      }
    }
  }
  for (let i = 0; i < tocPages; i++) doc.addPage();
  const firstTocPage = 2;

  // ── Contenu ──────────────────────────────────────────────────────────────────
  const tocEntries: { label: string; page: number; isPartie: boolean }[] = [];

  const renderBlocks = (blocks: Block[]) => {
    for (const b of blocks) {
      switch (b.type) {
        case 'h2': {
          ensure(14);
          y += 4;
          setFont(13, 'bold', '#1e293b');
          const l = doc.splitTextToSize(plain(b.text), CW);
          doc.text(l, ML, y);
          y += l.length * 5.6 + 2;
          break;
        }
        case 'h3': {
          ensure(11);
          y += 2.5;
          setFont(10.5, 'bold', '#2563eb');
          const l = doc.splitTextToSize(plain(b.text), CW);
          doc.text(l, ML, y);
          y += l.length * 4.8 + 1.5;
          break;
        }
        case 'p': {
          setFont(9.5, 'normal', '#334155');
          const l = doc.splitTextToSize(plain(b.text), CW);
          ensure(l.length * 4.5 + 2);
          doc.text(l, ML, y);
          y += l.length * 4.5 + 2.5;
          break;
        }
        case 'ul':
        case 'ol': {
          setFont(9.5, 'normal', '#374151');
          b.items.forEach((it, idx) => {
            const prefix = b.type === 'ul' ? '•  ' : `${idx + 1}.  `;
            const l = doc.splitTextToSize(plain(it), CW - 7);
            ensure(l.length * 4.5 + 1);
            doc.text(prefix, ML, y);
            doc.text(l, ML + 7, y);
            y += l.length * 4.5 + 1.2;
          });
          y += 1.5;
          break;
        }
        case 'callout': {
          const c = CALLOUT_PDF[b.kind];
          setFont(9, 'normal', c.color);
          const l = doc.splitTextToSize(plain(b.text.replace(/\n/g, ' ')), CW - 10);
          const h = l.length * 4.3 + 10;
          ensure(h + 3);
          fill(ML, y - 3.5, CW, h, c.bg);
          setFont(7.5, 'bold', c.color);
          doc.text(c.label, ML + 5, y + 1);
          setFont(9, 'normal', c.color);
          doc.text(l, ML + 5, y + 6);
          y += h + 1;
          break;
        }
        case 'formule': {
          setFont(9, 'bold', '#1e293b');
          const exprLines: string[] = [];
          for (const line of b.expr.split('\n')) exprLines.push(...doc.splitTextToSize(stripEmoji(line), CW - 10));
          const noteLines = b.note ? doc.splitTextToSize(plain(b.note), CW - 10) : [];
          const h = exprLines.length * 4.6 + noteLines.length * 4 + 12;
          ensure(h + 3);
          fill(ML, y - 3.5, CW, h, '#f1f5f9');
          setFont(7.5, 'bold', '#64748b');
          doc.text(stripEmoji(b.label).toUpperCase(), ML + 5, y + 1);
          doc.setFont('courier', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(...hex2rgb('#1e293b'));
          doc.text(exprLines, ML + 5, y + 6.5);
          if (noteLines.length) {
            setFont(8, 'normal', '#64748b');
            doc.text(noteLines, ML + 5, y + 7.5 + exprLines.length * 4.6);
          }
          y += h + 1;
          break;
        }
        case 'table': {
          ensure(20);
          autoTable(doc, {
            head: [b.header.map(plain)],
            body: b.rows.map((r) => r.map(plain)),
            startY: y,
            margin: { left: ML, right: MR, bottom: FOOT },
            styles: { fontSize: 8.2, cellPadding: 1.8, textColor: hex2rgb('#334155') },
            headStyles: { fillColor: hex2rgb('#e0e7ff'), textColor: hex2rgb('#1e293b'), fontStyle: 'bold' },
            alternateRowStyles: { fillColor: hex2rgb('#f8fafc') },
            theme: 'grid',
          });
          y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
          break;
        }
      }
    }
  };

  for (const g of parties) {
    // Bandeau de partie sur nouvelle page
    doc.addPage();
    y = 0;
    fill(0, 0, PW, 24, BLEU);
    setFont(14, 'bold', '#ffffff');
    doc.text(stripEmoji(g.partie), ML, 15);
    y = 36;
    tocEntries.push({ label: g.partie, page: doc.getCurrentPageInfo().pageNumber, isPartie: true });

    for (const s of g.items) {
      ensure(24);
      tocEntries.push({ label: s.titre, page: doc.getCurrentPageInfo().pageNumber, isPartie: false });
      // Titre de section
      setFont(8, 'bold', '#94a3b8');
      doc.text(stripEmoji(g.partie).toUpperCase(), ML, y);
      y += 5;
      renderBlocks(parseBlocks(s.contenu));
      y += 6;
    }
  }

  // ── Sommaire (écrit sur les pages réservées) ─────────────────────────────────
  let tocPage = firstTocPage;
  doc.setPage(tocPage);
  let ty = 24;
  setFont(16, 'bold', '#1e293b');
  doc.text('Sommaire', ML, ty);
  ty += 10;
  for (const e of tocEntries) {
    if (ty > PH - FOOT - 6) {
      tocPage += 1;
      if (tocPage >= firstTocPage + tocPages) break; // sécurité : ne pas déborder sur le contenu
      doc.setPage(tocPage);
      ty = 20;
    }
    if (e.isPartie) {
      ty += 2.5;
      setFont(10.5, 'bold', '#1e40af');
      doc.text(stripEmoji(e.label), ML, ty);
    } else {
      setFont(9.5, 'normal', '#475569');
      doc.text(stripEmoji(e.label), ML + 6, ty);
    }
    setFont(9, 'normal', '#94a3b8');
    doc.text(String(e.page), PW - MR, ty, { align: 'right' });
    ty += tocLineH - (e.isPartie ? 0 : 1.2);
  }

  // ── Pieds de page ────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    setFont(7.5, 'normal', '#94a3b8');
    doc.text('LabFlow — Manuel d\'utilisation', ML, PH - 8);
    doc.text(`${p} / ${total}`, PW - MR, PH - 8, { align: 'right' });
  }

  doc.save('LabFlow-Manuel-utilisation.pdf');
}
