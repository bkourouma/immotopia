import React, { useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Steps,
  Typography
} from 'antd';
import {
  createExternalAccessGrant,
  listExternalAccessPropertyDocuments,
  updateExternalAccessGrant
} from '../../../services/external-access-service';
import type {
  CreateExternalAccessResult,
  ExternalAccessGrantDetail,
  ExternalAccessScopeOptions,
  ExternalAccessSection,
  ExternalAccessType,
  UpdateExternalAccessInput
} from '../../../types/external-access';
import { apiErrorMessage } from '../../../components/patrimoine/patrimoine-labels';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';
import {
  accessSectionHelp,
  accessSectionLabel,
  accessTypeLabel,
  EXTERNAL_ACCESS_TYPES
} from './external-access-labels';

const { Text } = Typography;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_VALIDITY_DAYS = 90;
const STEP_COUNT = 4;
const PROBLEM_ID = 'external-access-step-problem';

interface WizardProps {
  tenantId: string;
  options: ExternalAccessScopeOptions;
  /** Présent : modification de cet accès ; absent : création. */
  grant?: ExternalAccessGrantDetail | null;
  onClose: () => void;
  onCreated: (result: CreateExternalAccessResult) => void;
  onUpdated: () => void;
}

interface FormState {
  type: ExternalAccessType;
  recipientName: string;
  recipientEmail: string;
  ownerClientId: string | undefined;
  propertyIds: string[];
  entityIds: string[];
  sections: ExternalAccessSection[];
  /** Vrai dès que l'agence a coché ou décoché une rubrique à la main. */
  sectionsTouched: boolean;
  documentIds: string[];
  permanent: boolean;
  expiresDate: Dayjs | null;
  linkTtlDays: number;
  sendEmail: boolean;
}

function initialState(options: ExternalAccessScopeOptions, grant?: ExternalAccessGrantDetail | null): FormState {
  // Un bien que les options ne proposent plus ne peut pas être renvoyé au serveur.
  const offered = new Set(options.properties.map(property => property.id));
  if (grant) {
    return {
      type: grant.type,
      recipientName: grant.recipientName,
      recipientEmail: grant.recipientEmail,
      ownerClientId: grant.ownerClientId ?? undefined,
      propertyIds: grant.properties.map(p => p.id).filter(id => offered.has(id)),
      entityIds: grant.entities.map(e => e.id),
      sections: grant.sections,
      sectionsTouched: true,
      documentIds: grant.documents.map(d => d.id),
      permanent: grant.permanent,
      expiresDate: grant.expiresAt ? dayjs(grant.expiresAt) : null,
      linkTtlDays: Math.min(7, options.maxLinkTtlDays),
      sendEmail: true
    };
  }
  return {
    type: 'NOTARY',
    recipientName: '',
    recipientEmail: '',
    ownerClientId: undefined,
    propertyIds: [],
    entityIds: [],
    sections: options.defaultsByType.NOTARY ?? [],
    sectionsTouched: false,
    documentIds: [],
    permanent: false,
    expiresDate: dayjs().add(DEFAULT_VALIDITY_DAYS, 'day'),
    linkTtlDays: Math.min(7, options.maxLinkTtlDays),
    sendEmail: true
  };
}

/** Message de blocage de l'étape, ou `null` si on peut avancer. */
function stepProblem(step: number, state: FormState): string | null {
  if (step === 0) {
    if (!state.recipientName.trim()) return t('Indiquez le nom du bénéficiaire.');
    if (!EMAIL_PATTERN.test(state.recipientEmail.trim())) return t('Indiquez une adresse e-mail valide.');
  }
  if (step === 1 && state.propertyIds.length === 0 && state.entityIds.length === 0) {
    return t('Choisissez au moins un bien ou une entité.');
  }
  if (step === 2 && state.sections.length === 0) return t('Choisissez au moins une rubrique.');
  if (step === 3 && !state.permanent && !state.expiresDate) return t('Choisissez une date de fin.');
  if (step === 3 && !state.permanent && state.expiresDate?.isBefore(dayjs(), 'day')) {
    return t('La date de fin est déjà passée : choisissez une date à venir.');
  }
  return null;
}

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  const without = list.filter(item => item !== value);
  return on ? [...without, value] : without;
}

