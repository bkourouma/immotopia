import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
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
  type CoOwnerOnlinePaymentConflict
} from '../../services/coowner-portal-service';
import { isSafeCheckoutUrl } from '../../services/public-installment-payment-service';
import { redirectToExternalUrl } from '../../utils/external-redirect';
import { ChargeCallsTable } from './ChargeCallsTable';
import { OnlinePaymentReturn, isPaymentCode } from './OnlinePaymentReturn';
import { portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

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
  // Appel dont le bouton « Payer en ligne » a été cliqué : un seul paiement s'initie à la fois.
  const [payingCallId, setPayingCallId] = useState<string | null>(null);
  // Appel dont le bouton « J'ai payé par mobile money » a été cliqué : ouvre la déclaration préremplie.
  const [callToDeclare, setCallToDeclare] = useState<CoOwnerChargeCall | null>(null);
  const [problem, setProblem] = useState<PaymentProblem | null>(null);

  const {
    data: calls,
    isPending,
    isFetching,
    error,
    refetch
  } = useQuery({
    queryKey: ['coowner-portal', 'charge-calls', 'all'],
    staleTime: 30_000,
    queryFn: () => listMyChargeCalls()
  });

  const availabilityQuery = useQuery({
    queryKey: ['coowner-portal', 'online-payment-availability'],
    staleTime: 30_000,
    queryFn: () => getOnlinePaymentAvailability(),
    retry: false
  });

  // Paiement mobile money déclaré (spec 047) : n'attend rien, ne bloque rien.
  const {
    entries: declaredEntries,
    anyAvailable: declaredAvailable,
    declarableSyndicateIds
  } = useDeclaredAvailabilities(calls ?? []);

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

  // Bouton de la ligne : règle cet appel seul.
  const payOnline = async (call: CoOwnerChargeCall) => {
    const lotId = call.lot?.id;
    if (!lotId) return;
    setPayingCallId(call.id);
    setProblem(null);
    try {
      const checkout = await startOnlinePayment({ lotId, chargeCallIds: [call.id] });
      if (isSafeCheckoutUrl(checkout.checkoutUrl)) {
        redirectToExternalUrl(checkout.checkoutUrl);
        return;
      }
      setProblem({ message: t("Le paiement en ligne n'a pas pu être initié.") });
    } catch (e) {
      setProblem(problemFromError(e));
    } finally {
      setPayingCallId(null);
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

      {problem ? (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={() => setProblem(null)}
          message={problem.message}
          action={
            problem.resumeUrl ? (
              <Button size="small" type="primary" onClick={() => redirectToExternalUrl(problem.resumeUrl as string)}>
                {t('Reprendre le paiement')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <DeclaredPaymentSection
        calls={calls}
        entries={declaredEntries}
        callToDeclare={callToDeclare}
        onCallDeclarationClose={() => setCallToDeclare(null)}
      />

      <Card>
        <ChargeCallsTable
          calls={calls}
          onResume={onlineEnabled ? call => void resumePayment(call) : undefined}
          onPayOne={onlineEnabled ? call => void payOnline(call) : undefined}
          onDeclareOne={declaredAvailable ? setCallToDeclare : undefined}
          canDeclare={call => declarableSyndicateIds.has(call.syndicateId)}
          payingCallId={payingCallId}
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
