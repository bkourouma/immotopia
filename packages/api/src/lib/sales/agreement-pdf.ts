import { createHash } from 'crypto';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { NotFoundError } from '../../middleware/error-middleware';
import { currentLanguage, t } from '../../i18n';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import {
  drawDocumentHeader,
  fontsOf,
  resolveDocumentBranding,
  truncate,
  type DocumentBranding
} from '../documents/document-branding';
import { sanitizeForPdf } from '../documents/pdf-text';
import { arabicFaces, drawArabicFooters, drawArabicText, wrapArabicText } from '../documents/pdf-arabic';
import { amountToArabicWords } from '../syndics/number-to-arabic-words';
import { A4, formatAmount, wrapText } from '../syndics/charge-receipt-pdf';
import { amountToFrenchWords } from '../syndics/number-to-french-words';
import { agreementNumber } from './numbering';

/**
 * Compromis de vente en PDF, généré à la volée pour la signature électronique
 * (spec 044, source SALE_AGREEMENT). Rien n'est stocké : `loadAgreementPdfData`
 * lit le compromis, `renderSaleAgreementPdf` le dessine, `agreementFingerprint`
 * en donne l'empreinte (détection d'un changement après l'envoi, SG-R2).
 *
 * Règles :
 * - Le prix plancher du mandat (`minimumPrice`) n'est JAMAIS lu : la requête
 *   `select` ne le demande pas, le document est remis à l'acquéreur.
 * - Pièce en français : tout texte passe par `sanitizeForPdf` (Helvetica WinAnsi).
 * - Les clauses sont des clauses types courtes, à faire valider par un juriste
 *   avant tout usage réel.
 */

const FINANCING_LABELS: Record<string, string> = {
  CASH: 'au comptant',
  LOAN: 'avec un prêt bancaire',
  MIXED: 'par un apport et un prêt bancaire'
};

export interface AgreementPdfData {
  number: string;
  price: number;
  depositAmount: number | null;
  depositHolder: 'NOTARY' | 'SELLER' | null;
  notaryName: string | null;
  expectedDeedDate: string | null;
  financing: string | null;
  seller: { name: string };
  buyer: { name: string; company: boolean; representative: string | null };
  property: { title: string; reference: string; address: string; zone: string | null };
  /** Devise du bien (comme le mandat de vente) : jamais une devise en dur. */
  currency: string;
  conditions: Array<{ label: string; dueDate: string | null }>;
  milestones: Array<{ label: string; dueDate: string | null; amount: number }>;
}

const day = (value: Date | null | undefined): string | null => (value ? value.toISOString().slice(0, 10) : null);

/** `2026-10-15` -> `15/10/2026`. */
function frenchDate(iso: string | null): string {
  if (!iso) return 'à définir';
  const [year, month, dayOfMonth] = iso.slice(0, 10).split('-');
  return `${dayOfMonth}/${month}/${year}`;
}

