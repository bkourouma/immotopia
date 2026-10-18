import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd';
import { CreditCardOutlined, SyncOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { MoneyValue, SkeletonList, StateBlock } from '../../components/primitives';
import { DeclaredPaymentSection } from '../../components/coowner-portal/declared-payment/DeclaredPaymentSection';
import { useDeclaredAvailabilities } from '../../components/coowner-portal/declared-payment/useDeclaredAvailabilities';
import { t } from '../../i18n/t';
import {
  getOnlinePayment,
  getOnlinePaymentAvailability,
  listMyChargeCalls,
  startOnlinePayment,
  type CoOwnerChargeCall,
  type CoOwnerOnlinePaymentAvailability,
  type CoOwnerOnlinePaymentConflict,
  type OnlinePaymentChannel
} from '../../services/coowner-portal-service';
import { isSafeCheckoutUrl } from '../../services/public-installment-payment-service';
import { redirectToExternalUrl } from '../../utils/external-redirect';
import { ChargeCallsTable, isCallSelectable } from './ChargeCallsTable';
import { OnlinePaymentReturn, isPaymentCode } from './OnlinePaymentReturn';
import { portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

function channelLabel(channel: OnlinePaymentChannel): string {
  switch (channel) {
    case 'WAVE':
      return 'Wave';
    case 'ORANGE_MONEY':
      return 'Orange Money';
    case 'MTN_MONEY':
      return t('MTN Money');
    case 'MOOV_MONEY':
      return 'Moov Money';
    default:
      return t('Carte bancaire');
  }
}

/** Frais et mode de la copropriété de l'appel choisi, retrouvée par son identifiant. */
function syndicateOnlineInfo(availability: CoOwnerOnlinePaymentAvailability, syndicateId: string) {
  return (
    availability.syndicates.find(syndicate => syndicate.available && syndicate.syndicateId === syndicateId) ?? null
  );
}

interface PaymentProblem {
  message: string;
  /** Page du fournisseur d'un paiement déjà ouvert : proposée à la reprise. */
  resumeUrl?: string;
}

function problemFromError(error: unknown): PaymentProblem {
  const response = (
    error as {
      response?: { status?: number; data?: { message?: string; code?: string; data?: CoOwnerOnlinePaymentConflict } };
    } | null
  )?.response;
  if (response?.status === 409 && response.data?.code === 'ONLINE_PAYMENT_IN_PROGRESS') {
    const url = response.data.data?.checkoutUrl;
    return {
      message: response.data.message || t('Un paiement en ligne est déjà en cours pour ces appels.'),
      resumeUrl: isSafeCheckoutUrl(url) ? url : undefined
    };
  }
  return { message: response?.data?.message || t("Le paiement en ligne n'a pas pu être initié.") };
}

/**
 * « Mes appels de charges » — tous les appels des lots du copropriétaire.
 * Le statut « En retard » est dérivé par le serveur (échéance passée, appel
 * non soldé). Le paiement en ligne (spec 042) ne se propose que si la
 * copropriété a un compte de paiement actif.
 */
export default function CoOwnerChargeCalls() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const paiementParam = searchParams.get('paiement');
  // Le paramètre d'adresse ne prouve rien : seul le statut lu à l'API compte.
  const [returnCode, setReturnCode] = useState<string | null>(() =>
    isPaymentCode(paiementParam) ? paiementParam : null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const [problem, setProblem] = useState<PaymentProblem | null>(null);

  const {
    data: calls,
    isPending,
    isFetching,
    error,
    refetch
  } = useQuery({
    queryKey: ['coowner-portal', 'charge-calls', 'all'],
    queryFn: () => listMyChargeCalls()
  });

  const availabilityQuery = useQuery({
    queryKey: ['coowner-portal', 'online-payment-availability'],
    queryFn: () => getOnlinePaymentAvailability(),
    retry: false
  });

  // Paiement mobile money déclaré (spec 047) : n'attend rien, ne bloque rien.
  const { entries: declaredEntries, anyAvailable: declaredAvailable } = useDeclaredAvailabilities(calls ?? []);

  const removePaiementParam = () =>
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete('paiement');
        return next;
      },
      { replace: true }
    );

  useEffect(() => {
    if (!paiementParam) return;
    if (isPaymentCode(paiementParam)) {
      setReturnCode(current => (current === paiementParam ? current : paiementParam));
      return;
    }
    // Valeur qui n'a pas la forme d'un code : retirée sans rien afficher.
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete('paiement');
        return next;
      },
      { replace: true }
    );
  }, [paiementParam, setSearchParams]);

  const handleReturnSettled = () => {
    removePaiementParam();
    setSelectedIds([]);
    void queryClient.invalidateQueries({ queryKey: ['coowner-portal'] });
  };

  const returnBanner = returnCode ? (
    <OnlinePaymentReturn key={returnCode} codePaiement={returnCode} onSettled={handleReturnSettled} />
  ) : null;

  if (isPending) return <SkeletonList rows={4} />;

  if (error || !calls) {
    return (
      <StateBlock
        variant="error"
        description={portalErrorMessage(error, t('Impossible de charger les appels de charges.'))}
        actions={[{ label: t('Réessayer'), onClick: () => void refetch(), primary: true }]}
      />
    );
  }

  const outstanding = calls.reduce((sum, call) => sum + call.outstanding, 0);
  const overdue = calls.filter(call => call.status === 'OVERDUE');
  const overdueAmount = overdue.reduce((sum, call) => sum + call.outstanding, 0);

  const availability = availabilityQuery.data;
  const onlineEnabled = Boolean(availability?.syndicates.some(syndicate => syndicate.available));
  const availabilityKnown = !availabilityQuery.isPending;
  const hasSomethingToPay = calls.some(call => call.outstanding > 0);

  // Sélection valide : un appel disparu ou devenu non payable (liste rechargée) en sort.
  const selectedCalls: CoOwnerChargeCall[] = [];
  for (const call of calls) {
    if (selectedIds.includes(call.id) && isCallSelectable(call, selectedCalls)) selectedCalls.push(call);
  }
  const selectedTotal = selectedCalls.reduce((sum, call) => sum + call.outstanding, 0);
  const selectedInfo =
    availability && selectedCalls.length > 0 ? syndicateOnlineInfo(availability, selectedCalls[0].syndicateId) : null;

  const payOnline = async () => {
    const lotId = selectedCalls[0]?.lot?.id;
    if (!lotId) return;
    setPaying(true);
    setProblem(null);
    try {
      const checkout = await startOnlinePayment({ lotId, chargeCallIds: selectedCalls.map(call => call.id) });
      if (isSafeCheckoutUrl(checkout.checkoutUrl)) {
        redirectToExternalUrl(checkout.checkoutUrl);
        return;
      }
      setProblem({ message: t("Le paiement en ligne n'a pas pu être initié.") });
    } catch (e) {
      setProblem(problemFromError(e));
    } finally {
      setPaying(false);
    }
  };

  // Reprise d'un paiement en cours depuis la liste : l'URL vient du serveur (code du compte), jamais du navigateur.
  const resumePayment = async (call: CoOwnerChargeCall) => {
    if (!call.onlineCheckoutCode) return;
    setProblem(null);
    try {
      const checkout = await getOnlinePayment(call.onlineCheckoutCode);
      if (checkout.status === 'PENDING' && isSafeCheckoutUrl(checkout.checkoutUrl)) {
        redirectToExternalUrl(checkout.checkoutUrl);
        return;
      }
      setReturnCode(checkout.codePaiement);
    } catch (e) {
      setProblem(problemFromError(e));
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {returnBanner}

      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mes appels de charges')}</Title>
          <Text type="secondary">{t('Montant appelé, déjà payé et reste à payer pour chacun de vos lots.')}</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={() => void refetch()} loading={isFetching}>
          {t('Actualiser')}
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card>
            <Text type="secondary">{t('Reste à payer')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={outstanding} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Text type="secondary">{t('Dont en retard')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={overdueAmount} />{' '}
              <Text type="secondary">({t('{{count}} appel(s)', { count: overdue.length })})</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {onlineEnabled && availability ? (
        <Card>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {selectedInfo?.simulated ? <Alert type="info" showIcon message={t('Mode démonstration')} /> : null}
            {problem ? (
              <Alert
                type="warning"
                showIcon
                closable
                onClose={() => setProblem(null)}
                message={problem.message}
                action={
                  problem.resumeUrl ? (
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => redirectToExternalUrl(problem.resumeUrl as string)}
                    >
                      {t('Reprendre le paiement')}
                    </Button>
                  ) : undefined
                }
              />
            ) : null}
            <div className="it-toolbar__actions" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <Space direction="vertical" size={0}>
                <Text>
                  {selectedCalls.length > 0 ? (
                    <>
                      {t('Total à payer :')} <MoneyValue value={selectedTotal} />
                    </>
                  ) : (
                    t('Cochez un ou plusieurs appels d’un même lot pour les régler en ligne.')
                  )}
                </Text>
                {selectedCalls.length > 0 && selectedInfo ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {selectedInfo.feesPaidBy === 'CLIENT'
                      ? t('Des frais du service de paiement peuvent s’ajouter au montant.')
                      : t('Les frais du service de paiement sont pris en charge par votre agence.')}
                  </Text>
                ) : null}
                {availability.paymentMethods.length > 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('Moyens de paiement : {{methods}}', {
                      methods: availability.paymentMethods.map(channelLabel).join(', ')
                    })}
                  </Text>
                ) : null}
              </Space>
              <Button
                type="primary"
                icon={<CreditCardOutlined aria-hidden />}
                disabled={selectedCalls.length === 0}
                loading={paying}
                onClick={() => void payOnline()}
              >
                {t('Payer en ligne')}
              </Button>
            </div>
          </Space>
        </Card>
      ) : null}

      <DeclaredPaymentSection calls={calls} entries={declaredEntries} />

      <Card>
        <ChargeCallsTable
          calls={calls}
          onResume={onlineEnabled ? call => void resumePayment(call) : undefined}
          selection={
            onlineEnabled ? { selectedIds: selectedCalls.map(call => call.id), onChange: setSelectedIds } : undefined
          }
        />
      </Card>

      {availabilityKnown && !onlineEnabled && !declaredAvailable && hasSomethingToPay ? (
        <Text type="secondary">
          {t(
            "Le règlement en ligne n'est pas encore ouvert pour votre copropriété. Rapprochez-vous de votre agence pour régler vos appels de charges."
          )}
        </Text>
      ) : null}
    </Space>
  );
}