// --- Étapes ------------------------------------------------------------------------

interface StepProps {
  state: FormState;
  patch: (changes: Partial<FormState>) => void;
  options: ExternalAccessScopeOptions;
}

const RecipientStep: React.FC<StepProps & { editing: boolean; emailChanged: boolean }> = ({
  state,
  patch,
  options,
  editing,
  emailChanged
}) => (
  <Form layout="vertical">
    <Form.Item label={t('Type de bénéficiaire')} required>
      <Select
        aria-label={t('Type de bénéficiaire')}
        value={state.type}
        disabled={editing}
        options={EXTERNAL_ACCESS_TYPES.map(value => ({ value, label: accessTypeLabel(value) }))}
        onChange={(type: ExternalAccessType) =>
          // Les rubriques proposées suivent le type, tant que l'agence ne les a pas modifiées.
          patch(state.sectionsTouched ? { type } : { type, sections: options.defaultsByType[type] ?? [] })
        }
      />
    </Form.Item>
    <Form.Item label={t('Nom du bénéficiaire')} required>
      <Input
        aria-label={t('Nom du bénéficiaire')}
        value={state.recipientName}
        maxLength={120}
        onChange={event => patch({ recipientName: event.target.value })}
      />
    </Form.Item>
    <Form.Item label={t('Adresse e-mail du bénéficiaire')} required>
      <Input
        type="email"
        aria-label={t('Adresse e-mail du bénéficiaire')}
        value={state.recipientEmail}
        maxLength={200}
        onChange={event => patch({ recipientEmail: event.target.value })}
      />
    </Form.Item>
    {emailChanged ? (
      <Alert
        type="warning"
        showIcon
        title={t('Changer l’adresse e-mail révoque les liens actifs : vous devrez renvoyer un lien.')}
      />
    ) : null}
  </Form>
);

const ScopeStep: React.FC<StepProps & { editing: boolean }> = ({ state, patch, options, editing }) => {
  const visibleProperties = useMemo(
    () =>
      state.ownerClientId
        ? options.properties.filter(property => property.ownerClientId === state.ownerClientId)
        : options.properties,
    [options.properties, state.ownerClientId]
  );
  const allVisibleChecked =
    visibleProperties.length > 0 && visibleProperties.every(property => state.propertyIds.includes(property.id));

  return (
    <Form layout="vertical">
      <Form.Item label={t('Propriétaire concerné (facultatif)')}>
        <Select
          allowClear
          aria-label={t('Propriétaire concerné (facultatif)')}
          placeholder={t('Tous les propriétaires')}
          value={state.ownerClientId}
          options={options.owners.map(owner => ({ value: owner.id, label: owner.name }))}
          disabled={editing}
          onChange={(ownerClientId?: string) => patch({ ownerClientId })}
        />
      </Form.Item>
      <Form.Item label={t('Biens partagés')}>
        {visibleProperties.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucun bien disponible.')} />
        ) : (
          <>
            <Checkbox
              checked={allVisibleChecked}
              onChange={event => {
                const visibleIds = visibleProperties.map(property => property.id);
                const others = state.propertyIds.filter(id => !visibleIds.includes(id));
                patch({ propertyIds: event.target.checked ? [...others, ...visibleIds] : others });
              }}
            >
              {t('Tout cocher')}
            </Checkbox>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginBlockStart: 8 }}>
              <Checkbox.Group
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                value={state.propertyIds}
                onChange={values => {
                  const visibleIds = new Set(visibleProperties.map(property => property.id));
                  const others = state.propertyIds.filter(id => !visibleIds.has(id));
                  patch({ propertyIds: [...others, ...(values as string[])] });
                }}
                options={visibleProperties.map(property => ({
                  value: property.id,
                  label: `${property.reference} — ${property.title}`
                }))}
              />
            </div>
          </>
        )}
      </Form.Item>
      <Form.Item
        label={t('Entités détentrices partagées')}
        extra={t('Les biens d’une entité sont ajoutés à chaque consultation.')}
      >
        {options.entities.length === 0 ? (
          <Text type="secondary">{t('Aucune entité détentrice.')}</Text>
        ) : (
          <Checkbox.Group
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            value={state.entityIds}
            onChange={values => patch({ entityIds: values as string[] })}
            options={options.entities.map(entity => ({ value: entity.id, label: entity.name }))}
          />
        )}
      </Form.Item>
    </Form>
  );
};

