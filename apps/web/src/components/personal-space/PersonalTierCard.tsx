import React, { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Form, Input, Progress, Space, Tag, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ASSET_USAGE_QUERY_KEY,
  PERSONAL_SPACE_ERROR,
  getAssetUsage,
  isValidUemoaPhone,
  normalizePhone,
  getTenantIdentity,
  readApiError,
  startPersonalUpgrade,
  updateTenantContactPhone
} from '../../services/personal-space-service';
import { formatMoney } from '../primitives';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

const { Text, Paragraph } = Typography;

const IDENTITY_QUERY_KEY = 'tenant-identity';
/** Attente de la confirmation serveur après un retour de paiement : 3 s, 60 s au plus. */
const CONFIRM_INTERVAL_MS = 3000;
const CONFIRM_MAX_MS = 60_000;

/**
 * Palier de l'espace personnel et montée vers le palier payant (lot 4D web).
 *
 * Monté par l'écran d'abonnement (`TenantSubscriptionSettings`), qui suit
 * déjà le retour de paiement (`?paiement=`) et les factures. Le pack ne change
 * qu'à la confirmation du paiement par le serveur : cette carte ne modifie
 * aucun droit, elle démarre le paiement et relit l'usage ensuite.
 *
 * Absente pour une agence (`plan === 'AGENCY'`) et tant que l'usage n'est pas
 * connu.
 */
