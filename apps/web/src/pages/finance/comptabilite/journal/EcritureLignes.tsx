import React from 'react';
import { MoneyValue } from '../../../../components/primitives';
import type { JournalEntry } from '../../../../services/accounting-exports-service';
import { t } from '../../../../i18n/t';

const cellule: React.CSSProperties = { padding: 'var(--space-1) var(--space-2)', textAlign: 'start' };
const celluleMontant: React.CSSProperties = { ...cellule, textAlign: 'end', whiteSpace: 'nowrap' };

/**
 * Lignes d'une écriture, dépliées à la demande. Un `<table>` HTML simple : un
 * Table antd par écriture (l'ancien écran) coûtait des centaines de nœuds
 * lourds par page.
 */
export const EcritureLignes: React.FC<{ entry: JournalEntry }> = ({ entry }) => (
  <div style={{ overflowX: 'auto', marginBlockStart: 'var(--space-2)' }}>
    <table
      aria-label={t('Lignes de l’écriture {{reference}}', { reference: entry.reference })}
      style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}
    >
      <thead>
        <tr style={{ color: 'var(--text-secondary)' }}>
          <th style={cellule}>{t('Compte')}</th>
          <th style={cellule}>{t('Intitulé')}</th>
          <th style={cellule}>{t('Libellé')}</th>
          <th style={cellule}>{t('Tiers')}</th>
          <th style={cellule}>{t('Nature')}</th>
          <th style={celluleMontant}>{t('Débit')}</th>
          <th style={celluleMontant}>{t('Crédit')}</th>
        </tr>
      </thead>
      <tbody>
        {entry.lines.map((line, index) => (
          <tr key={`${line.accountNumber}-${index}`} style={{ borderBlockStart: '1px solid var(--border-default)' }}>
            <td style={cellule}>{line.accountNumber}</td>
            <td style={cellule}>{line.accountName}</td>
            <td style={cellule}>{line.label}</td>
            <td style={cellule}>{line.thirdParty ?? '—'}</td>
            <td style={cellule}>{line.nature ?? '—'}</td>
            <td style={celluleMontant}>
              <MoneyValue value={line.debit} />
            </td>
            <td style={celluleMontant}>
              <MoneyValue value={line.credit} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
