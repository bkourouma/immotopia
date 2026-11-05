import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  getGeneralLedger,
  ledgerTable,
  parseAsOfDate,
  parsePeriod,
  Table,
  toCsv,
  toXlsx,
  trialBalanceTable
} from '../lib/accounting-exports/service';
import { getJournalPage, journalPageTable } from '../lib/accounting-exports/queries/journal';
import {
  accountLedgerTable,
  getAccountLedger,
  getLedgerSummary,
  listAccounts
} from '../lib/accounting-exports/queries/ledger';
import { getTrialBalanceData } from '../lib/accounting-exports/queries/balance';
import {
  getMandantOwnerLedger,
  getMandantOwnersPage,
  getMandantSubledger,
  getMandantTrialBalancePage,
  mandantOwnerLedgerTable,
  mandantSubledgerTable,
  mandantTrialBalancePageTable
} from '../lib/accounting-exports/mandants';
import { getAccountingMeta } from '../lib/accounting-exports/meta';
import {
  awaitFreshSync,
  forceSync,
  getSyncState,
  requestBackgroundSync
} from '../lib/accounting-exports/sync-scheduler';
import {
  accountsQuerySchema,
  generalLedgerQuerySchema,
  journalQuerySchema,
  mandantSubledgerQuerySchema,
  mandantTrialBalanceQuerySchema,
  metaQuerySchema,
  trialBalanceQuerySchema
} from '../lib/accounting-exports/schemas';

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

type Format = 'json' | 'csv' | 'xlsx';
type Mode = 'paged' | 'all';

/**
 * Lecture JSON : la synchronisation des comptes propriétaires est déclenchée en
 * arrière-plan AVANT la requête, sans être attendue ; l'état est lu au moment
 * de répondre.
 */
async function sendJson<T>(res: Response, tenantId: string, read: () => Promise<T>) {
  requestBackgroundSync(tenantId);
  const data = await read();
  res.json({ success: true, data, meta: { sync: getSyncState(tenantId) } });
}

/** Export : attend une synchronisation fraîche (rejette si elle échoue), puis envoie le fichier. */
async function sendFile(
  res: Response,
  tenantId: string,
  format: 'csv' | 'xlsx',
  name: string,
  build: () => Promise<Table>
) {
  await awaitFreshSync(tenantId);
  const table = await build();
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    res.status(200).send(toCsv(table));
    return;
  }
  const buffer = await toXlsx([table]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
  res.status(200).send(buffer);
}

/** Lecture paginée en JSON, ou, en export, la même requête sans pagination (`'all'`) en pièce jointe. */
async function respond<T>(
  res: Response,
  tenantId: string,
  format: Format,
  name: string,
  read: (mode: Mode) => Promise<T>,
  table: (data: T) => Table
) {
  if (format === 'json') {
    await sendJson(res, tenantId, () => read('paged'));
    return;
  }
  await sendFile(res, tenantId, format, name, async () => table(await read('all')));
}

const suffix = (period: { fromLabel: string; toLabel: string }) => `${period.fromLabel}_${period.toLabel}`;

const pageOf = (query: { page: number; limit: number }, mode: Mode) =>
  mode === 'all' ? ('all' as const) : { page: query.page, limit: query.limit };

export const getAccountingMetaHandler = asyncHandler(async (req: Request, res: Response) => {
  metaQuerySchema.parse(req.query);
  const tenantId = requireTenantId(req);
  await sendJson(res, tenantId, () => getAccountingMeta(tenantId));
});

export const listAccountsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = accountsQuerySchema.parse(req.query);
  const tenantId = requireTenantId(req);
  // La période ne sert qu'au filtre « avec mouvements ».
  const period = query.withMovements ? parsePeriod(query) : undefined;
  await sendJson(res, tenantId, async () => ({
    items: await listAccounts(tenantId, {
      search: query.search,
      withMovements: query.withMovements,
      period: period ? { from: period.from, to: period.to } : undefined,
      limit: query.limit
    })
  }));
});

export const getJournalHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = journalQuerySchema.parse(req.query);
  const tenantId = requireTenantId(req);
  const period = parsePeriod(query);
  const filters = { journal: query.journal, account: query.account, search: query.search };
  await respond(
    res,
    tenantId,
    query.format,
    `journal_${suffix(period)}`,
    mode => getJournalPage(tenantId, period, filters, pageOf(query, mode)),
    journalPageTable
  );
});

export const getGeneralLedgerHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = generalLedgerQuerySchema.parse(req.query);
  const tenantId = requireTenantId(req);
  const period = parsePeriod(query);

  if (query.account) {
    const account = query.account;
    await respond(
      res,
      tenantId,
      query.format,
      `grand-livre_${account}_${suffix(period)}`,
      mode =>
        getAccountLedger(
          tenantId,
          period,
          account,
          { search: query.search, journal: query.journal },
          pageOf(query, mode)
        ),
      accountLedgerTable
    );
    return;
  }

  if (query.format === 'json') {
    await sendJson(res, tenantId, () =>
      getLedgerSummary(tenantId, period, { search: query.search }, pageOf(query, 'paged'))
    );
    return;
  }
  // Export sans compte choisi : le grand livre complet de tous les comptes.
  await sendFile(res, tenantId, query.format, `grand-livre_${suffix(period)}`, async () =>
    ledgerTable(await getGeneralLedger(tenantId, period, query.search))
  );
});

export const getTrialBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = trialBalanceQuerySchema.parse(req.query);
  const tenantId = requireTenantId(req);
  const period = parsePeriod(query);
  const filters = { accountClass: query.class, hideZero: query.hideZero, search: query.search };
  await respond(
    res,
    tenantId,
    query.format,
    `balance_${suffix(period)}`,
    () => getTrialBalanceData(tenantId, period, filters),
    trialBalanceTable
  );
});

export const getMandantSubledgerHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = mandantSubledgerQuerySchema.parse(req.query);
  const tenantId = requireTenantId(req);
  const period = parsePeriod(query);
  const name = `grand-livre-auxiliaire-mandants_${suffix(period)}`;

  if (query.owner) {
    const owner = query.owner;
    await respond(
      res,
      tenantId,
      query.format,
      name,
      mode => getMandantOwnerLedger(tenantId, period, owner, { nature: query.nature }, pageOf(query, mode)),
      data => mandantOwnerLedgerTable(data, query.nature)
    );
    return;
  }

  if (query.format === 'json') {
    await sendJson(res, tenantId, () =>
      getMandantOwnersPage(tenantId, period, { search: query.search }, pageOf(query, 'paged'))
    );
    return;
  }
  // Export sans propriétaire choisi : le grand livre auxiliaire complet.
  await sendFile(res, tenantId, query.format, name, async () =>
    mandantSubledgerTable(await getMandantSubledger(tenantId, period))
  );
});

export const getMandantTrialBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = mandantTrialBalanceQuerySchema.parse(req.query);
  const tenantId = requireTenantId(req);
  const asOf = parseAsOfDate(query);
  await respond(
    res,
    tenantId,
    query.format,
    `balance-auxiliaire-mandants_${asOf.label}`,
    mode => getMandantTrialBalancePage(tenantId, asOf, { search: query.search }, pageOf(query, mode)),
    mandantTrialBalancePageTable
  );
});

/** Actualisation demandée : attend la fin de la synchronisation (rejoint celle en cours). */
export const syncAccountingHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const sync = await forceSync(tenantId);
  res.json({ success: true, data: sync, meta: { sync } });
});