const DocumentsPicker: React.FC<{
  tenantId: string;
  state: FormState;
  patch: (changes: Partial<FormState>) => void;
  options: ExternalAccessScopeOptions;
  grant?: ExternalAccessGrantDetail | null;
  /** Document -> bien : alimenté ici, lu à l'envoi pour écarter les documents d'un bien décoché. */
  docOwners: React.MutableRefObject<Map<string, string>>;
}> = ({ tenantId, state, patch, options, grant, docOwners }) => {
  const results = useQueries({
    queries: state.propertyIds.map(propertyId => ({
      queryKey: queryKey('external-access-property-documents', tenantId, { propertyId }),
      queryFn: () => listExternalAccessPropertyDocuments(tenantId, propertyId),
      staleTime: STALE_TIME.list
    }))
  });

  const titleOf = (propertyId: string): string => {
    const known =
      options.properties.find(property => property.id === propertyId) ??
      grant?.properties.find(property => property.id === propertyId);
    return known ? `${known.reference} — ${known.title}` : propertyId;
  };

  if (state.propertyIds.length === 0) {
    return (
      <Text type="secondary">
        {t('Les documents se choisissent parmi ceux des biens sélectionnés à l’étape précédente.')}
      </Text>
    );
  }

  return (
    <Space orientation="vertical" size="small" style={{ width: '100%' }}>
      {state.propertyIds.map((propertyId, index) => {
        const result = results[index];
        const documents = result?.data ?? [];
        for (const document of documents) docOwners.current.set(document.id, propertyId);
        return (
          <div key={propertyId}>
            <Text strong>{titleOf(propertyId)}</Text>
            {result?.isPending ? (
              <div>
                <Text type="secondary">{t('Chargement…')}</Text>
              </div>
            ) : result?.error ? (
              <div>
                <Text type="danger">{t('Documents indisponibles pour ce bien.')}</Text>
              </div>
            ) : documents.length === 0 ? (
              <div>
                <Text type="secondary">{t('Aucun document pour ce bien.')}</Text>
              </div>
            ) : (
              <Checkbox.Group
                style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBlockStart: 4 }}
                value={state.documentIds}
                onChange={values => {
                  const ids = new Set(documents.map(document => document.id));
                  const others = state.documentIds.filter(id => !ids.has(id));
                  patch({ documentIds: [...others, ...(values as string[])] });
                }}
                options={documents.map(document => ({ value: document.id, label: document.fileName }))}
              />
            )}
          </div>
        );
      })}
    </Space>
  );
};

const SectionsStep: React.FC<
  StepProps & {
    tenantId: string;
    grant?: ExternalAccessGrantDetail | null;
    docOwners: React.MutableRefObject<Map<string, string>>;
  }
> = ({ state, patch, options, tenantId, grant, docOwners }) => (
  <Form layout="vertical">
    <Form.Item
      label={t('Rubriques visibles par le bénéficiaire')}
      extra={t('Les rubriques proposées suivent le type choisi ; vous pouvez les modifier.')}
    >
      <Space orientation="vertical" size={8}>
        {options.sections.map(section => (
          <Checkbox
            key={section}
            checked={state.sections.includes(section)}
            onChange={event =>
              patch({ sections: toggle(state.sections, section, event.target.checked), sectionsTouched: true })
            }
          >
            <Text strong>{accessSectionLabel(section)}</Text>
            <br />
            <Text type="secondary">{accessSectionHelp(section)}</Text>
          </Checkbox>
        ))}
      </Space>
    </Form.Item>
    {state.sections.includes('DOCUMENTS') ? (
      <Form.Item
        label={t('Documents partageables')}
        extra={t(
          'Seuls les documents des biens cochés à l’étape précédente sont proposés, pas ceux des biens obtenus par une entité détentrice.'
        )}
      >
        <DocumentsPicker
          tenantId={tenantId}
          state={state}
          patch={patch}
          options={options}
          grant={grant}
          docOwners={docOwners}
        />
      </Form.Item>
    ) : null}
  </Form>
);

