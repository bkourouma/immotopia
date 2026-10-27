import React, { useEffect, useState } from 'react';
import { Alert, Descriptions, Drawer, List, Space, Spin, Tag, Timeline, Typography } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { fetchSignatureDetail } from '../../services/signature-admin-service';
import type { SignatureDetailDto } from '../../services/signature-admin-service';
import {
  channelLabel,
  requestStatusLabel,
  roleLabel,
  signerStatusLabel
} from '../../components/signature/signature-labels';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { eventLabel, kindLabel, targetHref } from './signature-admin-labels';

const { Text } = Typography;

export function dateTimeLabel(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(activeLocale());
}

interface Props {
  requestId: string | null;
  onClose: () => void;
}

/** Tiroir de détail : signataires, piste de preuve et lien vers le document cible. */
export const SignatureDetailDrawer: React.FC<Props> = ({ requestId, onClose }) => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [detail, setDetail] = useState<SignatureDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchSignatureDetail(requestId)
      .then(data => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.response?.data?.message || t('Erreur lors du chargement de la demande'));
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const status = detail ? requestStatusLabel(detail.status) : null;
  const href = detail ? targetHref(tenantId, detail.targetType, detail.targetId) : null;
  const signerName = (id?: string | null) => detail?.signers.find(signer => signer.id === id)?.fullName;

  return (
    <Drawer
      open={requestId !== null}
      onClose={onClose}
      width={560}
      title={detail?.title ?? t('Détail de la demande')}
      destroyOnHidden
    >
      {error && <Alert type="error" showIcon message={error} />}
      {!detail && !error && <Spin />}
      {detail && status && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('Type')}>{kindLabel(detail.kind)}</Descriptions.Item>
            <Descriptions.Item label={t('Statut')}>
              <Tag color={status.color}>{status.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('Créée le')}>{dateTimeLabel(detail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label={t('Échéance')}>{dateTimeLabel(detail.expiresAt)}</Descriptions.Item>
            {detail.completedAt && (
              <Descriptions.Item label={t('Terminée le')}>{dateTimeLabel(detail.completedAt)}</Descriptions.Item>
            )}
            {href && (
              <Descriptions.Item label={t('Document')}>
                <Link to={href}>{t('Ouvrir le document')}</Link>
              </Descriptions.Item>
            )}
          </Descriptions>

          <div>
            <Text strong>{t('Signataires')}</Text>
            <List
              size="small"
              dataSource={[...detail.signers].sort((a, b) => a.position - b.position)}
              renderItem={signer => {
                const signerStatus = signerStatusLabel(signer.status);
                return (
                  <List.Item>
                    <Space wrap>
                      <Text strong>{signer.fullName}</Text>
                      <Text type="secondary">
                        {roleLabel(signer.role)} · {channelLabel(signer.channel)}
                        {signer.contactMasked ? ` · ${signer.contactMasked}` : ''}
                      </Text>
                      <Tag color={signerStatus.color}>{signerStatus.label}</Tag>
                    </Space>
                  </List.Item>
                );
              }}
            />
          </div>

          <div>
            <Space wrap style={{ marginBottom: 8 }}>
              <Text strong>{t('Historique')}</Text>
              {detail.chainIntact === true && <Tag color="green">{t('Piste de preuve intacte')}</Tag>}
              {detail.chainIntact === false && <Tag color="red">{t('Piste de preuve altérée')}</Tag>}
            </Space>
            {detail.events.length === 0 ? (
              <div>
                <Text type="secondary">{t('Aucun événement')}</Text>
              </div>
            ) : (
              <Timeline
                items={detail.events.map((event, index) => ({
                  key: `${event.type}-${index}`,
                  children: (
                    <Space direction="vertical" size={0}>
                      <Text>
                        {eventLabel(event.type)}
                        {signerName(event.signerId) ? ` · ${signerName(event.signerId)}` : ''}
                      </Text>
                      <Text type="secondary">{dateTimeLabel(event.createdAt)}</Text>
                    </Space>
                  )
                }))}
              />
            )}
          </div>
        </Space>
      )}
    </Drawer>
  );
};
