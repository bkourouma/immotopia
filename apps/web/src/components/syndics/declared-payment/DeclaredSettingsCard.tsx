import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, InputNumber, Progress, Spin, Switch, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  getSyndicDeclaredSettings,
  updateSyndicDeclaredSettings,
  type DeclaredPaymentSettings,
  type UpdateDeclaredPaymentSettingsBody
} from '../../../services/syndic-declared-payment-service';
import { t } from '../../../i18n/t';
import { INSTRUCTIONS_MAX_LENGTH, MONTHLY_AI_QUOTA_FALLBACK, apiErrorMessage } from './helpers';

const { Paragraph, Text } = Typography;

interface Draft {
  enabled: boolean;
  reviewAlertBusinessDays: number;
  proofRequired: boolean;
  payerInstructions: string;
  aiPrefillEnabled: boolean;
}

export interface DeclaredSettingsCardProps {
  tenantId: string;
  syndicId: string;
  /** Faux : tout est en lecture seule. */
  canEdit?: boolean;
  /** Change quand les numéros de réception ont changé : relit `usable` et les compteurs. */
  refreshToken?: number;
  /** Appelé après un enregistrement réussi. */
  onChanged?: () => void;
}

const toDraft = (s: DeclaredPaymentSettings): Draft => ({
  enabled: s.enabled,
  reviewAlertBusinessDays: s.reviewAlertBusinessDays,
  proofRequired: s.proofRequired,
  payerInstructions: s.payerInstructions ?? '',
  aiPrefillEnabled: s.aiPrefillEnabled
});

/**
 * Réglages des paiements déclarés d'une copropriété (spec 047, contrat §1.5).
 * Le PUT n'envoie que les champs modifiés.
 */
export const DeclaredSettingsCard: React.FC<DeclaredSettingsCardProps> = ({
  tenantId,
  syndicId,
  canEdit = true,
  refreshToken = 0,
  onChanged
}) => {
  const { message } = App.useApp();
  const [settings, setSettings] = useState<DeclaredPaymentSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getSyndicDeclaredSettings(tenantId, syndicId);
      setSettings(data);
      setDraft(toDraft(data));
    } catch (e) {
      setLoadError(apiErrorMessage(e, t('Erreur lors du chargement des informations')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, syndicId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Un changement des numéros ne touche que `usable` et les compteurs : les saisies en cours restent.
  useEffect(() => {
    if (refreshToken === 0) return;
    getSyndicDeclaredSettings(tenantId, syndicId)
      .then(data => setSettings(data))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const title = t('Réglages des paiements déclarés');

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
      const body: UpdateDeclaredPaymentSettingsBody = {};
      if (changed.includes('enabled')) body.enabled = draft.enabled;
      if (changed.includes('reviewAlertBusinessDays')) body.reviewAlertBusinessDays = draft.reviewAlertBusinessDays;
      if (changed.includes('proofRequired')) body.proofRequired = draft.proofRequired;
      if (changed.includes('payerInstructions')) {
        body.payerInstructions = draft.payerInstructions.trim() ? draft.payerInstructions.trim() : null;
      }
      if (changed.includes('aiPrefillEnabled')) body.aiPrefillEnabled = draft.aiPrefillEnabled;
      const saved = await updateSyndicDeclaredSettings(tenantId, syndicId, body);
      setSettings(saved);
      setDraft(toDraft(saved));
      message.success(t('Réglages enregistrés'));
      onChanged?.();
    } catch (e) {
      setSaveError(apiErrorMessage(e, t('Enregistrement impossible')));
    } finally {
      setSaving(false);
    }
  };

  const quota = settings.aiReadsMonthlyQuota > 0 ? settings.aiReadsMonthlyQuota : MONTHLY_AI_QUOTA_FALLBACK;
  const percent = Math.min(100, Math.round((settings.aiReadsThisMonth / quota) * 100));
  const quotaReached = settings.aiReadsThisMonth >= quota;
  const readOnly = !canEdit;

  return (
    <Card title={title}>
      <Paragraph type="secondary">
        {t(
          'Les copropriétaires déclarent un paiement mobile money déjà effectué ; le gestionnaire le vérifie puis le valide ou le rejette.'
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
        <Form.Item label={t('Accepter les paiements déclarés')}>
          <Switch
            checked={draft.enabled}
            disabled={readOnly}
            onChange={enabled => patch({ enabled })}
            aria-label={t('Accepter les paiements déclarés')}
          />
        </Form.Item>
        {draft.enabled && !settings.usable ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={t(
              'Ajoutez au moins un numéro de réception actif : tant qu’il n’y en a pas, le portail n’affiche rien.'
            )}
          />
        ) : null}

        <Form.Item
          label={t('Délai d’alerte (jours ouvrés)')}
          extra={t('Une déclaration en attente depuis plus longtemps est signalée comme en retard.')}
        >
          <InputNumber
            min={1}
            max={15}
            precision={0}
            step={1}
            value={draft.reviewAlertBusinessDays}
            disabled={readOnly}
            aria-label={t('Délai d’alerte (jours ouvrés)')}
            onChange={value => {
              if (typeof value === 'number') {
                patch({ reviewAlertBusinessDays: Math.min(15, Math.max(1, Math.round(value))) });
              }
            }}
          />
        </Form.Item>

        <Form.Item label={t('Capture obligatoire')}>
          <Switch
            checked={draft.proofRequired}
            disabled={readOnly}
            onChange={proofRequired => patch({ proofRequired })}
            aria-label={t('Capture obligatoire')}
          />
        </Form.Item>

        <Form.Item label={t('Consigne affichée au copropriétaire')}>
          <Input.TextArea
            rows={3}
            value={draft.payerInstructions}
            maxLength={INSTRUCTIONS_MAX_LENGTH}
            showCount
            disabled={readOnly}
            aria-label={t('Consigne affichée au copropriétaire')}
            onChange={e => patch({ payerInstructions: e.target.value })}
          />
        </Form.Item>

        <Form.Item
          label={t('Pré-remplir par IA la déclaration à partir de la capture')}
          extra={settings.aiPrefillAvailable ? null : t('La lecture automatique n’est pas disponible sur ce serveur.')}
        >
          <Switch
            checked={settings.aiPrefillAvailable && draft.aiPrefillEnabled}
            disabled={readOnly || !settings.aiPrefillAvailable}
            onChange={aiPrefillEnabled => patch({ aiPrefillEnabled })}
            aria-label={t('Pré-remplir par IA la déclaration à partir de la capture')}
          />
        </Form.Item>
        <Paragraph type="secondary">
          {t(
            'L’IA propose seulement des valeurs que le copropriétaire relit ; elle ne valide ni ne crédite jamais rien.'
          )}
        </Paragraph>

        {settings.aiPrefillAvailable ? (
          <div style={{ marginBottom: 16 }}>
            <Text>{t('Lectures IA ce mois-ci : {{n}} sur {{quota}}', { n: settings.aiReadsThisMonth, quota })}</Text>
            <Progress
              percent={percent}
              status={quotaReached ? 'exception' : 'normal'}
              strokeColor={percent >= 80 && !quotaReached ? '#faad14' : undefined}
            />
            {quotaReached ? (
              <Alert
                type="warning"
                showIcon
                message={t('Quota atteint : la lecture automatique est suspendue jusqu’au mois prochain.')}
              />
            ) : null}
          </div>
        ) : null}
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
