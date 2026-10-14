import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, DatePicker, Divider, Input, InputNumber, Space, Switch, Typography } from 'antd';
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  deleteInspection,
  deleteInspectionPhoto,
  finalizeInspection,
  InspectionDeduction,
  InspectionPhoto,
  InspectionRoom,
  LeaseInspection,
  RemovedInspectionItem,
  UnevaluatedInspectionItem,
  updateInspection,
  uploadInspectionPhoto
} from '../../../services/lease-inspections-service';
import { RoomsAccordion, EntryItemLookup } from './RoomsAccordion';
import { DeductionsSection } from './DeductionsSection';
import { countItems, countUnevaluated, unevaluatedReason } from './inspection-constants';
import { countMissingWithoutDeduction, proposeDeductions } from './deduction-proposals';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from './local-draft-storage';
import { t } from '../../../i18n/t';

const { TextArea } = Input;
const { Text, Title } = Typography;

interface InspectionFormProps {
  tenantId: string;
  leaseId: string;
  inspection: LeaseInspection;
  /** État des lieux d'entrée déjà chargé — sert au rappel affiché en sortie. */
  entryInspection: LeaseInspection | null;
  onSaved: (updated: LeaseInspection) => void;
  onFinalized: (updated: LeaseInspection) => void;
  onDeleted: () => void;
  onCancel: () => void;
}

interface MetersState {
  electricity: string;
  water: string;
  gas: string;
}

/** Nombre d'éléments listés avant « et {{nombre}} autres » (CA-M3.6). */
const MAX_LISTED_ITEMS = 10;

/** Liste d'éléments mise en avant par un refus (non évalués, ou retirés de l'entrée). */
interface FlaggedItems {
  message: string;
  items: Array<{ itemId: string; text: string }>;
}

function unevaluatedFromRooms(rooms: InspectionRoom[]): UnevaluatedInspectionItem[] {
  const result: UnevaluatedInspectionItem[] = [];
  for (const room of rooms) {
    for (const item of room.items) {
      const missing = unevaluatedReason(item);
      if (missing) {
        result.push({ roomId: room.id, roomName: room.name, itemId: item.id, label: item.label, missing });
      }
    }
  }
  return result;
}

const FlaggedItemsAlert: React.FC<{ flagged: FlaggedItems; onClose: () => void }> = ({ flagged, onClose }) => {
  const listed = flagged.items.slice(0, MAX_LISTED_ITEMS);
  const others = flagged.items.length - listed.length;
  return (
    <Alert
      type="warning"
      showIcon
      closable
      onClose={onClose}
      message={flagged.message}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {listed.map(entry => (
            <li key={entry.itemId}>{entry.text}</li>
          ))}
          {others > 0 && <li>{t('et {{nombre}} autres', { nombre: others })}</li>}
        </ul>
      }
    />
  );
};

/** Rappel, sous un champ de la sortie, de la valeur relevée à l'entrée (CA-M4.11). */
const EntryValueHint: React.FC<{ value: string | number | null | undefined }> = ({ value }) => (
  <Text type="secondary" style={{ display: 'block', fontSize: 'var(--font-size-sm)', marginTop: 2 }}>
    {t('Entrée : {{valeur}}', { valeur: value === null || value === undefined || value === '' ? '—' : value })}
  </Text>
);

/**
 * Saisie d'un état des lieux en brouillon.
 *
 * Toute la saisie vit en état local ; rien n'est envoyé au serveur avant un
 * clic sur « Enregistrer ». Les photos font exception : elles s'envoient
 * immédiatement à l'ajout (le serveur les range tout de suite dans le
 * document), donc ne font pas partie de ce brouillon.
 */
