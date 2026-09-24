import React from 'react';
import { Button, Card, Space, Switch, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { LeaseInspection } from '../../../services/lease-inspections-service';
import { RoomsAccordion } from './RoomsAccordion';
import { DeductionsSection } from './DeductionsSection';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const { Text, Title } = Typography;

interface InspectionViewerProps {
  tenantId: string;
  leaseId: string;
  inspection: LeaseInspection;
  entryInspection: LeaseInspection | null;
  onBack: () => void;
}

const noop = async () => undefined;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Consultation en lecture seule d'un état des lieux finalisé, avec impression.
 *
 * `.inspection-no-print` masque la navigation et les boutons à l'impression :
 * seul le constat doit sortir sur le papier remis en main propre.
 */
export const InspectionViewer: React.FC<InspectionViewerProps> = ({
  tenantId,
  leaseId,
  inspection,
  entryInspection,
  onBack
}) => {
  const isExit = inspection.type === 'EXIT';

  const entryItemsById = React.useMemo(() => {
    if (!isExit || !entryInspection) return undefined;
    const map = new Map<string, { item: (typeof entryInspection.rooms)[number]['items'][number]; roomName: string }>();
    for (const room of entryInspection.rooms) {
      for (const item of room.items) {
        map.set(item.id, { item, roomName: room.name });
      }
    }
    return map;
  }, [isExit, entryInspection]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <style>{`
        @media print {
          .inspection-no-print { display: none !important; }
        }
      `}</style>

      <Space className="inspection-no-print" wrap>
        <Button onClick={onBack}>{t('Retour')}</Button>
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
          {t('Imprimer')}
        </Button>
      </Space>

      <Card>
        <Title level={5}>{isExit ? t('État des lieux de sortie') : t("État des lieux d'entrée")}</Title>
        <Text>{t('Réalisé le {{date}}', { date: formatDate(inspection.inspectionDate) })}</Text>
        {inspection.finalizedAt && (
          <div>
            <Text type="secondary">{t('Finalisé le {{date}}', { date: formatDate(inspection.finalizedAt) })}</Text>
          </div>
        )}
      </Card>

      <Card title={t('Pièces')}>
        <RoomsAccordion
          tenantId={tenantId}
          leaseId={leaseId}
          inspectionId={inspection.id}
          rooms={inspection.rooms}
          readOnly
          showEntryReminder={isExit}
          entryItemsById={entryItemsById}
          photos={inspection.photos}
          onUploadPhoto={noop}
          onDeletePhoto={noop}
        />
      </Card>

      <Card title={t('Compteurs et clés')}>
        <Space direction="vertical">
          <Text>{t('Électricité : {{valeur}}', { valeur: inspection.meters?.electricity || '—' })}</Text>
          <Text>{t('Eau : {{valeur}}', { valeur: inspection.meters?.water || '—' })}</Text>
          <Text>{t('Gaz : {{valeur}}', { valeur: inspection.meters?.gas || '—' })}</Text>
          <Text>{t('Nombre de clés : {{valeur}}', { valeur: inspection.keysCount ?? '—' })}</Text>
        </Space>
      </Card>

      <Card title={t('Observations générales')}>
        <Text>{inspection.generalComment || '—'}</Text>
      </Card>

      {isExit && (
        <Card title={t('Retenues sur le dépôt de garantie')}>
          <DeductionsSection deductions={inspection.deductions} readOnly />
        </Card>
      )}

      <Card title={t('Signatures')}>
        <Space direction="vertical">
          <Space align="center">
            <Switch checked={inspection.tenantPresent} disabled />
            <Text>{t('Le locataire est présent')}</Text>
          </Space>
          <Text>{t('Locataire signataire : {{nom}}', { nom: inspection.tenantSignatoryName || '—' })}</Text>
          <Text>{t('Agent : {{nom}}', { nom: inspection.agentSignatoryName || '—' })}</Text>
        </Space>
      </Card>
    </Space>
  );
};

export default InspectionViewer;
