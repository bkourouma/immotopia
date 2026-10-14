import React, { useEffect, useState } from 'react';
import { Button, Checkbox, Collapse, Input, InputNumber, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import {
  InspectionCondition,
  InspectionItem,
  InspectionPhoto,
  InspectionRoom
} from '../../../services/lease-inspections-service';
import { ConditionPicker } from './ConditionPicker';
import { ItemPhotos } from './ItemPhotos';
import { compareItemPair, conditionLabel, isItemEvaluated, itemKind, MISSING_COLOR } from './inspection-constants';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../../lib/utils';
import { t } from '../../../i18n/t';

const { TextArea } = Input;
const { Text } = Typography;

const MAX_QUANTITY = 9999;
const MAX_REPLACEMENT_VALUE = 100_000_000;
const UNEVALUATED_BORDER = '2px solid #fa8c16';

/** Élément d'entrée correspondant, retrouvé par identifiant, pour le rappel en sortie. */
export interface EntryItemLookup {
  item: InspectionItem;
  roomName: string;
}

interface RoomsAccordionProps {
  tenantId: string;
  leaseId: string;
  inspectionId: string;
  rooms: InspectionRoom[];
  readOnly: boolean;
  /** Vrai uniquement pour un état des lieux de sortie : affiche le rappel d'entrée. */
  showEntryReminder: boolean;
  /**
   * Sortie : un élément repris de l'entrée ne se supprime pas (on le marque
   * « Manquant »), sa valeur de remplacement est en lecture seule, et un
   * mobilier ajouté part sans quantité.
   */
  isExit?: boolean;
  /** Éléments non évalués à entourer en orange (refus de finalisation). */
  highlightUnevaluated?: Set<string>;
  entryItemsById?: Map<string, EntryItemLookup>;
  photos: InspectionPhoto[];
  onRoomsChange?: (rooms: InspectionRoom[]) => void;
  onUploadPhoto: (file: File, roomId: string, itemId: string) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
}

function formatAmount(value: number): string {
  return formatNumberWithSpaces(String(value));
}

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseFloat(parseFormattedNumber(value));
  return isNaN(parsed) ? 0 : parsed;
}

interface QuantityFieldProps {
  value: number | null;
  disabled: boolean;
  label: string;
  onChange: (value: number | null) => void;
}

/** Quantité d'un mobilier : boutons − et + de 44 px pour la saisie au doigt. */
const QuantityField: React.FC<QuantityFieldProps> = ({ value, disabled, label, onChange }) => {
  const step = (delta: number) => {
    const next = Math.min(MAX_QUANTITY, Math.max(0, (value ?? 0) + delta));
    onChange(next);
  };
  return (
    <Space.Compact>
      <Button
        icon={<MinusOutlined />}
        disabled={disabled || (value ?? 0) <= 0}
        onClick={() => step(-1)}
        aria-label={t('Diminuer la quantité')}
        style={{ width: 44, height: 44 }}
      />
      <InputNumber
        aria-label={label}
        min={0}
        max={MAX_QUANTITY}
        precision={0}
        controls={false}
        disabled={disabled}
        value={value}
        onChange={next => onChange(next === null || next === undefined ? null : Number(next))}
        style={{ width: 80, height: 44, display: 'flex', alignItems: 'center' }}
      />
      <Button
        icon={<PlusOutlined />}
        disabled={disabled || (value ?? 0) >= MAX_QUANTITY}
        onClick={() => step(1)}
        aria-label={t('Augmenter la quantité')}
        style={{ width: 44, height: 44 }}
      />
    </Space.Compact>
  );
};

/**
 * Pièces et éléments d'un état des lieux, en accordéon.
 *
 * Les identifiants de pièce et d'élément créés ici viennent de
 * `crypto.randomUUID()`, comme l'exige le contrat côté client : le serveur les
 * accepte tels quels (uuid ou chaîne non vide, uniques dans le document).
 *
 * Un élément de mobilier (`kind: 'FURNITURE'`, spec 040 M1) porte en plus une
 * quantité et une valeur de remplacement à l'unité ; un élément de bâti n'a
 * ni l'une ni l'autre.
 */
