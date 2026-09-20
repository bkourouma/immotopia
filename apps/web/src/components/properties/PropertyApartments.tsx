import React, { useState, useEffect } from 'react';
import { App, Card, Button, Modal, Form, Input, InputNumber, Select, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined, UploadOutlined, PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Property, PropertyMediaType } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { useNavigate } from 'react-router-dom';
import { uploadMedia } from '../../services/property-service';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';
import { DataCard, DataView, MoneyValue, StatusTag } from '../primitives';
import { t } from '../../i18n/t';

interface PropertyApartmentsProps {
  propertyId: string;
  tenantId: string;
  property: Property;
}

export const PropertyApartments: React.FC<PropertyApartmentsProps> = ({ propertyId, tenantId, property }) => {
  const { message } = App.useApp();

  const [apartments, setApartments] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  /**
   * Pagination en memoire, et c'est assume : l'endpoint des sous-biens rend
   * la liste complete d'un immeuble, sans enveloppe de pagination. Decouper
   * ici evite d'afficher quarante lignes d'un coup ; le jour ou l'API
   * paginera, seules ces deux lignes changent.
   */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
      if (
        error.response?.status === 404 ||
        error.response?.data?.error?.includes('IMMEUBLE') ||
        error.response?.data?.error?.includes('not found')
      ) {
        setApartments([]);
      } else {
        console.error('Erreur lors du chargement des appartements:', error);
        // Ne pas afficher d'erreur si ce n'est pas un IMMEUBLE
        if (property.propertyType === 'IMMEUBLE') {
          message.error(t('Erreur lors du chargement des appartements'));
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
        const parentLocation =
          property.typeSpecificData && typeof property.typeSpecificData === 'object' ? property.typeSpecificData : {};
        const locationFields = ['country', 'countryId', 'region', 'regionId', 'commune', 'communeId'];
        const inheritedLocation: Record<string, any> = {};
        locationFields.forEach(key => {
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
            batch.map(apt =>
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
              let errorMsg = t('Erreur inconnue');
              if (result.status === 'rejected') {
                const err = result.reason as { response?: { data?: { error?: string } }; message?: string };
                errorMsg = err?.response?.data?.error || err?.message || errorMsg;
              } else {
                const resData = (result as PromiseFulfilledResult<{ data: { success?: boolean; error?: string } }>)
                  .value?.data;
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
        let successMsg = t('{{successCount}} appartement{{value}} créé{{value2}} avec succès', {
          successCount: successCount,
          value: successCount > 1 ? 's' : '',
          value2: successCount > 1 ? 's' : ''
        });
        if (totalMedia > 0) {
          successMsg += t('({{totalMedia}} média{{value}} partagé{{value2}})', {
            totalMedia: totalMedia,
            value: totalMedia > 1 ? 'x' : '',
            value2: totalMedia > 1 ? 's' : ''
          });
        }
        message.success(successMsg);
      }
      if (errorCount > 0) {
        const errorDetails =
          errors.length > 0
            ? t('Détails: {{value}}{{value2}}', {
                value: errors.slice(0, 3).join(', '),
                value2: errors.length > 3 ? '...' : ''
              })
            : '';
        message.warning(
          t("{{errorCount}} appartement{{value}} n'a{{value2}} pas pu être créé{{value3}}{{errorDetails}}", {
            errorCount: errorCount,
            value: errorCount > 1 ? 's' : '',
            value2: errorCount > 1 ? 'ont' : '',
            value3: errorCount > 1 ? 's' : '',
            errorDetails: errorDetails
          })
        );
      }

      setModalVisible(false);
      form.resetFields();
      loadApartments();
    } catch (error: any) {
      console.error('Erreur globale lors de la création:', error);
      message.error(error.response?.data?.error || t('Erreur lors de la création'));
    } finally {
      setCreating(false);
    }
  };

  /**
   * Colonnes par priorite (REFONTE_UI_UX.md §5.1).
   *
   * L'ancien tableau alignait six colonnes sans largeur ni troncature, dans
   * une carte deja retrecie par la colonne de droite de la fiche : le titre
   * d'un appartement se repliait un mot par ligne et la colonne « Actions »
   * sortait du cadre. Les colonnes qualifient maintenant leur largeur, le
   * titre se coupe proprement, et surface et pieces disparaissent sous
   * 1200 px plutot que d'ecraser le reste.
   */
  const colonnes: ColumnsType<Property> = [
    { title: t('Appartement'), dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: t('Surface'),
      dataIndex: 'surfaceArea',
      key: 'surfaceArea',
      width: 110,
      align: 'end',
      responsive: ['xl'],
      render: (valeur: number) => (valeur ? `${valeur} m²` : '—')
    },
    {
      title: t('Pièces'),
      dataIndex: 'rooms',
      key: 'rooms',
      width: 90,
      align: 'end',
      responsive: ['xl'],
      render: (valeur: number) => valeur || '—'
    },
    {
      title: t('Prix'),
      dataIndex: 'price',
      key: 'price',
      width: 170,
      align: 'end',
      render: (valeur: number, appartement: Property) => (
        <MoneyValue value={valeur} currency={appartement.currency || 'FCFA'} />
      )
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (statut: string) => <StatusTag status={statut} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 100,
      align: 'end',
      render: (_: unknown, appartement: Property) => (
        <Button type="link" onClick={() => navigate(`/tenant/${tenantId}/properties/${appartement.id}`)}>
          {t('Voir')}
        </Button>
      )
    }
  ];

  if (property.propertyType !== 'IMMEUBLE') {
    return null;
  }

  const pageCourante = apartments.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Card>
      {/* En-tete dans le corps et non dans `title`/`extra` : la barre d'en-tete
          d'Ant Design ne se replie pas, et « Ajouter un appartement » passait
          par-dessus le titre sur un ecran etroit. */}
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <strong style={{ fontSize: 'var(--font-size-h3)' }}>
          {t('Appartements')}
          {apartments.length > 0 && ` (${apartments.length})`}
        </strong>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          {t('Ajouter un appartement')}
        </Button>
      </header>

      {/* Tableau au-dessus de 992 px, cartes en dessous (§5.1). Le tableau ne
          defile plus horizontalement : sous ce palier, ce sont des cartes. */}
      <DataView
        aria-label={t("Appartements de l'immeuble")}
        items={pageCourante}
        total={apartments.length}
        page={page}
        pageSize={pageSize}
        onPageChange={(pageSuivante, taille) => {
          setPage(pageSuivante);
          setPageSize(taille);
        }}
        loading={loading}
        rowKey={appartement => appartement.id}
        columns={colonnes}
        emptyDescription={t('Cet immeuble ne contient encore aucun appartement.')}
        emptyAction={{ label: t('Ajouter un appartement'), onClick: () => setModalVisible(true) }}
        renderCard={appartement => (
          <DataCard
            title={appartement.title}
            subtitle={[
              appartement.surfaceArea ? `${appartement.surfaceArea} m²` : null,
              appartement.rooms
                ? t('{{rooms}} pièce{{value}}', { rooms: appartement.rooms, value: appartement.rooms > 1 ? 's' : '' })
                : null
            ]
              .filter(Boolean)
              .join(' · ')}
            status={<StatusTag status={appartement.status} />}
            highlight={
              appartement.price ? (
                <MoneyValue value={appartement.price} currency={appartement.currency || 'FCFA'} />
              ) : undefined
            }
            onOpen={() => navigate(`/tenant/${tenantId}/properties/${appartement.id}`)}
          />
        )}
      />

      <Modal
        title={t('Créer des appartements')}
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
            apartmentGroups: [
              {
                count: 1,
                status: 'AVAILABLE'
              }
            ]
          }}
        >
          <Form.List name="apartmentGroups">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Card
                    key={key}
                    size="small"
                    title={t("Groupe d'appartements {{value}}", { value: name + 1 })}
                    extra={
                      fields.length > 1 && (
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)}>
                          {t('Supprimer')}
                        </Button>
                      )
                    }
                    style={{ marginBottom: 16 }}
                  >
                    <Form.Item
                      {...restField}
                      name={[name, 'count']}
                      label={t("Nombre d'appartements")}
                      rules={[
                        { required: true, message: t('Le nombre est requis') },
                        { type: 'number', min: 1, max: 100, message: t('Entre 1 et 100') }
                      ]}
                    >
                      <InputNumber min={1} max={100} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'title']}
                      label={t('Titre de base')}
                      rules={[{ required: true, message: t('Le titre est requis') }]}
                      tooltip={t(
                        'Si plusieurs appartements, un numéro sera ajouté automatiquement (ex: Appartement 1, Appartement 2...)'
                      )}
                    >
                      <Input placeholder={t('Ex: Appartement')} />
                    </Form.Item>

                    <Form.Item {...restField} name={[name, 'description']} label={t('Description')}>
                      <Input.TextArea rows={2} />
                    </Form.Item>

                    <Form.Item {...restField} name={[name, 'surfaceArea']} label={t('Surface (m²)')}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'rooms']}
                      label={t('Nombre de pièces')}
                      rules={[{ required: true, message: t('Le nombre de pièces est requis') }]}
                      tooltip={t('Le nombre de chambres sera calculé automatiquement (pièces - 1 pour le salon)')}
                    >
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item {...restField} name={[name, 'bathrooms']} label={t('Salles de bain')}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item {...restField} name={[name, 'price']} label={t('Prix')}>
                      <InputNumber
                        placeholder={t('Ex: 50 000 000')}
                        min={0}
                        step={1000}
                        style={{ width: '100%' }}
                        formatter={value => formatNumberWithSpaces(value?.toString() || '')}
                        parser={
                          (value => {
                            if (value == null || value === '') return undefined as unknown as number;
                            const parsed = parseFormattedNumber(value);
                            const num = parseFloat(parsed);
                            return isNaN(num) ? (undefined as unknown as number) : num;
                          }) as (displayValue: string | undefined) => number
                        }
                      />
                    </Form.Item>

                    <Form.Item {...restField} name={[name, 'furnishingStatus']} label={t('Meublé')}>
                      <Select>
                        <Select.Option value="FURNISHED">{t('Meublé')}</Select.Option>
                        <Select.Option value="UNFURNISHED">{t('Non meublé')}</Select.Option>
                        <Select.Option value="PARTIALLY_FURNISHED">{t('Partiellement meublé')}</Select.Option>
                      </Select>
                    </Form.Item>

                    <Form.Item {...restField} name={[name, 'status']} label={t('Statut')}>
                      <Select showSearch optionFilterProp="children" defaultValue="AVAILABLE">
                        <Select.Option value="AVAILABLE">{t('Disponible')}</Select.Option>
                        <Select.Option value="RESERVED">{t('Réservé')}</Select.Option>
                        <Select.Option value="UNDER_OFFER">{t('Sous offre')}</Select.Option>
                        <Select.Option value="RENTED">{t('Loué')}</Select.Option>
                        <Select.Option value="SOLD">{t('Vendu')}</Select.Option>
                        <Select.Option value="ARCHIVED">{t('Archivé')}</Select.Option>
                      </Select>
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, 'mediaFiles']}
                      label={t('Photos et Vidéos')}
                      tooltip={t('Les médias ajoutés seront partagés par tous les appartements de ce groupe')}
                    >
                      <Upload
                        multiple
                        listType="picture-card"
                        beforeUpload={() => false} // Empêcher l'upload automatique
                        accept="image/*,video/*"
                        onChange={info => {
                          // Garder seulement les fichiers valides
                          const fileList = info.fileList.filter(file => file.status !== 'error');
                          form.setFieldValue(['apartmentGroups', name, 'mediaFiles'], fileList);
                        }}
                        onRemove={file => {
                          const currentFiles = form.getFieldValue(['apartmentGroups', name, 'mediaFiles']) || [];
                          const newFiles = currentFiles.filter((f: any) => f.uid !== file.uid);
                          form.setFieldValue(['apartmentGroups', name, 'mediaFiles'], newFiles);
                        }}
                      >
                        {(form.getFieldValue(['apartmentGroups', name, 'mediaFiles']) || []).length < 20 && (
                          <div>
                            <PlusOutlined />
                            <div style={{ marginTop: 8 }}>{t('Ajouter')}</div>
                          </div>
                        )}
                      </Upload>
                      <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                        {t('Format accepté: Images (JPG, PNG, etc.) et Vidéos (MP4, etc.)')}
                      </div>
                    </Form.Item>
                  </Card>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    {t("Ajouter un groupe d'appartements")}
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