/** Lit le compromis de l'agence et tout ce qu'il imprime. Jamais `minimumPrice`. */
export async function loadAgreementPdfData(
  tenantId: string,
  agreementId: string,
  client: PrismaTransactionClient = prisma
): Promise<AgreementPdfData> {
  const agreement = await client.saleAgreement.findFirst({ where: { id: agreementId, tenantId } });
  if (!agreement) throw new NotFoundError('Compromis introuvable');
  const [offer, mandate, property, conditions, milestones] = await Promise.all([
    client.saleOffer.findFirst({
      where: { id: agreement.offerId, tenantId },
      select: { buyerContactId: true, financing: true }
    }),
    client.saleMandate.findFirst({
      where: { id: agreement.mandateId, tenantId },
      select: { sellerClientId: true }
    }),
    client.property.findFirst({
      where: { id: agreement.propertyId, tenantId },
      select: { title: true, internalReference: true, address: true, locationZone: true, currency: true }
    }),
    client.saleAgreementCondition.findMany({
      where: { tenantId, agreementId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { label: true, dueDate: true }
    }),
    client.salePaymentMilestone.findMany({
      where: { tenantId, agreementId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { label: true, dueDate: true, amount: true }
    })
  ]);
  if (!offer || !mandate || !property) throw new NotFoundError('Compromis introuvable');
  const [seller, buyer] = await Promise.all([
    client.tenantClient.findFirst({
      where: { id: mandate.sellerClientId, tenantId },
      select: { user: { select: { fullName: true, email: true } } }
    }),
    client.crmContact.findFirst({
      where: { id: offer.buyerContactId, tenantId },
      select: { firstName: true, lastName: true, legalName: true, representativeName: true }
    })
  ]);

  return {
    number: agreementNumber(agreement.year, agreement.sequence),
    price: Number(agreement.price),
    depositAmount: agreement.depositAmount == null ? null : Number(agreement.depositAmount),
    depositHolder: agreement.depositHolder,
    notaryName: agreement.notaryName,
    expectedDeedDate: day(agreement.expectedDeedDate),
    financing: offer.financing,
    seller: { name: seller?.user.fullName || seller?.user.email || '' },
    buyer: {
      name: buyer ? buyer.legalName || `${buyer.firstName} ${buyer.lastName}`.trim() : '',
      company: Boolean(buyer?.legalName),
      representative: buyer?.legalName ? (buyer.representativeName ?? null) : null
    },
    property: {
      title: property.title,
      reference: property.internalReference,
      address: property.address,
      zone: property.locationZone
    },
    currency: property.currency || 'XOF',
    conditions: conditions.map(row => ({ label: row.label, dueDate: day(row.dueDate) })),
    milestones: milestones.map(row => ({ label: row.label, dueDate: day(row.dueDate), amount: Number(row.amount) }))
  };
}

/** Empreinte des données imprimées : change dès qu'une ligne du PDF change. */
export function agreementFingerprint(data: AgreementPdfData): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// ------------------------------------------------------------------ rendu

const MARGIN = 40;
const GREY = rgb(0.35, 0.35, 0.35);
const BODY = 10;
const LEADING = 14;

class Flow {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    startY: number,
    first: PDFPage
  ) {
    this.page = first;
    this.y = startY;
  }

  private ensure(height: number): void {
    if (this.y - height >= MARGIN + 20) return;
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  get width(): number {
    return A4.width - 2 * MARGIN;
  }

  heading(text: string): void {
    this.ensure(40);
    this.y -= 10;
    this.page.drawText(truncate(text, this.bold, 11, this.width), { x: MARGIN, y: this.y, size: 11, font: this.bold });
    this.y -= LEADING;
  }

  paragraph(text: string, indent = 0): void {
    for (const line of wrapText(text, this.regular, BODY, this.width - indent)) {
      this.ensure(LEADING);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size: BODY, font: this.regular });
      this.y -= LEADING;
    }
  }

  /** Ligne « libellé : valeur » sur deux colonnes. */
  field(label: string, value: string): void {
    this.ensure(LEADING);
    this.page.drawText(truncate(label, this.regular, BODY, 150), {
      x: MARGIN,
      y: this.y,
      size: BODY,
      font: this.regular,
      color: GREY
    });
    wrapText(value || '-', this.bold, BODY, this.width - 160).forEach((line, index) => {
      if (index > 0) this.ensure(LEADING);
      this.page.drawText(line, { x: MARGIN + 160, y: this.y, size: BODY, font: this.bold });
      this.y -= LEADING;
    });
  }

  gap(height = 6): void {
    this.y -= height;
  }
}

function partyLines(data: AgreementPdfData): { seller: string; buyer: string } {
  const buyer = data.buyer.company
    ? `${data.buyer.name}${data.buyer.representative ? `, représentée par ${data.buyer.representative}` : ''}`
    : data.buyer.name;
  return { seller: data.seller.name, buyer };
}

function depositText(data: AgreementPdfData): string {
  if (data.depositAmount == null || data.depositAmount <= 0) {
    return "Aucun dépôt de garantie n'est stipulé.";
  }
  const holder =
    data.depositHolder === 'NOTARY'
      ? `séquestré entre les mains du notaire${data.notaryName ? ` ${data.notaryName}` : ''}`
      : data.depositHolder === 'SELLER'
        ? 'remis au vendeur'
        : 'conservé selon les modalités convenues entre les parties';
  const amount = `${formatAmount(data.depositAmount, data.currency)} (${amountToFrenchWords(data.depositAmount, data.currency)})`;
  return `L'acquéreur verse un dépôt de garantie de ${amount}, ${holder}. Il s'impute sur le prix à la réalisation de la vente.`;
}

function priceText(data: AgreementPdfData): string {
  const how = FINANCING_LABELS[data.financing ?? ''] ?? 'selon les modalités convenues entre les parties';
  return `La vente est consentie et acceptée moyennant le prix de ${formatAmount(data.price, data.currency)} (${amountToFrenchWords(data.price, data.currency)}), payable ${how}.`;
}

function financingText(financing: string | null): string {
  switch (financing) {
    case 'CASH':
      return t('au comptant');
    case 'LOAN':
      return t('avec un prêt bancaire');
    case 'MIXED':
      return t('par un apport et un prêt bancaire');
    default:
      return t('selon les modalités convenues entre les parties');
  }
}

function deedText(data: AgreementPdfData): string {
  const notary = data.notaryName ? ` devant ${data.notaryName}, notaire,` : ' devant le notaire de leur choix';
  return `Les parties s'engagent à réitérer la vente par acte authentique${notary} au plus tard le ${frenchDate(data.expectedDeedDate)}, sous réserve de la réalisation des conditions suspensives.`;
}

