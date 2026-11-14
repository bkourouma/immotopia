import React, { useEffect, useRef } from 'react';
import { Alert, Button, Collapse, Skeleton, Space, Tag, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { t } from '../../i18n/t';
import { requestCopilotOpen } from '../copilot-bridge';
import { helpEntryToPlainText } from '../excerpt';
import { useHelp } from '../help-context';
import { useHelpEntry } from '../registry';
import type { HelpEntry } from '../types';
import { HelpFeedback } from './HelpFeedback';

export interface HelpEntryViewProps {
  helpId: string;
}

const SECTION_TITLE_STYLE: React.CSSProperties = {
  margin: 0,
  marginBlockEnd: 'var(--space-2)',
  fontSize: 'var(--font-size-md, 15px)',
  fontWeight: 600
};

const LIST_STYLE: React.CSSProperties = { margin: 0, paddingInlineStart: 'var(--space-5, 20px)' };

/** Texte brut : un `<p>` par paragraphe (`\n\n`), jamais de HTML interprete. */
function Paragraphs({ text }: { text: string }) {
  const parts = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  return (
    <>
      {parts.map((part, index) => (
        <p key={index} style={{ margin: 0, marginBlockEnd: 'var(--space-2)', whiteSpace: 'pre-line' }}>
          {part}
        </p>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBlockEnd: 'var(--space-4)' }}>
      <h3 style={SECTION_TITLE_STYLE}>{title}</h3>
      {children}
    </section>
  );
}

function Definitions({ items }: { items: { term: string; description: string }[] }) {
  return (
    <dl style={{ margin: 0 }}>
      {items.map((item, index) => (
        <div key={index} style={{ marginBlockEnd: 'var(--space-2)' }}>
          <dt style={{ fontWeight: 600 }}>{item.term}</dt>
          <dd style={{ margin: 0 }}>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

function HowToRead({ data }: { data: NonNullable<HelpEntry['howToRead']> }) {
  const columns = data.columns ?? [];
  const statuses = data.statuses ?? [];
  const notes = data.notes ?? [];
  if (!columns.length && !statuses.length && !notes.length) return null;
  return (
    <Section title={t('Comment lire')}>
      {columns.length > 0 && <Definitions items={columns.map(c => ({ term: c.label, description: c.description }))} />}
      {statuses.length > 0 && (
        <Definitions items={statuses.map(s => ({ term: s.label, description: s.description }))} />
      )}
      {notes.length > 0 && (
        <ul style={LIST_STYLE}>
          {notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Steps({ steps }: { steps: NonNullable<HelpEntry['steps']> }) {
  return (
    <Section title={t('Procédure')}>
      <ol style={LIST_STYLE}>
        {steps.map((step, index) => (
          <li key={index} style={{ marginBlockEnd: 'var(--space-2)' }}>
            <strong>{step.title}</strong>
            {step.detail && <div>{step.detail}</div>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Consequences({ items }: { items: string[] }) {
  return (
    <Section title={t('Conséquences')}>
      <Alert
        type="warning"
        showIcon={false}
        style={{ borderInlineStart: '4px solid var(--color-warning, #faad14)' }}
        title={
          <ul style={LIST_STYLE}>
            {items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        }
      />
    </Section>
  );
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Section title={t('Questions fréquentes')}>
      <Collapse
        size="small"
        items={items.map((item, index) => ({
          key: String(index),
          label: item.q,
          children: <Paragraphs text={item.a} />
        }))}
      />
    </Section>
  );
}

function PackStatus({ feature }: { feature: string }) {
  const { featureAccess, tenantId } = useHelp();
  const access = featureAccess ? (featureAccess as Record<string, string>)[feature] : undefined;
  if (access === 'NONE') {
    return (
      <Space wrap size="small">
        <Tag color="error">{t('Non inclus dans votre pack')}</Tag>
        {tenantId && <Link to={`/tenant/${tenantId}/settings/abonnement`}>{t('Voir mon abonnement')}</Link>}
      </Space>
    );
  }
  if (access === 'READ_ONLY') return <Tag color="warning">{t('Lecture seule dans votre pack')}</Tag>;
  return <Typography.Text type="secondary">{t('Inclus dans votre pack')}</Typography.Text>;
}

function Permissions({ data }: { data: NonNullable<HelpEntry['permissions']> }) {
  const roles = data.roles ?? [];
  if (!roles.length && !data.note && !data.feature) return null;
  return (
    <Section title={t('Droits et pack nécessaires')}>
      {roles.length > 0 && (
        <p style={{ margin: 0, marginBlockEnd: 'var(--space-2)' }}>
          {t('Rôles concernés')} : {roles.join(', ')}
        </p>
      )}
      {data.note && <Paragraphs text={data.note} />}
      {data.feature && <PackStatus feature={data.feature} />}
    </Section>
  );
}

function RelatedLinks({ items }: { items: NonNullable<HelpEntry['related']> }) {
  const { tenantId, openHelp, closeHelp } = useHelp();
  const navigate = useNavigate();
  const visible = items.filter(item => !item.to?.includes(':tenantId') || tenantId);
  if (!visible.length) return null;
  const go = (to: string) => {
    navigate(to.replace(':tenantId', tenantId ?? ''));
    closeHelp();
  };
  return (
    <Section title={t('Voir aussi')}>
      <ul style={{ ...LIST_STYLE, listStyle: 'none', paddingInlineStart: 0 }}>
        {visible.map((item, index) => {
          const { helpId, to } = item;
          if (!helpId && !to) return null;
          return (
            <li key={index}>
              <Button type="link" style={{ padding: 0 }} onClick={() => (helpId ? openHelp(helpId) : go(to as string))}>
                {item.label}
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function EntryBody({ entry }: { entry: HelpEntry }) {
  return (
    <>
      <p
        style={{
          fontWeight: 500,
          fontSize: 'var(--font-size-md, 15px)',
          margin: 0,
          marginBlockEnd: 'var(--space-4)'
        }}
      >
        {entry.summary}
      </p>
      {entry.purpose && (
        <Section title={t('À quoi ça sert')}>
          <Paragraphs text={entry.purpose} />
        </Section>
      )}
      {entry.howToRead && <HowToRead data={entry.howToRead} />}
      {entry.steps && entry.steps.length > 0 && <Steps steps={entry.steps} />}
      {entry.consequences && entry.consequences.length > 0 && <Consequences items={entry.consequences} />}
      {entry.faq && entry.faq.length > 0 && <Faq items={entry.faq} />}
      {entry.permissions && <Permissions data={entry.permissions} />}
      {entry.related && entry.related.length > 0 && <RelatedLinks items={entry.related} />}
    </>
  );
}

function EntryActions({ entry }: { entry: HelpEntry }) {
  const { copilotAvailable, startTour, closeHelp } = useHelp();
  if (!entry.tour && !copilotAvailable) return null;
  const askCopilot = () => {
    requestCopilotOpen({
      draft: t('Pouvez-vous m’expliquer « {{titre}} » ?', { titre: entry.title }),
      helpId: entry.id,
      helpExcerpt: helpEntryToPlainText(entry)
    });
    closeHelp();
  };
  return (
    <Space wrap style={{ marginBlockEnd: 'var(--space-4)' }}>
      {entry.tour && (
        <Button
          onClick={() => {
            startTour(entry.id);
            closeHelp();
          }}
        >
          {t('Visite guidée')}
        </Button>
      )}
      {copilotAvailable && <Button onClick={askCopilot}>{t('Demander à ImmoCopilot')}</Button>}
    </Space>
  );
}

function ReadyEntry({ entry, fallback }: { entry: HelpEntry; fallback: boolean }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, [entry.id]);
  return (
    <article>
      {fallback && (
        <Typography.Paragraph type="secondary">
          {t("Cette aide n'est pas encore traduite dans votre langue : elle s'affiche en français.")}
        </Typography.Paragraph>
      )}
      <div {...(fallback ? { dir: 'ltr', lang: 'fr' } : {})} style={{ textAlign: 'start' }}>
        <h2 ref={titleRef} tabIndex={-1} style={{ margin: 0, marginBlockEnd: 'var(--space-2)', outline: 'none' }}>
          {entry.title}
        </h2>
        <EntryActions entry={entry} />
        <EntryBody entry={entry} />
      </div>
      <HelpFeedback helpId={entry.id} />
    </article>
  );
}

/** Fiche d'aide complete : sections dans l'ordre, uniquement celles qui ont des donnees. */
export function HelpEntryView({ helpId }: HelpEntryViewProps) {
  const { entry, status, fallback } = useHelpEntry(helpId);
  if (status === 'loading' || status === 'idle') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (status === 'missing' || !entry) {
    return <Typography.Text type="secondary">{t("Cette fiche d'aide est introuvable.")}</Typography.Text>;
  }
  return <ReadyEntry entry={entry} fallback={fallback} />;
}

export default HelpEntryView;
