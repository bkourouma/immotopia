import React from 'react';
import { Button, Card, Space, Switch, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { InspectionRoom, LeaseInspection } from '../../../services/lease-inspections-service';
import { RoomsAccordion } from './RoomsAccordion';
import { DeductionsSection } from './DeductionsSection';
import { itemKind } from './inspection-constants';
import { formatNumberWithSpaces } from '../../../lib/utils';
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
 * Valeur de remplacement totale de l'inventaire (valeur à l'unité × quantité
 * pour le mobilier), `null` si aucun élément n'en porte.
 */
function inventoryReplacementTotal(rooms: InspectionRoom[]): number | null {
  let total = 0;
  let found = false;
  for (const room of rooms) {
    for (const item of room.items) {
      if (item.replacementValue === null || item.replacementValue === undefined) continue;
      found = true;
      total += itemKind(item) === 'FURNITURE' ? item.replacementValue * (item.quantity ?? 0) : item.replacementValue;
    }
  }
  return found ? total : null;
}

/** Rappel de la valeur relevée à l'entrée, sur une sortie imprimée. */
function entryHint(value: string | number | null | undefined): React.ReactNode {
  return (
    <Text type="secondary" style={{ marginInlineStart: 8 }}>
      ({t('Entrée : {{valeur}}', { valeur: value === null || value === undefined || value === '' ? '—' : value })})
    </Text>
  );
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

  const inventoryTotal = isExit ? null : inventoryReplacementTotal(inspection.rooms);
  const showEntryValues = isExit && Boolean(entryInspection);

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
          isExit={isExit}
          entryItemsById={entryItemsById}
          photos={inspection.photos}
          onUploadPhoto={noop}
          onDeletePhoto={noop}
        />
        {inventoryTotal !== null && (
          <Text strong style={{ display: 'block', marginTop: 12 }}>
            {t("Valeur de remplacement totale de l'inventaire : {{montant}} FCFA", {
              montant: formatNumberWithSpaces(String(inventoryTotal))
            })}
          </Text>
        )}
      </Card>

      <Card title={t('Compteurs et clés')}>
        <Space direction="vertical">
          <Text>
            {t('Électricité : {{valeur}}', { valeur: inspection.meters?.electricity || '—' })}
            {showEntryValues && entryHint(entryInspection?.meters?.electricity)}
          </Text>
          <Text>
            {t('Eau : {{valeur}}', { valeur: inspection.meters?.water || '—' })}
            {showEntryValues && entryHint(entryInspection?.meters?.water)}
          </Text>
          <Text>
            {t('Gaz : {{valeur}}', { valeur: inspection.meters?.gas || '—' })}
            {showEntryValues && entryHint(entryInspection?.meters?.gas)}
          </Text>
          <Text>
            {t('Nombre de clés : {{valeur}}', { valeur: inspection.keysCount ?? '—' })}
            {showEntryValues && entryHint(entryInspection?.keysCount)}
          </Text>
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