/** Version de lecture arabe d'un nouveau compromis ; les données et l'empreinte restent identiques. */
async function renderSaleAgreementArabicPdf(data: AgreementPdfData, branding: DocumentBranding): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setLanguage('ar');
  doc.setTitle(t('Compromis de vente {{number}}', { number: data.number }));
  doc.setCreator('ImmoTopia');
  const faces = await arabicFaces(doc);
  let page = doc.addPage([A4.width, A4.height]);
  let y = await drawDocumentHeader(doc, page, branding, {
    title: t('COMPROMIS DE VENTE'),
    subtitle: t('N° {{number}}', { number: data.number })
  });
  const right = A4.width - MARGIN;
  const width = A4.width - 2 * MARGIN;
  const ensure = (height: number) => {
    if (y - height >= MARGIN + 25) return;
    page = doc.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
    drawArabicText(page, faces.bold, t('Compromis de vente {{number}} (suite)', { number: data.number }), {
      x: right,
      y,
      size: 10,
      maxWidth: width
    });
    y -= 23;
  };
  const heading = (text: string) => {
    ensure(38);
    y -= 9;
    drawArabicText(page, faces.bold, text, { x: right, y, size: 11, maxWidth: width });
    y -= 19;
  };
  const paragraph = (text: string) => {
    for (const line of wrapArabicText(faces.regular, text, BODY, width)) {
      ensure(LEADING);
      drawArabicText(page, faces.regular, line, { x: right, y, size: BODY, maxWidth: width });
      y -= LEADING;
    }
  };
  const field = (label: string, value: string, ltr = false) => {
    ensure(LEADING);
    drawArabicText(page, faces.regular, label, { x: right, y, size: BODY, maxWidth: 155, color: GREY });
    drawArabicText(page, faces.bold, value || '—', {
      x: ltr ? MARGIN : right - 165,
      y,
      size: BODY,
      maxWidth: width - 165,
      ...(ltr ? { align: 'start' as const } : {})
    });
    y -= LEADING + 2;
  };

  heading(t('Entre les soussignés'));
  field(t('Le vendeur'), data.seller.name);
  field(
    t("L'acquéreur"),
    data.buyer.company && data.buyer.representative
      ? t('{{name}}, représentée par {{representative}}', {
          name: data.buyer.name,
          representative: data.buyer.representative
        })
      : data.buyer.name
  );
  heading(t('Article 1 - Bien vendu'));
  field(t('Désignation'), data.property.title);
  field(t('Référence'), data.property.reference, true);
  field(t('Adresse'), [data.property.address, data.property.zone].filter(Boolean).join('، '));
  heading(t('Article 2 - Prix'));
  paragraph(t('La vente est consentie et acceptée moyennant le prix indiqué ci-dessous.'));
  field(t('Prix de vente'), formatAmount(data.price, data.currency), true);
  field(t('Montant en lettres'), amountToArabicWords(data.price, data.currency));
  field(t('Payable'), financingText(data.financing));
  heading(t('Article 3 - Dépôt de garantie'));
  if (data.depositAmount && data.depositAmount > 0) {
    paragraph(t("L'acquéreur verse un dépôt de garantie du montant indiqué ci-dessous."));
    field(t('Dépôt de garantie'), formatAmount(data.depositAmount, data.currency), true);
    field(t('Montant en lettres'), amountToArabicWords(data.depositAmount, data.currency));
    field(
      t('Conservation du dépôt'),
      data.depositHolder === 'NOTARY'
        ? data.notaryName || t('le notaire')
        : data.depositHolder === 'SELLER'
          ? t('le vendeur')
          : t('selon les modalités convenues entre les parties')
    );
    paragraph(t('Il s’impute sur le prix à la réalisation de la vente.'));
  } else paragraph(t("Aucun dépôt de garantie n'est stipulé."));
  heading(t('Article 4 - Échéancier de paiement'));
  if (data.milestones.length === 0)
    paragraph(t("Aucun échéancier particulier n'est stipulé ; le solde du prix est payable à la signature de l'acte."));
  for (const milestone of data.milestones) {
    paragraph(milestone.label);
    field(t('Montant'), formatAmount(milestone.amount, data.currency), true);
    field(t('Au plus tard le'), milestone.dueDate ? frenchDate(milestone.dueDate) : t('à définir'), true);
  }
  heading(t('Article 5 - Conditions suspensives'));
  if (data.conditions.length === 0) paragraph(t("Aucune condition suspensive n'est stipulée."));
  else paragraph(t('La vente est conclue sous les conditions suspensives suivantes :'));
  for (const condition of data.conditions) {
    paragraph(condition.label);
    if (condition.dueDate) field(t('Au plus tard le'), frenchDate(condition.dueDate), true);
  }
  heading(t('Article 6 - Acte authentique'));
  paragraph(
    t(
      "Les parties s'engagent à réitérer la vente par acte authentique devant le notaire indiqué, au plus tard à la date mentionnée ci-dessous, sous réserve de la réalisation des conditions suspensives."
    )
  );
  field(t('Notaire'), data.notaryName || t('le notaire de leur choix'));
  field(t('Au plus tard le'), data.expectedDeedDate ? frenchDate(data.expectedDeedDate) : t('à définir'), true);
  heading(t('Article 7 - Dispositions générales'));
  paragraph(
    t(
      "Le vendeur déclare être libre de disposer du bien et l'acquéreur déclare avoir visité le bien et en accepter l'état. Chaque partie reconnaît avoir lu et accepté le présent compromis, qui prend effet à la date de la dernière signature."
    )
  );
  heading(t('Signatures'));
  field(t('Le vendeur'), data.seller.name);
  field(t("L'acquéreur"), data.buyer.name);
  drawArabicFooters(doc, faces, branding.issuer.name);
  return Buffer.from(await doc.save());
}

