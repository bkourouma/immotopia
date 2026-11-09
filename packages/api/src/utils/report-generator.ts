/**
 * Report Generator Utility
 * Functions for generating reports in PDF, CSV, and Excel formats
 */

import { toCsvString, FORMULA_START } from '../lib/csv';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { prisma } from './database';
import { drawDocumentHeader, resolveDocumentBranding } from '../lib/documents/document-branding';
import { FOOTER_RESERVED, drawDocumentFooters } from '../lib/documents/document-layout';
import { pdfLanguage } from '../lib/documents/pdf-text';
import { arabicFaces, drawArabicFooters, drawArabicNumber, drawArabicText } from '../lib/documents/pdf-arabic';
import { currentLanguage, t } from '../i18n';
import { logger } from './logger';
import { RentalPaymentStatus } from '@prisma/client';

interface RevenueReportData {
  startDate: Date;
  endDate: Date;
  propertyId?: string;
  totalRevenue: number;
  paymentCount: number;
  revenuesByProperty: Array<{
    propertyAddress: string;
    revenue: number;
    paymentCount: number;
  }>;
  revenuesByMonth: Array<{
    month: string;
    revenue: number;
  }>;
}

interface OccupancyReportData {
  asOfDate: Date;
  totalProperties: number;
  occupiedProperties: number;
  availableProperties: number;
  occupancyRate: number;
  properties: Array<{
    address: string;
    status: string;
    currentLease?: {
      leaseNumber: string;
      tenantName: string;
      startDate: Date;
      endDate: Date | null;
    };
  }>;
}

// @i18n-keys
const AR_REPORT_LABELS = {
  summary: 'Résumé',
  period: 'Période',
  totalRevenue: 'Revenus totaux',
  payments: 'Nombre de paiements',
  revenueByProperty: 'Revenus par propriété',
  date: 'Date',
  totalProperties: 'Total propriétés',
  occupied: 'Propriétés occupées',
  available: 'Propriétés disponibles',
  occupancyRate: "Taux d'occupation",
  detailByProperty: 'Détails par propriété',
  rented: 'Loué',
  free: 'Disponible'
} as const;

/**
 * T140: Generate revenue report in PDF format
 */
