import type { ChurchEvent, Moment } from '@/app/page';

type TimedMoment = Moment & { time: string; end: string };

function safeFileName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'culto';
}

export async function downloadSchedulePdf(event: ChurchEvent, moments: TimedMoment[], total: number) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = width - margin * 2;
  let y = 18;

  const newPage = () => {
    doc.addPage();
    y = 18;
    header(false);
  };
  const ensure = (needed: number) => { if (y + needed > height - 18) newPage(); };
  const header = (cover = true) => {
    doc.setFillColor(21, 56, 45);
    doc.rect(0, 0, width, cover ? 48 : 13, 'F');
    doc.setTextColor(215, 242, 97);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cover ? 11 : 8);
    doc.text('ZION CHURCH  |  ORDEM', margin, cover ? 16 : 8.5);
    if (cover) {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('Cronograma do culto', margin, 31);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(event.title, margin, 40);
    }
  };

  header();
  y = 60;
  doc.setTextColor(20, 35, 29);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const eventDate = new Date(`${event.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`${eventDate}  |  ${event.time}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 105, 98);
  doc.text(`${event.type}${event.location ? `  |  ${event.location}` : ''}`, margin, y + 6);
  doc.text(`Duracao total: ${Math.floor(total / 60)}h ${total % 60}min`, margin, y + 12);
  y += 24;

  moments.forEach((moment, index) => {
    const details = [moment.owner, moment.details].filter(Boolean).join(' - ');
    const detailLines = doc.splitTextToSize(details || 'Responsavel a definir', contentWidth - 39);
    const itemLines = (moment.items || []).flatMap((item, itemIndex) => doc.splitTextToSize(`${itemIndex + 1}. ${item}`, contentWidth - 45));
    const rowHeight = Math.max(22, 15 + detailLines.length * 4 + itemLines.length * 4.5);
    ensure(rowHeight + 5);
    doc.setFillColor(index % 2 ? 248 : 241, index % 2 ? 249 : 247, index % 2 ? 247 : 243);
    doc.roundedRect(margin, y, contentWidth, rowHeight, 2, 2, 'F');
    doc.setTextColor(31, 107, 79);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(moment.time, margin + 4, y + 7);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`ate ${moment.end}`, margin + 4, y + 12);
    doc.setTextColor(20, 35, 29);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(moment.title || 'Momento sem titulo', margin + 35, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(95, 108, 102);
    doc.text(detailLines, margin + 35, y + 13);
    let itemY = y + 13 + detailLines.length * 4 + 2;
    if (itemLines.length) {
      doc.setTextColor(40, 85, 69);
      doc.text(itemLines, margin + 39, itemY);
    }
    doc.setTextColor(20, 35, 29);
    doc.setFont('helvetica', 'bold');
    doc.text(`${moment.duration} min`, width - margin - 4, y + 7, { align: 'right' });
    y += rowHeight + 4;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(125, 135, 130);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}  |  Pagina ${page} de ${pages}`, margin, height - 8);
  }
  doc.save(`cronograma-${safeFileName(event.title)}-${event.date}.pdf`);
}
