import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Descriptions, Skeleton, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getSaleMandate, listSaleMandates } from '../../services/sales-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { MoneyValue, StatusTag } from '../primitives';
import { t } from '../../i18n/t';
import { SaleStatusTag } from '../../pages/sales/SaleStatusTag';

const { Text } = Typography;

interface PropertySaleCardProps {
  tenantId: string;
  propertyId: string;
}

/**
 * Encart « Vente » de la fiche bien — lot 9 (PRD §5.6).
 *
 * Mandat actif du bien (via `GET /mandates?propertyId=…`), dernière offre,
 * statut du compromis, lien vers la fiche mandat. Sans mandat, propose d'en
 * créer un — la modale de `SaleMandates.tsx` lit `?new=1&propertyId=…`.
 */
export const PropertySaleCard: React.FC<PropertySaleCardProps> = ({ tenantId, propertyId }) => {
  const { data: mandates, isLoading: mandatesLoading } = useQuery({
    queryKey: queryKey('sale-mandates-for-property', tenantId, { propertyId }),
    queryFn: () => listSaleMandates(tenantId, { propertyId }),
    enabled: Boolean(tenantId && propertyId),
    staleTime: STALE_TIME.list
  });

  // Le mandat actif prime ; à défaut, le plus récent (même révoqué ou
  // terminé) reste plus parlant qu'une carte vide.
  const mandate = mandates?.find(m => m.status === 'ACTIVE') ?? mandates?.[0] ?? null;

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: queryKey('sale-mandate-detail-for-property', tenantId, { id: mandate?.id }),
    queryFn: () => getSaleMandate(tenantId, mandate!.id),
    enabled: Boolean(tenantId && mandate?.id),
    staleTime: STALE_TIME.list
  });

  if (mandatesLoading) {
    return (
      <Card title={t('Vente')}>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  if (!mandate) {
    return (
      <Card title={t('Vente')}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">{t('Aucun mandat de vente pour ce bien.')}</Text>
          <Link to={`/tenant/${tenantId}/sales/mandates?new=1&propertyId=${propertyId}`}>
            <Button type="primary">{t('Créer un mandat de vente')}</Button>
          </Link>
        </Space>
      </Card>
    );
  }

  // L'offre retenue dit le prix convenu ; à défaut, la plus récente.
  const offreRetenue = detail?.offers?.find(offer => offer.status === 'ACCEPTED') ?? null;
  const derniereOffre = offreRetenue ?? detail?.offers?.[0] ?? null;

  return (
    <Card title={t('Vente')}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('Mandat')}>
          <Space>
            {mandate.number}
            <SaleStatusTag
              kind="mandate"
              status={mandate.isExpired && mandate.status === 'ACTIVE' ? 'EXPIRED' : mandate.status}
            />
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label={t('Prix demandé')}>
          <MoneyValue value={mandate.askingPrice} />
        </Descriptions.Item>
        <Descriptions.Item label={offreRetenue ? t('Offre retenue') : t('Dernière offre')}>
          {detailLoading ? (
            <Skeleton.Input active size="small" />
          ) : derniereOffre ? (
            <Space>
              <MoneyValue value={derniereOffre.agreedPrice ?? derniereOffre.amount} />
              <SaleStatusTag kind="offer" status={derniereOffre.status} />
            </Space>
          ) : (
            t('Aucune offre reçue')
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t('Compromis')}>
          {mandate.agreementStatus ? (
            <SaleStatusTag kind="agreement" status={mandate.agreementStatus} />
          ) : (
            t('Aucun compromis')
          )}
        </Descriptions.Item>
      </Descriptions>
      <Link
        to={`/tenant/${tenantId}/sales/mandates/${mandate.id}`}
        style={{ display: 'inline-block', marginTop: 'var(--space-3)' }}
      >
        {t('Voir la fiche mandat')}
      </Link>
    </Card>
  );
};

export default PropertySaleCard;
