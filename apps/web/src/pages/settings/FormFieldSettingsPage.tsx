import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, App, Button, Collapse, Empty, Input, Skeleton, Space, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import {
  getFormSettings,
  updateFormSettings,
  type FieldMode,
  type FormSettingsForm
} from '../../services/form-settings-service';
import { invalidateFormFieldModes } from '../../hooks/useFormFieldModes';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';
import { FieldModesEditor } from '../../components/form-settings/FieldModesEditor';
import { t } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;

/** Réglages en attente par formulaire : `null` = revenir au mode par défaut. */
type Pending = Record<string, Record<string, FieldMode | null>>;

const MODULE_LABELS: Record<string, () => string> = {
  syndic: () => t('Syndic de copropriété')
};

function moduleLabel(module: string): string {
  return MODULE_LABELS[module]?.() ?? module.charAt(0).toUpperCase() + module.slice(1);
}

/** Fait apparaître l'état « en cours d'édition » dans le formulaire passé à l'éditeur. */
function withPending(form: FormSettingsForm, pending: Record<string, FieldMode | null> | undefined) {
  if (!pending) return form;
  return {
    ...form,
    fields: form.fields.map(field =>
      field.key in pending
        ? { ...field, storedMode: pending[field.key], mode: pending[field.key] ?? field.defaultMode }
        : field
    )
  } as FormSettingsForm;
}

/**
 * `/tenant/:tenantId/settings/formulaires` — Paramètres de l'agence › Formulaires.
 * Obligatoire / Facultatif / Masqué par champ et par formulaire. Les champs
 * « sous condition » restent grisés tant qu'ImmoTopia ne les a pas déverrouillés
 * pour l'agence ; l'enregistrement est propre à chaque formulaire.
 */
export const FormFieldSettingsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { message } = App.useApp();
  // Écriture = TENANT_SETTINGS_EDIT côté API ; `permissions === null` une fois `ready` : aucune restriction connue.
  const { permissions, ready } = useMyMenuAccess(tenantId);
  const canEdit = ready && (permissions === null || permissions.has('TENANT_SETTINGS_EDIT'));

  const [forms, setForms] = useState<FormSettingsForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getFormSettings(tenantId);
      setForms(response.forms);
    } catch {
      setError(t('Impossible de charger les réglages des formulaires.'));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChange = (formKey: string, fieldKey: string, mode: FieldMode | null) => {
    const form = forms.find(f => f.formKey === formKey);
    const field = form?.fields.find(f => f.key === fieldKey);
    if (!field) return;
    setPending(prev => {
      const next = { ...(prev[formKey] ?? {}) };
      // Revenir à l'état déjà enregistré : plus de changement à envoyer.
      if (mode === field.storedMode) delete next[fieldKey];
      else next[fieldKey] = mode;
      const all = { ...prev };
      if (Object.keys(next).length === 0) delete all[formKey];
      else all[formKey] = next;
      return all;
    });
  };

  const handleSave = async (formKey: string) => {
    if (!tenantId) return;
    const changes = pending[formKey];
    if (!changes || Object.keys(changes).length === 0) return;
    setSavingKey(formKey);
    try {
      await updateFormSettings(tenantId, formKey, changes);
      invalidateFormFieldModes(formKey);
      message.success(t('Réglages du formulaire enregistrés.'));
      setPending(prev => {
        const all = { ...prev };
        delete all[formKey];
        return all;
      });
      await load();
    } catch {
      message.error(t("Impossible d'enregistrer les réglages de ce formulaire."));
    } finally {
      setSavingKey(null);
    }
  };

  const grouped = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const visible = forms.filter(form => {
      if (!needle) return true;
      return (
        form.label.toLowerCase().includes(needle) ||
        form.fields.some(field => field.label.toLowerCase().includes(needle))
      );
    });
    const byModule = new Map<string, FormSettingsForm[]>();
    for (const form of visible) {
      byModule.set(form.module, [...(byModule.get(form.module) ?? []), form]);
    }
    return Array.from(byModule.entries());
  }, [forms, search]);

  const formPanels = (moduleForms: FormSettingsForm[]) =>
    moduleForms.map(form => {
      const changes = pending[form.formKey];
      const changeCount = changes ? Object.keys(changes).length : 0;
      return {
        key: form.formKey,
        label: (
          <Space size="small" wrap>
            <Text strong>{form.label}</Text>
            {changeCount > 0 && <Tag color="gold">{t('Modifications non enregistrées')}</Tag>}
          </Space>
        ),
        children: (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <FieldModesEditor
              form={withPending(form, changes)}
              editable={canEdit}
              onChange={(fieldKey, mode) => handleChange(form.formKey, fieldKey, mode)}
            />
            {canEdit && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="primary"
                  disabled={changeCount === 0}
                  loading={savingKey === form.formKey}
                  onClick={() => void handleSave(form.formKey)}
                >
                  {t('Enregistrer')}
                </Button>
              </div>
            )}
          </Space>
        )
      };
    });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {t('Formulaires')}
        </Title>
        <Text type="secondary">
          {t("Choisissez, champ par champ, ce qui est demandé dans les formulaires de l'agence.")}
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        message={t('Trois sortes de champs')}
        description={
          <>
            <Paragraph style={{ marginBottom: 4 }}>
              {t(
                "Les champs paramétrables se règlent ici : Obligatoire, Facultatif ou Masqué. Sans réglage, le formulaire reste tel qu'il est aujourd'hui."
              )}
            </Paragraph>
            <Paragraph style={{ marginBottom: 4 }}>
              {t(
                'Les champs « Réglage soumis à ImmoTopia » sont grisés : demandez leur déverrouillage au support ImmoTopia.'
              )}
            </Paragraph>
            <Paragraph style={{ marginBottom: 0 }}>
              {t("Les autres champs ne sont jamais facultatifs et n'apparaissent pas ici.")}
            </Paragraph>
          </>
        }
      />

      {ready && !canEdit && (
        <Alert
          type="warning"
          showIcon
          message={t('Lecture seule')}
          description={t("Vous n'avez pas le droit de modifier les paramètres de l'agence.")}
        />
      )}

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('Rechercher un formulaire ou un champ')}
        aria-label={t('Rechercher un formulaire ou un champ')}
        value={search}
        onChange={event => setSearch(event.target.value)}
        style={{ maxWidth: 480 }}
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      )}

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : grouped.length === 0 ? (
        <Empty
          description={
            search ? t('Aucun formulaire ne correspond à la recherche.') : t('Aucun formulaire paramétrable.')
          }
        />
      ) : (
        <Collapse
          // Une recherche ouvre les modules concernés ; sans recherche, tout reste fermé.
          key={search.trim() ? `search-${search.trim()}` : 'all'}
          defaultActiveKey={search.trim() ? grouped.map(([module]) => module) : undefined}
          items={grouped.map(([module, moduleForms]) => ({
            key: module,
            label: (
              <Space>
                <Text strong>{moduleLabel(module)}</Text>
                <Tag>{moduleForms.length}</Tag>
              </Space>
            ),
            children: (
              <Collapse
                items={formPanels(moduleForms)}
                defaultActiveKey={search.trim() ? moduleForms.map(f => f.formKey) : undefined}
              />
            )
          }))}
        />
      )}
    </Space>
  );
};

export default FormFieldSettingsPage;
