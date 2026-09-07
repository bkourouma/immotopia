import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Tag, Space, Modal, Form, Input, InputNumber, Select, message, Upload } from 'antd';
import { PlusOutlined, EyeOutlined, DeleteOutlined, UploadOutlined, PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Property, PropertyType, PropertyStatus, PropertyMediaType } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { useNavigate } from 'react-router-dom';
import { uploadMedia } from '../../services/property-service';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

interface PropertyApartmentsProps {
  propertyId: string;
  tenantId: string;
  property: Property;
}

export const PropertyApartments: React.FC<PropertyApartmentsProps> = ({
  propertyId,
  tenantId,
  property
}) => {
  const [apartments, setApartments] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const parseNumber = (value: string): string => {
    return value.replace(/\s/g, '');
  };

  useEffect(() => {
    if (property.propertyType === 'IMMEUBLE') {
      loadApartments();
    }
  }, [propertyId, property.propertyType]);

  const loadApartments = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{ success: boolean; data: Property[] }>(
        `/tenants/${tenantId}/properties/${propertyId}/sub-properties`
      );
      setApartments(response.data.data || []);
    } catch (error: any) {
      // Si la propriété n'est pas de type IMMEUBLE, on retourne une liste vide
      // au lieu d'afficher une erreur
      if (error.response?.status === 404 || 
          error.response?.data?.error?.includes('IMMEUBLE') ||
          error.response?.data?.error?.includes('not found')) {
        setApartments([]);
      } else {
        console.error('Erreur lors du chargement des appartements:', error);
        // Ne pas afficher d'erreur si ce n'est pas un IMMEUBLE
        if (property.propertyType === 'IMMEUBLE') {
          message.error('Erreur lors du chargement des appartements');
        }
      }
    } finally {
      setLoading(false);
    }
  };

