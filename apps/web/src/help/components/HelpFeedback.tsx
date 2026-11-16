import React, { useEffect, useState } from 'react';
import { Button, Input, Space, Typography } from 'antd';
import { t } from '../../i18n/t';
import { sendHelpFeedback } from '../feedback-api';
import { currentHelpLanguage } from '../registry';

export interface HelpFeedbackProps {
  helpId: string;
}

type Step = 'ask' | 'form' | 'thanks';

const QUESTION_MAX = 1000;

function useFeedbackFlow(helpId: string) {
  const [step, setStep] = useState<Step>('ask');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setStep('ask');
    setText('');
    setSending(false);
    setFailed(false);
  }, [helpId]);

  const send = async (extra: { useful?: boolean; question?: string }): Promise<boolean> => {
    setSending(true);
    setFailed(false);
    try {
      await sendHelpFeedback({
        helpId,
        ...extra,
        path: window.location.pathname,
        locale: currentHelpLanguage()
      });
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setSending(false);
    }
  };

  const vote = async (useful: boolean) => {
    const ok = await send({ useful });
    if (useful && ok) setStep('thanks');
    if (!useful) {
      setStep('form');
    }
  };

  const submitQuestion = async () => {
    const question = text.trim();
    if (!question) return;
    if (await send({ question })) setStep('thanks');
  };

  const openQuestion = () => {
    setFailed(false);
    setStep('form');
  };

  return { step, text, setText, sending, failed, vote, submitQuestion, openQuestion };
}

function QuestionForm(props: {
  text: string;
  onChange: (value: string) => void;
  sending: boolean;
  onSubmit: () => void;
}) {
  const { text, onChange, sending, onSubmit } = props;
  const label = t('Que manque-t-il ? (facultatif)');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label htmlFor="help-feedback-question">{label}</label>
      <Input.TextArea
        id="help-feedback-question"
        value={text}
        maxLength={QUESTION_MAX}
        showCount
        autoSize={{ minRows: 3, maxRows: 6 }}
        onChange={event => onChange(event.target.value)}
      />
      <div style={{ textAlign: 'end' }}>
        <Button type="primary" loading={sending} disabled={sending || !text.trim()} onClick={onSubmit}>
          {t('Envoyer')}
        </Button>
      </div>
    </div>
  );
}

/** Avis sur une fiche : utile / pas utile, et question non couverte. */
export function HelpFeedback({ helpId }: HelpFeedbackProps) {
  const flow = useFeedbackFlow(helpId);
  const { step, sending } = flow;

  if (step === 'thanks') {
    return (
      <section aria-live="polite" style={{ marginBlockStart: 'var(--space-4)' }}>
        <Typography.Text type="secondary">{t('Merci pour votre retour.')}</Typography.Text>
      </section>
    );
  }

  return (
    <section
      aria-label={t('Votre avis')}
      style={{
        marginBlockStart: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)'
      }}
    >
      {step === 'ask' && (
        <>
          <Typography.Text strong>{t('Cette aide vous a-t-elle été utile ?')}</Typography.Text>
          <Space wrap>
            <Button disabled={sending} onClick={() => void flow.vote(true)}>
              {t('Oui')}
            </Button>
            <Button disabled={sending} onClick={() => void flow.vote(false)}>
              {t('Non')}
            </Button>
            <Button type="link" disabled={sending} onClick={flow.openQuestion}>
              {t("Ma question n'est pas couverte")}
            </Button>
          </Space>
        </>
      )}
      {step === 'form' && (
        <QuestionForm
          text={flow.text}
          onChange={flow.setText}
          sending={sending}
          onSubmit={() => void flow.submitQuestion()}
        />
      )}
      {flow.failed && (
        <Typography.Text type="secondary" role="status">
          {t("Votre retour n'a pas pu être envoyé. Vous pouvez réessayer plus tard.")}
        </Typography.Text>
      )}
    </section>
  );
}

export default HelpFeedback;
