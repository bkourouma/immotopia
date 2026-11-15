import { useState } from 'react';
import { Button, Input, Modal, Radio } from 'antd';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import { copilotService } from '../../services/copilot-service';
import type { CopilotUiMessage, ResponseFeedback } from '../../types/copilot';

interface Props {
  tenantId: string;
  conversationId: string;
  rating: NonNullable<CopilotUiMessage['rating']>;
}

export function ResponseFeedbackButton({ tenantId, conversationId, rating }: Props) {
  const { t } = useAssistantTranslation();
  const [saved, setSaved] = useState(rating.previous);
  const [draft, setDraft] = useState<{ helpful?: boolean; comment: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    if (pending || draft?.helpful === undefined) return;
    const vote: ResponseFeedback = { revision: rating.revision, helpful: draft.helpful, comment: draft.comment.trim() };
    setError(false);
    setPending(true);
    try {
      await copilotService.saveResponseFeedback(tenantId, conversationId, rating.turnId, vote);
      setSaved(vote);
      setDraft(undefined);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="text"
        size="small"
        onClick={() => {
          setError(false);
          setDraft({ helpful: saved?.helpful, comment: saved?.comment ?? '' });
        }}
      >
        {saved ? t('Modifier mon avis') : t('Donner un avis')}
      </Button>
      <Modal
        open={!!draft}
        title={t('Cette réponse vous a-t-elle été utile ?')}
        onCancel={() => {
          if (!pending) setDraft(undefined);
        }}
        onOk={() => void submit()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={pending}
        okButtonProps={{ disabled: draft?.helpful === undefined }}
      >
        {draft && (
          <>
            <Radio.Group
              value={draft.helpful}
              disabled={pending}
              onChange={event => setDraft({ ...draft, helpful: event.target.value })}
            >
              <Radio value={true}>{t('Utile')}</Radio>
              <Radio value={false}>{t('Peu utile')}</Radio>
            </Radio.Group>
            <Input.TextArea
              aria-label={t('Commentaire facultatif')}
              placeholder={t('Commentaire facultatif')}
              value={draft.comment}
              onChange={event => setDraft({ ...draft, comment: event.target.value })}
              maxLength={1000}
              disabled={pending}
              style={{ marginBlockStart: 12 }}
            />
            {error && <p role="alert">{t('Votre avis n’a pas pu être enregistré.')}</p>}
          </>
        )}
      </Modal>
    </>
  );
}