// Correcting the handleCreate function to use Promise.allSettled and batching
  const handleCreate = async (values: any) => {
    setCreating(true);
    const apartmentGroups = values.apartmentGroups || [];
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      // Traitement par batch pour éviter les problèmes de concurrence
      const BATCH_SIZE = 3; 
      
      for (const group of apartmentGroups) {
        const count = group.count || 1;
        const baseTitle = group.title || 'Appartement';
        const rooms = group.rooms;
        const bedrooms = rooms > 0 ? Math.max(0, rooms - 1) : 0;
        const mediaFiles = group.mediaFiles || [];
        
        const apartmentsToCreate = [];
        // Inherit location from parent (Pays, Région, Commune, Quartier, Adresse) so apartments are linked to building location
        const parentLocation = property.typeSpecificData && typeof property.typeSpecificData === 'object'
          ? property.typeSpecificData
          : {};
        const locationFields = ['country', 'countryId', 'region', 'regionId', 'commune', 'communeId'];
        const inheritedLocation: Record<string, any> = {};
        locationFields.forEach((key) => {
          if (parentLocation[key] !== undefined && parentLocation[key] !== null) {
            inheritedLocation[key] = parentLocation[key];
          }
        });

        for (let i = 1; i <= count; i++) {
          const title = count > 1 ? `${baseTitle} ${i}` : baseTitle;
          apartmentsToCreate.push({
            title,
            data: {
              propertyType: 'APPARTEMENT',
              ownershipType: property.ownershipType,
              title: title,
              description: group.description || '',
              address: property.address,
              locationZone: property.locationZone,
              latitude: property.latitude,
              longitude: property.longitude,
              typeSpecificData: Object.keys(inheritedLocation).length > 0 ? inheritedLocation : undefined,
              transactionModes: group.transactionModes || property.transactionModes,
              price: group.price != null ? parseFloat(parseNumber(String(group.price))) : undefined,
              currency: property.currency || 'EUR',
              surfaceArea: group.surfaceArea,
              rooms: rooms,
              bedrooms: bedrooms,
              bathrooms: group.bathrooms,
              furnishingStatus: group.furnishingStatus,
              availability: group.availability || 'AVAILABLE',
              status: group.status || 'AVAILABLE'
            }
          });
        }

        for (let i = 0; i < apartmentsToCreate.length; i += BATCH_SIZE) {
          const batch = apartmentsToCreate.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.allSettled(
            batch.map((apt) =>
              apiClient.post<{ success: boolean; data: Property }>(
                `/tenants/${tenantId}/properties/${propertyId}/sub-properties`,
                apt.data
              )
            )
          );

          for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            if (result.status === 'fulfilled' && result.value.data.success) {
              const createdApartment = result.value.data.data;
              successCount++;

              if (mediaFiles.length > 0) {
                try {
                  let displayOrder = 0;
                  let hasPrimary = false;

                  for (const mediaFile of mediaFiles) {
                    if (mediaFile.originFileObj) {
                      try {
                        const fileType = mediaFile.originFileObj.type || '';
                        let mediaType = PropertyMediaType.PHOTO;
                        if (fileType.startsWith('video/')) {
                          mediaType = PropertyMediaType.VIDEO;
                        }

                        const isPrimary = !hasPrimary && mediaType === PropertyMediaType.PHOTO;
                        if (isPrimary) {
                          hasPrimary = true;
                        }

                        await uploadMedia(
                          tenantId,
                          createdApartment.id,
                          mediaFile.originFileObj,
                          mediaType as string,
                          displayOrder++,
                          isPrimary
                        );
                      } catch (mediaError: any) {
                        console.error(`Erreur upload média pour ${createdApartment.title}:`, mediaError);
                      }
                    }
                  }
                } catch (mediaError: any) {
                  console.error(`Erreur upload médias pour ${createdApartment.title}:`, mediaError);
                }
              }
            } else {
              errorCount++;
              const apt = batch[j];
              let errorMsg = 'Erreur inconnue';
              if (result.status === 'rejected') {
                const err = result.reason as { response?: { data?: { error?: string } }; message?: string };
                errorMsg = err?.response?.data?.error || err?.message || errorMsg;
              } else {
                const resData = (result as PromiseFulfilledResult<{ data: { success?: boolean; error?: string } }>).value?.data;
                errorMsg = resData?.error || errorMsg;
              }
              errors.push(`${apt.title}: ${errorMsg}`);
              console.error(`Erreur création ${apt.title}:`, result.status === 'rejected' ? result.reason : errorMsg);
            }
          }
        }
      }

      if (successCount > 0) {
        const totalMedia = apartmentGroups.reduce((sum: number, group: any) => {
          return sum + (group.mediaFiles?.length || 0);
        }, 0);
        let successMsg = `${successCount} appartement${successCount > 1 ? 's' : ''} créé${successCount > 1 ? 's' : ''} avec succès`;
        if (totalMedia > 0) {
          successMsg += ` (${totalMedia} média${totalMedia > 1 ? 'x' : ''} partagé${totalMedia > 1 ? 's' : ''})`;
        }
        message.success(successMsg);
      }
      if (errorCount > 0) {
        const errorDetails = errors.length > 0 ? `\nDétails: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}` : '';
        message.warning(
          `${errorCount} appartement${errorCount > 1 ? 's' : ''} n'a${errorCount > 1 ? 'ont' : ''} pas pu être créé${errorCount > 1 ? 's' : ''}${errorDetails}`
        );
      }

      setModalVisible(false);
      form.resetFields();
      loadApartments();
    } catch (error: any) {
      console.error('Erreur globale lors de la création:', error);
      message.error(error.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    {
      title: 'Titre',
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: 'Surface (m²)',
      dataIndex: 'surfaceArea',
      key: 'surfaceArea',
      render: (value: number) => value || '-'
    },
    {
      title: 'Pièces',
      dataIndex: 'rooms',
      key: 'rooms',
      render: (value: number) => value || '-'
    },
    {
      title: 'Prix',
      dataIndex: 'price',
      key: 'price',
      render: (value: number, record: Property) => 
        value ? `${new Intl.NumberFormat('fr-FR').format(value)} ${record.currency || 'EUR'}` : '-'
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: PropertyStatus) => {
        const statusLabels: Record<string, string> = {
          DRAFT: 'Brouillon',
          UNDER_REVIEW: 'En révision',
          AVAILABLE: 'Disponible',
          RESERVED: 'Réservé',
          UNDER_OFFER: 'Sous offre',
          RENTED: 'Loué',
          SOLD: 'Vendu',
          ARCHIVED: 'Archivé'
        };
        const colors: Record<string, string> = {
          DRAFT: 'default',
          UNDER_REVIEW: 'warning',
          AVAILABLE: 'success',
          RESERVED: 'processing',
          UNDER_OFFER: 'processing',
          RENTED: 'purple',
          SOLD: 'error',
          ARCHIVED: 'default'
        };
        return <Tag color={colors[status] || 'default'}>{statusLabels[status] || status}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Property) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/tenant/${tenantId}/properties/${record.id}`)}
          >
            Voir
          </Button>
        </Space>
      )
    }
  ];

  if (property.propertyType !== 'IMMEUBLE') {
    return null;
  }

  return (
    <Card
      title="Appartements"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
        >
          Ajouter un appartement
        </Button>
      }
    >
      <Table
        dataSource={apartments}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title="Créer des appartements"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={800}
        confirmLoading={creating}
        style={{ top: 20 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            apartmentGroups: [{
              count: 1,
              status: 'AVAILABLE'
            }]
          }}
        >
          <Form.List name="apartmentGroups">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Card
                    key={key}
                    size="small"
                    title={`Groupe d'appartements ${name + 1}`}
                    extra={
                      fields.length > 1 && (
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(name)}
                        >
                          Supprimer
                        </Button>
                      )
                    }
                    style={{ marginBottom: 16 }}
                  >
                    <Form.Item
                      {...restField}
                      name={[name, 'count']}
                      label="Nombre d'appartements"
                      rules={[
                        { required: true, message: 'Le nombre est requis' },
                        { type: 'number', min: 1, max: 100, message: 'Entre 1 et 100' }
                      ]}
                    >
                      <InputNumber min={1} max={100} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'title']}
                      label="Titre de base"
                      rules={[{ required: true, message: 'Le titre est requis' }]}
                      tooltip="Si plusieurs appartements, un numéro sera ajouté automatiquement (ex: Appartement 1, Appartement 2...)"
                    >
                      <Input placeholder="Ex: Appartement" />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'description']}
                      label="Description"
                    >
                      <Input.TextArea rows={2} />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'surfaceArea']}
                      label="Surface (m²)"
                    >
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'rooms']}
                      label="Nombre de pièces"
                      rules={[{ required: true, message: 'Le nombre de pièces est requis' }]}
                      tooltip="Le nombre de chambres sera calculé automatiquement (pièces - 1 pour le salon)"
                    >
                      <InputNumber 
                        min={1} 
                        style={{ width: '100%' }}
                      />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'bathrooms']}
                      label="Salles de bain"
                    >
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'price']}
                      label="Prix"
                    >
                      <InputNumber
                        placeholder="Ex: 50 000 000"
                        min={0}
                        step={1000}
                        style={{ width: '100%' }}
                        formatter={(value) => formatNumberWithSpaces(value?.toString() || '')}
                        parser={((value) => {
                          if (value == null || value === '') return undefined as unknown as number;
                          const parsed = parseFormattedNumber(value);
                          const num = parseFloat(parsed);
                          return isNaN(num) ? (undefined as unknown as number) : num;
                        }) as (displayValue: string | undefined) => number}
                      />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'furnishingStatus']}
                      label="Meublé"
                    >
                      <Select>
                        <Select.Option value="FURNISHED">Meublé</Select.Option>
                        <Select.Option value="UNFURNISHED">Non meublé</Select.Option>
                        <Select.Option value="PARTIALLY_FURNISHED">Partiellement meublé</Select.Option>
                      </Select>
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'status']}
                      label="Statut"
                    >
                      <Select defaultValue="AVAILABLE">
                        <Select.Option value="AVAILABLE">Disponible</Select.Option>
                        <Select.Option value="RESERVED">Réservé</Select.Option>
                        <Select.Option value="UNDER_OFFER">Sous offre</Select.Option>
                        <Select.Option value="RENTED">Loué</Select.Option>
                        <Select.Option value="SOLD">Vendu</Select.Option>
                        <Select.Option value="ARCHIVED">Archivé</Select.Option>
                      </Select>
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'mediaFiles']}
                      label="Photos et Vidéos"
                      tooltip="Les médias ajoutés seront partagés par tous les appartements de ce groupe"
                    >
                      <Upload
                        multiple
                        listType="picture-card"
                        beforeUpload={() => false} // Empêcher l'upload automatique
                        accept="image/*,video/*"
                        onChange={(info) => {
                          // Garder seulement les fichiers valides
                          const fileList = info.fileList.filter(file => file.status !== 'error');
                          form.setFieldValue(['apartmentGroups', name, 'mediaFiles'], fileList);
                        }}
                        onRemove={(file) => {
                          const currentFiles = form.getFieldValue(['apartmentGroups', name, 'mediaFiles']) || [];
                          const newFiles = currentFiles.filter((f: any) => f.uid !== file.uid);
                          form.setFieldValue(['apartmentGroups', name, 'mediaFiles'], newFiles);
                        }}
                      >
                        {(form.getFieldValue(['apartmentGroups', name, 'mediaFiles']) || []).length < 20 && (
                          <div>
                            <PlusOutlined />
                            <div style={{ marginTop: 8 }}>Ajouter</div>
                          </div>
                        )}
                      </Upload>
                      <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                        Format accepté: Images (JPG, PNG, etc.) et Vidéos (MP4, etc.)
                      </div>
                    </Form.Item>
                  </Card>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                  >
                    Ajouter un groupe d'appartements
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Card>
  );
};