export const PersonalTierCard: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const returningFromPayment = Boolean(searchParams.get('paiement'));
  const startedAt = useRef(Date.now());
  const [waiting, setWaiting] = useState(returningFromPayment);
  const [starting, setStarting] = useState(false);
  const [askPhone, setAskPhone] = useState(false);
  const [notice, setNotice] = useState<{ type: 'info' | 'warning' | 'error'; text: string } | null>(null);
  const [form] = Form.useForm<{ phone: string }>();

  const usageQuery = useQuery({
    queryKey: queryKey(ASSET_USAGE_QUERY_KEY, tenantId),
    queryFn: () => getAssetUsage(tenantId),
    staleTime: STALE_TIME.list,
    retry: false
  });
  const usage = usageQuery.data;
  const refetchUsage = usageQuery.refetch;

  const identity = useQuery({
    queryKey: queryKey(IDENTITY_QUERY_KEY, tenantId),
    queryFn: () => getTenantIdentity(tenantId),
    enabled: usage?.plan === 'FREE',
    staleTime: STALE_TIME.list,
    retry: false
  });

  // Retour de paiement : l'usage est relu jusqu'à ce que le palier ait changé.
  useEffect(() => {
    if (!waiting) return undefined;
    if (usage?.plan === 'PAID') {
      setWaiting(false);
      return undefined;
    }
    const timer = setTimeout(() => {
      if (Date.now() - startedAt.current >= CONFIRM_MAX_MS) setWaiting(false);
      else void refetchUsage();
    }, CONFIRM_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [waiting, usage?.plan, usageQuery.dataUpdatedAt, refetchUsage]);

  if (!usage || usage.plan === 'AGENCY') return null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [ASSET_USAGE_QUERY_KEY] });
    await queryClient.invalidateQueries({ queryKey: [IDENTITY_QUERY_KEY] });
  };

  const goToCheckout = (url: string | null | undefined) => {
    if (url) window.location.assign(url);
    else message.error(t('Adresse de paiement indisponible.'));
  };

  const startUpgrade = async () => {
    setNotice(null);
    setStarting(true);
    try {
      const started = await startPersonalUpgrade(tenantId, usage.upgrade?.target ?? 'PARTICULIER_PLUS');
      goToCheckout(started.checkoutUrl);
    } catch (error) {
      const { status, code, data, message: serverMessage } = readApiError(error);
      if (code === PERSONAL_SPACE_ERROR.ALREADY_ON_TARGET) {
        setNotice({ type: 'info', text: t('Votre espace est déjà sur le palier payant.') });
        await refresh();
      } else if (code === PERSONAL_SPACE_ERROR.PAYMENT_IN_PROGRESS) {
        const resumeUrl = typeof data?.checkoutUrl === 'string' ? data.checkoutUrl : null;
        modal.confirm({
          title: t('Un paiement est déjà en cours'),
          content: t('Reprenez-le pour le terminer.'),
          okText: t('Reprendre le paiement'),
          cancelText: t('Annuler'),
          onOk: () => goToCheckout(resumeUrl)
        });
      } else if (code === PERSONAL_SPACE_ERROR.PHONE_REQUIRED) {
        setAskPhone(true);
      } else if (status === 503) {
        setNotice({
          type: 'warning',
          text: t('Le paiement en ligne n’est pas disponible pour le moment. Réessayez plus tard.')
        });
      } else {
        setNotice({ type: 'error', text: serverMessage ?? t('Impossible de démarrer le paiement.') });
      }
    } finally {
      setStarting(false);
    }
  };

  const handleUpgradeClick = () => {
    // Téléphone obligatoire avant de payer : on le demande d'abord s'il manque.
    if (!identity.data?.contactPhone?.trim() && !identity.isError) {
      setAskPhone(true);
      return;
    }
    void startUpgrade();
  };

  const handleSavePhone = async (values: { phone: string }) => {
    setNotice(null);
    setStarting(true);
    try {
      await updateTenantContactPhone(tenantId, normalizePhone(values.phone));
      await queryClient.invalidateQueries({ queryKey: [IDENTITY_QUERY_KEY] });
      setAskPhone(false);
    } catch (error) {
      setNotice({
        type: 'error',
        text: readApiError(error).message ?? t("Impossible d'enregistrer le numéro de téléphone.")
      });
      setStarting(false);
      return;
    }
    setStarting(false);
    await startUpgrade();
  };

  const paid = usage.plan === 'PAID';
  const percent =
    usage.limit && usage.limit > 0
      ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
      : usage.used > 0
        ? 100
        : 0;

  return (
    <Card title={t('Palier de votre espace')} data-testid="personal-tier-card">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {waiting && <Alert type="info" showIcon role="status" title={t('Confirmation du paiement en cours…')} />}
        {notice && <Alert type={notice.type} showIcon role="alert" title={notice.text} />}
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label={t('Palier actuel')}>
            <Tag color={paid ? 'success' : 'default'}>{paid ? t('Palier payant') : t('Palier gratuit')}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('Actifs suivis')}>
            {usage.limit !== null
              ? t('{{used}} sur {{limit}}', { used: usage.used, limit: usage.limit })
              : String(usage.used)}
          </Descriptions.Item>
        </Descriptions>
        {usage.limit !== null && (
          <Progress
            percent={percent}
            status={percent >= 100 ? 'exception' : 'normal'}
            format={() => `${usage.used} / ${usage.limit}`}
            aria-label={t('Actifs suivis')}
          />
        )}

        {paid && <Text>{t('Vous êtes sur le palier payant : merci de votre confiance.')}</Text>}

        {!paid && usage.upgrade && (
          <div>
            <Paragraph style={{ marginBottom: 'var(--space-2)' }}>
              {t('Palier payant : jusqu’à {{limit}} actifs pour {{prix}} par mois.', {
                limit: usage.upgrade.limit,
                prix: formatMoney(usage.upgrade.priceMonthly, { currency: usage.upgrade.currency })
              })}{' '}
              <Tag color="warning">{t('Tarif provisoire')}</Tag>
            </Paragraph>
            {askPhone ? (
              <Form
                form={form}
                layout="vertical"
                onFinish={handleSavePhone}
                style={{ maxWidth: 420 }}
                disabled={starting}
              >
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 'var(--space-3)' }}
                  title={t('Un numéro de téléphone est nécessaire avant de payer.')}
                />
                <Form.Item
                  name="phone"
                  label={t('Téléphone')}
                  extra={t('Format international, par exemple +2250712345678.')}
                  rules={[
                    { required: true, message: t('Le numéro de téléphone est obligatoire pour payer.') },
                    {
                      validator: (_, value?: string) =>
                        !value || isValidUemoaPhone(value)
                          ? Promise.resolve()
                          : Promise.reject(
                              new Error(
                                t('Numéro invalide : format international attendu, par exemple +2250712345678.')
                              )
                            )
                    }
                  ]}
                >
                  <Input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="+225…" />
                </Form.Item>
                <Space wrap>
                  <Button type="primary" htmlType="submit" loading={starting}>
                    {t('Enregistrer et payer')}
                  </Button>
                  <Button onClick={() => setAskPhone(false)}>{t('Annuler')}</Button>
                </Space>
              </Form>
            ) : (
              <Button type="primary" loading={starting} onClick={handleUpgradeClick}>
                {t('Passer au palier payant')}
              </Button>
            )}
          </div>
        )}
      </Space>
    </Card>
  );
};
