import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Payments } from '../../pages/rental/Payments';
import { CSV_BOM, toCsvString } from '../../utils/table-export/csv';
import type { ExportTable } from '../../utils/table-export/types';

/**
 * BUG-2026-11-04-061 : l'export des paiements écrivait, dans la colonne
 * « En ligne », le texte des deux badges mis bout à bout (« En ligneRéussi »,
 * « En ligneAnnulé »…). La colonne dit désormais « Oui » ou « Non », et le
 * statut seul, traduit, reste dans la colonne « Statut ».
 *
 * L'écrivain de fichier est remplacé par un espion : on lit le tableau neutre
 * (`ExportTable`) que reçoivent tous les formats — Excel, CSV et PDF —, puis on
 * le passe au vrai écrivain CSV.
 */

const written = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../utils/table-export/write', () => ({
  writeExport: vi.fn(async (...args: unknown[]) => {
    written.calls.push(args);
    return 'file';
  })
}));

const listPayments = vi.fn();
vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return {
    ...actual,
    listPayments: (...a: unknown[]) => listPayments(...a),
    listLeases: vi.fn().mockResolvedValue({ success: true, data: [], pagination: { total: 0 } })
  };
});
vi.mock('../../services/payment-gateway-service', () => ({ checkOnlinePaymentStatus: vi.fn() }));
vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => <div>formulaire de saisie</div> }));
vi.mock('../../components/rental/AllocatePaymentForm', () => ({
  AllocatePaymentForm: () => <div>formulaire d’affectation</div>
}));
vi.mock('../../components/rental/PaymentDeclarationsList', () => ({
  PaymentDeclarationsList: () => <div>liste des déclarations</div>
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

type StatutCheckout = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';

function checkout(status: StatutCheckout) {
  return {
    id: `checkout-${status}`,
    codePaiement: 'IMT-ABCDEFGHIJKLMNOPQRST',
    status,
    mode: 'SIMULATOR' as const,
    providerServiceName: 'Wave',
    providerTransactionId: null,
    providerFees: null,
    failureMessage: null,
    reviewReason: null,
    lastCheckedAt: null
  };
}

function paiement(id: string, status: string, enLigne: StatutCheckout | null) {
  return {
    id,
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    amount: 50_000,
    currency: 'XOF',
    method: 'MOBILE_MONEY',
    status,
    initiated_at: '2026-11-04T12:00:00.000Z',
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: '',
    onlineCheckout: enLigne ? checkout(enLigne) : null,
    lease: { id: 'bail-1', lease_number: 'BAIL-1' }
  };
}

const PAIEMENTS = [
  paiement('p1', 'SUCCESS', 'SUCCESS'),
  paiement('p2', 'CANCELED', 'CANCELED'),
  paiement('p3', 'SUCCESS', null),
  paiement('p4', 'FAILED', 'FAILED'),
  paiement('p5', 'PENDING', 'REVIEW')
];

function monter() {
  listPayments.mockResolvedValue({
    success: true,
    data: PAIEMENTS,
    pagination: { page: 1, limit: 50, total: PAIEMENTS.length, totalPages: 1 }
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/rental/payments']}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/payments" element={<Payments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** Ouvre le menu d'export et choisit un format ; rend l'appel reçu par l'écrivain. */
async function exporter(libelleFormat: string) {
  const avant = written.calls.length;
  await userEvent.click(await screen.findByRole('button', { name: 'Exporter le tableau' }, { timeout: 8000 }));
  await userEvent.click(await screen.findByText(libelleFormat));
  await waitFor(() => expect(written.calls.length).toBe(avant + 1), { timeout: 8000 });
  return written.calls[avant] as [string, ExportTable, string];
}

function colonne(table: ExportTable, entete: string): string[] {
  const index = table.columns.findIndex(c => c.header === entete);
  expect(index, `colonne « ${entete} » absente`).toBeGreaterThanOrEqual(0);
  return table.rows.map(ligne => ligne[index].text);
}

beforeEach(() => {
  written.calls = [];
  vi.clearAllMocks();
});

const EN_LIGNE = ['Oui', 'Oui', 'Non', 'Oui', 'Oui'];
const STATUTS = ['Réussi', 'Annulé', 'Réussi', 'Échoué', 'En attente'];

describe('Export des paiements — colonnes « En ligne » et « Statut »', () => {
  it('« En ligne » dit Oui ou Non, « Statut » le statut seul ; aucune autre colonne ne colle des badges', async () => {
    monter();
    const [format, table] = await exporter('CSV');
    expect(format).toBe('csv');

    // Une ligne par paiement, dans l'ordre de la liste.
    expect(colonne(table, 'En ligne')).toEqual(EN_LIGNE);
    expect(colonne(table, 'Statut')).toEqual(STATUTS);

    // Le fichier CSV lui-même, relu champ par champ.
    const csv = toCsvString(table, 'fr');
    expect(csv).not.toMatch(/En ligne(Réussi|Échoué|Annulé|Expiré|En attente|En cours)/);
    const [entete, ...lignes] = csv.replace(CSV_BOM, '').split('\r\n');
    const champs = (ligne: string) => ligne.split(';');
    expect(lignes.map(l => champs(l)[champs(entete).indexOf('En ligne')])).toEqual(EN_LIGNE);
    expect(lignes.map(l => champs(l)[champs(entete).indexOf('Statut')])).toEqual(STATUTS);

    // Les autres colonnes : une valeur chacune, jamais deux libellés mis bout à bout.
    expect(table.columns.map(c => c.header)).toEqual([
      'Bail',
      'Locataire',
      'Date',
      'Montant',
      'Reste à affecter',
      'Méthode',
      'Statut',
      'En ligne'
    ]);
    for (const ligne of table.rows) {
      for (const cellule of ligne) expect(cellule.text).not.toMatch(/En ligne\S/);
    }
    expect(colonne(table, 'Méthode')).toEqual(Array(PAIEMENTS.length).fill('Mobile Money'));
  });

  it('Excel, CSV et PDF reçoivent le même tableau', async () => {
    monter();
    const [formatXlsx, tableXlsx] = await exporter('Excel (.xlsx)');
    const [formatCsv, tableCsv] = await exporter('CSV');
    const [formatPdf, tablePdf] = await exporter('PDF');

    expect([formatXlsx, formatCsv, formatPdf]).toEqual(['xlsx', 'csv', 'pdf']);
    expect(tableCsv).toEqual(tableXlsx);
    expect(tablePdf).toEqual(tableXlsx);
    expect(colonne(tablePdf, 'En ligne')).toEqual(EN_LIGNE);
    // Trois exports de suite : sous charge, plus que le délai par défaut de la suite.
  }, 120_000);
});