const DurationStep: React.FC<StepProps & { editing: boolean }> = ({ state, patch, options, editing }) => (
  <Form layout="vertical">
    <Form.Item label={t('Durée de l’accès')}>
      <Radio.Group
        value={state.permanent ? 'permanent' : 'limited'}
        onChange={event => patch({ permanent: event.target.value === 'permanent' })}
      >
        <Space orientation="vertical">
          <Radio value="limited">{t('Jusqu’à une date')}</Radio>
          <Radio value="permanent">{t('Permanent (jusqu’à révocation)')}</Radio>
        </Space>
      </Radio.Group>
    </Form.Item>
    {!state.permanent ? (
      <Form.Item label={t('Date de fin de l’accès')}>
        <DatePicker
          aria-label={t('Date de fin de l’accès')}
          value={state.expiresDate}
          allowClear={false}
          disabledDate={date => date.isBefore(dayjs(), 'day')}
          onChange={expiresDate => patch({ expiresDate })}
        />
      </Form.Item>
    ) : null}
    {!editing ? (
      <>
        <Form.Item
          label={t('Durée de validité du lien (jours)')}
          extra={t('Un accès permanent n’est pas un lien éternel : vous pourrez renvoyer un lien à tout moment.')}
        >
          <InputNumber
            min={1}
            max={Math.max(1, options.maxLinkTtlDays)}
            value={state.linkTtlDays}
            aria-label={t('Durée de validité du lien (jours)')}
            onChange={value => patch({ linkTtlDays: typeof value === 'number' ? value : state.linkTtlDays })}
          />
        </Form.Item>
        <Form.Item>
          <Checkbox checked={state.sendEmail} onChange={event => patch({ sendEmail: event.target.checked })}>
            {t('Envoyer le lien par e-mail au bénéficiaire')}
          </Checkbox>
        </Form.Item>
      </>
    ) : null}
  </Form>
);

