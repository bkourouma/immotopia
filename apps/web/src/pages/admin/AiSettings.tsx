import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  AutoComplete,
  Button,
  Card,
  Collapse,
  Input,
  Radio,
  Select,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';
import { AssistantFeedbackList } from './AssistantFeedbackList';
import { AssistantUsageList } from './AssistantUsageList';
import { SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAiSettings, listAiModels, testAiConnection, updateAiSettings } from '../../services/ai-settings-service';
import type {
  AiEffort,
  AiMode,
  AiModelOption,
  AiModelsByMode,
  AiProviderId,
  AiSettings,
  TranscriptionProvider,
  TranscriptionSettings
} from '../../types/ai-settings';
import { handleApiError } from '../../utils/error-handler';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;

interface Draft {
  provider: AiProviderId;
  model: string;
  effort: AiEffort;
  refusalFallback: boolean;
  modelsByMode: AiModelsByMode;
  transcription: TranscriptionSettings;
}

const audioModels = { openai: 'gpt-transcribe', google: 'gemini-3.5-transcribe' } as const;
const audioProviders = { openai: 'OpenAI', google: 'Google Gemini' } as const;
const audioModelId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

function normalizeTranscription(config: TranscriptionSettings): TranscriptionSettings {
  return config.provider === 'disabled' ? config : { ...config, model: config.model.trim() };
}

function modeModels(input: AiModelsByMode = {}): AiModelsByMode {
  const deep = input.deep?.trim();
  const fast = input.fast?.trim();
  return { ...(deep ? { deep } : {}), ...(fast ? { fast } : {}) };
}

