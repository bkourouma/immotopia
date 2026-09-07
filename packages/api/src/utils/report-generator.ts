/**
 * Report Generator Utility
 * Functions for generating reports in PDF, CSV, and Excel formats
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { prisma } from './database';
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

/**
 * T140: Generate revenue report in PDF format
 */
export async function generateRevenueReportPDF(data: RevenueReportData, _tenantId: string): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 750;
    const margin = 50;
    const lineHeight = 20;

    // Title
    page.drawText('Rapport de Revenus', {
      x: margin,
      y,
      size: 24,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    y -= 40;

    // Date range
    page.drawText(`Période: ${format(data.startDate, 'dd/MM/yyyy')} - ${format(data.endDate, 'dd/MM/yyyy')}`, {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= 30;

    // Summary
    page.drawText('Résumé', {
      x: margin,
      y,
      size: 16,
      font: boldFont
    });
    y -= lineHeight;

    page.drawText(`Revenus totaux: ${formatCurrency(data.totalRevenue)}`, {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= lineHeight;

    page.drawText(`Nombre de paiements: ${data.paymentCount}`, {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= 30;

    // Revenues by property
    if (data.revenuesByProperty.length > 0) {
      page.drawText('Revenus par propriété', {
        x: margin,
        y,
        size: 16,
        font: boldFont
      });
      y -= lineHeight;

      let currentPage = page;
      for (const item of data.revenuesByProperty.slice(0, 20)) {
        if (y < 100) {
          currentPage = pdfDoc.addPage([612, 792]);
          y = 750;
        }
        currentPage.drawText(`${item.propertyAddress}: ${formatCurrency(item.revenue)}`, {
          x: margin + 20,
          y,
          size: 10,
          font
        });
        y -= lineHeight;
      }
    }

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
      ['Rapport de Revenus'],
      [`Période: ${format(data.startDate, 'dd/MM/yyyy')} - ${format(data.endDate, 'dd/MM/yyyy')}`],
      [],
      ['Résumé'],
      ['Revenus totaux', formatCurrency(data.totalRevenue)],
      ['Nombre de paiements', data.paymentCount],
      [],
      ['Revenus par propriété'],
      ['Propriété', 'Revenus', 'Nombre de paiements']
    ];

    for (const item of data.revenuesByProperty) {
      rows.push([item.propertyAddress, formatCurrency(item.revenue), item.paymentCount]);
    }

    rows.push([]);
    rows.push(['Revenus par mois']);
    rows.push(['Mois', 'Revenus']);

    for (const item of data.revenuesByMonth) {
      rows.push([item.month, formatCurrency(item.revenue)]);
    }

    const csvContent = rows.map(row => row.join(',')).join('\n');
    return Buffer.from(csvContent, 'utf-8');
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
    const summarySheet = workbook.addWorksheet('Résumé');
    const byPropertySheet = workbook.addWorksheet('Par propriété');
    const byMonthSheet = workbook.addWorksheet('Par mois');

    // Summary sheet
    summarySheet.columns = [
      { header: 'Métrique', key: 'metric', width: 30 },
      { header: 'Valeur', key: 'value', width: 20 }
    ];
    summarySheet.addRow({
      metric: 'Période',
      value: `${format(data.startDate, 'dd/MM/yyyy')} - ${format(data.endDate, 'dd/MM/yyyy')}`
    });
    summarySheet.addRow({ metric: 'Revenus totaux', value: formatCurrency(data.totalRevenue) });
    summarySheet.addRow({ metric: 'Nombre de paiements', value: data.paymentCount });

    // By property sheet
    byPropertySheet.columns = [
      { header: 'Propriété', key: 'property', width: 40 },
      { header: 'Revenus', key: 'revenue', width: 20 },
      { header: 'Nombre de paiements', key: 'count', width: 20 }
    ];
    for (const item of data.revenuesByProperty) {
      byPropertySheet.addRow({
        property: item.propertyAddress,
        revenue: item.revenue,
        count: item.paymentCount
      });
    }

    // By month sheet
    byMonthSheet.columns = [
      { header: 'Mois', key: 'month', width: 20 },
      { header: 'Revenus', key: 'revenue', width: 20 }
    ];
    for (const item of data.revenuesByMonth) {
      byMonthSheet.addRow({
        month: item.month,
        revenue: item.revenue
      });
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
export async function generateOccupancyReportPDF(data: OccupancyReportData, _tenantId: string): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 750;
    const margin = 50;
    const lineHeight = 20;

    // Title
    page.drawText("Rapport d'Occupation", {
      x: margin,
      y,
      size: 24,
      font: boldFont
    });
    y -= 40;

    page.drawText(`Date: ${format(data.asOfDate, 'dd/MM/yyyy')}`, {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= 30;

    // Summary
    page.drawText('Résumé', {
      x: margin,
      y,
      size: 16,
      font: boldFont
    });
    y -= lineHeight;

    page.drawText(`Total propriétés: ${data.totalProperties}`, {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= lineHeight;

    page.drawText(`Propriétés occupées: ${data.occupiedProperties}`, {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= lineHeight;

    page.drawText(`Propriétés disponibles: ${data.availableProperties}`, {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= lineHeight;

    page.drawText(`Taux d'occupation: ${data.occupancyRate.toFixed(2)}%`, {
      x: margin,
      y,
      size: 12,
      font
    });
    y -= 30;

    // Properties list
    page.drawText('Détails par propriété', {
      x: margin,
      y,
      size: 16,
      font: boldFont
    });
    y -= lineHeight;

    for (const prop of data.properties.slice(0, 30)) {
      if (y < 100) {
        page = pdfDoc.addPage([612, 792]);
        y = 750;
      }
      page.drawText(`${prop.address} - ${prop.status}`, {
        x: margin + 20,
        y,
        size: 10,
        font
      });
      y -= lineHeight;
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    logger.error('Error generating occupancy report PDF:', error);
    throw error;
  }
}

/**
 * T144: Generate occupancy report in CSV format
 */
export async function generateOccupancyReportCSV(data: OccupancyReportData, _tenantId: string): Promise<Buffer> {
  try {
    const rows: any[] = [
      ["Rapport d'Occupation"],
      [`Date: ${format(data.asOfDate, 'dd/MM/yyyy')}`],
      [],
      ['Résumé'],
      ['Total propriétés', data.totalProperties],
      ['Propriétés occupées', data.occupiedProperties],
      ['Propriétés disponibles', data.availableProperties],
      ["Taux d'occupation", `${data.occupancyRate.toFixed(2)}%`],
      [],
      ['Détails par propriété'],
      ['Adresse', 'Statut', 'Bail', 'Locataire', 'Date début', 'Date fin']
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

    const csvContent = rows.map(row => row.join(',')).join('\n');
    return Buffer.from(csvContent, 'utf-8');
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
    const summarySheet = workbook.addWorksheet('Résumé');
    const propertiesSheet = workbook.addWorksheet('Propriétés');

    // Summary sheet
    summarySheet.columns = [
      { header: 'Métrique', key: 'metric', width: 30 },
      { header: 'Valeur', key: 'value', width: 20 }
    ];
    summarySheet.addRow({ metric: 'Date', value: format(data.asOfDate, 'dd/MM/yyyy') });
    summarySheet.addRow({ metric: 'Total propriétés', value: data.totalProperties });
    summarySheet.addRow({ metric: 'Propriétés occupées', value: data.occupiedProperties });
    summarySheet.addRow({ metric: 'Propriétés disponibles', value: data.availableProperties });
    summarySheet.addRow({ metric: "Taux d'occupation", value: `${data.occupancyRate.toFixed(2)}%` });

    // Properties sheet
    propertiesSheet.columns = [
      { header: 'Adresse', key: 'address', width: 40 },
      { header: 'Statut', key: 'status', width: 15 },
      { header: 'Bail', key: 'lease', width: 20 },
      { header: 'Locataire', key: 'tenant', width: 30 },
      { header: 'Date début', key: 'startDate', width: 15 },
      { header: 'Date fin', key: 'endDate', width: 15 }
    ];
    for (const prop of data.properties) {
      propertiesSheet.addRow({
        address: prop.address,
        status: prop.status,
        lease: prop.currentLease?.leaseNumber || '-',
        tenant: prop.currentLease?.tenantName || '-',
        startDate: prop.currentLease?.startDate ? format(prop.currentLease.startDate, 'dd/MM/yyyy') : '-',
        endDate: prop.currentLease?.endDate ? format(prop.currentLease.endDate, 'dd/MM/yyyy') : '-'
      });
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
    if (format === 'csv') {
      return await exportDataCSV(entityType, propertyIds, tenantId, filters);
    } else {
      return await exportDataExcel(entityType, propertyIds, tenantId, filters);
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
    rows.push(['ID', 'Propriété', 'Locataire', 'Montant', 'Date', 'Méthode', 'Statut']);
    const payments = await prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds },
          ...(filters.propertyId && { property_id: filters.propertyId })
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
            primary_renter: {
              include: {
                user: true
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
        payment.lease?.primary_renter?.user
          ? `${payment.lease.primary_renter.user.firstName} ${payment.lease.primary_renter.user.lastName}`
          : '-',
        payment.amount,
        payment.succeeded_at ? format(payment.succeeded_at, 'dd/MM/yyyy') : '-',
        payment.method,
        payment.status
      ]);
    }
  } else if (entityType === 'installments') {
    rows.push(['ID', 'Propriété', 'Locataire', 'Période', 'Date échéance', 'Montant', 'Payé', 'Statut']);
    const installments = await prisma.rentalInstallment.findMany({
      where: {
        tenant_id: tenantId,
        lease: {
          property_id: { in: propertyIds },
          ...(filters.propertyId && { property_id: filters.propertyId })
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
            primary_renter: {
              include: {
                user: true
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
        inst.lease?.primary_renter?.user
          ? `${inst.lease.primary_renter.user.firstName} ${inst.lease.primary_renter.user.lastName}`
          : '-',
        `${inst.period_month}/${inst.period_year}`,
        format(inst.due_date, 'dd/MM/yyyy'),
        totalAmount,
        inst.amount_paid,
        inst.status
      ]);
    }
  } else if (entityType === 'leases') {
    rows.push(['ID', 'Propriété', 'Locataire', 'Date début', 'Date fin', 'Loyer', 'Statut']);
    const leases = await prisma.rentalLease.findMany({
      where: {
        tenant_id: tenantId,
        property_id: { in: propertyIds },
        ...(filters.propertyId && { property_id: filters.propertyId })
      },
      include: {
        property: true,
        primary_renter: {
          include: {
            user: true
          }
        }
      }
    });

    for (const lease of leases) {
      rows.push([
        lease.id,
        lease.property?.address || '-',
        lease.primary_renter?.user
          ? `${lease.primary_renter.user.firstName} ${lease.primary_renter.user.lastName}`
          : '-',
        format(lease.start_date, 'dd/MM/yyyy'),
        lease.end_date ? format(lease.end_date, 'dd/MM/yyyy') : '-',
        lease.monthly_rent,
        lease.status
      ]);
    }
  }

  const csvContent = rows.map(row => row.join(',')).join('\n');
  return Buffer.from(csvContent, 'utf-8');
}

async function exportDataExcel(
  entityType: 'payments' | 'installments' | 'leases',
  propertyIds: string[],
  tenantId: string,
  filters: any
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Données');

  if (entityType === 'payments') {
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 40 },
      { header: 'Propriété', key: 'property', width: 40 },
      { header: 'Locataire', key: 'tenant', width: 30 },
      { header: 'Montant', key: 'amount', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Méthode', key: 'method', width: 15 },
      { header: 'Statut', key: 'status', width: 15 }
    ];

    const payments = await prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds },
          ...(filters.propertyId && { property_id: filters.propertyId })
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
            primary_renter: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });

    for (const payment of payments) {
      worksheet.addRow({
        id: payment.id,
        property: payment.lease?.property?.address || '-',
        tenant: payment.lease?.primary_renter?.user
          ? `${payment.lease.primary_renter.user.firstName} ${payment.lease.primary_renter.user.lastName}`
          : '-',
        amount: Number(payment.amount),
        date: payment.succeeded_at ? format(payment.succeeded_at, 'dd/MM/yyyy') : '-',
        method: payment.method,
        status: payment.status
      });
    }
  } else if (entityType === 'installments') {
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 40 },
      { header: 'Propriété', key: 'property', width: 40 },
      { header: 'Locataire', key: 'tenant', width: 30 },
      { header: 'Période', key: 'period', width: 15 },
      { header: 'Date échéance', key: 'dueDate', width: 15 },
      { header: 'Montant', key: 'amount', width: 15 },
      { header: 'Payé', key: 'paid', width: 15 },
      { header: 'Statut', key: 'status', width: 15 }
    ];

    const installments = await prisma.rentalInstallment.findMany({
      where: {
        tenant_id: tenantId,
        lease: {
          property_id: { in: propertyIds },
          ...(filters.propertyId && { property_id: filters.propertyId })
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
            primary_renter: {
              include: {
                user: true
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
      worksheet.addRow({
        id: inst.id,
        property: inst.lease?.property?.address || '-',
        tenant: inst.lease?.primary_renter?.user
          ? `${inst.lease.primary_renter.user.firstName} ${inst.lease.primary_renter.user.lastName}`
          : '-',
        period: `${inst.period_month}/${inst.period_year}`,
        dueDate: format(inst.due_date, 'dd/MM/yyyy'),
        amount: totalAmount,
        paid: Number(inst.amount_paid),
        status: inst.status
      });
    }
  } else if (entityType === 'leases') {
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 40 },
      { header: 'Propriété', key: 'property', width: 40 },
      { header: 'Locataire', key: 'tenant', width: 30 },
      { header: 'Date début', key: 'startDate', width: 15 },
      { header: 'Date fin', key: 'endDate', width: 15 },
      { header: 'Loyer', key: 'rent', width: 15 },
      { header: 'Statut', key: 'status', width: 15 }
    ];

    const leases = await prisma.rentalLease.findMany({
      where: {
        tenant_id: tenantId,
        property_id: { in: propertyIds },
        ...(filters.propertyId && { property_id: filters.propertyId })
      },
      include: {
        property: true,
        primary_renter: {
          include: {
            user: true
          }
        }
      }
    });

    for (const lease of leases) {
      worksheet.addRow({
        id: lease.id,
        property: lease.property?.address || '-',
        tenant: lease.primary_renter?.user
          ? `${lease.primary_renter.user.firstName} ${lease.primary_renter.user.lastName}`
          : '-',
        startDate: format(lease.start_date, 'dd/MM/yyyy'),
        endDate: lease.end_date ? format(lease.end_date, 'dd/MM/yyyy') : '-',
        rent: Number(lease.monthly_rent),
        status: lease.status
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
}
