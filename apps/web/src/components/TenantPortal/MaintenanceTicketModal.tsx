import React, { useState } from 'react';
import { App, Modal, Form, Input, Select, Upload, Button, Space, Typography } from 'antd';
import { UploadOutlined, ToolOutlined, PlusOutlined } from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import type { UploadFile } from 'antd';
import { t } from '../../i18n/t';

const { TextArea } = Input;
const { Text } = Typography;

interface MaintenanceTicketModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function MaintenanceTicketModal({ open, onCancel, onSuccess }: MaintenanceTicketModalProps) {
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const handleSubmit = async (values: any) => {
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('category', values.category);
      formData.append('priority', values.priority);
      formData.append('description', values.description);

      if (values.locationDetails) {
        formData.append('locationDetails', values.locationDetails);
      }

      // Add files
      fileList.forEach(file => {
        if (file.originFileObj) {
          formData.append('attachments', file.originFileObj);
        }
      });

      await tenantPortalService.createMaintenanceTicket(formData);

      message.success(t('Ticket de maintenance créé avec succès'));
      form.resetFields();
      setFileList([]);
      onSuccess();
      onCancel();
    } catch (error: any) {
      message.error(error.response?.data?.message || t('Erreur lors de la création du ticket'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (info: any) => {
    let newFileList = [...info.fileList];
    // Keep only last 10 files
    newFileList = newFileList.slice(-10);
    setFileList(newFileList);
  };

  const beforeUpload = (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error(t('Vous ne pouvez télécharger que des images!'));
      return Upload.LIST_IGNORE;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error(t('Le fichier doit être inférieur à 5MB!'));
      return Upload.LIST_IGNORE;
    }
    return false; // Prevent auto upload
  };

  return (
    <Modal
      title={
        <Space>
          <ToolOutlined />
          <span>{t('Nouvelle demande de maintenance')}</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={700}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          priority: 'MEDIUM'
        }}
      >
        <Form.Item label={t('Titre')} name="title" rules={[{ required: true, message: t('Le titre est requis') }]}>
          <Input placeholder={t("Ex: Fuite d'eau dans la salle de bain")} />
        </Form.Item>

        <Form.Item
          label={t('Catégorie')}
          name="category"
          rules={[{ required: true, message: t('La catégorie est requise') }]}
        >
          <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner la catégorie')}>
            <Select.Option value="PLUMBING">{t('Plomberie')}</Select.Option>
            <Select.Option value="ELECTRICITY">{t('Électricité')}</Select.Option>
            <Select.Option value="AC">{t('Climatisation')}</Select.Option>
            <Select.Option value="OTHER">{t('Autre')}</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label={t('Priorité')}
          name="priority"
          rules={[{ required: true, message: t('La priorité est requise') }]}
        >
          <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner la priorité')}>
            <Select.Option value="LOW">{t('Basse')}</Select.Option>
            <Select.Option value="MEDIUM">{t('Moyenne')}</Select.Option>
            <Select.Option value="HIGH">{t('Haute')}</Select.Option>
            <Select.Option value="URGENT">{t('Urgente')}</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label={t('Description')}
          name="description"
          rules={[{ required: true, message: t('La description est requise') }]}
        >
          <TextArea rows={4} placeholder={t('Décrivez le problème en détail...')} />
        </Form.Item>

        <Form.Item label={t('Détails de localisation (optionnel)')} name="locationDetails">
          <Input placeholder={t('Ex: Chambre principale, côté fenêtre')} />
        </Form.Item>

        <Form.Item
          label={t('Photos')}
          name="attachments"
          extra={<Text type="secondary">{t('Images uniquement (max 10 fichiers, 5MB chacun)')}</Text>}
        >
          <Upload
            fileList={fileList}
            onChange={handleFileChange}
            beforeUpload={beforeUpload}
            maxCount={10}
            accept="image/*"
            listType="picture-card"
          >
            {fileList.length < 10 && (
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 8 }}>{t('Télécharger')}</div>
              </div>
            )}
          </Upload>
        </Form.Item>

        <Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onCancel}>{t('Annuler')}</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              {t('Créer le ticket')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
