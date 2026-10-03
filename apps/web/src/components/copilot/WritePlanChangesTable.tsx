import React, { useState } from 'react';
import { CheckCircleOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { t } from '../../i18n/t';
import type { WritePlanChange } from '../../types/copilot';
import { formatPlanValue, LONG_VALUE_CHARS } from './write-plan-format';

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'start',
  verticalAlign: 'top',
  borderBlockEnd: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
  overflowWrap: 'anywhere'
};

/** Valeur longue repliable ; le texte est rendu tel quel (jamais en HTML). */
function Value({ text }: { text: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  if (text.length <= LONG_VALUE_CHARS) return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
  return (
    <span>
      <span style={{ whiteSpace: 'pre-wrap' }}>{open ? text : `${text.slice(0, LONG_VALUE_CHARS)}…`}</span>{' '}
      <Button type="link" size="small" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ padding: 0 }}>
        {open ? t('Voir moins') : t('Voir plus')}
      </Button>
    </span>
  );
}

/**
 * Tableau Champ | Avant | Après. L'« après » est mis en évidence par la couleur,
 * une flèche et le gras (jamais la couleur seule). Création : « — » en « Avant ».
 */
export function WritePlanChangesTable({ changes }: { changes: WritePlanChange[] }): React.ReactElement {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th scope="col" style={cellStyle}>
              {t('Champ')}
            </th>
            <th scope="col" style={cellStyle}>
              {t('Avant')}
            </th>
            <th scope="col" style={cellStyle}>
              {t('Après')}
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c, index) => (
            <tr key={`${c.field}-${index}`} data-testid="write-plan-change">
              <th scope="row" style={{ ...cellStyle, fontWeight: 600 }}>
                {c.field}
              </th>
              <td style={{ ...cellStyle, color: 'var(--ant-color-text-secondary, #666)' }}>
                {c.before === undefined ? (
                  <span aria-label={t('Aucune valeur avant : nouvel enregistrement')}>—</span>
                ) : (
                  <Value text={formatPlanValue(c.before)} />
                )}
              </td>
              <td
                style={{
                  ...cellStyle,
                  fontWeight: 600,
                  background: 'var(--ant-color-success-bg, #f6ffed)'
                }}
              >
                <CheckCircleOutlined aria-hidden="true" style={{ marginInlineEnd: 6 }} />
                <Value text={formatPlanValue(c.after)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default WritePlanChangesTable;
