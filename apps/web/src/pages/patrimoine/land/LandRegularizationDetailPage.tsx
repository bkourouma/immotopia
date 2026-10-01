import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Card, Input, Modal, Progress, Space, Statistic, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { httpStatusOf, landErrorMessage } from './land-errors';
import { LandValidationAlert } from './LandValidationAlert';
import { PageHeader, SkeletonDetail, StateBlock } from '../../../components/primitives';
import { t } from '../../../i18n/t';
import { LandStepDrawer } from './LandStepDrawer';
import { LandStepTimeline } from './LandStepTimeline';
import {
  addLandStep,
  changeLandRegularizationStatus,
  getLandRegularization,
  updateLandRegularization
} from './land-regularization-service';
import { formatLandDate, formatXof, regularizationStatusColor, regularizationStatusLabel } from './land-labels';
import type { LandRegularizationDetail, LandRegularizationStatus } from './land-types';

const { Text } = Typography;
const { TextArea } = Input;

type StatusAction = { target: LandRegularizationStatus; reasonRequired: boolean };

/**
 * Détail d'un dossier de régularisation foncière (spec 033, lot B2).
 *
 * Les frais de régularisation sont un chiffre SÉPARÉ : ils ne sont pas
 * ajoutés au coût de revient du bien ni au rendement.
 */
