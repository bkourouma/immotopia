import { DECLARATIONS_CHANGED_EVENT } from '../../components/navigation/SyndicWorkspaceLayout';
import React, { useEffect, useState } from 'react';
import { App, Alert, Button, Space, Tabs, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { CheckoutsTable } from '../../components/syndics/online-payment/CheckoutsTable';
import { GatewayConfigCard } from '../../components/syndics/online-payment/GatewayConfigCard';
import { PayoutsPanel } from '../../components/syndics/online-payment/PayoutsPanel';
import { ReviewDecisionModal } from '../../components/syndics/online-payment/ReviewDecisionModal';
import { ApproveModal } from '../../components/syndics/declared-payment/ApproveModal';
import { DeclarationDrawer } from '../../components/syndics/declared-payment/DeclarationDrawer';
import { DeclarationsTable } from '../../components/syndics/declared-payment/DeclarationsTable';
import { DeclareForThirdPartyModal } from '../../components/syndics/declared-payment/DeclareForThirdPartyModal';
import { DeclaredSettingsCard } from '../../components/syndics/declared-payment/DeclaredSettingsCard';
import { ReceivingNumbersCard } from '../../components/syndics/declared-payment/ReceivingNumbersCard';
import { RejectModal } from '../../components/syndics/declared-payment/RejectModal';
import {
  getSyndicGatewaySettings,
  type DecideSyndicCheckoutResult,
  type SyndicOnlineCheckoutRow
} from '../../services/syndic-online-payment-service';
import { useTabParam } from '../../components/syndics/finances/url-params';
import type { SyndicDeclarationRow } from '../../services/syndic-declared-payment-service';
import { formatMoney } from '../../components/primitives';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Title, Paragraph } = Typography;

const PAYMENT_TABS = ['declarations', 'en-ligne', 'reversements'] as const;

/**
 * Écran « Paiements » d'une copropriété (route `/paiements-en-ligne`).
 * Trois sections :
 * - « Paiements déclarés » (spec 047) : file de validation des transferts mobile
 *   money déclarés par les copropriétaires, tiroir de détail, validation, rejet,
 *   déclaration pour un tiers ;
 * - « Paiement par transfert mobile money » (spec 047) : numéros de réception et réglages ;
 * - « Paiement en ligne » (spec 042) : compte marchand, suivi des paiements
 *   (vérifier, trancher un `REVIEW`) et reversements vers la banque.
 */
