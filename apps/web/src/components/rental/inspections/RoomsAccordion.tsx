import React, { useState } from 'react';
import { Button, Collapse, Input, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { InspectionItem, InspectionPhoto, InspectionRoom } from '../../../services/lease-inspections-service';
import { ConditionPicker } from './ConditionPicker';
import { ItemPhotos } from './ItemPhotos';
import { conditionLabel, isDegraded } from './inspection-constants';
import { t } from '../../../i18n/t';

const { TextArea } = Input;
const { Text } = Typography;

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
  entryItemsById?: Map<string, EntryItemLookup>;
  photos: InspectionPhoto[];
  onRoomsChange?: (rooms: InspectionRoom[]) => void;
  onUploadPhoto: (file: File, roomId: string, itemId: string) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
}

/**
 * Pièces et éléments d'un état des lieux, en accordéon.
 *
 * Les identifiants de pièce et d'élément créés ici viennent de
 * `crypto.randomUUID()`, comme l'exige le contrat côté client : le serveur les
 * accepte tels quels (uuid ou chaîne non vide, uniques dans le document).
 */
export const RoomsAccordion: React.FC<RoomsAccordionProps> = ({
  tenantId,
  leaseId,
  inspectionId,
  rooms,
  readOnly,
  showEntryReminder,
  entryItemsById,
  photos,
  onRoomsChange,
  onUploadPhoto,
  onDeletePhoto
}) => {
  const [newRoomName, setNewRoomName] = useState('');
  const [newItemLabel, setNewItemLabel] = useState<Record<string, string>>({});

  const photosFor = (roomId: string, itemId: string) =>
    photos.filter(photo => photo.roomId === roomId && photo.itemId === itemId);

  const updateRoom = (roomId: string, updater: (room: InspectionRoom) => InspectionRoom) => {
    if (!onRoomsChange) return;
    onRoomsChange(rooms.map(room => (room.id === roomId ? updater(room) : room)));
  };

  const handleAddRoom = () => {
    const name = newRoomName.trim();
    if (!name || !onRoomsChange) return;
    onRoomsChange([...rooms, { id: crypto.randomUUID(), name, items: [] }]);
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
    updateRoom(roomId, room => ({
      ...room,
      items: [...room.items, { id: crypto.randomUUID(), label, condition: null, comment: null }]
    }));
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

  if (rooms.length === 0) {
    return <Text type="secondary">{t('Aucune pièce pour le moment.')}</Text>;
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Collapse defaultActiveKey={rooms.map(room => room.id)}>
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
            extra={
              !readOnly && (
                <span onClick={e => e.stopPropagation()}>
                  <Popconfirm title={t('Supprimer cette pièce ?')} onConfirm={() => handleDeleteRoom(room.id)}>
                    <Button
                      danger
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      aria-label={t('Supprimer la pièce {{nom}}', { nom: room.name })}
                    />
                  </Popconfirm>
                </span>
              )
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {room.items.map(item => {
                const entryLookup = entryItemsById?.get(item.id);
                const degraded =
                  showEntryReminder && entryLookup ? isDegraded(entryLookup.item.condition, item.condition) : false;

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 8,
                      borderRadius: 6,
                      background: degraded ? '#fff1f0' : undefined,
                      border: degraded ? '1px solid #ffa39e' : undefined
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6
                      }}
                    >
                      <Text strong>{item.label}</Text>
                      {!readOnly && (
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
                      <Tag color={item.condition ? undefined : 'default'}>{conditionLabel(item.condition)}</Tag>
                    ) : (
                      <ConditionPicker
                        value={item.condition}
                        onChange={condition => handleItemChange(room.id, item.id, { condition })}
                      />
                    )}

                    {showEntryReminder && entryLookup && (
                      <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                        {t('Entrée : {{etat}}', { etat: conditionLabel(entryLookup.item.condition) })}
                        {degraded && (
                          <Tag color="red" style={{ marginInlineStart: 6 }}>
                            {t('Dégradé')}
                          </Tag>
                        )}
                      </div>
                    )}

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
              })}

              {!readOnly && (
                <Space.Compact style={{ width: '100%', maxWidth: 360 }}>
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