export async function generateRevenueReportPDF(data: RevenueReportData, tenantId: string): Promise<Buffer> {
  if (currentLanguage() === 'ar') return generateArabicReportPDF('revenue', data, tenantId);
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 40;
    const lineHeight = 20;

    // En-tête standard de l'agence, titre et période
    const branding = await resolveDocumentBranding(tenantId, null);
    let y = await drawDocumentHeader(pdfDoc, page, branding, {
      title: t('Rapport de revenus', undefined, pdfLanguage()),
      subtitle: `Période : ${format(data.startDate, 'dd/MM/yyyy')} - ${format(data.endDate, 'dd/MM/yyyy')}`
    });

    // Summary
    page.drawText(pdfSafe('Résumé'), {
      x: margin,
      y,
      size: 16,
      font: boldFont
    });
    y -= lineHeight;

    page.drawText(pdfSafe(`Revenus totaux: ${formatCurrency(data.totalRevenue)}`), {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= lineHeight;

    page.drawText(pdfSafe(`Nombre de paiements: ${data.paymentCount}`), {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= 30;

    // Revenues by property
    if (data.revenuesByProperty.length > 0) {
      page.drawText(pdfSafe('Revenus par propriété'), {
        x: margin,
        y,
        size: 16,
        font: boldFont
      });
      y -= lineHeight;

      let currentPage = page;
      for (const item of data.revenuesByProperty.slice(0, 20)) {
        if (y < FOOTER_RESERVED + 30) {
          currentPage = pdfDoc.addPage([612, 792]);
          y = 792 - 60;
        }
        currentPage.drawText(pdfSafe(`${item.propertyAddress}: ${formatCurrency(item.revenue)}`), {
          x: margin + 20,
          y,
          size: 10,
          font
        });
        y -= lineHeight;
      }
    }

    await drawDocumentFooters(pdfDoc, {
      issuerName: branding.issuer.name,
      reference: t('Rapport de revenus', undefined, pdfLanguage())
    });
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    logger.error('Error generating revenue report PDF:', error);
    throw error;
  }
}

/**
 * T141: Generate revenue report in CSV format
 */
export async function generateRevenueReportCSV(data: RevenueReportData, _tenantId: string): Promise<Buffer> {
  try {
    const rows: any[] = [
      [t('Rapport de revenus')],
      [`${t('Période')}: ${format(data.startDate, 'dd/MM/yyyy')} - ${format(data.endDate, 'dd/MM/yyyy')}`],
      [],
      [t('Résumé')],
      [t('Revenus totaux'), formatCurrency(data.totalRevenue)],
      [t('Nombre de paiements'), data.paymentCount],
      [],
      [t('Revenus par propriété')],
      [t('Propriété'), t('Revenus'), t('Nombre de paiements')]
    ];

    for (const item of data.revenuesByProperty) {
      rows.push([item.propertyAddress, formatCurrency(item.revenue), item.paymentCount]);
    }

    rows.push([]);
    rows.push([t('Revenus par mois')]);
    rows.push([t('Mois'), t('Revenus')]);

    for (const item of data.revenuesByMonth) {
      rows.push([item.month, formatCurrency(item.revenue)]);
    }

    return Buffer.from(toCsvString(rows), 'utf-8');
  } catch (error) {
    logger.error('Error generating revenue report CSV:', error);
    throw error;
  }
}

/**
 * T142: Generate revenue report in Excel format
 */
export async function generateRevenueReportExcel(data: RevenueReportData, _tenantId: string): Promise<Buffer> {
  try {
    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet(t('Résumé'));
    const byPropertySheet = workbook.addWorksheet(t('Par propriété'));
    const byMonthSheet = workbook.addWorksheet(t('Par mois'));

    // Summary sheet
    summarySheet.columns = [
      { header: t('Métrique'), key: 'metric', width: 30 },
      { header: t('Valeur'), key: 'value', width: 20 }
    ];
    summarySheet.addRow({
      metric: t('Période'),
      value: `${format(data.startDate, 'dd/MM/yyyy')} - ${format(data.endDate, 'dd/MM/yyyy')}`
    });
    summarySheet.addRow({ metric: t('Revenus totaux'), value: formatCurrency(data.totalRevenue) });
    summarySheet.addRow({ metric: t('Nombre de paiements'), value: data.paymentCount });

    // By property sheet
    byPropertySheet.columns = [
      { header: t('Propriété'), key: 'property', width: 40 },
      { header: t('Revenus'), key: 'revenue', width: 20 },
      { header: t('Nombre de paiements'), key: 'count', width: 20 }
    ];
    for (const item of data.revenuesByProperty) {
      byPropertySheet.addRow(
        excelSafeRow({
          property: item.propertyAddress,
          revenue: item.revenue,
          count: item.paymentCount
        })
      );
    }

    // By month sheet
    byMonthSheet.columns = [
      { header: t('Mois'), key: 'month', width: 20 },
      { header: t('Revenus'), key: 'revenue', width: 20 }
    ];
    for (const item of data.revenuesByMonth) {
      byMonthSheet.addRow(
        excelSafeRow({
          month: item.month,
          revenue: item.revenue
        })
      );
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    logger.error('Error generating revenue report Excel:', error);
    throw error;
  }
}

/**
 * T143: Generate occupancy report in PDF format
 */
export async function generateOccupancyReportPDF(data: OccupancyReportData, tenantId: string): Promise<Buffer> {
  if (currentLanguage() === 'ar') return generateArabicReportPDF('occupancy', data, tenantId);
  try {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 40;
    const lineHeight = 20;

    // En-tête standard de l'agence, titre et date
    const branding = await resolveDocumentBranding(tenantId, null);
    let y = await drawDocumentHeader(pdfDoc, page, branding, {
      title: t("Rapport d'occupation", undefined, pdfLanguage()),
      subtitle: `Au ${format(data.asOfDate, 'dd/MM/yyyy')}`
    });

    // Summary
    page.drawText(pdfSafe('Résumé'), {
      x: margin,
      y,
      size: 16,
      font: boldFont
    });
    y -= lineHeight;

    page.drawText(pdfSafe(`Total propriétés: ${data.totalProperties}`), {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= lineHeight;

    page.drawText(pdfSafe(`Propriétés occupées: ${data.occupiedProperties}`), {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= lineHeight;

    page.drawText(pdfSafe(`Propriétés disponibles: ${data.availableProperties}`), {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= lineHeight;

    page.drawText(pdfSafe(`Taux d'occupation: ${data.occupancyRate.toFixed(2)}%`), {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= 30;

    // Properties list
    page.drawText(pdfSafe('Détails par propriété'), {
      x: margin,
      y,
      size: 16,
      font: boldFont
    });
    y -= lineHeight;

    for (const prop of data.properties.slice(0, 30)) {
      if (y < FOOTER_RESERVED + 30) {
        page = pdfDoc.addPage([612, 792]);
        y = 792 - 60;
      }
      page.drawText(pdfSafe(`${prop.address} - ${prop.status}`), {
        x: margin + 20,
        y,
        size: 10,
        font
      });
      y -= lineHeight;
    }

    await drawDocumentFooters(pdfDoc, {
      issuerName: branding.issuer.name,
      reference: t("Rapport d'occupation", undefined, pdfLanguage())
    });
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    logger.error('Error generating occupancy report PDF:', error);
    throw error;
  }
}

async function generateArabicReportPDF(kind: 'revenue', data: RevenueReportData, tenantId: string): Promise<Buffer>;
async function generateArabicReportPDF(kind: 'occupancy', data: OccupancyReportData, tenantId: string): Promise<Buffer>;
async function generateArabicReportPDF(
  kind: 'revenue' | 'occupancy',
  data: RevenueReportData | OccupancyReportData,
  tenantId: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const faces = await arabicFaces(pdf);
  const branding = await resolveDocumentBranding(tenantId, null);
  const title =
    kind === 'revenue' ? t('Rapport de revenus', undefined, 'ar') : t("Rapport d'occupation", undefined, 'ar');
  const first = pdf.addPage([612, 792]);
  let page = first;
  let y = await drawDocumentHeader(pdf, first, branding, { title });
  const section = (label: string) => {
    y -= 8;
    drawArabicText(page, faces.bold, t(label, undefined, 'ar'), { x: 572, y, size: 13, maxWidth: 532 });
    y -= 26;
  };
  const row = (label: string, value: string, indent = 0, numeric = false) => {
    if (y < FOOTER_RESERVED + 30) {
      page = pdf.addPage([612, 792]);
      y = 732;
    }
    const right = 572 - indent;
    const shownLabel = t(label, undefined, 'ar');
    drawArabicText(page, faces.regular, shownLabel, { x: right, y, size: 10, maxWidth: 330 });
    (numeric ? drawArabicNumber : drawArabicText)(page, faces.regular, value, { x: 215, y, size: 10, maxWidth: 175 });
    y -= 20;
  };
  section(AR_REPORT_LABELS.summary);
  if (kind === 'revenue') {
    const report = data as RevenueReportData;
    row(
      AR_REPORT_LABELS.period,
      `${format(report.startDate, 'dd/MM/yyyy')} - ${format(report.endDate, 'dd/MM/yyyy')}`,
      0,
      true
    );
    row(AR_REPORT_LABELS.totalRevenue, formatCurrency(report.totalRevenue), 0, true);
    row(AR_REPORT_LABELS.payments, String(report.paymentCount), 0, true);
    y -= 12;
    section(AR_REPORT_LABELS.revenueByProperty);
    for (const item of report.revenuesByProperty.slice(0, 20))
      row(item.propertyAddress, formatCurrency(item.revenue), 10, true);
  } else {
    const report = data as OccupancyReportData;
    row(AR_REPORT_LABELS.date, format(report.asOfDate, 'dd/MM/yyyy'), 0, true);
    row(AR_REPORT_LABELS.totalProperties, String(report.totalProperties), 0, true);
    row(AR_REPORT_LABELS.occupied, String(report.occupiedProperties), 0, true);
    row(AR_REPORT_LABELS.available, String(report.availableProperties), 0, true);
    row(AR_REPORT_LABELS.occupancyRate, `${report.occupancyRate.toFixed(2)}%`, 0, true);
    y -= 12;
    section(AR_REPORT_LABELS.detailByProperty);
    for (const item of report.properties.slice(0, 30)) {
      const status =
        item.status === 'OCCUPIED'
          ? AR_REPORT_LABELS.rented
          : item.status === 'AVAILABLE'
            ? AR_REPORT_LABELS.free
            : item.status;
      row(item.address, t(status, undefined, 'ar'), 10);
    }
  }
  drawArabicFooters(pdf, faces, branding.issuer.name);
  return Buffer.from(await pdf.save());
}

/**
 * T144: Generate occupancy report in CSV format
 */
export async function generateOccupancyReportCSV(data: OccupancyReportData, _tenantId: string): Promise<Buffer> {
  try {
    const rows: any[] = [
      [t("Rapport d'occupation")],
      [`${t('Date')}: ${format(data.asOfDate, 'dd/MM/yyyy')}`],
      [],
      [t('Résumé')],
      [t('Total propriétés'), data.totalProperties],
      [t('Propriétés occupées'), data.occupiedProperties],
      [t('Propriétés disponibles'), data.availableProperties],
      [t("Taux d'occupation"), `${data.occupancyRate.toFixed(2)}%`],
      [],
      [t('Détails par propriété')],
      [t('Adresse'), t('Statut'), t('Bail'), t('Locataire'), t('Date début'), t('Date fin')]
    ];

    for (const prop of data.properties) {
      rows.push([
        prop.address,
        prop.status,
        prop.currentLease?.leaseNumber || '-',
        prop.currentLease?.tenantName || '-',
        prop.currentLease?.startDate ? format(prop.currentLease.startDate, 'dd/MM/yyyy') : '-',
        prop.currentLease?.endDate ? format(prop.currentLease.endDate, 'dd/MM/yyyy') : '-'
      ]);
    }

    return Buffer.from(toCsvString(rows), 'utf-8');
  } catch (error) {
    logger.error('Error generating occupancy report CSV:', error);
    throw error;
  }
}

/**
 * T145: Generate occupancy report in Excel format
 */
export async function generateOccupancyReportExcel(data: OccupancyReportData, _tenantId: string): Promise<Buffer> {
  try {
    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet(t('Résumé'));
    const propertiesSheet = workbook.addWorksheet(t('Propriétés'));

    // Summary sheet
    summarySheet.columns = [
      { header: t('Métrique'), key: 'metric', width: 30 },
      { header: t('Valeur'), key: 'value', width: 20 }
    ];
    summarySheet.addRow({ metric: t('Date'), value: format(data.asOfDate, 'dd/MM/yyyy') });
    summarySheet.addRow({ metric: t('Total propriétés'), value: data.totalProperties });
    summarySheet.addRow({ metric: t('Propriétés occupées'), value: data.occupiedProperties });
    summarySheet.addRow({ metric: t('Propriétés disponibles'), value: data.availableProperties });
    summarySheet.addRow({ metric: t("Taux d'occupation"), value: `${data.occupancyRate.toFixed(2)}%` });

    // Properties sheet
    propertiesSheet.columns = [
      { header: t('Adresse'), key: 'address', width: 40 },
      { header: t('Statut'), key: 'status', width: 15 },
      { header: t('Bail'), key: 'lease', width: 20 },
      { header: t('Locataire'), key: 'tenant', width: 30 },
      { header: t('Date début'), key: 'startDate', width: 15 },
      { header: t('Date fin'), key: 'endDate', width: 15 }
    ];
    for (const prop of data.properties) {
      propertiesSheet.addRow(
        excelSafeRow({
          address: prop.address,
          status: prop.status,
          lease: prop.currentLease?.leaseNumber || '-',
          tenant: prop.currentLease?.tenantName || '-',
          startDate: prop.currentLease?.startDate ? format(prop.currentLease.startDate, 'dd/MM/yyyy') : '-',
          endDate: prop.currentLease?.endDate ? format(prop.currentLease.endDate, 'dd/MM/yyyy') : '-'
        })
      );
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    logger.error('Error generating occupancy report Excel:', error);
    throw error;
  }
}

/**
 * T146: Export data (payments, installments, leases)
 */
export async function exportData(
  entityType: 'payments' | 'installments' | 'leases',
  propertyIds: string[],
  tenantId: string,
  filters: {
    startDate?: Date;
    endDate?: Date;
    propertyId?: string;
  },
  format: 'csv' | 'excel'
): Promise<Buffer> {
  try {
    // Le périmètre est restreint AVANT de descendre dans les fonctions
    // internes : si `filters.propertyId` est fourni, il doit appartenir au
    // périmètre du propriétaire (`propertyIds`), sinon le résultat est vide
    // — jamais les données d'un autre propriétaire de la même agence.
    const scopedPropertyIds = filters.propertyId ? propertyIds.filter(id => id === filters.propertyId) : propertyIds;

    if (format === 'csv') {
      return await exportDataCSV(entityType, scopedPropertyIds, tenantId, filters);
    } else {
      return await exportDataExcel(entityType, scopedPropertyIds, tenantId, filters);
    }
  } catch (error) {
    logger.error('Error exporting data:', error);
    throw error;
  }
}

async function exportDataCSV(
  entityType: 'payments' | 'installments' | 'leases',
  propertyIds: string[],
  tenantId: string,
  filters: any
): Promise<Buffer> {
  const rows: any[] = [];

  if (entityType === 'payments') {
    rows.push([t('ID'), t('Propriété'), t('Locataire'), t('Montant'), t('Date'), t('Méthode'), t('Statut')]);
    const payments = await prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        },
        ...(filters.startDate &&
          filters.endDate && {
            succeeded_at: {
              gte: filters.startDate,
              lte: filters.endDate
            }
          })
      },
      include: {
        lease: {
          include: {
            property: true,
            primaryRenter: {
              include: {
                user: { select: { id: true, fullName: true } }
              }
            }
          }
        }
      }
    });

    for (const payment of payments) {
      rows.push([
        payment.id,
        payment.lease?.property?.address || '-',
        payment.lease?.primaryRenter?.user?.fullName || '-',
        payment.amount,
        payment.succeeded_at ? format(payment.succeeded_at, 'dd/MM/yyyy') : '-',
        paymentMethodLabel(payment.method),
        paymentStatusLabel(payment.status)
      ]);
    }
  } else if (entityType === 'installments') {
    rows.push([
      t('ID'),
      t('Propriété'),
      t('Locataire'),
      t('Période'),
      t('Date échéance'),
      t('Montant'),
      t('Payé'),
      t('Statut')
    ]);
    const installments = await prisma.rentalInstallment.findMany({
      where: {
        tenant_id: tenantId,
        lease: {
          property_id: { in: propertyIds }
        },
        ...(filters.startDate &&
          filters.endDate && {
            due_date: {
              gte: filters.startDate,
              lte: filters.endDate
            }
          })
      },
      include: {
        lease: {
          include: {
            property: true,
            primaryRenter: {
              include: {
                user: { select: { id: true, fullName: true } }
              }
            }
          }
        }
      }
    });

    for (const inst of installments) {
      const totalAmount =
        Number(inst.amount_rent) +
        Number(inst.amount_service) +
        Number(inst.amount_other_fees) +
        Number(inst.penalty_amount);
      rows.push([
        inst.id,
        inst.lease?.property?.address || '-',
        inst.lease?.primaryRenter?.user?.fullName || '-',
        `${inst.period_month}/${inst.period_year}`,
        format(inst.due_date, 'dd/MM/yyyy'),
        totalAmount,
        inst.amount_paid,
        installmentStatusLabel(inst.status)
      ]);
    }
  } else if (entityType === 'leases') {
    rows.push([t('ID'), t('Propriété'), t('Locataire'), t('Date début'), t('Date fin'), t('Loyer'), t('Statut')]);
    const leases = await prisma.rentalLease.findMany({
      where: {
        tenant_id: tenantId,
        property_id: { in: propertyIds }
      },
      include: {
        property: true,
        primaryRenter: {
          include: {
            user: { select: { id: true, fullName: true } }
          }
        }
      }
    });

    for (const lease of leases) {
      rows.push([
        lease.id,
        lease.property?.address || '-',
        lease.primaryRenter?.user?.fullName || '-',
        format(lease.start_date, 'dd/MM/yyyy'),
        lease.end_date ? format(lease.end_date, 'dd/MM/yyyy') : '-',
        lease.rent_amount,
        leaseStatusLabel(lease.status)
      ]);
    }
  }

  return Buffer.from(toCsvString(rows), 'utf-8');
}

async function exportDataExcel(
  entityType: 'payments' | 'installments' | 'leases',
  propertyIds: string[],
  tenantId: string,
  filters: any
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t('Données'));

  if (entityType === 'payments') {
    worksheet.columns = [
      { header: t('ID'), key: 'id', width: 40 },
      { header: t('Propriété'), key: 'property', width: 40 },
      { header: t('Locataire'), key: 'tenant', width: 30 },
      { header: t('Montant'), key: 'amount', width: 15 },
      { header: t('Date'), key: 'date', width: 15 },
      { header: t('Méthode'), key: 'method', width: 15 },
      { header: t('Statut'), key: 'status', width: 15 }
    ];

    const payments = await prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        },
        ...(filters.startDate &&
          filters.endDate && {
            succeeded_at: {
              gte: filters.startDate,
              lte: filters.endDate
            }
          })
      },
      include: {
        lease: {
          include: {
            property: true,
            primaryRenter: {
              include: {
                user: { select: { id: true, fullName: true } }
              }
            }
          }
        }
      }
    });

    for (const payment of payments) {
      worksheet.addRow(
        excelSafeRow({
          id: payment.id,
          property: payment.lease?.property?.address || '-',
          tenant: payment.lease?.primaryRenter?.user?.fullName || '-',
          amount: Number(payment.amount),
          date: payment.succeeded_at ? format(payment.succeeded_at, 'dd/MM/yyyy') : '-',
          method: paymentMethodLabel(payment.method),
          status: paymentStatusLabel(payment.status)
        })
      );
    }
  } else if (entityType === 'installments') {
    worksheet.columns = [
      { header: t('ID'), key: 'id', width: 40 },
      { header: t('Propriété'), key: 'property', width: 40 },
      { header: t('Locataire'), key: 'tenant', width: 30 },
      { header: t('Période'), key: 'period', width: 15 },
      { header: t('Date échéance'), key: 'dueDate', width: 15 },
      { header: t('Montant'), key: 'amount', width: 15 },
      { header: t('Payé'), key: 'paid', width: 15 },
      { header: t('Statut'), key: 'status', width: 15 }
    ];

    const installments = await prisma.rentalInstallment.findMany({
      where: {
        tenant_id: tenantId,
        lease: {
          property_id: { in: propertyIds }
        },
        ...(filters.startDate &&
          filters.endDate && {
            due_date: {
              gte: filters.startDate,
              lte: filters.endDate
            }
          })
      },
      include: {
        lease: {
          include: {
            property: true,
            primaryRenter: {
              include: {
                user: { select: { id: true, fullName: true } }
              }
            }
          }
        }
      }
    });

    for (const inst of installments) {
      const totalAmount =
        Number(inst.amount_rent) +
        Number(inst.amount_service) +
        Number(inst.amount_other_fees) +
        Number(inst.penalty_amount);
      worksheet.addRow(
        excelSafeRow({
          id: inst.id,
          property: inst.lease?.property?.address || '-',
          tenant: inst.lease?.primaryRenter?.user?.fullName || '-',
          period: `${inst.period_month}/${inst.period_year}`,
          dueDate: format(inst.due_date, 'dd/MM/yyyy'),
          amount: totalAmount,
          paid: Number(inst.amount_paid),
          status: installmentStatusLabel(inst.status)
        })
      );
    }
  } else if (entityType === 'leases') {
    worksheet.columns = [
      { header: t('ID'), key: 'id', width: 40 },
      { header: t('Propriété'), key: 'property', width: 40 },
      { header: t('Locataire'), key: 'tenant', width: 30 },
      { header: t('Date début'), key: 'startDate', width: 15 },
      { header: t('Date fin'), key: 'endDate', width: 15 },
      { header: t('Loyer'), key: 'rent', width: 15 },
      { header: t('Statut'), key: 'status', width: 15 }
    ];

    const leases = await prisma.rentalLease.findMany({
      where: {
        tenant_id: tenantId,
        property_id: { in: propertyIds }
      },
      include: {
        property: true,
        primaryRenter: {
          include: {
            user: { select: { id: true, fullName: true } }
          }
        }
      }
    });

    for (const lease of leases) {
      worksheet.addRow(
        excelSafeRow({
          id: lease.id,
          property: lease.property?.address || '-',
          tenant: lease.primaryRenter?.user?.fullName || '-',
          startDate: format(lease.start_date, 'dd/MM/yyyy'),
          endDate: lease.end_date ? format(lease.end_date, 'dd/MM/yyyy') : '-',
          rent: Number(lease.rent_amount),
          status: leaseStatusLabel(lease.status)
        })
      );
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Les polices standard du PDF n'encodent que WinAnsi. Intl (fr-FR) produit des
 * espaces insécables fines (U+202F) qui faisaient échouer drawText (500 sur le
 * rapport de revenus) : on les ramène à une espace et on remplace tout
 * caractère non encodable.
 */
const WIN_ANSI_EXTRAS = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));
export function pdfSafe(text: string): string {
  return Array.from(text.replace(/[\u00a0\u2007\u2009\u202f]/g, ' '))
    .map(ch => {
      const code = ch.codePointAt(0) as number;
      if (code === 10 || code === 13 || code === 9) return ' ';
      return (code >= 32 && code <= 255) || WIN_ANSI_EXTRAS.has(ch) ? ch : '?';
    })
    .join('');
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
}

/**
 * Libellés des valeurs techniques exportées (BUG-2026-11-04-009) : le texte
 * français est la clé de traduction, dans la langue de la requête. Une valeur
 * inconnue sort telle quelle plutôt que vide.
 */
function labelOf(map: Record<string, () => string>, value: string | null | undefined): string {
  if (!value) return '-';
  return map[value] ? map[value]() : value;
}

const PAYMENT_METHOD_LABELS: Record<string, () => string> = {
  CASH: () => t('Espèces'),
  BANK_TRANSFER: () => t('Virement bancaire'),
  CHECK: () => t('Chèque'),
  MOBILE_MONEY: () => t('Mobile Money'),
  CARD: () => t('Carte bancaire'),
  DIRECT_DEBIT: () => t('Prélèvement'),
  OTHER: () => t('Autre')
};

const PAYMENT_STATUS_LABELS: Record<string, () => string> = {
  PENDING: () => t('En attente'),
  SUCCESS: () => t('Réussi'),
  FAILED: () => t('Échoué'),
  CANCELED: () => t('Annulé'),
  REFUNDED: () => t('Remboursé'),
  PARTIALLY_REFUNDED: () => t('Partiellement remboursé')
};

const INSTALLMENT_STATUS_LABELS: Record<string, () => string> = {
  DRAFT: () => t('Brouillon'),
  DUE: () => t('À payer'),
  PARTIAL: () => t('Partiellement payée'),
  PAID: () => t('Payée'),
  OVERDUE: () => t('En retard'),
  CANCELED: () => t('Annulée')
};

const LEASE_STATUS_LABELS: Record<string, () => string> = {
  DRAFT: () => t('Brouillon'),
  ACTIVE: () => t('Actif'),
  SUSPENDED: () => t('Suspendu'),
  ENDED: () => t('Terminé'),
  CANCELED: () => t('Annulé')
};

const paymentMethodLabel = (value: string | null | undefined) => labelOf(PAYMENT_METHOD_LABELS, value);
const paymentStatusLabel = (value: string | null | undefined) => labelOf(PAYMENT_STATUS_LABELS, value);
const installmentStatusLabel = (value: string | null | undefined) => labelOf(INSTALLMENT_STATUS_LABELS, value);
const leaseStatusLabel = (value: string | null | undefined) => labelOf(LEASE_STATUS_LABELS, value);

/**
 * Cellule Excel : un texte que le tableur exécuterait comme une formule est
 * préfixé d'une apostrophe — même règle que `lib/csv.ts`. Nombres, chaînes
 * purement numériques et tiret isolé sont laissés intacts.
 */
const NUMERIC_TEXT = /^[-+]?\d+([.,]\d+)?$/;
function excelSafe<T>(value: T): T | string {
  if (typeof value !== 'string') return value;
  if (FORMULA_START.test(value) && value.trim() !== '-' && !NUMERIC_TEXT.test(value)) return `'${value}`;
  return value;
}

function excelSafeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, excelSafe(value)]));
}
