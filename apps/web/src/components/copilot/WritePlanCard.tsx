import React, { useEffect, useId, useState } from 'react';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { Alert, Button, Card, Input, Space, Tag } from 'antd';
import { t } from '../../i18n/t';
import type { WritePlan, WritePlanState, CapabilityExecutedPayload } from '../../types/copilot';
import { requiredConfirmationWord } from '../../utils/copilot-write-plan';
import { WritePlanChangesTable } from './WritePlanChangesTable';
import { WritePlanPathParams, WritePlanQuery } from './WritePlanRouteParams';
import {
  formatCountdown,
  formatDecisionTime,
  formatStateReadTime,
  methodLabel,
  planModuleLabel,
  recordKindLabel,
  resultPreviewText,
  targetLabelText
} from './write-plan-format';

export interface WritePlanCardProps {
  plan: WritePlan;
  state: WritePlanState;
  result?: CapabilityExecutedPayload;
  error?: { code: string; message: string };
  decidedAt?: string;
  onApprove(proposalId: string, confirmation?: string): void;
  onRefuse(proposalId: string): void;
}

const sectionStyle: React.CSSProperties = { marginBlockStart: 12 };
const headingStyle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 600 };
const mutedStyle: React.CSSProperties = { color: 'var(--ant-color-text-secondary, #666)' };

/** Heure courante rafraîchie chaque seconde tant que `active` (décompte et expiration). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function bannerText(state: WritePlanState): string {
  switch (state) {
    case 'executed':
      return t('Action exécutée');
    case 'refused':
      return t("Action refusée — rien n'a été modifié");
    case 'expired':
      return t("Plan expiré — rien n'a été modifié");
    case 'failed':
      return t("L'action a échoué");
    default:
      return t("Action à valider — rien n'a encore été modifié");
  }
}

function SourceTag({ server }: { server: boolean }): React.ReactElement {
  return server ? (
    <Tag icon={<SafetyCertificateOutlined aria-hidden="true" />} color="blue">
      {t('Calculé par le serveur')}
    </Tag>
  ) : (
    <Tag>{t("Expliqué par l'assistant")}</Tag>
  );
}

function PlanContent({ plan }: { plan: WritePlan }): React.ReactElement {
  const stepsId = useId();
  const dataId = useId();
  const stateReadTime = formatStateReadTime(plan.stateReadAt);
  return (
    <>
      <section aria-labelledby={stepsId} style={sectionStyle}>
        <Space wrap size={8}>
          <h4 id={stepsId} style={headingStyle}>
            {t("Ce que l'assistant va faire")}
          </h4>
          <SourceTag server={false} />
        </Space>
        <ol style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>
          {plan.steps.map((step, index) => (
            <li key={index} style={{ overflowWrap: 'anywhere' }}>
              {step}
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby={dataId} style={sectionStyle}>
        <Space wrap size={8}>
          <h4 id={dataId} style={headingStyle}>
            {t('Données concernées')}
          </h4>
          <SourceTag server />
        </Space>
        {plan.target ? (
          <p style={{ margin: '6px 0' }}>
            <span style={mutedStyle}>{t('Enregistrement visé')} : </span>
            <strong>
              <bdi>{targetLabelText(plan.target.label)}</bdi>
            </strong>
            {plan.target.resolved ? null : <span style={mutedStyle}> ({t('non retrouvé par le serveur')})</span>}
          </p>
        ) : null}
        {stateReadTime ? (
          <p style={{ ...mutedStyle, margin: '6px 0', fontSize: 12 }}>
            {t('État lu à {{time}}', { time: stateReadTime })}. {t('Les données ont pu changer depuis.')}
          </p>
        ) : null}
        {plan.changes.length > 0 ? (
          <WritePlanChangesTable changes={plan.changes} />
        ) : (
          <p style={{ ...mutedStyle, margin: '6px 0' }}>{t('Aucun champ à comparer pour cette action.')}</p>
        )}
        {plan.changesTruncated ? (
          <p style={{ ...mutedStyle, margin: '6px 0' }}>
            {t('Liste tronquée : seuls les premiers champs sont affichés.')}
          </p>
        ) : null}
      </section>
      <WritePlanPathParams pathParams={plan.pathParams} hasTarget={plan.target !== null} />
      <WritePlanQuery query={plan.query} />
    </>
  );
}

function Warnings({ warnings }: { warnings: string[] }): React.ReactElement | null {
  const id = useId();
  if (warnings.length === 0) return null;
  return (
    <section aria-labelledby={id} style={sectionStyle}>
      <Space wrap size={8}>
        <h4 id={id} style={headingStyle}>
          {t('Avertissements')}
        </h4>
        <SourceTag server />
      </Space>
      <ul style={{ margin: '6px 0 0', paddingInlineStart: 0, listStyle: 'none' }}>
        {warnings.map((w, index) => (
          <li key={index} style={{ overflowWrap: 'anywhere' }}>
            <WarningOutlined
              aria-hidden="true"
              style={{ marginInlineEnd: 6, color: 'var(--ant-color-warning, #faad14)' }}
            />
            {w}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Outcome({
  state,
  result,
  error,
  decidedAt
}: Pick<WritePlanCardProps, 'state' | 'result' | 'error' | 'decidedAt'>): React.ReactElement | null {
  const time = formatDecisionTime(decidedAt);
  const preview = result ? resultPreviewText(result.resultPreview) : null;
  let alert: React.ReactNode = null;
  if (state === 'executed') {
    alert = (
      <Alert type="success" showIcon title={t('Exécuté')} description={result?.message || t('Action exécutée.')} />
    );
  } else if (state === 'failed') {
    alert = (
      <Alert
        type="error"
        showIcon
        title={t("L'action n'a pas été exécutée")}
        description={error?.message ?? result?.message ?? t("L'action n'a pas pu être effectuée.")}
      />
    );
  } else if (state === 'refused') {
    alert = <Alert type="info" showIcon title={t('Refusé')} description={t("Aucune modification n'a été faite.")} />;
  } else if (state === 'expired') {
    alert = (
      <Alert
        type="warning"
        showIcon
        title={t('Expiré')}
        description={error?.message ?? t('Ce plan a expiré. Demandez-le de nouveau.')}
      />
    );
  }
  return (
    <div role="status" aria-live="polite" data-testid="copilot-write-plan-status" style={{ marginBlockStart: 12 }}>
      {alert}
      {time ? (
        <p style={{ ...mutedStyle, margin: '6px 0 0', fontSize: 12 }}>
          {t('Décision enregistrée le {{date}}', { date: time })}
        </p>
      ) : null}
      {preview ? (
        <details style={{ marginBlockStart: 6 }}>
          <summary>{t("Voir l'aperçu du résultat")}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, margin: '6px 0 0' }}>
            {preview}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Carte d'accord d'un plan d'écriture : montre ce qui sera modifié AVANT toute
 * écriture. `title` et `steps` viennent du modèle (texte brut, jamais en HTML) ;
 * cible, avant/après et avertissements sont calculés par le serveur.
 */
