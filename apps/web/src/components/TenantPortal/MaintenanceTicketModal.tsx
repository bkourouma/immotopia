import React, { useState } from 'react';
import { App, Modal, Form, Input, Select, Upload, Button, Space, Typography } from 'antd';
import { UploadOutlined, ToolOutlined, PlusOutlined } from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import type { UploadFile } from 'antd';

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

      message.success('Ticket de maintenance créé avec succès');
      form.resetFields();
      setFileList([]);
      onSuccess();
      onCancel();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Erreur lors de la création du ticket');
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
      message.error('Vous ne pouvez télécharger que des images!');
      return Upload.LIST_IGNORE;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('Le fichier doit être inférieur à 5MB!');
      return Upload.LIST_IGNORE;
    }
    return false; // Prevent auto upload
  };

  return (
    <Modal
      title={
        <Space>
          <ToolOutlined />
          <span>Nouvelle demande de maintenance</span>
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
        <Form.Item label="Titre" name="title" rules={[{ required: true, message: 'Le titre est requis' }]}>
          <Input placeholder="Ex: Fuite d'eau dans la salle de bain" />
        </Form.Item>

        <Form.Item label="Catégorie" name="category" rules={[{ required: true, message: 'La catégorie est requise' }]}>
          <Select placeholder="Sélectionner la catégorie">
            <Select.Option value="PLUMBING">Plomberie</Select.Option>
            <Select.Option value="ELECTRICITY">Électricité</Select.Option>
            <Select.Option value="AC">Climatisation</Select.Option>
            <Select.Option value="OTHER">Autre</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="Priorité" name="priority" rules={[{ required: true, message: 'La priorité est requise' }]}>
          <Select placeholder="Sélectionner la priorité">
            <Select.Option value="LOW">Basse</Select.Option>
            <Select.Option value="MEDIUM">Moyenne</Select.Option>
            <Select.Option value="HIGH">Haute</Select.Option>
            <Select.Option value="URGENT">Urgente</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="Description"
          name="description"
          rules={[{ required: true, message: 'La description est requise' }]}
        >
          <TextArea rows={4} placeholder="Décrivez le problème en détail..." />
        </Form.Item>

        <Form.Item label="Détails de localisation (optionnel)" name="locationDetails">
          <Input placeholder="Ex: Chambre principale, côté fenêtre" />
        </Form.Item>

        <Form.Item
          label="Photos"
          name="attachments"
          extra={<Text type="secondary">Images uniquement (max 10 fichiers, 5MB chacun)</Text>}
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
                <div style={{ marginTop: 8 }}>Télécharger</div>
              </div>
            )}
          </Upload>
        </Form.Item>

        <Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onCancel}>Annuler</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Créer le ticket
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
