import React from 'react';
import { Button, Descriptions, Modal, Tag, Typography } from 'antd';
import type { PlatformAuditLog } from '../../services/audit-service';
import {
  getAuditActionLabelFr,
  getAuditActorTypeLabelFr,
  getAuditCategoryLabelFr,
  getAuditEntityTypeLabelFr,
  getAuditOutcomeLabelFr,
  getAuditVisibilityLabelFr
} from '../../constants/audit-labels';
import { getAuditOutcomeColor } from '../../utils/tenant-audit-display';
import { getPlatformActorDisplay } from '../../utils/platform-audit-display';
import { ChangesBlock, DetailsBlock, formatFullDate } from '../tenant/ActivityLogDetailModal';
import { t } from '../../i18n/t';

const { Text, Paragraph } = Typography;

interface PlatformAuditDetailModalProps {
  log: PlatformAuditLog | null;
  onClose: () => void;
  /** Applique le filtre « identifiant de requête » de la liste. */
  onFilterRequest: (requestId: string) => void;
}

function resourceText(log: PlatformAuditLog): string {
  if (log.resourceLabel) return log.resourceLabel;
  const typeLabel = getAuditEntityTypeLabelFr(log.resourceType);
  return log.resourceId ? `${typeLabel} (${log.resourceId})` : typeLabel;
}

function ActorValue({ log }: { log: PlatformAuditLog }) {
  const identity = log.user?.email && log.user.email !== getPlatformActorDisplay(log) ? log.user.email : null;
  return (
    <>
      {getPlatformActorDisplay(log)}
      {identity && <Text type="secondary"> ({identity})</Text>}
      <Text type="secondary"> · {getAuditActorTypeLabelFr(log.actorType)}</Text>
    </>
  );
}

function RequestIdValue({ requestId, onFilter }: { requestId: string; onFilter: (id: string) => void }) {
  return (
    <>
      <Text code>{requestId}</Text>
      <Button type="link" size="small" onClick={() => onFilter(requestId)}>
        {t('Voir toute la requête')}
      </Button>
    </>
  );
}

export const PlatformAuditDetailModal: React.FC<PlatformAuditDetailModalProps> = ({
  log,
  onClose,
  onFilterRequest
}) => (
  <Modal
    title={t("Détail de l'activité")}
    open={log !== null}
    onCancel={onClose}
    footer={[
      <Button key="close" onClick={onClose}>
        {t('Fermer')}
      </Button>
    ]}
    width={720}
    destroyOnClose
  >
    {log && (
      <>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label={t('Date')}>{formatFullDate(log.createdAt)}</Descriptions.Item>
          <Descriptions.Item label={t('Agence')}>{log.tenant?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Acteur')}>
            <ActorValue log={log} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Action')}>{getAuditActionLabelFr(log.action)}</Descriptions.Item>
          <Descriptions.Item label={t('Ressource')}>{resourceText(log)}</Descriptions.Item>
          <Descriptions.Item label={t('Résultat')}>
            <Tag color={getAuditOutcomeColor(log.outcome)}>{getAuditOutcomeLabelFr(log.outcome)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('Catégorie')}>{getAuditCategoryLabelFr(log.category)}</Descriptions.Item>
          <Descriptions.Item label={t('Visibilité')}>{getAuditVisibilityLabelFr(log.visibility)}</Descriptions.Item>
          <Descriptions.Item label={t('Adresse IP')}>{log.ipAddress || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Navigateur')}>
            {log.userAgent ? (
              <Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }} ellipsis={{ rows: 2, expandable: true }}>
                {log.userAgent}
              </Paragraph>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('Identifiant de requête')}>
            {log.requestId ? <RequestIdValue requestId={log.requestId} onFilter={onFilterRequest} /> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('Source')}>{log.source || '—'}</Descriptions.Item>
        </Descriptions>
        <ChangesBlock changes={log.changes} />
        <DetailsBlock details={log.details} />
      </>
    )}
  </Modal>
);