/** Rend le compromis (clauses types courtes, à faire valider juridiquement). */
export async function renderSaleAgreementPdf(data: AgreementPdfData, branding: DocumentBranding): Promise<Buffer> {
  if (currentLanguage() === 'ar') return renderSaleAgreementArabicPdf(data, branding);
  const doc = await PDFDocument.create();
  doc.setTitle(sanitizeForPdf(`Compromis de vente ${data.number}`));
  doc.setCreator('ImmoTopia');
  const { regular, bold } = await fontsOf(doc);
  const first = doc.addPage([A4.width, A4.height]);
  const startY = await drawDocumentHeader(doc, first, branding, {
    title: 'COMPROMIS DE VENTE',
    subtitle: `N° ${data.number}`
  });
  const flow = new Flow(doc, regular, bold, startY, first);
  const parties = partyLines(data);

  flow.heading('Entre les soussignés');
  flow.field('Le vendeur', parties.seller);
  flow.field("L'acquéreur", parties.buyer);

  flow.heading('Article 1 - Bien vendu');
  flow.field('Désignation', data.property.title);
  flow.field('Référence', data.property.reference);
  flow.field('Adresse', [data.property.address, data.property.zone].filter(Boolean).join(', '));

  flow.heading('Article 2 - Prix');
  flow.paragraph(priceText(data));

  flow.heading('Article 3 - Dépôt de garantie');
  flow.paragraph(depositText(data));

  flow.heading('Article 4 - Échéancier de paiement');
  if (data.milestones.length === 0) {
    flow.paragraph(
      "Aucun échéancier particulier n'est stipulé ; le solde du prix est payable à la signature de l'acte."
    );
  }
  for (const milestone of data.milestones) {
    const due = `au plus tard le ${frenchDate(milestone.dueDate)}`;
    flow.paragraph(`- ${milestone.label} : ${formatAmount(milestone.amount, data.currency)}, ${due}`, 8);
  }

  flow.heading('Article 5 - Conditions suspensives');
  if (data.conditions.length === 0) {
    flow.paragraph("Aucune condition suspensive n'est stipulée.");
  } else {
    flow.paragraph('La vente est conclue sous les conditions suspensives suivantes :');
    for (const condition of data.conditions) {
      const due = condition.dueDate ? ` (au plus tard le ${frenchDate(condition.dueDate)})` : '';
      flow.paragraph(`- ${condition.label}${due}`, 8);
    }
  }

  flow.heading('Article 6 - Acte authentique');
  flow.paragraph(deedText(data));

  flow.heading('Article 7 - Dispositions générales');
  flow.paragraph(
    "Le vendeur déclare être libre de disposer du bien et l'acquéreur déclare avoir visité le bien et en accepter l'état. Chaque partie reconnaît avoir lu et accepté le présent compromis, qui prend effet à la date de la dernière signature."
  );

  flow.gap(10);
  flow.heading('Signatures');
  flow.paragraph(`Le vendeur : ${parties.seller}`);
  flow.paragraph(`L'acquéreur : ${parties.buyer}`);

  return Buffer.from(await doc.save());
}

/** PDF du compromis de l'agence, prêt à être signé. */
export async function buildSaleAgreementPdf(tenantId: string, agreementId: string): Promise<Buffer> {
  const [data, branding] = await Promise.all([
    loadAgreementPdfData(tenantId, agreementId),
    resolveDocumentBranding(tenantId, null)
  ]);
  return renderSaleAgreementPdf(data, branding);
}