/** Corps commun à la création et à la modification. Les documents d'un bien décoché sont écartés. */
function buildBody(state: FormState, expiresAt: string | null, docOwners: Map<string, string>) {
  const selected = new Set(state.propertyIds);
  const documentIds = state.sections.includes('DOCUMENTS')
    ? state.documentIds.filter(id => {
        const owner = docOwners.get(id);
        return owner !== undefined && selected.has(owner);
      })
    : [];
  return {
    recipientName: state.recipientName.trim(),
    recipientEmail: state.recipientEmail.trim(),
    propertyIds: state.propertyIds,
    entityIds: state.entityIds,
    sections: state.sections,
    documentIds,
    expiresAt
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every(value => b.includes(value));
}

/** En modification, ne renvoie que ce qui a réellement changé (jamais un bien que les options ne proposent pas). */
function changedFields(
  body: ReturnType<typeof buildBody>,
  grant: ExternalAccessGrantDetail,
  state: FormState,
  options: ExternalAccessScopeOptions
): UpdateExternalAccessInput {
  const offered = new Set(options.properties.map(property => property.id));
  const initialProperties = grant.properties.map(p => p.id).filter(id => offered.has(id));
  const properties = body.propertyIds.filter(id => offered.has(id));
  const changes: UpdateExternalAccessInput = {};
  if (body.recipientName !== grant.recipientName) changes.recipientName = body.recipientName;
  if (body.recipientEmail !== grant.recipientEmail) changes.recipientEmail = body.recipientEmail;
  if (!sameSet(body.sections, grant.sections)) changes.sections = body.sections;
  const sameExpiry =
    state.permanent === grant.permanent &&
    (state.permanent || (grant.expiresAt && state.expiresDate?.isSame(dayjs(grant.expiresAt), 'day')));
  if (!sameExpiry) changes.expiresAt = body.expiresAt;
  if (!sameSet(properties, initialProperties)) changes.propertyIds = properties;
  if (
    !sameSet(
      body.entityIds,
      grant.entities.map(e => e.id)
    )
  ) {
    changes.entityIds = body.entityIds;
  }
  if (
    !sameSet(
      body.documentIds,
      grant.documents.map(d => d.id)
    )
  ) {
    changes.documentIds = body.documentIds;
  }
  return changes;
}

// --- Assistant ------------------------------------------------------------------------

/**
 * Assistant en quatre étapes : 1 type et bénéficiaire, 2 périmètre, 3 rubriques
 * et documents, 4 durée. Sert aussi à modifier un accès existant (le type reste
 * figé). Monté seulement quand il est ouvert : son état naît à chaque ouverture.
 */
export const ExternalAccessWizard: React.FC<WizardProps> = ({
  tenantId,
  options,
  grant,
  onClose,
  onCreated,
  onUpdated
}) => {
  const { message } = App.useApp();
  const editing = Boolean(grant);
  const [state, setState] = useState<FormState>(() => initialState(options, grant));
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const docOwners = useRef<Map<string, string>>(new Map(grant?.documents.map(d => [d.id, d.propertyId]) ?? []));

  const patch = (changes: Partial<FormState>) => setState(previous => ({ ...previous, ...changes }));
  const problem = stepProblem(step, state);
  const emailChanged =
    editing && grant !== null && grant !== undefined && state.recipientEmail.trim() !== grant.recipientEmail;
  const expiresAt = state.permanent || !state.expiresDate ? null : state.expiresDate.endOf('day').toISOString();

  const submit = async () => {
    setSubmitting(true);
    try {
      const shared = buildBody(state, expiresAt, docOwners.current);
      if (grant) {
        await updateExternalAccessGrant(tenantId, grant.id, changedFields(shared, grant, state, options));
        message.success(t('Accès modifié.'));
        onUpdated();
      } else {
        const result = await createExternalAccessGrant(tenantId, {
          ...shared,
          type: state.type,
          ownerClientId: state.ownerClientId ?? null,
          linkTtlDays: state.linkTtlDays,
          sendEmail: state.sendEmail
        });
        onCreated(result);
      }
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible d’enregistrer cet accès.')));
    } finally {
      setSubmitting(false);
    }
  };

  const isLast = step === STEP_COUNT - 1;
  const stepTitles = [t('Bénéficiaire'), t('Périmètre'), t('Rubriques'), t('Durée')];

  return (
    <Modal
      open
      width={680}
      title={editing ? t('Modifier l’accès partagé') : t('Nouvel accès partagé')}
      onCancel={onClose}
      mask={{ closable: false }}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          {step > 0 ? <Button onClick={() => setStep(step - 1)}>{t('Retour')}</Button> : null}
          {isLast ? (
            <Button
              type="primary"
              loading={submitting}
              disabled={problem !== null}
              aria-describedby={problem ? PROBLEM_ID : undefined}
              onClick={submit}
            >
              {editing ? t('Enregistrer') : t('Créer l’accès')}
            </Button>
          ) : (
            <Button
              type="primary"
              disabled={problem !== null}
              aria-describedby={problem ? PROBLEM_ID : undefined}
              onClick={() => setStep(step + 1)}
            >
              {t('Suivant')}
            </Button>
          )}
        </Space>
      }
    >
      <Steps size="small" current={step} items={stepTitles.map(title => ({ title }))} style={{ marginBlockEnd: 24 }} />
      {step === 0 ? (
        <RecipientStep state={state} patch={patch} options={options} editing={editing} emailChanged={emailChanged} />
      ) : null}
      {step === 1 ? <ScopeStep state={state} patch={patch} options={options} editing={editing} /> : null}
      {step === 2 ? (
        <SectionsStep
          state={state}
          patch={patch}
          options={options}
          tenantId={tenantId}
          grant={grant}
          docOwners={docOwners}
        />
      ) : null}
      {step === 3 ? <DurationStep state={state} patch={patch} options={options} editing={editing} /> : null}
      {problem ? (
        <Text id={PROBLEM_ID} type="secondary" style={{ display: 'block', marginBlockStart: 8 }}>
          {problem}
        </Text>
      ) : null}
    </Modal>
  );
};
