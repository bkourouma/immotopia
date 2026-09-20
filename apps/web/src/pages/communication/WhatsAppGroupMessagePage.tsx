import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Alert, Button, Card, Col, Divider, Popover, Row, Space, Tag, Typography } from 'antd';
import {
  BoldOutlined,
  CodeOutlined,
  DeleteOutlined,
  ItalicOutlined,
  PictureOutlined,
  SendOutlined,
  SmileOutlined,
  StrikethroughOutlined
} from '@ant-design/icons';
import { whatsappNotificationConfigService } from '../../services/whatsapp-notification-config-service';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

const QUICK_EMOJIS = ['😀', '😄', '😍', '🙏', '🔥', '✅', '🎉', '📣', '🏠', '💰', '📞', '📍', '⏰', '⚡', '👋', '🚀'];

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : t("Erreur lors de l'envoi");
}

export function WhatsAppGroupMessagePage() {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [composerText, setComposerText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const previewUrl = useMemo(() => (selectedImage ? URL.createObjectURL(selectedImage) : ''), [selectedImage]);
  const canSend = composerText.trim().length > 0 || Boolean(selectedImage);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const focusComposer = () => {
    textAreaRef.current?.focus();
  };

  const insertAtCursor = (value: string) => {
    const textarea = textAreaRef.current;
    if (!textarea) {
      setComposerText(prev => `${prev}${value}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = composerText.slice(0, start) + value + composerText.slice(end);
    const caret = start + value.length;

    setComposerText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const wrapSelection = (prefix: string, suffix = prefix) => {
    const textarea = textAreaRef.current;
    if (!textarea) {
      setComposerText(prev => `${prev}${prefix}${suffix}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = composerText.slice(start, end);
    const leadingSpaces = selected.match(/^\s*/)?.[0] || '';
    const trailingSpaces = selected.match(/\s*$/)?.[0] || '';
    const core = selected.slice(leadingSpaces.length, selected.length - trailingSpaces.length);
    const wrappedCore = core ? `${prefix}${core}${suffix}` : `${prefix}${suffix}`;
    const replacement = `${leadingSpaces}${wrappedCore}${trailingSpaces}`;
    const next = composerText.slice(0, start) + replacement + composerText.slice(end);
    const selectionStart = start + leadingSpaces.length + prefix.length;
    const selectionEnd = selectionStart + core.length;

    setComposerText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const openImagePicker = () => {
    fileInputRef.current?.click();
  };

  const onSelectImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      message.error(t('Veuillez choisir une image'));
      event.target.value = '';
      return;
    }
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimeTypes.includes(file.type)) {
      message.error(t('Format non supporte. Utilisez JPEG ou PNG'));
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error(t('Image trop volumineuse (max 5MB)'));
      event.target.value = '';
      return;
    }

    setSelectedImage(file);
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    if (!tenantId) return;
    if (!canSend) {
      message.warning(t('Ajoutez un texte ou une image'));
      return;
    }

    setSending(true);
    try {
      const payload = {
        message: composerText,
        image: selectedImage
      };
      const result = await whatsappNotificationConfigService.sendGroupBroadcast(tenantId, payload);
      const providerLabel = result.provider || 'WhatsApp';
      const fallbackNote = result.usedFallbackTextOnly ? ' (image non envoyee, texte envoye)' : '';
      message.success(
        t('Message envoye via {{providerLabel}}{{fallbackNote}}', {
          providerLabel: providerLabel,
          fallbackNote: fallbackNote
        })
      );
      setComposerText('');
      clearImage();
    } catch (error: unknown) {
      message.error(extractErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const emojiPanel = (
    <div style={{ maxWidth: 260 }}>
      <Space size={[6, 6]} wrap>
        {QUICK_EMOJIS.map(item => (
          <Button key={item} size="small" onClick={() => insertAtCursor(item)}>
            {item}
          </Button>
        ))}
      </Space>
    </div>
  );

  return (
    <>
      <Card>
        <Space align="center" style={{ marginBottom: 8 }}>
          <PictureOutlined style={{ color: '#25D366', fontSize: 20 }} />
          <Title level={4} style={{ margin: 0 }}>
            {t('Message Groupe WhatsApp')}
          </Title>
        </Space>
        <Text type="secondary">
          {t('Envoyez un message spontane au groupe configure dans')} <code>WHATSAPP_GROUP_BROADCAST_TO</code>.
        </Text>
        <Alert
          showIcon
          type="info"
          style={{ marginTop: 12 }}
          message={t('Format WhatsApp')}
          description={t(
            'Utilisez les boutons: ils inserent le format WhatsApp (*gras*, _italique_, ~barre~, `code`). Evitez d inclure les espaces a l interieur des symboles.'
          )}
        />

        <Divider />

        <Space size={[8, 8]} wrap style={{ marginBottom: 12 }}>
          <Button size="small" icon={<BoldOutlined />} onClick={() => wrapSelection('*')}>
            {t('Gras')}
          </Button>
          <Button size="small" icon={<ItalicOutlined />} onClick={() => wrapSelection('_')}>
            {t('Italique')}
          </Button>
          <Button size="small" icon={<StrikethroughOutlined />} onClick={() => wrapSelection('~')}>
            {t('Barre')}
          </Button>
          <Button size="small" icon={<CodeOutlined />} onClick={() => wrapSelection('`')}>
            {t('Code')}
          </Button>
          <Popover content={emojiPanel} trigger="click" placement="bottomLeft">
            <Button size="small" icon={<SmileOutlined />}>
              {t('Emojis')}
            </Button>
          </Popover>
          <Button size="small" icon={<PictureOutlined />} onClick={openImagePicker}>
            {t('Image')}
          </Button>
          <Button size="small" onClick={() => insertAtCursor('\n- ')}>
            {t('Liste')}
          </Button>
        </Space>

        <textarea
          ref={textAreaRef}
          value={composerText}
          onChange={event => setComposerText(event.target.value)}
          onClick={focusComposer}
          placeholder={t('Tapez votre message WhatsApp...')}
          rows={8}
          style={{
            width: '100%',
            border: '1px solid #d9d9d9',
            borderRadius: 12,
            padding: 14,
            fontSize: 15,
            lineHeight: 1.5,
            resize: 'vertical',
            background: '#f5f8f6'
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          style={{ display: 'none' }}
          onChange={onSelectImage}
        />

        <div style={{ marginTop: 8 }}>
          <Tag color="default">{composerText.length} caracteres</Tag>
          {selectedImage ? <Tag color="green">Image: {selectedImage.name}</Tag> : null}
        </div>

        {selectedImage && previewUrl && (
          <Card size="small" style={{ marginTop: 12 }}>
            <Row gutter={12} align="middle">
              <Col xs={24} md={14}>
                <img
                  src={previewUrl}
                  alt={t('Apercu')}
                  style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 8 }}
                />
              </Col>
              <Col xs={24} md={10}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('Image jointe')}
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  {t('Cette image sera envoyee avec votre message comme legende.')}
                </Text>
                <Button icon={<DeleteOutlined />} onClick={clearImage}>
                  {t('Retirer l image')}
                </Button>
              </Col>
            </Row>
          </Card>
        )}

        <Divider />

        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Text type="secondary">{t('Le message part vers votre destination groupe configuree sur WaSender.')}</Text>
          <Button
            type="primary"
            icon={<SendOutlined />}
            size="large"
            loading={sending}
            disabled={!canSend}
            onClick={handleSend}
          >
            {t('Envoyer au groupe')}
          </Button>
        </Space>
      </Card>
    </>
  );
}