export const InspectionForm: React.FC<InspectionFormProps> = ({
  tenantId,
  leaseId,
  inspection,
  entryInspection,
  onSaved,
  onFinalized,
  onDeleted,
  onCancel
}) => {
  const { message, modal } = App.useApp();
  const isExit = inspection.type === 'EXIT';

  const [inspectionDate, setInspectionDate] = useState(dayjs(inspection.inspectionDate));
  const [rooms, setRooms] = useState<InspectionRoom[]>(inspection.rooms);
  const [meters, setMeters] = useState<MetersState>({
    electricity: inspection.meters?.electricity || '',
    water: inspection.meters?.water || '',
    gas: inspection.meters?.gas || ''
  });
  const [keysCount, setKeysCount] = useState<number | null>(inspection.keysCount);
  const [generalComment, setGeneralComment] = useState(inspection.generalComment || '');
  const [tenantPresent, setTenantPresent] = useState(inspection.tenantPresent);
  const [tenantSignatoryName, setTenantSignatoryName] = useState(inspection.tenantSignatoryName || '');
  const [agentSignatoryName, setAgentSignatoryName] = useState(inspection.agentSignatoryName || '');
  const [deductions, setDeductions] = useState<InspectionDeduction[]>(inspection.deductions);
  const [photos, setPhotos] = useState<InspectionPhoto[]>(inspection.photos);

  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<FlaggedItems | null>(null);
  const [highlightUnevaluated, setHighlightUnevaluated] = useState<Set<string> | undefined>(undefined);

  // Brouillon local : tant que la copie plus récente trouvée dans
  // `localStorage` n'a pas été traitée (restaurée ou ignorée), on ne
  // l'écrase pas avec les valeurs venues du serveur.
  const [pendingLocalDraft] = useState(() => loadLocalDraft(inspection.id));
  const [draftResolved, setDraftResolved] = useState(() => !pendingLocalDraft);

  const entryItemsById = useMemo(() => {
    if (!isExit || !entryInspection) return undefined;
    const map = new Map<string, EntryItemLookup>();
    for (const room of entryInspection.rooms) {
      for (const item of room.items) {
        map.set(item.id, { item, roomName: room.name });
      }
    }
    return map;
  }, [isExit, entryInspection]);

  // Sauvegarde locale à chaque modification, protégée par try/catch dans
  // `saveLocalDraft` : un réseau coupé pendant la visite ne doit pas perdre la
  // saisie en cours.
  useEffect(() => {
    if (!draftResolved) return;
    saveLocalDraft(inspection.id, {
      inspectionDate: inspectionDate.format('YYYY-MM-DD'),
      rooms,
      meters,
      keysCount,
      generalComment,
      tenantPresent,
      tenantSignatoryName,
      agentSignatoryName,
      deductions
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftResolved,
    inspection.id,
    inspectionDate,
    rooms,
    meters,
    keysCount,
    generalComment,
    tenantPresent,
    tenantSignatoryName,
    agentSignatoryName,
    deductions
  ]);

  const handleRestoreLocalDraft = () => {
    if (!pendingLocalDraft) return;
    setInspectionDate(dayjs(pendingLocalDraft.inspectionDate));
    setRooms(pendingLocalDraft.rooms);
    setMeters({
      electricity: pendingLocalDraft.meters.electricity || '',
      water: pendingLocalDraft.meters.water || '',
      gas: pendingLocalDraft.meters.gas || ''
    });
    setKeysCount(pendingLocalDraft.keysCount);
    setGeneralComment(pendingLocalDraft.generalComment);
    setTenantPresent(pendingLocalDraft.tenantPresent);
    setTenantSignatoryName(pendingLocalDraft.tenantSignatoryName);
    setAgentSignatoryName(pendingLocalDraft.agentSignatoryName);
    setDeductions(pendingLocalDraft.deductions);
    setDraftResolved(true);
  };

  const handleDismissLocalDraft = () => {
    clearLocalDraft(inspection.id);
    setDraftResolved(true);
  };

  const buildPayload = () => ({
    inspectionDate: inspectionDate.format('YYYY-MM-DD'),
    rooms,
    meters,
    keysCount,
    generalComment: generalComment || null,
    tenantPresent,
    tenantSignatoryName: tenantSignatoryName || null,
    agentSignatoryName: agentSignatoryName || null,
    deductions
  });

  /** Met en avant les éléments à évaluer : liste, pièces ouvertes, bordure orange (CA-M3.6). */
  const showUnevaluated = (items: UnevaluatedInspectionItem[]) => {
    setFlagged({
      message: t('{{nombre}} éléments ne sont pas encore évalués.', { nombre: items.length }),
      items: items.map(item => ({ itemId: item.itemId, text: `${item.roomName} — ${item.label}` }))
    });
    setHighlightUnevaluated(new Set(items.map(item => item.itemId)));
  };

  const handleSave = async (): Promise<LeaseInspection | null> => {
    setFormError(null);
    setSaving(true);
    try {
      const response = await updateInspection(tenantId, leaseId, inspection.id, buildPayload());
      clearLocalDraft(inspection.id);
      message.success(t('État des lieux enregistré'));
      onSaved(response.data);
      return response.data;
    } catch (error: any) {
      // Le §400/409 s'affiche tel quel, sans reformulation.
      const serverMessage = error?.response?.data?.message;
      setFormError(serverMessage || t('Erreur lors de l’enregistrement'));
      const removedItems: RemovedInspectionItem[] | undefined = error?.response?.data?.data?.removedItems;
      if (Array.isArray(removedItems) && removedItems.length > 0) {
        setFlagged({
          message: t("Indiquez « Manquant » plutôt que de retirer un élément de l'entrée."),
          items: removedItems.map(item => ({ itemId: item.itemId, text: item.label }))
        });
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    const saved = await handleSave();
    if (!saved) return;

    // Pré-contrôle M3 : la route de finalisation n'est pas appelée tant qu'un
    // élément reste à évaluer ; le brouillon, lui, vient d'être enregistré.
    const unevaluated = unevaluatedFromRooms(rooms);
    if (countItems(rooms) > 0 && unevaluated.length > 0) {
      showUnevaluated(unevaluated);
      return;
    }
    setFlagged(null);
    setHighlightUnevaluated(undefined);

    const withoutDeduction = isExit ? countMissingWithoutDeduction(rooms, entryItemsById, deductions) : 0;

    modal.confirm({
      title: t('Finaliser l’état des lieux ?'),
      content: (
        <>
          <p style={{ margin: 0 }}>{t('Une fois finalisé, l’état des lieux ne peut plus être modifié.')}</p>
          {withoutDeduction > 0 && (
            <p style={{ marginBlockStart: 8, marginBlockEnd: 0 }}>
              {t("{{nombre}} éléments manquants n'ont pas de retenue. Vous pouvez finaliser quand même.", {
                nombre: withoutDeduction
              })}
            </p>
          )}
        </>
      ),
      okText: t('Finaliser'),
      cancelText: t('Annuler'),
      onOk: async () => {
        setFinalizing(true);
        setFormError(null);
        try {
          const response = await finalizeInspection(tenantId, leaseId, inspection.id);
          clearLocalDraft(inspection.id);
          message.success(t('État des lieux finalisé'));
          onFinalized(response.data);
        } catch (error: any) {
          const unevaluatedItems: UnevaluatedInspectionItem[] | undefined =
            error?.response?.data?.data?.unevaluatedItems;
          if (Array.isArray(unevaluatedItems) && unevaluatedItems.length > 0) {
            showUnevaluated(unevaluatedItems);
            return;
          }
          const serverMessage = error?.response?.data?.message;
          setFormError(serverMessage || t('Erreur lors de la finalisation'));
        } finally {
          setFinalizing(false);
        }
      }
    });
  };

  const handleDelete = () => {
    modal.confirm({
      title: t('Supprimer ce brouillon ?'),
      content: t('Cette action est irréversible.'),
      okText: t('Supprimer'),
      okButtonProps: { danger: true },
      cancelText: t('Annuler'),
      onOk: async () => {
        setDeleting(true);
        try {
          await deleteInspection(tenantId, leaseId, inspection.id);
          clearLocalDraft(inspection.id);
          message.success(t('Brouillon supprimé'));
          onDeleted();
        } catch (error: any) {
          message.error(error?.response?.data?.message || t('Erreur lors de la suppression'));
        } finally {
          setDeleting(false);
        }
      }
    });
  };

  const handleUploadPhoto = async (file: File, roomId: string, itemId: string) => {
    const response = await uploadInspectionPhoto(tenantId, leaseId, inspection.id, file, { roomId, itemId });
    setPhotos(prev => [...prev, response.data]);
  };

  const handleDeletePhoto = async (photoId: string) => {
    await deleteInspectionPhoto(tenantId, leaseId, inspection.id, photoId);
    setPhotos(prev => prev.filter(photo => photo.id !== photoId));
  };

  const handleProposeFromDamages = () => {
    const proposals = proposeDeductions({
      rooms,
      entryItemsById,
      entryKeysCount: entryInspection?.keysCount,
      exitKeysCount: keysCount,
      existing: deductions
    });
    if (proposals.length === 0) {
      message.info(t('Aucune dégradation ni aucun manquant détecté pour le moment.'));
      return;
    }
    setDeductions(prev => [...prev, ...proposals]);
  };

  const totalItems = countItems(rooms);
  const evaluatedItems = totalItems - countUnevaluated(rooms);
  const entryMeters = isExit ? entryInspection?.meters : undefined;
  const showEntryValues = isExit && Boolean(entryInspection);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {pendingLocalDraft && !draftResolved && (
        <Alert
          type="warning"
          showIcon
          message={t('Une saisie locale non enregistrée a été trouvée pour cet état des lieux.')}
          description={
            <Space>
              <Button size="small" type="primary" onClick={handleRestoreLocalDraft}>
                {t('Restaurer')}
              </Button>
              <Button size="small" onClick={handleDismissLocalDraft}>
                {t('Ignorer')}
              </Button>
            </Space>
          }
        />
      )}

      {formError && <Alert type="error" showIcon message={formError} closable onClose={() => setFormError(null)} />}

      {flagged && <FlaggedItemsAlert flagged={flagged} onClose={() => setFlagged(null)} />}

      <Card>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Title level={5}>{isExit ? t('État des lieux de sortie') : t("État des lieux d'entrée")}</Title>
          <Text>{t('Date de l’état des lieux')}</Text>
          <DatePicker
            value={inspectionDate}
            onChange={value => value && setInspectionDate(value)}
            format="DD/MM/YYYY"
            style={{ maxWidth: 220 }}
          />
        </Space>
      </Card>

      <Card
        title={t('Pièces')}
        extra={
          <Text type={evaluatedItems < totalItems ? 'warning' : 'secondary'}>
            {t('{{evalues}} éléments évalués sur {{total}}', { evalues: evaluatedItems, total: totalItems })}
          </Text>
        }
      >
        <RoomsAccordion
          tenantId={tenantId}
          leaseId={leaseId}
          inspectionId={inspection.id}
          rooms={rooms}
          readOnly={false}
          showEntryReminder={isExit}
          isExit={isExit}
          highlightUnevaluated={highlightUnevaluated}
          entryItemsById={entryItemsById}
          photos={photos}
          onRoomsChange={setRooms}
          onUploadPhoto={handleUploadPhoto}
          onDeletePhoto={handleDeletePhoto}
        />
      </Card>

      <Card title={t('Compteurs et clés')}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text>{t('Électricité')}</Text>
            <Input
              value={meters.electricity}
              onChange={e => setMeters(prev => ({ ...prev, electricity: e.target.value }))}
              placeholder={t('Relevé du compteur électrique')}
            />
            {showEntryValues && <EntryValueHint value={entryMeters?.electricity} />}
          </div>
          <div>
            <Text>{t('Eau')}</Text>
            <Input
              value={meters.water}
              onChange={e => setMeters(prev => ({ ...prev, water: e.target.value }))}
              placeholder={t('Relevé du compteur d’eau')}
            />
            {showEntryValues && <EntryValueHint value={entryMeters?.water} />}
          </div>
          <div>
            <Text>{t('Gaz')}</Text>
            <Input
              value={meters.gas}
              onChange={e => setMeters(prev => ({ ...prev, gas: e.target.value }))}
              placeholder={t('Relevé du compteur de gaz')}
            />
            {showEntryValues && <EntryValueHint value={entryMeters?.gas} />}
          </div>
          <div>
            <Text>{t('Nombre de clés')}</Text>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              value={keysCount ?? undefined}
              onChange={value => setKeysCount(value == null ? null : Number(value))}
            />
            {showEntryValues && <EntryValueHint value={entryInspection?.keysCount} />}
          </div>
        </Space>
      </Card>

      <Card title={t('Observations générales')}>
        <TextArea rows={4} value={generalComment} onChange={e => setGeneralComment(e.target.value)} />
      </Card>

      {isExit && (
        <Card title={t('Retenues sur le dépôt de garantie')}>
          <DeductionsSection
            deductions={deductions}
            readOnly={false}
            onChange={setDeductions}
            onProposeFromDamages={handleProposeFromDamages}
          />
        </Card>
      )}

      <Card title={t('Signatures')}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space align="center">
            <Switch checked={tenantPresent} onChange={setTenantPresent} />
            <Text>{t('Le locataire est présent')}</Text>
          </Space>
          <div>
            <Text>{t('Nom du locataire signataire')}</Text>
            <Input
              disabled={!tenantPresent}
              value={tenantSignatoryName}
              onChange={e => setTenantSignatoryName(e.target.value)}
            />
          </div>
          <div>
            <Text>{t('Nom de l’agent')}</Text>
            <Input value={agentSignatoryName} onChange={e => setAgentSignatoryName(e.target.value)} />
          </div>
        </Space>
      </Card>

      <Divider />

      <Space wrap>
        <Button onClick={onCancel}>{t('Retour')}</Button>
        <Button icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
          {t('Enregistrer')}
        </Button>
        <Button type="primary" loading={finalizing} onClick={handleFinalize}>
          {t('Finaliser')}
        </Button>
        <Button danger icon={<DeleteOutlined />} loading={deleting} onClick={handleDelete}>
          {t('Supprimer le brouillon')}
        </Button>
      </Space>
    </Space>
  );
};

export default InspectionForm;
