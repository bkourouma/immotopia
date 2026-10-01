import React from 'react';
import { Button, Descriptions, Divider, Modal, Tag, Typography } from 'antd';
import type { TenantAuditLog } from '../../services/tenant-audit-service';
import {
  getAuditActionLabelFr,
  getAuditCategoryLabelFr,
  getAuditEntityTypeLabelFr,
  getAuditOutcomeLabelFr
} from '../../constants/audit-labels';
import { getAuditActorDisplay, getAuditOutcomeColor, toChangeRows } from '../../utils/tenant-audit-display';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text, Title, Paragraph } = Typography;

interface ActivityLogDetailModalProps {
  log: TenantAuditLog | null;
  onClose: () => void;
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString(activeLocale(), { dateStyle: 'medium', timeStyle: 'medium' });
}

function resourceText(log: TenantAuditLog): string {
  if (log.resourceLabel) return log.resourceLabel;
  const typeLabel = getAuditEntityTypeLabelFr(log.resourceType);
  return log.resourceId ? `${typeLabel} (${log.resourceId})` : typeLabel;
}

function ChangesBlock({ changes }: { changes: TenantAuditLog['changes'] }) {
  const rows = toChangeRows(changes);
  if (rows.length === 0) return null;
  return (
    <>
      <Divider />
      <Title level={5}>{t('Modifications')}</Title>
      <Descriptions column={1} bordered size="small">
        {rows.map(row => (
          <Descriptions.Item key={row.field} label={row.field}>
            <Text code>{row.before}</Text> {'→'} <Text code>{row.after}</Text>
          </Descriptions.Item>
        ))}
      </Descriptions>
    </>
  );
}

function DetailsBlock({ details }: { details: TenantAuditLog['details'] }) {
  if (!details || Object.keys(details).length === 0) return null;
  return (
    <>
      <Divider />
      <Title level={5}>{t('Détails')}</Title>
      {/* Contenu utilisateur : toujours rendu comme texte, jamais comme HTML. */}
      <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {JSON.stringify(details, null, 2)}
      </pre>
    </>
  );
}

export const ActivityLogDetailModal: React.FC<ActivityLogDetailModalProps> = ({ log, onClose }) => {
  // Le support n'a ni adresse ni navigateur à montrer : l'API ne les envoie pas.
  const showClientInfo = log !== null && log.actorType !== 'SUPER_ADMIN';

  return (
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
            <Descriptions.Item label={t('Acteur')}>{getAuditActorDisplay(log)}</Descriptions.Item>
            <Descriptions.Item label={t('Action')}>{getAuditActionLabelFr(log.action)}</Descriptions.Item>
            <Descriptions.Item label={t('Ressource')}>{resourceText(log)}</Descriptions.Item>
            <Descriptions.Item label={t('Résultat')}>
              <Tag color={getAuditOutcomeColor(log.outcome)}>{getAuditOutcomeLabelFr(log.outcome)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('Catégorie')}>{getAuditCategoryLabelFr(log.category)}</Descriptions.Item>
            {showClientInfo && log.ipAddress && (
              <Descriptions.Item label={t('Adresse IP')}>{log.ipAddress}</Descriptions.Item>
            )}
            {showClientInfo && log.userAgent && (
              <Descriptions.Item label={t('Navigateur')}>
                <Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }} ellipsis={{ rows: 2, expandable: true }}>
                  {log.userAgent}
                </Paragraph>
              </Descriptions.Item>
            )}
            {log.requestId && (
              <Descriptions.Item label={t('Identifiant de requête')}>
                <Text code>{log.requestId}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
          <ChangesBlock changes={log.changes} />
          <DetailsBlock details={log.details} />
        </>
      )}
    </Modal>
  );
};
