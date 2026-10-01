import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProperty, listProperties } from '../../../services/property-service';
import { httpStatusOf, landErrorMessage } from './land-errors';
import { LandValidationAlert } from './LandValidationAlert';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';
import { createLandRegularization, listLandTracks } from './land-regularization-service';
import type { LandRegularizationDetail, LandTrackKey } from './land-types';

const { TextArea } = Input;

const MAX_CUSTOM_STEPS = 30;

interface CustomStepValue {
  label?: string;
  required?: boolean;
  dueDate?: string;
}

interface FormValues {
  propertyId: string;
  track: LandTrackKey;
  startDate?: string;
  notes?: string;
  steps?: CustomStepValue[];
}

export interface LandCreateModalProps {
  open: boolean;
  tenantId: string;
  /** Bien pré-sélectionné (`?propertyId=` ou lien depuis la fiche d'un terrain). */
  defaultPropertyId?: string;
  onClose: () => void;
  onCreated: (detail: LandRegularizationDetail) => void;
}

/**
 * `<LandCreateModal>` — ouverture d'un dossier de régularisation foncière.
 *
 * Le catalogue des filières vient de l'API : aucune étape n'est écrite ici.
 * Une filière personnalisée demande une liste d'étapes (1 à 30). Le refus 409
 * « un dossier est déjà en cours sur ce bien » s'affiche dans la modale.
 */
export const LandCreateModal: React.FC<LandCreateModalProps> = ({
  open,
  tenantId,
  defaultPropertyId,
  onClose,
  onCreated
}) => {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const track = Form.useWatch('track', form);
  const queryClient = useQueryClient();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debounced, setDebounced] = useState('');

  const tracksQuery = useQuery({
    queryKey: queryKey('land-tracks', tenantId),
    queryFn: () => listLandTracks(tenantId),
    enabled: open,
    staleTime: STALE_TIME.reference
  });

  const propertiesQuery = useQuery({
    queryKey: queryKey('land-property-options', tenantId, { q: debounced }),
    queryFn: () => listProperties(tenantId, { q: debounced || undefined, limit: 20 }),
    enabled: open,
    staleTime: STALE_TIME.list
  });

  const defaultPropertyQuery = useQuery({
    queryKey: queryKey('land-property-default', tenantId, { id: defaultPropertyId }),
    queryFn: () => getProperty(tenantId, defaultPropertyId as string),
    enabled: open && Boolean(defaultPropertyId),
    staleTime: STALE_TIME.list
  });

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      form.resetFields();
      if (defaultPropertyId) form.setFieldsValue({ propertyId: defaultPropertyId });
    }
  }, [open, defaultPropertyId, form]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebounced(search), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const propertyOptions = useMemo(() => {
    const options = new Map<string, string>();
    const bienParDefaut = defaultPropertyQuery.data;
    if (bienParDefaut) options.set(bienParDefaut.id, optionLabel(bienParDefaut));
    for (const bien of propertiesQuery.data?.properties ?? []) options.set(bien.id, optionLabel(bien));
    return Array.from(options, ([value, label]) => ({ value, label }));
  }, [propertiesQuery.data, defaultPropertyQuery.data]);

  const tracks = tracksQuery.data ?? [];
  const selectedTrack = tracks.find(item => item.key === track);

  const handleOk = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const custom = values.track === 'PERSONNALISEE';
      const detail = await createLandRegularization(tenantId, {
        propertyId: values.propertyId,
        track: values.track,
        startDate: values.startDate || undefined,
        notes: values.notes?.trim() || undefined,
        steps: custom
          ? (values.steps ?? []).map(step => ({
              label: (step.label ?? '').trim(),
              required: step.required ?? true,
              dueDate: step.dueDate || undefined
            }))
          : undefined
      });
      queryClient.setQueryData(queryKey('land-regularization', tenantId, { id: detail.id }), detail);
      void queryClient.invalidateQueries({ queryKey: ['land-regularizations', tenantId] });
      onCreated(detail);
    } catch (error) {
      const status = httpStatusOf(error);
      setErrorMessage(
        landErrorMessage(
          error,
          status === 409
            ? t('Ce bien a déjà un dossier de régularisation en cours.')
            : t('Impossible de créer le dossier de régularisation.')
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('Nouveau dossier de régularisation')}
      onCancel={onClose}
      onOk={handleOk}
      okText={t('Créer le dossier')}
      cancelText={t('Annuler')}
      confirmLoading={submitting}
      destroyOnHidden
      width={640}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark="optional"
        onValuesChange={changed => {
          if ('track' in changed) {
            form.setFieldValue('steps', changed.track === 'PERSONNALISEE' ? [{ label: '', required: true }] : []);
          }
        }}
      >
        {errorMessage && <Alert type="error" showIcon title={errorMessage} style={{ marginBottom: 16 }} />}

        <Form.Item name="propertyId" label={t('Bien')} rules={[{ required: true, message: t('Choisissez un bien.') }]}>
          <Select
            showSearch
            filterOption={false}
            onSearch={setSearch}
            loading={propertiesQuery.isFetching}
            options={propertyOptions}
            placeholder={t('Rechercher un bien')}
            notFoundContent={t('Aucun bien trouvé.')}
          />
        </Form.Item>

        <Form.Item
          name="track"
          label={t('Filière')}
          rules={[{ required: true, message: t('Choisissez une filière.') }]}
        >
          <Select
            loading={tracksQuery.isPending}
            options={tracks.map(item => ({ value: item.key, label: item.label }))}
            placeholder={t('Choisir une filière')}
          />
        </Form.Item>

        {selectedTrack?.validationStatus === 'A_VALIDER' && (
          <LandValidationAlert note={selectedTrack.validationNote} style={{ marginBottom: 16 }} />
        )}

        <Form.Item name="startDate" label={t('Date de début')}>
          <Input type="date" />
        </Form.Item>

        <Form.Item name="notes" label={t('Notes')}>
          <TextArea rows={3} maxLength={5000} />
        </Form.Item>

        {track === 'PERSONNALISEE' && <CustomStepsEditor />}
      </Form>
    </Modal>
  );
};

