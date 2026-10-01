import React, { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  downloadPropertyDocumentFile,
  listPropertyDocuments,
  uploadDocument
} from '../../../services/property-service';
import { documentTypeLabel } from '../../../components/patrimoine/patrimoine-labels';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { saveBlob } from '../../../utils/save-blob';
import { t } from '../../../i18n/t';
import { landErrorMessage } from './land-errors';
import { changeLandStepStatus, deleteLandStep, updateLandStep } from './land-regularization-service';
import { formatLandDate, stepStatusColor, stepStatusLabel, stepTransitionLabel, toDateInput } from './land-labels';
import type { LandRegularizationDetail, LandStep, LandStepStatus } from './land-types';

const { Text } = Typography;
const { TextArea } = Input;

export interface LandStepDrawerProps {
  tenantId: string;
  regularization: LandRegularizationDetail;
  step: LandStep | null;
  /** Faux quand le dossier n'est plus en cours : l'API refuserait toute écriture. */
  editable: boolean;
  onClose: () => void;
  onChanged: (detail: LandRegularizationDetail) => void;
}

/**
 * `<LandStepDrawer>` — panneau d'une étape : changement de statut, échéance,
 * coût, notes, pièce justificative.
 *
 * Les boutons de statut sont construits UNIQUEMENT depuis `allowedTransitions`
 * (source unique côté serveur). Seule la réouverture d'une étape terminée
 * réclame un motif, comme le contrat.
 */
