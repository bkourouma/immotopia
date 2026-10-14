import React from 'react';
import { Alert, Button, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getStockSlip } from '../../../../services/finance-stock-controle-service';
import { StockAttachmentList } from '../StockAttachmentList';
import { StockSlipPdfButton } from '../StockSlipPdfButton';
import { EtapeGeste, LigneRecap } from './MagasinBriques';
import { lireErreurStock } from './stock-erreurs';
import { detailKey, STALE_TIME } from '../../../../lib/query-keys';
import { formatQuantity } from '../../../../types/finance-stock-inventaire-types';
import {
  STOCK_SLIP_KIND_LABELS,
  type StockAbilities,
  type StockAttachmentPurpose,
  type StockSlipKind
} from '../../../../types/finance-stock-controle-types';
import { dateFormat } from '../../../../i18n/format';
import { t } from '../../../../i18n/t';

const { Text } = Typography;

/** Droit d'ajout d'une pièce selon la nature du bon (spec B5-R6). */
function peutAjouter(kind: StockSlipKind, abilities: StockAbilities): boolean {
  if (kind === 'RECEIPT') return abilities.canReceive;
  if (kind === 'ISSUE') return abilities.canIssue;
  return abilities.canValidateCount;
}

const FINALITES: StockAttachmentPurpose[] = ['SIGNED_SLIP', 'GOODS_PHOTO', 'DELIVERY_NOTE'];

export interface MagasinBonProps {
  tenantId: string;
  slipId: string;
  abilities: StockAbilities;
  onRetour: () => void;
}

/**
 * Un bon, en plein écran (ecrans §6.2, forme du tiroir §5.7) : nature et
 * numéro, dates, lieu, chantier, preneur, facture, lignes en quantités —
 * **aucune valeur sur l'écran Magasin** —, PDF et pièces jointes.
 */
export const MagasinBon: React.FC<MagasinBonProps> = ({ tenantId, slipId, abilities, onRetour }) => {
  const lecture = useQuery({
    queryKey: detailKey('stock-slips', tenantId, slipId),
    queryFn: () => getStockSlip(tenantId, slipId),
    staleTime: STALE_TIME.list
  });

  if (lecture.isError) {
    const erreur = lireErreurStock(lecture.error, t('Le bon n’a pas pu être lu.'));
    return (
      <EtapeGeste titre={t('Bon')} onRetour={onRetour}>
        {erreur.status === 404 ? (
          <Alert type="info" showIcon message={t('Ce bon est introuvable.')} />
        ) : (
          <Alert
            type="error"
            showIcon
            message={erreur.message}
            action={
              <Button onClick={() => void lecture.refetch()} style={{ minHeight: 44 }}>
                {t('Réessayer')}
              </Button>
            }
          />
        )}
      </EtapeGeste>
    );
  }

  const bon = lecture.data?.data;
  if (!bon) {
    return (
      <EtapeGeste titre={t('Bon')} onRetour={onRetour}>
        <Text type="secondary">{t('Chargement du bon…')}</Text>
      </EtapeGeste>
    );
  }

  const demandeur = bon.taker?.label ?? bon.requestedBy;

  return (
    <EtapeGeste titre={`${STOCK_SLIP_KIND_LABELS[bon.kind]} ${bon.number}`} onRetour={onRetour}>
      <LigneRecap label={t('Date du document')}>{dayjs(bon.documentDate).format(dateFormat('short'))}</LigneRecap>
      <LigneRecap label={t('Enregistré')}>
        {t('le {{date}} à {{heure}} (heure du serveur) par {{nom}}', {
          date: dayjs(bon.createdAt).format(dateFormat('short')),
          heure: dayjs(bon.createdAt).format('HH:mm'),
          nom: bon.createdByLabel
        })}
      </LigneRecap>
      <LigneRecap label={t('Lieu')}>{bon.location.label}</LigneRecap>
      {bon.site ? <LigneRecap label={t('Chantier')}>{bon.site.name}</LigneRecap> : null}
      {demandeur ? <LigneRecap label={t('Preneur ou demandeur')}>{demandeur}</LigneRecap> : null}
      {bon.supplierInvoice ? (
        <LigneRecap label={t('Facture')}>
          {bon.supplierInvoice.reference} — {bon.supplierInvoice.supplierName}
        </LigneRecap>
      ) : null}
      <LigneRecap label={t('Articles')}>
        {bon.movements.map(mouvement => (
          <Text key={mouvement.id} style={{ display: 'block' }}>
            {mouvement.itemReference} — {mouvement.itemLabel} : {formatQuantity(mouvement.quantity, mouvement.itemUnit)}
          </Text>
        ))}
      </LigneRecap>
      <div style={{ marginBlock: 'var(--space-3)' }}>
        <StockSlipPdfButton tenantId={tenantId} slipId={bon.id} number={bon.number} />
      </div>
      <StockAttachmentList
        tenantId={tenantId}
        targetType="SLIP"
        targetId={bon.id}
        canAdd={peutAjouter(bon.kind, abilities)}
        initialAttachments={bon.attachments}
        purposes={FINALITES}
      />
    </EtapeGeste>
  );
};

export default MagasinBon;