export const RoomsAccordion: React.FC<RoomsAccordionProps> = ({
  tenantId,
  leaseId,
  inspectionId,
  rooms,
  readOnly,
  showEntryReminder,
  isExit = false,
  highlightUnevaluated,
  entryItemsById,
  photos,
  onRoomsChange,
  onUploadPhoto,
  onDeletePhoto
}) => {
  const [newRoomName, setNewRoomName] = useState('');
  const [newItemLabel, setNewItemLabel] = useState<Record<string, string>>({});
  const [newItemFurniture, setNewItemFurniture] = useState<Record<string, boolean>>({});
  const [activeKeys, setActiveKeys] = useState<string[]>(() => rooms.map(room => room.id));

  // Un refus de finalisation ouvre les pièces qui contiennent un élément à évaluer.
  useEffect(() => {
    if (!highlightUnevaluated || highlightUnevaluated.size === 0) return;
    const roomIds = rooms
      .filter(room => room.items.some(item => highlightUnevaluated.has(item.id)))
      .map(room => room.id);
    setActiveKeys(prev => Array.from(new Set([...prev, ...roomIds])));
    // `rooms` volontairement absent : n'ouvrir qu'au moment du refus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightUnevaluated]);

  const photosFor = (roomId: string, itemId: string) =>
    photos.filter(photo => photo.roomId === roomId && photo.itemId === itemId);

  const updateRoom = (roomId: string, updater: (room: InspectionRoom) => InspectionRoom) => {
    if (!onRoomsChange) return;
    onRoomsChange(rooms.map(room => (room.id === roomId ? updater(room) : room)));
  };

  const handleAddRoom = () => {
    const name = newRoomName.trim();
    if (!name || !onRoomsChange) return;
    const id = crypto.randomUUID();
    onRoomsChange([...rooms, { id, name, items: [] }]);
    setActiveKeys(prev => [...prev, id]);
    setNewRoomName('');
  };

  const handleRenameRoom = (roomId: string, name: string) => {
    if (!name.trim()) return;
    updateRoom(roomId, room => ({ ...room, name: name.trim() }));
  };

  const handleDeleteRoom = (roomId: string) => {
    if (!onRoomsChange) return;
    onRoomsChange(rooms.filter(room => room.id !== roomId));
  };

  const handleAddItem = (roomId: string) => {
    const label = (newItemLabel[roomId] || '').trim();
    if (!label) return;
    const furniture = Boolean(newItemFurniture[roomId]);
    const newItem: InspectionItem = {
      id: crypto.randomUUID(),
      label,
      condition: null,
      comment: null,
      kind: furniture ? 'FURNITURE' : 'FIXTURE',
      quantity: furniture && !isExit ? 1 : null,
      replacementValue: null
    };
    updateRoom(roomId, room => ({ ...room, items: [...room.items, newItem] }));
    setNewItemLabel(prev => ({ ...prev, [roomId]: '' }));
  };

  const handleDeleteItem = (roomId: string, itemId: string) => {
    updateRoom(roomId, room => ({ ...room, items: room.items.filter(item => item.id !== itemId) }));
  };

  const handleItemChange = (roomId: string, itemId: string, patch: Partial<InspectionItem>) => {
    updateRoom(roomId, room => ({
      ...room,
      items: room.items.map(item => (item.id === itemId ? { ...item, ...patch } : item))
    }));
  };

  /** « Manquant » met la quantité d'un mobilier à 0 ; en sortir la remet à vide. */
  const handleConditionChange = (roomId: string, item: InspectionItem, condition: InspectionCondition) => {
    const patch: Partial<InspectionItem> = { condition };
    if (itemKind(item) === 'FURNITURE') {
      if (condition === 'MISSING') patch.quantity = 0;
      else if (item.condition === 'MISSING') patch.quantity = null;
    }
    handleItemChange(roomId, item.id, patch);
  };

  const isFromEntry = (itemId: string) => isExit && Boolean(entryItemsById?.has(itemId));

  if (rooms.length === 0) {
    return <Text type="secondary">{t('Aucune pièce pour le moment.')}</Text>;
  }

  const renderInventoryFields = (room: InspectionRoom, item: InspectionItem, entryItem: InspectionItem | null) => {
    if (itemKind(item) !== 'FURNITURE') return null;
    if (readOnly) {
      return (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Text>{t('Quantité : {{quantite}}', { quantite: item.quantity ?? '—' })}</Text>
          {item.replacementValue !== null && item.replacementValue !== undefined && (
            <Text type="secondary">
              {t('Valeur de remplacement : {{montant}} FCFA', { montant: formatAmount(item.replacementValue) })}
            </Text>
          )}
        </div>
      );
    }

    const missing = item.condition === 'MISSING';
    const valueLocked = isFromEntry(item.id);
    const entryQuantity = entryItem && itemKind(entryItem) === 'FURNITURE' ? (entryItem.quantity ?? null) : null;

    return (
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <Text type="secondary" style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>
            {t('Quantité')}
          </Text>
          <Space wrap>
            <QuantityField
              label={t('Quantité')}
              value={missing ? 0 : (item.quantity ?? null)}
              disabled={missing}
              onChange={quantity => handleItemChange(room.id, item.id, { quantity })}
            />
            {showEntryReminder && entryQuantity !== null && !missing && (
              <Button
                style={{ minHeight: 44 }}
                onClick={() => handleItemChange(room.id, item.id, { quantity: entryQuantity })}
              >
                {t("Comme à l'entrée ({{quantite}})", { quantite: entryQuantity })}
              </Button>
            )}
          </Space>
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>
            {t("Valeur de remplacement (FCFA, à l'unité)")}
          </Text>
          {valueLocked ? (
            <Text>
              {item.replacementValue !== null && item.replacementValue !== undefined
                ? `${formatAmount(item.replacementValue)} FCFA`
                : '—'}
            </Text>
          ) : (
            <InputNumber
              aria-label={t("Valeur de remplacement (FCFA, à l'unité)")}
              min={0}
              max={MAX_REPLACEMENT_VALUE}
              precision={0}
              step={1000}
              style={{ width: 180, height: 44, display: 'flex', alignItems: 'center' }}
              value={item.replacementValue ?? null}
              formatter={value => formatNumberWithSpaces(value?.toString() || '')}
              parser={parseAmount as (displayValue: string | undefined) => number}
              onChange={value =>
                handleItemChange(room.id, item.id, {
                  replacementValue: value === null || value === undefined ? null : Number(value)
                })
              }
            />
          )}
        </div>
      </div>
    );
  };

  const renderEntryReminder = (item: InspectionItem, entryItem: InspectionItem) => {
    const diff = compareItemPair(entryItem, item);
    const reminder =
      diff.kind === 'FURNITURE'
        ? t('Entrée : {{etat}} · {{quantite}}', {
            etat: conditionLabel(entryItem.condition),
            quantite: entryItem.quantity ?? '—'
          })
        : t('Entrée : {{etat}}', { etat: conditionLabel(entryItem.condition) });
    return (
      <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
        {reminder}
        {diff.degraded && (
          <Tag color="red" style={{ marginInlineStart: 6 }}>
            {t('Dégradé')}
          </Tag>
        )}
        {diff.missing && (
          <Tag color="purple" style={{ marginInlineStart: 6 }}>
            {t('Manquant')}
          </Tag>
        )}
        {diff.quantityDecrease > 0 && (
          <Tag color="purple" style={{ marginInlineStart: 6 }}>
            {t('Baisse de quantité (−{{nombre}})', { nombre: diff.quantityDecrease })}
          </Tag>
        )}
      </div>
    );
  };

  const renderItem = (room: InspectionRoom, item: InspectionItem) => {
    const entryLookup = entryItemsById?.get(item.id);
    const entryItem = showEntryReminder && entryLookup ? entryLookup.item : null;
    const diff = entryItem ? compareItemPair(entryItem, item) : null;
    const flagged = Boolean(diff && (diff.missing || diff.quantityDecrease > 0));
    const highlighted = !readOnly && Boolean(highlightUnevaluated?.has(item.id)) && !isItemEvaluated(item);
    const background = diff?.degraded ? '#fff1f0' : flagged ? '#f9f0ff' : undefined;
    const border = highlighted
      ? UNEVALUATED_BORDER
      : diff?.degraded
        ? '1px solid #ffa39e'
        : flagged
          ? `1px solid ${MISSING_COLOR}`
          : undefined;

    return (
      <div
        key={item.id}
        data-unevaluated={highlighted ? 'true' : undefined}
        style={{ padding: 8, borderRadius: 6, background, border }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text strong>{item.label}</Text>
          {!readOnly && !isFromEntry(item.id) && (
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label={t('Supprimer l’élément {{nom}}', { nom: item.label })}
              onClick={() => handleDeleteItem(room.id, item.id)}
            />
          )}
        </div>

        {readOnly ? (
          <Tag color={item.condition === 'MISSING' ? 'purple' : item.condition ? undefined : 'default'}>
            {conditionLabel(item.condition)}
          </Tag>
        ) : (
          <ConditionPicker
            value={item.condition}
            onChange={condition => handleConditionChange(room.id, item, condition)}
          />
        )}

        {renderInventoryFields(room, item, entryItem)}

        {entryItem && renderEntryReminder(item, entryItem)}

        {readOnly ? (
          item.comment && <div style={{ marginTop: 6 }}>{item.comment}</div>
        ) : (
          <TextArea
            style={{ marginTop: 6 }}
            rows={2}
            value={item.comment || ''}
            placeholder={t('Commentaire (optionnel)')}
            onChange={e => handleItemChange(room.id, item.id, { comment: e.target.value })}
          />
        )}

        <ItemPhotos
          tenantId={tenantId}
          leaseId={leaseId}
          inspectionId={inspectionId}
          photos={photosFor(room.id, item.id)}
          readOnly={readOnly}
          onUpload={file => onUploadPhoto(file, room.id, item.id)}
          onDelete={onDeletePhoto}
        />
      </div>
    );
  };

  const renderRoomExtra = (room: InspectionRoom) => {
    if (readOnly) return null;
    const toEvaluate = room.items.filter(item => !isItemEvaluated(item)).length;
    const holdsEntryItems = room.items.some(item => isFromEntry(item.id));
    return (
      <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {toEvaluate > 0 && <Tag color="orange">{t('{{nombre}} à évaluer', { nombre: toEvaluate })}</Tag>}
        {holdsEntryItems ? (
          <Tooltip title={t("Indiquez « Manquant » plutôt que de retirer un élément de l'entrée.")}>
            <Button
              danger
              type="text"
              size="small"
              disabled
              icon={<DeleteOutlined />}
              aria-label={t('Supprimer la pièce {{nom}}', { nom: room.name })}
            />
          </Tooltip>
        ) : (
          <Popconfirm title={t('Supprimer cette pièce ?')} onConfirm={() => handleDeleteRoom(room.id)}>
            <Button
              danger
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              aria-label={t('Supprimer la pièce {{nom}}', { nom: room.name })}
            />
          </Popconfirm>
        )}
      </span>
    );
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Collapse
        activeKey={activeKeys}
        onChange={keys => setActiveKeys(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
      >
        {rooms.map(room => (
          <Collapse.Panel
            key={room.id}
            header={
              readOnly ? (
                room.name
              ) : (
                <Text
                  editable={{ onChange: value => handleRenameRoom(room.id, value) }}
                  onClick={e => e.stopPropagation()}
                >
                  {room.name}
                </Text>
              )
            }
            extra={renderRoomExtra(room)}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {room.items.map(item => renderItem(room, item))}

              {!readOnly && (
                <Space direction="vertical" size={4} style={{ width: '100%', maxWidth: 360 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder={t('Nouvel élément')}
                      value={newItemLabel[room.id] || ''}
                      onChange={e => setNewItemLabel(prev => ({ ...prev, [room.id]: e.target.value }))}
                      onPressEnter={() => handleAddItem(room.id)}
                    />
                    <Button icon={<PlusOutlined />} onClick={() => handleAddItem(room.id)}>
                      {t('Ajouter')}
                    </Button>
                  </Space.Compact>
                  <Checkbox
                    checked={Boolean(newItemFurniture[room.id])}
                    onChange={e => setNewItemFurniture(prev => ({ ...prev, [room.id]: e.target.checked }))}
                  >
                    {t('Mobilier (avec quantité)')}
                  </Checkbox>
                </Space>
              )}
            </Space>
          </Collapse.Panel>
        ))}
      </Collapse>

      {!readOnly && (
        <Space.Compact style={{ width: '100%', maxWidth: 360 }}>
          <Input
            placeholder={t('Nouvelle pièce')}
            value={newRoomName}
            onChange={e => setNewRoomName(e.target.value)}
            onPressEnter={handleAddRoom}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRoom}>
            {t('Ajouter une pièce')}
          </Button>
        </Space.Compact>
      )}
    </Space>
  );
};

export default RoomsAccordion;
