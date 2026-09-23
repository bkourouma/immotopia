import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  getGeneralLedger,
  getJournal,
  getTrialBalance,
  journalTable,
  ledgerTable,
  parsePeriod,
  Table,
  toCsv,
  toXlsx,
  trialBalanceTable
} from '../lib/accounting-exports/service';

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

type Format = 'json' | 'csv' | 'xlsx';

function formatOf(req: Request): Format {
  const format = typeof req.query.format === 'string' ? req.query.format : 'json';
  if (format !== 'json' && format !== 'csv' && format !== 'xlsx') {
    throw new BadRequestError('Format attendu : json, csv ou xlsx.');
  }
  return format;
}

/** Renvoie les données en JSON, ou le fichier demandé en pièce jointe. */
async function send(res: Response, format: Format, name: string, data: unknown, table: () => Table) {
  if (format === 'json') {
    res.json({ success: true, data });
    return;
  }
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    res.status(200).send(toCsv(table()));
    return;
  }
  const buffer = await toXlsx([table()]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
  res.status(200).send(buffer);
}

const suffix = (period: { fromLabel: string; toLabel: string }) => `${period.fromLabel}_${period.toLabel}`;

export const getJournalHandler = asyncHandler(async (req: Request, res: Response) => {
  const format = formatOf(req);
  const period = parsePeriod(req.query);
  const journal = typeof req.query.journal === 'string' && req.query.journal ? req.query.journal : undefined;
  const data = await getJournal(requireTenantId(req), period, journal);
  await send(res, format, `journal_${suffix(period)}`, data, () => journalTable(data));
});

export const getGeneralLedgerHandler = asyncHandler(async (req: Request, res: Response) => {
  const format = formatOf(req);
  const period = parsePeriod(req.query);
  const account = typeof req.query.account === 'string' && req.query.account ? req.query.account : undefined;
  const data = await getGeneralLedger(requireTenantId(req), period, account);
  await send(res, format, `grand-livre_${suffix(period)}`, data, () => ledgerTable(data));
});

export const getTrialBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const format = formatOf(req);
  const period = parsePeriod(req.query);
  const data = await getTrialBalance(requireTenantId(req), period);
  await send(res, format, `balance_${suffix(period)}`, data, () => trialBalanceTable(data));
});