export function WritePlanCard({
  plan,
  state,
  result,
  error,
  decidedAt,
  onApprove,
  onRefuse
}: WritePlanCardProps): React.ReactElement {
  const bannerId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const open = state === 'pending' || state === 'approving';
  const now = useNow(state === 'pending');
  const target = Date.parse(plan.expiresAt);
  const msLeft = Number.isFinite(target) ? target - now : Number.POSITIVE_INFINITY;
  const timeExpired = state === 'pending' && msLeft <= 0;
  const actionable = state === 'pending' && !timeExpired;
  const word = requiredConfirmationWord(plan);
  const wordOk = word === null || typed === word;
  const countdown = Number.isFinite(msLeft) ? formatCountdown(msLeft) : null;

  const bannerState: WritePlanState = timeExpired ? 'expired' : state;
  const frozen = !open;
  const BannerIcon = state === 'executed' ? CheckCircleOutlined : ExclamationCircleOutlined;

  return (
    <Card size="small" data-testid="copilot-write-plan-card" styles={{ body: { paddingBlock: 12 } }}>
      <div
        role="group"
        aria-labelledby={bannerId}
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '8px 12px',
          borderRadius: 6,
          marginBlockEnd: 12,
          background: frozen ? 'var(--ant-color-fill-tertiary, #f5f5f5)' : 'var(--ant-color-warning-bg, #fffbe6)',
          border: '1px solid var(--ant-color-border-secondary, #f0f0f0)'
        }}
      >
        <BannerIcon aria-hidden="true" />
        <strong id={bannerId}>{bannerText(bannerState)}</strong>
      </div>

      <h3 style={{ margin: 0, fontSize: 16, overflowWrap: 'anywhere' }}>{plan.title}</h3>
      <Space wrap size={[8, 4]} style={{ marginBlockStart: 6 }}>
        <Tag color={plan.sensitive ? 'red' : 'default'}>{recordKindLabel(plan.recordKind)}</Tag>
        {plan.module ? (
          <span style={mutedStyle}>
            {t('Module')} : {planModuleLabel(plan.module)}
          </span>
        ) : null}
        <span style={mutedStyle}>{methodLabel(plan.method)}</span>
      </Space>

      <PlanContent plan={plan} />
      <Warnings warnings={plan.warnings} />

      {plan.sensitive ? (
        <Alert
          type="error"
          showIcon
          style={sectionStyle}
          title={t('Action sensible')}
          description={plan.sensitiveReason || t('Cette action a des effets difficiles à annuler.')}
        />
      ) : null}

      {frozen ? <Outcome state={state} result={result} error={error} decidedAt={decidedAt} /> : null}

      {open ? (
        <>
          {word !== null ? (
            <div style={sectionStyle}>
              <label htmlFor={inputId} style={{ display: 'block', marginBlockEnd: 4 }}>
                {t('Pour approuver, saisissez le mot {{word}}', { word })}
              </label>
              <Input
                id={inputId}
                value={typed}
                disabled={!actionable}
                autoComplete="off"
                spellCheck={false}
                onChange={e => setTyped(e.target.value)}
                // Entrée dans ce champ ne doit jamais approuver : seul le bouton le fait.
                onKeyDown={e => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
                style={{ maxWidth: 240 }}
              />
            </div>
          ) : null}
          {state === 'pending' && error ? (
            <Alert type="warning" showIcon style={sectionStyle} title={error.message} />
          ) : null}
          <Space style={{ marginBlockStart: 12 }} wrap>
            <Button
              type="primary"
              loading={state === 'approving'}
              disabled={!actionable || !wordOk}
              onClick={() => onApprove(plan.proposalId, word !== null ? typed : undefined)}
            >
              {t('Approuver et exécuter')}
            </Button>
            <Button disabled={!actionable} onClick={() => onRefuse(plan.proposalId)}>
              {t('Refuser')}
            </Button>
          </Space>
          <p role="timer" style={{ ...mutedStyle, margin: '8px 0 0', fontSize: 12 }}>
            {timeExpired
              ? t('Ce plan a expiré. Demandez-le de nouveau.')
              : countdown
                ? t('Expire dans {{time}}', { time: countdown })
                : null}
          </p>
        </>
      ) : null}
    </Card>
  );
}

export default WritePlanCard;