export const LandStepDrawer: React.FC<LandStepDrawerProps> = ({
  tenantId,
  regularization,
  step,
  editable,
  onClose,
  onChanged
}) => {
  const { message } = App.useApp();
  const [reason, setReason] = useState('');
  const [label, setLabel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [cost, setCost] = useState<number | null>(0);
  const [notes, setNotes] = useState('');
  const [documentChoice, setDocumentChoice] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const custom = regularization.track === 'PERSONNALISEE';

  useEffect(() => {
    if (!step) return;
    setReason('');
    setLabel(step.label);
    setDueDate(toDateInput(step.dueDate));
    setCost(step.costXof);
    setNotes(step.notes ?? '');
    setDocumentChoice(undefined);
    setErrorMessage(null);
  }, [step]);

  const documentsQuery = useQuery({
    queryKey: queryKey('land-property-documents', tenantId, { propertyId: regularization.propertyId }),
    queryFn: () => listPropertyDocuments(tenantId, regularization.propertyId),
    enabled: Boolean(step) && editable,
    staleTime: STALE_TIME.list
  });

  if (!step) return null;

  const reopening = step.status === 'TERMINEE';

  /** Exécute un appel d'écriture : verrouille l'écran, affiche l'erreur API telle quelle. */
  const run = async (action: () => Promise<LandRegularizationDetail>, success?: string) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const detail = await action();
      onChanged(detail);
      if (success) message.success(success);
      return true;
    } catch (error) {
      setErrorMessage(landErrorMessage(error, t("Impossible d'enregistrer cette modification.")));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (target: LandStepStatus) =>
    run(async () => {
      const detail = await changeLandStepStatus(
        tenantId,
        regularization.id,
        step.id,
        target,
        reopening ? reason.trim() : undefined
      );
      setReason('');
      return detail;
    }, t("Statut de l'étape mis à jour."));

  const save = () =>
    run(
      () =>
        updateLandStep(tenantId, regularization.id, step.id, {
          ...(custom ? { label: label.trim() } : {}),
          dueDate: dueDate || null,
          costXof: cost ?? 0,
          notes: notes.trim() || null
        }),
      t('Étape enregistrée.')
    );

  const attach = (documentId: string | null) =>
    run(() => updateLandStep(tenantId, regularization.id, step.id, { documentId }), t('Pièce mise à jour.'));

  const upload = async (file: File) => {
    setBusy(true);
    setErrorMessage(null);
    let uploaded = false;
    try {
      const document = await uploadDocument(tenantId, regularization.propertyId, file, step.suggestedDocumentType);
      uploaded = true;
      const detail = await updateLandStep(tenantId, regularization.id, step.id, { documentId: document.id });
      onChanged(detail);
      message.success(t('Pièce téléversée et rattachée.'));
    } catch (error) {
      setErrorMessage(
        uploaded
          ? t("La pièce a été téléversée mais n'a pas pu être rattachée à l'étape.") + ' ' + landErrorMessage(error, '')
          : landErrorMessage(error, t('Impossible de téléverser la pièce.'))
      );
    } finally {
      // La liste des documents du bien change dès que le fichier est téléversé,
      // même si le rattachement échoue ensuite.
      if (uploaded) await documentsQuery.refetch();
      setBusy(false);
    }
  };

  const download = async () => {
    if (!step.document) return;
    try {
      const { blob, filename } = await downloadPropertyDocumentFile(
        tenantId,
        regularization.propertyId,
        step.document.id,
        step.document.fileName
      );
      saveBlob(blob, filename);
    } catch (error) {
      message.error(landErrorMessage(error, t('Impossible de télécharger la pièce.')));
    }
  };

  const remove = async () => {
    const ok = await run(() => deleteLandStep(tenantId, regularization.id, step.id), t('Étape supprimée.'));
    if (ok) onClose();
  };

  const documentOptions = (documentsQuery.data ?? []).map(document => ({
    value: document.id,
    label: `${document.fileName} — ${documentTypeLabel(document.documentType)}`
  }));

  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title={step.label}
      extra={<Tag color={stepStatusColor(step.status)}>{stepStatusLabel(step.status)}</Tag>}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {errorMessage && <Alert type="error" showIcon title={errorMessage} />}

        <Descriptions size="small" column={1}>
          <Descriptions.Item label={t('Début')}>{formatLandDate(step.startedAt)}</Descriptions.Item>
          <Descriptions.Item label={t('Fin')}>{formatLandDate(step.completedAt)}</Descriptions.Item>
          <Descriptions.Item label={t('Échéance')}>
            {formatLandDate(step.dueDate)}
            {step.isOverdue && (
              <Tag color="error" className="ms-2">
                {t('En retard')}
              </Tag>
            )}
          </Descriptions.Item>
        </Descriptions>

        {editable && step.allowedTransitions.length > 0 && (
          <section aria-label={t("Changer le statut de l'étape")}>
            {reopening && (
              <div style={{ marginBottom: 8 }}>
                <label htmlFor="motif-reouverture-etape">{t('Motif de la réouverture (obligatoire)')}</label>
                <TextArea
                  id="motif-reouverture-etape"
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                />
              </div>
            )}
            <Space wrap>
              {step.allowedTransitions.map(target => (
                <Button
                  key={target}
                  disabled={busy || (reopening && reason.trim() === '')}
                  type={target === 'TERMINEE' ? 'primary' : 'default'}
                  onClick={() => changeStatus(target)}
                >
                  {stepTransitionLabel(step.status, target)}
                </Button>
              ))}
            </Space>
          </section>
        )}

        <Divider style={{ margin: 0 }} />

        {custom && (
          <div>
            <label htmlFor="libelle-etape">{t("Libellé de l'étape")}</label>
            <Input
              id="libelle-etape"
              maxLength={200}
              value={label}
              disabled={!editable}
              onChange={event => setLabel(event.target.value)}
            />
          </div>
        )}
        <div>
          <label htmlFor="echeance-etape">{t('Échéance')}</label>
          <Input
            id="echeance-etape"
            type="date"
            value={dueDate}
            disabled={!editable}
            onChange={event => setDueDate(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cout-etape">{t('Coût engagé (XOF)')}</label>
          <InputNumber
            id="cout-etape"
            min={0}
            max={999999999999}
            precision={0}
            style={{ width: '100%' }}
            value={cost}
            disabled={!editable}
            onChange={value => setCost(typeof value === 'number' ? value : null)}
          />
        </div>
        <div>
          <label htmlFor="notes-etape">{t('Notes')}</label>
          <TextArea
            id="notes-etape"
            rows={3}
            maxLength={5000}
            value={notes}
            disabled={!editable}
            onChange={event => setNotes(event.target.value)}
          />
        </div>
        {editable && (
          <Button type="primary" loading={busy} disabled={custom && !label.trim()} onClick={save}>
            {t("Enregistrer l'étape")}
          </Button>
        )}

        <Divider style={{ margin: 0 }} />

        <section aria-label={t('Pièce justificative')}>
          <Text strong>{t('Pièce justificative')}</Text>
          <div style={{ marginTop: 8 }}>
            {step.document ? (
              <Space wrap>
                <Text>{step.document.fileName}</Text>
                <Tag>{documentTypeLabel(step.document.documentType)}</Tag>
                <Button icon={<DownloadOutlined />} onClick={download}>
                  {t('Télécharger la pièce')}
                </Button>
                {editable && (
                  <Button disabled={busy} onClick={() => attach(null)}>
                    {t('Détacher la pièce')}
                  </Button>
                )}
              </Space>
            ) : (
              <Text type="secondary">{t("Aucune pièce n'est rattachée à cette étape.")}</Text>
            )}
          </div>

          {editable && (
            <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
              <label htmlFor="piece-existante">{t('Rattacher un document existant du bien')}</label>
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  id="piece-existante"
                  style={{ width: '100%' }}
                  showSearch
                  optionFilterProp="label"
                  loading={documentsQuery.isPending}
                  options={documentOptions}
                  value={documentChoice}
                  onChange={setDocumentChoice}
                  placeholder={t('Choisir un document')}
                  notFoundContent={t('Aucun document pour ce bien.')}
                />
                <Button disabled={busy || !documentChoice} onClick={() => attach(documentChoice as string)}>
                  {t('Rattacher')}
                </Button>
              </Space.Compact>

              <label htmlFor="piece-nouvelle">
                {t('Ou téléverser un nouveau fichier ({{type}})', {
                  type: documentTypeLabel(step.suggestedDocumentType)
                })}
              </label>
              <input
                id="piece-nouvelle"
                type="file"
                disabled={busy}
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </Space>
          )}
        </section>

        {editable && custom && step.status === 'A_FAIRE' && (
          <>
            <Divider style={{ margin: 0 }} />
            <Popconfirm
              title={t('Supprimer cette étape ?')}
              okText={t('Supprimer')}
              cancelText={t('Annuler')}
              onConfirm={remove}
            >
              <Button danger disabled={busy}>
                {t("Supprimer l'étape")}
              </Button>
            </Popconfirm>
          </>
        )}
      </Space>
    </Drawer>
  );
};