export const SyndicOnlinePayments: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, syndicId } = useSyndicRouteContext();
  const [tab, setTab] = useTabParam(PAYMENT_TABS, 'declarations');
  const [collectionBalance, setCollectionBalance] = useState<number | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [deciding, setDeciding] = useState<SyndicOnlineCheckoutRow | null>(null);
  // Mêmes droits que l'API : vérifier, trancher, reverser = SYNDIC_EDIT ; configurer = en plus TENANT_SETTINGS_EDIT.
  // `permissions === null` : aucune restriction (administrateur, super-admin, échec réseau).
  const { permissions, ready } = useMyMenuAccess(tenantId);
  const canEdit = ready && (permissions === null || permissions.has('SYNDIC_EDIT'));
  const canEditSettings = canEdit && (permissions === null || permissions.has('TENANT_SETTINGS_EDIT'));

  // Paiements déclarés (spec 047) : compteur distinct de celui du paiement en ligne.
  const [declaredRefresh, setDeclaredRefresh] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [approving, setApproving] = useState<SyndicDeclarationRow | null>(null);
  const [rejecting, setRejecting] = useState<SyndicDeclarationRow | null>(null);
  const [thirdPartyOpen, setThirdPartyOpen] = useState(false);

  // Onglet « Reversements » ouvert directement : GatewayConfigCard (source habituelle du solde du 5525)
  // n'est pas monté, on lit alors les réglages ici. Un échec laisse le solde à `null` (traité comme 0).
  useEffect(() => {
    if (tab !== 'reversements' || !tenantId || !syndicId) return;
    let cancelled = false;
    getSyndicGatewaySettings(tenantId, syndicId)
      .then(settings => {
        if (!cancelled) setCollectionBalance(settings.collectionAccount.balance);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tab, tenantId, syndicId, refreshToken]);

  if (!tenantId || !syndicId) {
    return <Alert type="error" showIcon message={t('Paramètres copropriété manquants')} />;
  }

  const bump = () => setRefreshToken(value => value + 1);
  const bumpDeclared = () => {
    setDeclaredRefresh(value => value + 1);
    // Le compteur de l'onglet « Paiements » se relit (SyndicWorkspaceLayout).
    window.dispatchEvent(new Event(DECLARATIONS_CHANGED_EVENT));
  };

  const handleDecided = (result: DecideSyndicCheckoutResult) => {
    setDeciding(null);
    if (result.checkout.status === 'SUCCESS') {
      const documents = result.payment?.documents.map(doc => doc.number).join(', ');
      message.success(
        result.payment
          ? t('Encaissement de {{amount}} enregistré{{documents}}', {
              amount: formatMoney(result.payment.amount),
              documents: documents ? ` (${documents})` : ''
            })
          : t('Suivi clos : l’encaissement était déjà enregistré')
      );
    } else {
      message.success(t('Paiement refusé. Le payeur n’a pas été remboursé.'));
    }
    bump();
  };

  const handleApproved = () => {
    setApproving(null);
    bumpDeclared();
    // Les soldes de la section « Paiement en ligne » ont pu changer.
    bump();
  };

  const handleRejected = () => {
    setRejecting(null);
    bumpDeclared();
  };

  const handleStale = () => {
    message.info(t('Cette déclaration a déjà été traitée.'));
    setOpenId(null);
    setApproving(null);
    setRejecting(null);
    bumpDeclared();
  };

  const handleCreatedForThirdParty = (row: SyndicDeclarationRow) => {
    setThirdPartyOpen(false);
    bumpDeclared();
    // Le gestionnaire valide ensuite depuis le tiroir.
    setOpenId(row.id);
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Title level={2} style={{ margin: 0 }}>
          {t('Paiements')}
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('Paiements des appels de charges : transferts mobile money déclarés, paiement en ligne, reversements.')}
        </Paragraph>
      </Space>

      <Tabs
        activeKey={tab}
        onChange={key => setTab(key as (typeof PAYMENT_TABS)[number])}
        destroyOnHidden
        items={[
          {
            key: 'declarations',
            label: t('Paiements déclarés'),
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <DeclarationsTable
                  tenantId={tenantId}
                  syndicId={syndicId}
                  refreshToken={declaredRefresh}
                  onOpen={row => setOpenId(row.id)}
                  toolbarExtra={
                    canEdit ? (
                      <Button icon={<PlusOutlined />} onClick={() => setThirdPartyOpen(true)}>
                        {t('Déclarer pour un copropriétaire')}
                      </Button>
                    ) : null
                  }
                />
                <Title level={3} style={{ margin: 0 }}>
                  {t('Paiement par transfert mobile money')}
                </Title>
                <ReceivingNumbersCard
                  tenantId={tenantId}
                  syndicId={syndicId}
                  canEdit={canEdit}
                  refreshToken={declaredRefresh}
                  onChanged={bumpDeclared}
                />
                <DeclaredSettingsCard
                  tenantId={tenantId}
                  syndicId={syndicId}
                  canEdit={canEdit}
                  refreshToken={declaredRefresh}
                  onChanged={bumpDeclared}
                />
              </Space>
            )
          },
          {
            key: 'en-ligne',
            label: t('Paiement en ligne'),
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <GatewayConfigCard
                  tenantId={tenantId}
                  syndicId={syndicId}
                  refreshToken={refreshToken}
                  canEditSettings={canEditSettings}
                  onSettingsLoaded={settings => setCollectionBalance(settings.collectionAccount.balance)}
                />
                <CheckoutsTable
                  tenantId={tenantId}
                  syndicId={syndicId}
                  refreshToken={refreshToken}
                  onDecide={setDeciding}
                  onChanged={bump}
                  canEdit={canEdit}
                />
              </Space>
            )
          },
          {
            key: 'reversements',
            label: t('Reversements vers la banque'),
            children: (
              <PayoutsPanel
                tenantId={tenantId}
                syndicId={syndicId}
                collectionBalance={collectionBalance}
                canEdit={canEdit}
                onRecorded={result => {
                  // Le solde affiché en haut est celui du 5525 : un reversement d'un numéro de réception n'y touche pas.
                  if ((result.treasuryAccountNumber ?? '5525') === '5525')
                    setCollectionBalance(result.collectionBalanceAfter);
                  bump();
                }}
              />
            )
          }
        ]}
      />

      <ReviewDecisionModal
        tenantId={tenantId}
        syndicId={syndicId}
        checkout={deciding}
        onClose={() => setDeciding(null)}
        onDecided={handleDecided}
      />

      <DeclarationDrawer
        tenantId={tenantId}
        syndicId={syndicId}
        declarationId={openId}
        canEdit={canEdit}
        refreshToken={declaredRefresh}
        onClose={() => setOpenId(null)}
        onApprove={row => {
          setOpenId(null);
          setApproving(row);
        }}
        onReject={row => {
          setOpenId(null);
          setRejecting(row);
        }}
        onStale={handleStale}
      />

      <ApproveModal
        tenantId={tenantId}
        syndicId={syndicId}
        declaration={approving}
        onClose={() => setApproving(null)}
        onApproved={handleApproved}
        onStale={handleStale}
      />

      <RejectModal
        tenantId={tenantId}
        syndicId={syndicId}
        declaration={rejecting}
        onClose={() => setRejecting(null)}
        onRejected={handleRejected}
        onStale={handleStale}
      />

      <DeclareForThirdPartyModal
        tenantId={tenantId}
        syndicId={syndicId}
        open={thirdPartyOpen}
        onClose={() => setThirdPartyOpen(false)}
        onCreated={handleCreatedForThirdParty}
      />
    </Space>
  );
};

export default SyndicOnlinePayments;
