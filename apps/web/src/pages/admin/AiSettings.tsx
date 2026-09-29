import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  AutoComplete,
  Button,
  Card,
  Radio,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAiSettings, listAiModels, updateAiSettings } from '../../services/ai-settings-service';
import type { AiEffort, AiModelOption, AiProviderId, AiSettings } from '../../types/ai-settings';
import { handleApiError } from '../../utils/error-handler';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;

interface Draft {
  provider: AiProviderId;
  model: string;
  effort: AiEffort;
  refusalFallback: boolean;
}

function toDraft(settings: AiSettings): Draft {
  return {
    provider: settings.provider,
    model: settings.model ?? '',
    effort: settings.effort,
    refusalFallback: settings.refusalFallback
  };
}

function providerLabel(id: AiProviderId, fallback: string): string {
  switch (id) {
    case 'disabled':
      return t('Désactivé');
    case 'openrouter':
      return 'OpenRouter';
    case 'anthropic':
      return 'Anthropic';
    case 'fake':
      return t('Faux (recette)');
    default:
      return fallback;
  }
}

/** Ordre d'affichage fixe, quel que soit l'ordre renvoyé par l'API. */
const PROVIDER_ORDER: AiProviderId[] = ['disabled', 'openrouter', 'anthropic', 'fake'];

/**
 * Admin › Assistant IA. Le super-admin choisit le fournisseur et le modèle
 * d'ImmoCopilot. Les clés API restent dans le `.env` du serveur : l'écran n'en
 * saisit ni n'en affiche, il indique seulement si elles sont configurées.
 */
export const AiSettingsPage: React.FC = () => {
  const { message } = AntApp.useApp();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [models, setModels] = useState<AiModelOption[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsUnavailable, setModelsUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getAiSettings();
      setSettings(data);
      setDraft(toDraft(data));
    } catch (error) {
      setLoadError(handleApiError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const provider = draft?.provider;
  useEffect(() => {
    if (provider !== 'openrouter' || models !== null) return;
    let cancelled = false;
    setModelsLoading(true);
    listAiModels()
      .then(result => {
        if (cancelled) return;
        setModels(result.models);
        setModelsUnavailable(result.unavailable);
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setModelsUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, models]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    const base = toDraft(settings);
    return (
      base.provider !== draft.provider ||
      base.model.trim() !== draft.model.trim() ||
      base.effort !== draft.effort ||
      base.refusalFallback !== draft.refusalFallback
    );
  }, [settings, draft]);

  const modelOptions = useMemo(
    () => (models ?? []).map(m => ({ value: m.id, label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id })),
    [models]
  );

  const patch = (changes: Partial<Draft>) => {
    setDraft(current => (current ? { ...current, ...changes } : current));
    setSaveError(null);
  };

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateAiSettings({ ...draft, model: draft.model.trim() });
      setSettings(saved);
      setDraft(toDraft(saved));
      message.success(t('Réglages de l’assistant IA enregistrés.'));
    } catch (error) {
      setSaveError(handleApiError(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div data-testid="ai-settings-loading">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (loadError || !settings || !draft) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('Impossible de charger les réglages de l’assistant IA')}
        description={loadError ?? undefined}
        action={
          <Button size="small" onClick={() => void load()}>
            {t('Réessayer')}
          </Button>
        }
      />
    );
  }

  const providers = PROVIDER_ORDER.map(id => settings.providers.find(p => p.id === id)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p)
  );
  const keyTag = (id: AiProviderId) => {
    if (id !== 'openrouter' && id !== 'anthropic') return null;
    return settings.keys[id] ? (
      <Tag color="green">{t('Clé configurée')}</Tag>
    ) : (
      <Tag color="red">{t('Clé manquante')}</Tag>
    );
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ marginBottom: 4 }}>
          {t('Assistant IA')}
        </Title>
        <Text type="secondary">{t('Choisissez le fournisseur et le modèle utilisés par ImmoCopilot.')}</Text>
      </div>

      <Alert
        type="info"
        showIcon
        message={t(
          'Les clés API se renseignent dans le fichier .env du serveur (variables OPENROUTER_API_KEY et ANTHROPIC_API_KEY), jamais dans cet écran.'
        )}
      />

      <Card title={t('Fournisseur')}>
        <Radio.Group
          value={draft.provider}
          onChange={e => patch({ provider: e.target.value as AiProviderId })}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {providers.map(p => (
              <div key={p.id}>
                <Radio value={p.id} disabled={!p.available}>
                  <Space wrap>
                    <Text strong>{providerLabel(p.id, p.label)}</Text>
                    {keyTag(p.id)}
                  </Space>
                </Radio>
                {!p.available && p.reason ? (
                  <div style={{ marginInlineStart: 24 }}>
                    <Text type="secondary">{p.reason}</Text>
                  </div>
                ) : null}
              </div>
            ))}
          </Space>
        </Radio.Group>
      </Card>

      {draft.provider === 'openrouter' || draft.provider === 'anthropic' ? (
        <Card title={t('Modèle')}>
          {draft.provider === 'openrouter' ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <AutoComplete
                aria-label={t('Modèle')}
                style={{ width: '100%' }}
                value={draft.model}
                options={modelOptions}
                onChange={value => patch({ model: value })}
                placeholder={t('Rechercher un modèle ou saisir son identifiant')}
                filterOption={(input, option) =>
                  String(option?.value ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase()) ||
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
              {modelsLoading ? <Text type="secondary">{t('Chargement des modèles…')}</Text> : null}
              {modelsUnavailable && !modelsLoading ? (
                <Text type="warning">{t('Liste indisponible, saisissez l’identifiant à la main')}</Text>
              ) : null}
            </Space>
          ) : (
            <AutoComplete
              aria-label={t('Modèle')}
              style={{ width: '100%' }}
              value={draft.model}
              onChange={value => patch({ model: value })}
              placeholder="claude-opus-5-5"
            />
          )}
        </Card>
      ) : null}

      {draft.provider === 'anthropic' ? (
        <Card title={t('Options Anthropic')}>
          <Space direction="vertical" size="middle">
            <div>
              <Paragraph style={{ marginBottom: 8 }}>{t('Effort de raisonnement')}</Paragraph>
              <Radio.Group
                value={draft.effort}
                onChange={e => patch({ effort: e.target.value as AiEffort })}
                optionType="button"
                options={[
                  { value: 'low', label: t('Faible') },
                  { value: 'medium', label: t('Moyen') },
                  { value: 'high', label: t('Élevé') }
                ]}
              />
            </div>
            <Space>
              <Switch
                aria-label={t('Repli en cas de refus')}
                checked={draft.refusalFallback}
                onChange={checked => patch({ refusalFallback: checked })}
              />
              <Text>{t('Repli en cas de refus')}</Text>
            </Space>
          </Space>
        </Card>
      ) : null}

      {saveError ? <Alert type="error" showIcon message={saveError} role="alert" /> : null}

      <Space wrap align="center" size="middle">
        <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={saving} onClick={() => void onSave()}>
          {t('Enregistrer')}
        </Button>
        <Tag>{settings.source === 'database' ? t('Base de données') : t('Variables d’environnement')}</Tag>
        {settings.updatedAt ? (
          <Text type="secondary">
            {t('Dernière modification par {{name}} le {{date}}', {
              name: settings.updatedByName ?? t('inconnu'),
              date: dayjs(settings.updatedAt).format(dateFormat('dateTime'))
            })}
          </Text>
        ) : null}
      </Space>
    </Space>
  );
};

export default AiSettingsPage;
