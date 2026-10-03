import React, { useId } from 'react';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Space, Tag } from 'antd';
import { t } from '../../i18n/t';
import type { WritePlanPathParam, WritePlanQueryParam } from '../../types/copilot';
import { Value } from './WritePlanChangesTable';

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'start',
  verticalAlign: 'top',
  borderBlockEnd: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
  overflowWrap: 'anywhere'
};
const sectionStyle: React.CSSProperties = { marginBlockStart: 12 };
const headingStyle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 600 };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };

function Heading({ id, children }: { id: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Space wrap size={8}>
      <h4 id={id} style={headingStyle}>
        {children}
      </h4>
      <Tag icon={<SafetyCertificateOutlined aria-hidden="true" />} color="blue">
        {t('Calculé par le serveur')}
      </Tag>
    </Space>
  );
}

/** « Paramètres envoyés à la route » : tableau Clé | Valeur. Rien si la liste est vide. */
export function WritePlanQuery({ query }: { query?: WritePlanQueryParam[] }): React.ReactElement | null {
  const id = useId();
  if (!query || query.length === 0) return null;
  return (
    <section aria-labelledby={id} style={sectionStyle} data-testid="write-plan-query">
      <Heading id={id}>{t('Paramètres envoyés à la route')}</Heading>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th scope="col" style={cellStyle}>
                {t('Clé')}
              </th>
              <th scope="col" style={cellStyle}>
                {t('Valeur')}
              </th>
            </tr>
          </thead>
          <tbody>
            {query.map((q, index) => (
              <tr key={`${q.key}-${index}`} data-testid="write-plan-query-row">
                <th scope="row" style={{ ...cellStyle, ...mono, fontWeight: 600 }}>
                  {q.key}
                </th>
                <td style={cellStyle}>
                  <Value text={q.value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** « Éléments visés » : identifiants bruts en monospace ; « parent : » si aucune cible nommée. */
export function WritePlanPathParams({
  pathParams,
  hasTarget
}: {
  pathParams?: WritePlanPathParam[];
  hasTarget: boolean;
}): React.ReactElement | null {
  const id = useId();
  if (!pathParams || pathParams.length === 0) return null;
  return (
    <section aria-labelledby={id} style={sectionStyle} data-testid="write-plan-path-params">
      <Heading id={id}>{t('Éléments visés')}</Heading>
      <ul style={{ margin: '6px 0 0', paddingInlineStart: 0, listStyle: 'none' }}>
        {pathParams.map((p, index) => (
          <li key={`${p.name}-${index}`} style={{ overflowWrap: 'anywhere' }}>
            {hasTarget ? null : <span>{t('parent')} : </span>}
            <span>{p.name} : </span>
            <code style={mono}>{p.value}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