function toDraft(settings: AiSettings): Draft {
  return {
    provider: settings.provider,
    model: settings.model ?? '',
    effort: settings.effort,
    refusalFallback: settings.refusalFallback,
    modelsByMode: modeModels(settings.modelsByMode),
    transcription: settings.transcription ?? { provider: 'disabled' }
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

/** Modèles Anthropic proposés ; la saisie libre reste possible pour un identifiant plus récent. */
const ANTHROPIC_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];

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
  const [testMode, setTestMode] = useState<AiMode>('standard');
  const [testing, setTesting] = useState(false);

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
      base.refusalFallback !== draft.refusalFallback ||
      JSON.stringify(base.transcription) !== JSON.stringify(normalizeTranscription(draft.transcription)) ||
      JSON.stringify(base.modelsByMode) !== JSON.stringify(modeModels(draft.modelsByMode))
    );
  }, [settings, draft]);

  const modelOptions = useMemo(() => {
    const options = (models ?? [])
      .map(m => ({ value: m.id, label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // Le modèle déjà enregistré reste sélectionnable même s'il a quitté le catalogue.
    const current = draft?.model.trim();
    if (current && current.includes('/') && !options.some(o => o.value === current))
      options.unshift({ value: current, label: current });
    return options;
  }, [models, draft?.model]);

  const patch = (changes: Partial<Draft>) => {
    setDraft(current => (current ? { ...current, ...changes } : current));
    setSaveError(null);
  };

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { modelsByMode, transcription, ...base } = draft;
      const normalized = modeModels(modelsByMode);
      const changed = JSON.stringify(normalized) !== JSON.stringify(modeModels(settings?.modelsByMode));
      const audio = normalizeTranscription(transcription);
      const audioChanged = settings && JSON.stringify(audio) !== JSON.stringify(toDraft(settings).transcription);
      const saved = await updateAiSettings({
        ...base,
        model: base.model.trim(),
        ...(changed ? { modelsByMode: normalized } : {}),
        ...(audioChanged ? { transcription: audio } : {})
      });
      setSettings(saved);
      setDraft(toDraft(saved));
      message.success(t('Réglages de l’assistant IA enregistrés.'));
    } catch (error) {
      setSaveError(handleApiError(error));
    } finally {
      setSaving(false);
    }
  };

  async function runConnectionTest() {
    setTesting(true);
    try {
      const result = await testAiConnection(testMode);
      message.success(
        result.simulated
          ? t('Test effectué avec le fournisseur de recette.')
          : result.toolsVerified
            ? t('Connexion et appel d’outil vérifiés en {{count}} ms.', { count: result.durationMs })
            : t('Connexion réussie en {{count}} ms.', { count: result.durationMs })
      );
    } catch (error) {
      message.error(handleApiError(error));
    } finally {
      setTesting(false);
    }
  }

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
          onChange={e => {
            const next = e.target.value as AiProviderId;
            // Un modèle sans « / » (ex. celui d'Anthropic) n'existe pas chez OpenRouter : on le vide.
            const invalid = next === 'openrouter' && !draft.model.includes('/');
            patch({ provider: next, ...(invalid ? { model: '' } : {}), modelsByMode: {} });
          }}
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
              {modelsUnavailable && !modelsLoading ? (
                <>
                  <AutoComplete
                    aria-label={t('Modèle')}
                    style={{ width: '100%' }}
                    value={draft.model}
                    onChange={value => patch({ model: value })}
                    placeholder={t('Identifiant du modèle (fournisseur/modèle)')}
                  />
                  <Text type="warning">{t('Liste indisponible, saisissez l’identifiant à la main')}</Text>
                </>
              ) : (
                <Select
                  aria-label={t('Modèle')}
                  style={{ width: '100%' }}
                  showSearch
                  loading={modelsLoading}
                  value={draft.model || undefined}
                  options={modelOptions}
                  onChange={value => patch({ model: value })}
                  placeholder={t('Choisir un modèle')}
                  notFoundContent={modelsLoading ? t('Chargement des modèles…') : t('Aucun modèle trouvé')}
                  filterOption={(input, option) =>
                    String(option?.label ?? '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                />
              )}
            </Space>
          ) : (
            <AutoComplete
              aria-label={t('Modèle')}
              style={{ width: '100%' }}
              value={draft.model}
              options={ANTHROPIC_MODELS.map(id => ({ value: id, label: id }))}
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

      {draft.provider === 'anthropic' || draft.provider === 'openrouter' ? (
        <Card title={t('Modèles par mode')}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {(['deep', 'fast'] as const).map(mode => {
              const label = mode === 'deep' ? t('Modèle approfondi') : t('Modèle rapide');
              return (
                <label key={mode} style={{ display: 'grid', gap: 6 }}>
                  {label}
                  <AutoComplete
                    aria-label={label}
                    allowClear
                    style={{ width: '100%' }}
                    value={draft.modelsByMode[mode] ?? ''}
                    options={
                      draft.provider === 'anthropic' ? ANTHROPIC_MODELS.map(id => ({ value: id })) : modelOptions
                    }
                    placeholder={t('Utilise le modèle standard si vide')}
                    onChange={value => patch({ modelsByMode: { ...draft.modelsByMode, [mode]: value } })}
                  />
                </label>
              );
            })}
          </Space>
        </Card>
      ) : null}
      {draft.provider !== 'disabled' && (
        <Card title={t('Connexion au fournisseur')}>
          <Space wrap>
            <Select
              aria-label={t('Mode du test')}
              value={testMode}
              onChange={setTestMode}
              options={[
                { value: 'standard', label: t('Standard') },
                { value: 'deep', label: t('Approfondi') },
                { value: 'fast', label: t('Rapide') }
              ]}
            />
            <Button disabled={dirty} loading={testing} onClick={() => void runConnectionTest()}>
              {t('Tester la connexion')}
            </Button>
          </Space>
        </Card>
      )}

      {settings.transcriptionKeys && (
        <Card title={t('Transcription de la dictée')}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">
              {t('Ce moteur prend le relais lorsque la dictée du navigateur est indisponible.')}
            </Text>
            <Radio.Group
              aria-label={t('Moteur de transcription')}
              value={draft.transcription.provider}
              onChange={e => {
                const provider = e.target.value as TranscriptionProvider | 'disabled';
                patch({
                  transcription: provider === 'disabled' ? { provider } : { provider, model: audioModels[provider] }
                });
              }}
            >
              <Space wrap>
                <Radio value="disabled">{t('Navigateur uniquement')}</Radio>
                {(Object.keys(audioProviders) as TranscriptionProvider[]).map(provider => (
                  <Radio key={provider} value={provider} disabled={!settings.transcriptionKeys?.[provider]}>
                    {audioProviders[provider]}{' '}
                    {!settings.transcriptionKeys?.[provider] && <Tag color="red">{t('Clé manquante')}</Tag>}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
            {draft.transcription.provider !== 'disabled' && (
              <Input
                aria-label={t('Modèle de transcription')}
                placeholder={t('Modèle de transcription')}
                value={draft.transcription.model}
                maxLength={200}
                onChange={e => {
                  if (draft.transcription.provider !== 'disabled') {
                    patch({ transcription: { ...draft.transcription, model: e.target.value } });
                  }
                }}
              />
            )}
          </Space>
        </Card>
      )}

      <Collapse
        items={[
          { key: 'feedback', label: t('Avis sur les réponses de l’assistant'), children: <AssistantFeedbackList /> },
          { key: 'usage', label: t('Usages de l’assistant'), children: <AssistantUsageList /> }
        ]}
      />

      {saveError ? <Alert type="error" showIcon message={saveError} role="alert" /> : null}

      <Space wrap align="center" size="middle">
        <Button
          type="primary"
          icon={<SaveOutlined />}
          disabled={
            !dirty ||
            (draft.transcription.provider !== 'disabled' && !audioModelId.test(draft.transcription.model.trim()))
          }
          loading={saving}
          onClick={() => void onSave()}
        >
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