export const LandRegularizationDetailPage: React.FC = () => {
  const { tenantId, regularizationId } = useParams<{ tenantId: string; regularizationId: string }>();
  const { tenantMembership } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const agence = tenantId || tenantMembership?.tenantId;

  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [newStepLabel, setNewStepLabel] = useState('');

  const key = queryKey('land-regularization', agence, { id: regularizationId });
  const { data, isPending, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => getLandRegularization(agence as string, regularizationId as string),
    enabled: Boolean(agence && regularizationId),
    staleTime: STALE_TIME.list
  });

  const serverId = data?.id;
  const serverNotes = data?.notes ?? '';
  useEffect(() => {
    if (serverId) setNotes(serverNotes);
  }, [serverId, serverNotes]);

  if (!agence || !regularizationId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }
  if (isPending) return <SkeletonDetail />;
  if (httpStatusOf(error) === 404) {
    return (
      <StateBlock
        variant="empty"
        title={t('Dossier introuvable')}
        description={t("Ce dossier de régularisation n'existe pas ou n'est plus accessible.")}
        actions={[
          {
            label: t('Retour aux dossiers'),
            primary: true,
            onClick: () => navigate(`/tenant/${agence}/patrimoine/land`)
          }
        ]}
      />
    );
  }
  if (error || !data) {
    return (
      <StateBlock
        variant="error"
        title={t('Impossible de charger ce dossier de régularisation.')}
        actions={[{ label: t('Réessayer'), onClick: () => refetch() }]}
      />
    );
  }

  const dossier = data;
  const editable = dossier.status === 'EN_COURS';
  const custom = dossier.track === 'PERSONNALISEE';
  const openStep = dossier.steps.find(step => step.id === openStepId) ?? null;

  const apply = (detail: LandRegularizationDetail) => {
    queryClient.setQueryData(key, detail);
    // Préfixe sans filtres : les listes filtrées (?propertyId=, ?status=) sont rafraîchies aussi.
    void queryClient.invalidateQueries({ queryKey: ['land-regularizations', agence] });
  };

  const closeStatusModal = () => {
    setStatusAction(null);
    setReason('');
    setActionError(null);
  };

  const submitStatus = async () => {
    if (!statusAction) return;
    setBusy(true);
    setActionError(null);
    try {
      apply(await changeLandRegularizationStatus(agence, dossier.id, statusAction.target, reason.trim() || undefined));
      message.success(t('Statut du dossier mis à jour.'));
      closeStatusModal();
    } catch (err) {
      setActionError(landErrorMessage(err, t('Impossible de changer le statut du dossier.')));
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    setBusy(true);
    try {
      apply(await updateLandRegularization(agence, dossier.id, { notes: notes.trim() }));
      message.success(t('Notes enregistrées.'));
    } catch (err) {
      message.error(landErrorMessage(err, t("Impossible d'enregistrer les notes.")));
    } finally {
      setBusy(false);
    }
  };

  const addStep = async () => {
    if (!newStepLabel.trim()) return;
    setBusy(true);
    try {
      apply(await addLandStep(agence, dossier.id, { label: newStepLabel.trim(), required: true }));
      setNewStepLabel('');
    } catch (err) {
      message.error(landErrorMessage(err, t("Impossible d'ajouter l'étape.")));
    } finally {
      setBusy(false);
    }
  };

  const modalTitle =
    statusAction?.target === 'TERMINEE'
      ? t('Terminer le dossier')
      : statusAction?.target === 'ABANDONNEE'
        ? t('Abandonner le dossier')
        : t('Rouvrir le dossier');

  return (
    <>
      <PageHeader
        title={dossier.property.title}
        breadcrumbs={[
          { label: t('Patrimoine'), to: `/tenant/${agence}/patrimoine` },
          { label: t('Régularisation foncière'), to: `/tenant/${agence}/patrimoine/land` },
          { label: dossier.property.internalReference || dossier.property.title }
        ]}
        subtitle={
          <Space size="small" wrap>
            <Tag color={regularizationStatusColor(dossier.status)}>{regularizationStatusLabel(dossier.status)}</Tag>
            <span>{dossier.trackLabel}</span>
            <Link to={`/tenant/${agence}/properties/${dossier.propertyId}`}>{t('Voir la fiche du bien')}</Link>
          </Space>
        }
      />

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {dossier.validationStatus === 'A_VALIDER' && <LandValidationAlert note={dossier.validationNote} />}

        <Card>
          <Space size="large" wrap align="start">
            <div style={{ minWidth: 220 }}>
              <Text type="secondary">{t('Avancement')}</Text>
              <Progress percent={dossier.progress.percent} aria-label={t('Avancement du dossier')} />
              <Text type="secondary">
                {t('{{done}} étape(s) sur {{total}}', {
                  done: dossier.progress.completed,
                  total: dossier.progress.total
                })}
              </Text>
            </div>
            <div>
              <Statistic title={t('Frais de régularisation')} value={formatXof(dossier.feesXof)} />
              <Text type="secondary">{t("Ce montant n'est pas inclus dans le coût de revient du bien.")}</Text>
            </div>
            <Statistic title={t('Début')} value={formatLandDate(dossier.startDate)} />
            {dossier.endedAt && <Statistic title={t('Clôture')} value={formatLandDate(dossier.endedAt)} />}
          </Space>

          <Space wrap style={{ marginTop: 16, display: 'flex' }}>
            {editable ? (
              <>
                <Button type="primary" onClick={() => setStatusAction({ target: 'TERMINEE', reasonRequired: false })}>
                  {t('Terminer le dossier')}
                </Button>
                <Button danger onClick={() => setStatusAction({ target: 'ABANDONNEE', reasonRequired: false })}>
                  {t('Abandonner le dossier')}
                </Button>
              </>
            ) : (
              <Button onClick={() => setStatusAction({ target: 'EN_COURS', reasonRequired: true })}>
                {t('Rouvrir le dossier')}
              </Button>
            )}
          </Space>
        </Card>

        <Card title={t('Étapes')}>
          <LandStepTimeline steps={dossier.steps} onOpenStep={setOpenStepId} />
          {editable && custom && (
            <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
              <Input
                aria-label={t('Libellé de la nouvelle étape')}
                placeholder={t('Libellé de la nouvelle étape')}
                maxLength={200}
                value={newStepLabel}
                onChange={event => setNewStepLabel(event.target.value)}
                onPressEnter={() => !busy && addStep()}
              />
              <Button icon={<PlusOutlined />} disabled={busy || !newStepLabel.trim()} onClick={addStep}>
                {t('Ajouter une étape')}
              </Button>
            </Space.Compact>
          )}
        </Card>

        <Card title={t('Notes du dossier')}>
          <TextArea
            rows={3}
            maxLength={5000}
            value={notes}
            disabled={!editable}
            aria-label={t('Notes du dossier')}
            onChange={event => setNotes(event.target.value)}
          />
          {editable && (
            <Button style={{ marginTop: 8 }} disabled={busy} onClick={saveNotes}>
              {t('Enregistrer les notes')}
            </Button>
          )}
        </Card>
      </Space>

      <LandStepDrawer
        tenantId={agence}
        regularization={dossier}
        step={openStep}
        editable={editable}
        onClose={() => setOpenStepId(null)}
        onChanged={apply}
      />

      <Modal
        open={Boolean(statusAction)}
        title={modalTitle}
        onCancel={closeStatusModal}
        onOk={submitStatus}
        okText={t('Confirmer')}
        cancelText={t('Annuler')}
        confirmLoading={busy}
        okButtonProps={{ disabled: Boolean(statusAction?.reasonRequired) && reason.trim() === '' }}
        destroyOnHidden
      >
        {actionError && <Alert type="error" showIcon title={actionError} style={{ marginBottom: 12 }} />}
        <label htmlFor="motif-dossier">
          {statusAction?.reasonRequired ? t('Motif (obligatoire)') : t('Motif (facultatif)')}
        </label>
        <TextArea
          id="motif-dossier"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={event => setReason(event.target.value)}
        />
      </Modal>
    </>
  );
};
