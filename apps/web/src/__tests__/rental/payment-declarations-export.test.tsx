import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { CSV_BOM, toCsvString } from '../../utils/table-export/csv';
import { neutralizeFormula } from '../../utils/copilot-artifact';
import type { ExportTable } from '../../utils/table-export/types';

/**
 * BUG-2026-11-04-062 : l'export des déclarations de paiement écrivait les dates
 * en toutes lettres (« 4 novembre 2026 ») là où les autres exports écrivent
 * « 04/11/2026 », et les cellules sans valeur « '- » — l'apostrophe que la
 * neutralisation des formules pose devant tout texte commençant par « - ».
 *
 * L'écran garde ses dates en toutes lettres et son « - » ; seul l'export change.
 * La neutralisation, elle, n'est pas touchée : on vérifie qu'elle protège
 * toujours une référence saisie comme une formule.
 */

const written = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../utils/table-export/write', () => ({
  writeExport: vi.fn(async (...args: unknown[]) => {
    written.calls.push(args);
    return 'file';
  })
}));

const listPaymentDeclarations = vi.fn();
vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return { ...actual, listPaymentDeclarations: (...a: unknown[]) => listPaymentDeclarations(...a) };
});
vi.mock('../../components/finance/TreasuryAccountSelector', () => ({ TreasuryAccountSelector: () => null }));

import { PaymentDeclarationsList } from '../../components/rental/PaymentDeclarationsList';

function declaration(id: string, surcharges: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: 'a',
    lease_id: 'b',
    declared_by: 'u',
    amount: 75_000,
    // Midi UTC : le même jour civil sous tous les fuseaux courants.
    payment_date: '2026-11-04T12:00:00.000Z',
    payment_method: 'CASH',
    status: 'PENDING',
    created_at: '2026-11-04T12:00:00.000Z',
    updated_at: '2026-11-04T12:00:00.000Z',
    lease: { id: 'b', lease_number: `BAIL-${id}` },
    installment: null,
    reference: null,
    ...surcharges
  };
}

const DECLARATIONS = [
  // Ni échéance ni référence : les deux cellules doivent être vides.
  declaration('1'),
  declaration('2', { installment: { period_month: 9, period_year: 2026 }, reference: 'VIR-0042' }),
  // Une référence saisie comme une formule reste neutralisée.
  declaration('3', { reference: '=1+1' })
];

beforeEach(() => {
  written.calls = [];
  listPaymentDeclarations.mockResolvedValue({
    success: true,
    data: DECLARATIONS,
    pagination: { page: 1, limit: 100, total: DECLARATIONS.length, totalPages: 1 }
  });
});

async function exporterEnCsv(): Promise<ExportTable> {
  render(
    <AntApp>
      <PaymentDeclarationsList tenantId="agence-1" />
    </AntApp>
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Exporter le tableau' }, { timeout: 15000 }));
  await userEvent.click(await screen.findByText('CSV'));
  await waitFor(() => expect(written.calls).toHaveLength(1), { timeout: 15000 });
  return written.calls[0][1] as ExportTable;
}

function colonne(table: ExportTable, entete: string) {
  const index = table.columns.findIndex(c => c.header === entete);
  expect(index, `colonne « ${entete} » absente`).toBeGreaterThanOrEqual(0);
  return table.rows.map(ligne => ligne[index]);
}

describe('Export des déclarations — dates et cellules vides', () => {
  it('écrit les dates jj/mm/aaaa et laisse vides les cellules sans valeur', async () => {
    const table = await exporterEnCsv();

    // Dates : celles de l'export, pas celles de l'écran.
    for (const entete of ['Date de déclaration', 'Date de paiement']) {
      const cellules = colonne(table, entete);
      expect(cellules.map(c => c.text)).toEqual(['04/11/2026', '04/11/2026', '04/11/2026']);
      expect(cellules.every(c => c.kind === 'date')).toBe(true);
    }

    // Cellules sans valeur : vides, pas un tiret.
    const echeances = colonne(table, 'Échéance');
    expect(echeances.map(c => c.text)).toEqual(['', '09/2026', '']);
    expect(echeances[0].kind).toBe('empty');
    const references = colonne(table, 'Référence');
    expect(references.map(c => c.text)).toEqual(['', 'VIR-0042', '=1+1']);
    expect(references[0].kind).toBe('empty');

    // Le fichier CSV relu : aucune date en toutes lettres, aucune apostrophe devant un tiret.
    const csv = toCsvString(table, 'fr');
    expect(csv).not.toMatch(/novembre/);
    expect(csv).not.toContain("'-");
    const [entete, ...lignes] = csv.replace(CSV_BOM, '').split('\r\n');
    const champs = entete.split(';');
    const premiere = lignes[0].split(';');
    expect(premiere[champs.indexOf('Date de déclaration')]).toBe('04/11/2026');
    expect(premiere[champs.indexOf('Date de paiement')]).toBe('04/11/2026');
    expect(premiere[champs.indexOf('Échéance')]).toBe('');
    expect(premiere[champs.indexOf('Référence')]).toBe('');

    // La neutralisation des formules n'est pas affaiblie.
    expect(lignes[2].split(';')[champs.indexOf('Référence')]).toBe("'=1+1");
  });

  it('la neutralisation protège toujours les formules, tiret compris', () => {
    for (const mauvais of ['=1+1', '+1', '-1', '-SUM(A1)', '@SUM(A1)', '\tx', '\rx', '-']) {
      expect(neutralizeFormula(mauvais)).toBe(`'${mauvais}`);
    }
  });
});
