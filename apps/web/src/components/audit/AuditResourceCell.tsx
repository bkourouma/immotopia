import React from 'react';
import { Tooltip } from 'antd';
import { getAuditResourceDisplayLabel } from '../../constants/audit-labels';

interface AuditResourceCellProps {
  log: { resourceType: string; resourceId?: string; resourceLabel?: string; details?: Record<string, unknown> };
}

/** Ressource d'une ligne du journal : libellé fourni par l'API, sinon type et identifiant abrégé. */
export const AuditResourceCell: React.FC<AuditResourceCellProps> = ({ log }) => {
  if (log.resourceLabel) return <>{log.resourceLabel}</>;
  const { label, tooltip } = getAuditResourceDisplayLabel(log.resourceType, log.resourceId, log.details);
  if (!tooltip) return <>{label}</>;
  return (
    <Tooltip title={tooltip}>
      <span style={{ cursor: 'help', borderBottom: '1px dotted rgba(0,0,0,0.2)' }}>{label}</span>
    </Tooltip>
  );
};
