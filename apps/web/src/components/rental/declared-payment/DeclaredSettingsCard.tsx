import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, InputNumber, Progress, Spin, Switch, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  getRentalDeclaredSettings,
  updateRentalDeclaredSettings
} from '../../../services/rental-declared-payment-service';
import {
  RENTAL_DEFAULT_REVIEW_ALERT_BUSINESS_DAYS,
  RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MAX,
  RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MIN,
  type RentalDeclaredPaymentSettingsDto,
  type UpdateRentalDeclaredPaymentSettingsBody
} from '../../../types/rental-declared-payment';
import { useMyMenuAccess } from '../../../hooks/useMenuAccess';
import { t } from '../../../i18n/t';
import { HelpSectionTitle } from '../../../help';
import { apiErrorMessage } from './helpers';

const { Paragraph, Text } = Typography;

interface Draft {
  enabled: boolean;
  proofRequired: boolean;
  aiPrefillEnabled: boolean;
  reviewAlertBusinessDays: number;
}

export interface RentalDeclaredSettingsCardProps {
  tenantId: string;
}

const toDraft = (s: RentalDeclaredPaymentSettingsDto): Draft => ({
  enabled: s.enabled,
  proofRequired: s.proofRequired,
  aiPrefillEnabled: s.aiPrefillEnabled,
  reviewAlertBusinessDays: s.reviewAlertBusinessDays ?? RENTAL_DEFAULT_REVIEW_ALERT_BUSINESS_DAYS
});

/**
 * Réglages du paiement déclaré du locatif (spec 049, contrat §1.2).
 * Le PUT n'envoie que les champs modifiés ; il exige RENTAL_PAYMENTS_ALLOCATE.
 */
export const DeclaredSettingsCard: React.FC<RentalDeclaredSettingsCardProps> = ({ tenantId }) => {
  const { message } = App.useApp();
  const { permissions } = useMyMenuAccess(tenantId);
  const canEdit = permissions === null || permissions.has('RENTAL_PAYMENTS_ALLOCATE');
  const [settings, setSettings] = useState<RentalDeclaredPaymentSettingsDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getRentalDeclaredSettings(tenantId);
      setSettings(data);
      setDraft(toDraft(data));
    } catch (e) {
      setLoadError(apiErrorMessage(e, t('Erreur lors du chargement des informations')));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = (
    <HelpSectionTitle title={t('Réglages des paiements déclarés')} helpId="locatif.paiements.declarations.reglages" />
  );

  if (loading && !settings) {
    return (
      <Card title={title}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (loadError && !settings) {
    return (
      <Card title={title}>
        <Alert
          type="error"
          showIcon
          message={t('Erreur')}
          description={loadError}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      </Card>
    );
  }

  if (!settings || !draft) return null;

  const initial = toDraft(settings);
  const changed = (Object.keys(draft) as Array<keyof Draft>).filter(k => draft[k] !== initial[k]);
  const dirty = changed.length > 0;
  const patch = (partial: Partial<Draft>) => setDraft(d => (d ? { ...d, ...partial } : d));

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body: UpdateRentalDeclaredPaymentSettingsBody = {};
      if (changed.includes('enabled')) body.enabled = draft.enabled;
      if (changed.includes('proofRequired')) body.proofRequired = draft.proofRequired;
      if (changed.includes('aiPrefillEnabled')) body.aiPrefillEnabled = draft.aiPrefillEnabled;
      if (changed.includes('reviewAlertBusinessDays')) body.reviewAlertBusinessDays = draft.reviewAlertBusinessDays;
      const saved = await updateRentalDeclaredSettings(tenantId, body);
      setSettings(saved);
      setDraft(toDraft(saved));
      message.success(t('Réglages enregistrés'));
    } catch (e) {
      setSaveError(apiErrorMessage(e, t('Enregistrement impossible')));
    } finally {
      setSaving(false);
    }
  };

  const quota = settings.aiReadsMonthlyQuota;
  const percent = quota > 0 ? Math.min(100, Math.round((settings.aiReadsThisMonth / quota) * 100)) : 0;
  const quotaReached = quota > 0 && settings.aiReadsThisMonth >= quota;
  const readOnly = !canEdit;

  return (
    <Card title={title}>
      <Paragraph type="secondary">
        {t(
          'Les locataires déclarent un paiement mobile money déjà effectué ; le gestionnaire le vérifie puis le valide ou le rejette.'
        )}
      </Paragraph>

      {saveError ? (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setSaveError(null)}
          style={{ marginBottom: 16 }}
          message={saveError}
        />
      ) : null}

      <Form layout="vertical">
        <Form.Item label={t('Déclaration de paiement activée')}>
          <Switch
            checked={draft.enabled}
            disabled={readOnly}
            onChange={enabled => patch({ enabled })}
            aria-label={t('Déclaration de paiement activée')}
          />
        </Form.Item>
        {draft.enabled && !settings.usable ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('Ajoutez un numéro de réception actif : tant qu’il n’y en a pas, le portail n’affiche rien.')}
          />
        ) : null}

        <Form.Item label={t('Capture obligatoire')}>
          <Switch
            checked={draft.proofRequired}
            disabled={readOnly}
            onChange={proofRequired => patch({ proofRequired })}
            aria-label={t('Capture obligatoire')}
          />
        </Form.Item>

        <Form.Item
          label={t('Lecture IA de la capture')}
          extra={settings.aiPrefillAvailable ? null : t('La lecture automatique n’est pas disponible sur ce serveur.')}
        >
          <Switch
            checked={settings.aiPrefillAvailable && draft.aiPrefillEnabled}
            disabled={readOnly || !settings.aiPrefillAvailable}
            onChange={aiPrefillEnabled => patch({ aiPrefillEnabled })}
            aria-label={t('Lecture IA de la capture')}
          />
        </Form.Item>
        <Paragraph type="secondary">
          {t('L’IA propose seulement des valeurs que le locataire relit ; elle ne valide ni ne crédite jamais rien.')}
        </Paragraph>

        {settings.aiPrefillAvailable ? (
          <div style={{ marginBottom: 16 }}>
            <Text>{t('Lectures IA ce mois-ci : {{n}} sur {{quota}}', { n: settings.aiReadsThisMonth, quota })}</Text>
            <Progress percent={percent} status={quotaReached ? 'exception' : 'normal'} />
            {quotaReached ? (
              <Alert
                type="warning"
                showIcon
                message={t('Quota atteint : la lecture automatique est suspendue jusqu’au mois prochain.')}
              />
            ) : null}
          </div>
        ) : null}

        <Form.Item
          label={t('Délai d’alerte (jours ouvrés)')}
          extra={t('Une déclaration en attente depuis plus longtemps est signalée comme en retard.')}
        >
          <InputNumber
            min={RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MIN}
            max={RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MAX}
            precision={0}
            step={1}
            value={draft.reviewAlertBusinessDays}
            disabled={readOnly}
            aria-label={t('Délai d’alerte (jours ouvrés)')}
            onChange={value => {
              if (typeof value === 'number') {
                patch({
                  reviewAlertBusinessDays: Math.min(
                    RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MAX,
                    Math.max(RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MIN, Math.round(value))
                  )
                });
              }
            }}
          />
        </Form.Item>
      </Form>

      {canEdit ? (
        <Button type="primary" loading={saving} disabled={!dirty} onClick={() => void handleSave()}>
          {t('Enregistrer')}
        </Button>
      ) : null}
    </Card>
  );
};

export default DeclaredSettingsCard;