function optionLabel(bien: { title: string; internalReference?: string | null }): string {
  return bien.internalReference ? `${bien.title} (${bien.internalReference})` : bien.title;
}

/** Éditeur de la liste d'étapes d'une filière personnalisée (1 à 30). */
const CustomStepsEditor: React.FC = () => (
  <Form.List
    name="steps"
    rules={[
      {
        validator: async (_, steps: CustomStepValue[] | undefined) => {
          if (!steps || steps.length < 1) throw new Error(t('Ajoutez au moins une étape.'));
        }
      }
    ]}
  >
    {(fields, { add, remove }, { errors }) => (
      <div role="group" aria-label={t('Étapes personnalisées')}>
        {fields.map((field, index) => (
          <Space key={field.key} align="start" wrap style={{ display: 'flex', marginBottom: 8 }}>
            <Form.Item
              name={[field.name, 'label']}
              label={index === 0 ? t("Libellé de l'étape") : undefined}
              rules={[{ required: true, whitespace: true, message: t("Saisissez le libellé de l'étape.") }]}
              style={{ marginBottom: 0, minWidth: 220 }}
            >
              <Input maxLength={200} aria-label={t("Libellé de l'étape {{n}}", { n: index + 1 })} />
            </Form.Item>
            <Form.Item
              name={[field.name, 'dueDate']}
              label={index === 0 ? t('Échéance') : undefined}
              style={{ marginBottom: 0 }}
            >
              <Input type="date" aria-label={t("Échéance de l'étape {{n}}", { n: index + 1 })} />
            </Form.Item>
            <Form.Item name={[field.name, 'required']} valuePropName="checked" style={{ marginBottom: 0 }}>
              <Checkbox>{t('Obligatoire')}</Checkbox>
            </Form.Item>
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={t("Supprimer l'étape {{n}}", { n: index + 1 })}
              disabled={fields.length <= 1}
              onClick={() => remove(field.name)}
            />
          </Space>
        ))}
        <Form.ErrorList errors={errors} />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          disabled={fields.length >= MAX_CUSTOM_STEPS}
          onClick={() => add({ label: '', required: true })}
        >
          {t('Ajouter une étape')}
        </Button>
      </div>
    )}
  </Form.List>
);
