import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatNumber } from '../../i18n/format';
import { WritePlanCard } from '../../components/copilot/WritePlanCard';
import { CopilotMessageList } from '../../components/copilot/CopilotMessageList';
import type { CapabilityExecutedPayload, WritePlan } from '../../types/copilot';

const future = () => new Date(Date.now() + 5 * 60_000).toISOString();

function makePlan(over: Partial<WritePlan> = {}): WritePlan {
  return {
    proposalId: 'wp1',
    token: 'jeton-plan',
    expiresAt: future(),
    action: 'EXECUTE_CAPABILITY',
    capabilityId: 'PATCH /contacts/:id',
    method: 'PATCH',
    module: 'CRM',
    title: 'Mettre à jour le contact',
    steps: ['Lire le contact', 'Modifier le téléphone'],
    recordKind: 'update',
    target: { label: 'Awa Diop', resolved: true },
    changes: [
      { field: 'phone', before: '0102', after: '0304' },
      { field: 'active', before: false, after: true },
      { field: 'score', before: 1200, after: 3400 },
      { field: 'email', before: '[masqué]', after: '[masqué]' }
    ],
    warnings: ['Le contact est lié à 2 baux.'],
    sensitive: false,
    requiresTypedConfirmation: false,
    ...over
  };
}

function setup(plan: WritePlan, props: Partial<React.ComponentProps<typeof WritePlanCard>> = {}) {
  const onApprove = vi.fn();
  const onRefuse = vi.fn();
  const view = render(
    <WritePlanCard plan={plan} state="pending" onApprove={onApprove} onRefuse={onRefuse} {...props} />
  );
  return { onApprove, onRefuse, ...view };
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.useRealTimers());

describe('WritePlanCard : rendu', () => {
  it("annonce que rien n'a été modifié, dans un groupe nommé", () => {
    setup(makePlan());
    const group = screen.getByRole('group', { name: /Action à valider — rien n'a encore été modifié/ });
    expect(group).toBeInTheDocument();
  });

  it.each([
    ['create', 'Création'],
    ['update', 'Modification'],
    ['action', 'Action']
  ] as const)('traduit le type %s en « %s »', (recordKind, label) => {
    setup(makePlan({ recordKind }));
    expect(screen.getByText(label, { selector: '.ant-tag' })).toBeInTheDocument();
    expect(screen.getByText(/Module : CRM/)).toBeInTheDocument();
    expect(screen.getByText(/PATCH/)).toBeInTheDocument();
  });

  it('étiquette la provenance des sections et numérote les étapes', () => {
    setup(makePlan());
    expect(screen.getByText("Expliqué par l'assistant")).toBeInTheDocument();
    expect(screen.getAllByText('Calculé par le serveur').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Lire le contact').closest('ol')).not.toBeNull();
  });

  it('affiche la cible, le tableau avant/après et les avertissements', () => {
    setup(makePlan());
    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Champ' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Avant' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Après' })).toBeInTheDocument();
    const rows = screen.getAllByTestId('write-plan-change');
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText('0102')).toBeInTheDocument();
    expect(within(rows[0]).getByText('0304')).toBeInTheDocument();
    // Booléens et nombres formatés ; « [masqué] » tel quel.
    expect(within(rows[1]).getByText('Non')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Oui')).toBeInTheDocument();
    expect(rows[2].textContent).toContain(formatNumber(1200));
    expect(rows[2].textContent).toContain(formatNumber(3400));
    expect(within(rows[3]).getAllByText('[masqué]')).toHaveLength(2);
    expect(screen.getByText('Le contact est lié à 2 baux.')).toBeInTheDocument();
  });

  it('création : « — » en Avant', () => {
    setup(
      makePlan({
        recordKind: 'create',
        target: null,
        changes: [{ field: 'name', before: undefined, after: 'Nouveau' }]
      })
    );
    const row = screen.getByTestId('write-plan-change');
    expect(within(row).getByLabelText(/Aucune valeur avant/)).toHaveTextContent('—');
    expect(within(row).getByText('Nouveau')).toBeInTheDocument();
  });

  it('formate les dates avec la langue active', () => {
    setup(makePlan({ changes: [{ field: 'start', before: null, after: '2026-03-01' }] }));
    const row = screen.getByTestId('write-plan-change');
    expect(within(row).getByText('(vide)')).toBeInTheDocument();
    expect(row.textContent).not.toContain('2026-03-01');
    expect(row.textContent).toMatch(/2026/);
  });

  it('replie les valeurs longues', async () => {
    const long = 'x'.repeat(300);
    setup(makePlan({ changes: [{ field: 'notes', before: 'court', after: long }] }));
    const row = screen.getByTestId('write-plan-change');
    expect(row.textContent).not.toContain(long);
    await userEvent.click(within(row).getByRole('button', { name: 'Voir plus' }));
    expect(row.textContent).toContain(long);
    expect(within(row).getByRole('button', { name: 'Voir moins' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('signale une liste tronquée et une cible non résolue', () => {
    setup(makePlan({ changesTruncated: true, target: { label: 'Inconnu', resolved: false } }));
    expect(screen.getByText(/Liste tronquée/)).toBeInTheDocument();
    expect(screen.getByText(/non retrouvé par le serveur/)).toBeInTheDocument();
  });

  it('rend le texte du modèle comme texte brut (pas de HTML)', () => {
    const { container } = setup(
      makePlan({
        title: '<img src=x onerror=alert(1)>Titre',
        steps: ['<b>gras</b> <script>alert(1)</script>']
      })
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('li b')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>Titre')).toBeInTheDocument();
    expect(screen.getByText(/<b>gras<\/b>/)).toBeInTheDocument();
  });
});

describe('WritePlanCard : contrat serveur étendu', () => {
  it('affiche paramètres de requête, éléments visés (monospace) et heure de lecture', () => {
    setup(
      makePlan({
        query: [
          { key: 'notify', value: 'true' },
          { key: 'token', value: '[masqué]' }
        ],
        pathParams: [{ name: 'id', value: 'c0ffee-123' }],
        stateReadAt: '2026-03-01T10:05:00Z'
      })
    );
    const query = screen.getByTestId('write-plan-query');
    expect(within(query).getByText('Paramètres envoyés à la route')).toBeInTheDocument();
    expect(within(query).getByRole('columnheader', { name: 'Clé' })).toBeInTheDocument();
    expect(within(query).getByRole('columnheader', { name: 'Valeur' })).toBeInTheDocument();
    expect(within(query).getAllByTestId('write-plan-query-row')).toHaveLength(2);
    expect(within(query).getByText('[masqué]')).toBeInTheDocument();
    expect(within(query).getByText(/champ protégé/)).toBeInTheDocument();
    const ids = screen.getByTestId('write-plan-path-params');
    expect(within(ids).getByText('Éléments visés')).toBeInTheDocument();
    expect(within(ids).getByText('c0ffee-123').tagName).toBe('CODE');
    expect(within(ids).queryByText(/parent/)).toBeNull();
    expect(screen.getByText(/État lu à/)).toHaveTextContent('Les données ont pu changer depuis.');
    // Les avertissements serveur restent affichés.
    expect(screen.getByText('Le contact est lié à 2 baux.')).toBeInTheDocument();
  });

  it('sans cible : mention « parent : » devant les identifiants', () => {
    setup(makePlan({ target: null, pathParams: [{ name: 'contactId', value: 'abc' }] }));
    expect(within(screen.getByTestId('write-plan-path-params')).getByText(/parent/)).toBeInTheDocument();
  });

  it('champ protégé dans le tableau : icône et texte accessible, pas la seule valeur', () => {
    setup(makePlan());
    const row = screen.getAllByTestId('write-plan-change')[3];
    expect(within(row).getAllByText(/champ protégé/)).toHaveLength(2);
    expect(row.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('sections absentes quand le serveur ne les fournit pas', () => {
    setup(makePlan({ query: [], pathParams: undefined }));
    expect(screen.queryByTestId('write-plan-query')).toBeNull();
    expect(screen.queryByTestId('write-plan-path-params')).toBeNull();
    expect(screen.queryByText(/État lu à/)).toBeNull();
  });

  it('sensible=false mais requiresTypedConfirmation=true : mot exigé', async () => {
    const { onApprove } = setup(makePlan({ sensitive: false, requiresTypedConfirmation: true }));
    const approve = screen.getByRole('button', { name: 'Approuver et exécuter' });
    expect(approve).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/saisissez le mot CONFIRMER/), 'CONFIRMER');
    expect(approve).toBeEnabled();
    await userEvent.click(approve);
    expect(onApprove).toHaveBeenCalledWith('wp1', 'CONFIRMER');
  });

  it('en attente avec erreur de confirmation : message visible, boutons actifs', () => {
    setup(makePlan({ requiresTypedConfirmation: true }), {
      error: { code: 'CONFIRMATION_REQUIRED', message: 'Saisissez le mot de confirmation' }
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez le mot de confirmation');
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeEnabled();
  });
});

describe('WritePlanCard : décision', () => {
  it("Approuver appelle le rappel avec l'identifiant, sans confirmation", async () => {
    const { onApprove, onRefuse } = setup(makePlan());
    await userEvent.click(screen.getByRole('button', { name: 'Approuver et exécuter' }));
    expect(onApprove).toHaveBeenCalledWith('wp1', undefined);
    expect(onRefuse).not.toHaveBeenCalled();
  });

  it('Refuser appelle uniquement le rappel de refus', async () => {
    const { onApprove, onRefuse } = setup(makePlan());
    await userEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(onRefuse).toHaveBeenCalledWith('wp1');
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("Échap n'approuve jamais", async () => {
    const { onApprove } = setup(makePlan());
    screen.getByRole('button', { name: 'Approuver et exécuter' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("plan sensible : désactivé tant que le mot exact n'est pas saisi, puis envoie la confirmation", async () => {
    const { onApprove } = setup(
      makePlan({
        sensitive: true,
        sensitiveReason: 'Envoie un e-mail à 40 personnes.',
        requiresTypedConfirmation: true,
        confirmationWord: 'CONFIRMER'
      })
    );
    expect(screen.getByText('Envoie un e-mail à 40 personnes.')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approuver et exécuter' });
    expect(approve).toBeDisabled();
    const input = screen.getByLabelText(/saisissez le mot CONFIRMER/);
    await userEvent.type(input, 'confirmer');
    expect(approve).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'CONFIRMER');
    expect(approve).toBeEnabled();
    await userEvent.click(approve);
    expect(onApprove).toHaveBeenCalledWith('wp1', 'CONFIRMER');
  });

  it("Entrée dans le champ de confirmation n'approuve pas", async () => {
    const { onApprove } = setup(
      makePlan({ sensitive: true, requiresTypedConfirmation: true, confirmationWord: 'CONFIRMER' })
    );
    const input = screen.getByLabelText(/saisissez le mot/);
    await userEvent.type(input, 'CONFIRMER{Enter}');
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("désactive les boutons et le décompte à l'expiration", () => {
    vi.useFakeTimers();
    const soon = new Date(Date.now() + 2500).toISOString();
    setup(makePlan({ expiresAt: soon }));
    expect(screen.getByText(/Expire dans/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approuver et exécuter' })).toBeEnabled();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.getByRole('button', { name: 'Approuver et exécuter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeDisabled();
    expect(screen.getAllByText(/expiré/).length).toBeGreaterThan(0);
  });

  it('plan déjà expiré : bouton désactivé dès le rendu', () => {
    setup(makePlan({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    expect(screen.getByRole('button', { name: 'Approuver et exécuter' })).toBeDisabled();
  });
});

describe('WritePlanCard : états figés', () => {
  const result: CapabilityExecutedPayload = {
    kind: 'capability',
    proposalId: 'wp1',
    ok: true,
    status: 200,
    message: 'Contact mis à jour.',
    resultPreview: { html: '<img src=x onerror=alert(1)>' }
  };

  it('exécuté : message, heure et aperçu replié en texte brut', () => {
    const { container } = setup(makePlan(), { state: 'executed', result, decidedAt: '2026-03-01T10:00:00Z' });
    expect(screen.getByText('Contact mis à jour.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Action exécutée/ })).toBeInTheDocument();
    expect(screen.getByText(/Décision enregistrée le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approuver et exécuter' })).toBeNull();
    const details = container.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(container.querySelector('img')).toBeNull();
    expect(details.querySelector('pre')?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('échec : message clair, pas de bouton', () => {
    setup(makePlan(), {
      state: 'failed',
      result: { ...result, ok: false, status: 422, message: 'Téléphone invalide.' },
      error: { code: 'EXECUTION_FAILED', message: 'Téléphone invalide.' }
    });
    expect(screen.getByText('Téléphone invalide.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull();
  });

  it('refusé : statut local', () => {
    setup(makePlan(), { state: 'refused', decidedAt: '2026-03-01T10:00:00Z' });
    expect(screen.getByRole('group', { name: /Action refusée — rien n'a été modifié/ })).toBeInTheDocument();
    expect(screen.getByText('Refusé')).toBeInTheDocument();
  });

  it('en cours : bouton en chargement, pas de second clic possible', () => {
    const { onApprove } = setup(makePlan(), { state: 'approving' });
    const approve = screen.getByRole('button', { name: /Approuver et exécuter/ });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeDisabled();
  });
});

describe("CopilotMessageList : plan d'écriture", () => {
  it('rend la carte et relaie approbation et refus', async () => {
    const onApprovePlan = vi.fn();
    const onRefusePlan = vi.fn();
    render(
      <CopilotMessageList
        tenantId="t1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onApprovePlan={onApprovePlan}
        onRefusePlan={onRefusePlan}
        messages={[
          {
            id: 'm1',
            role: 'assistant',
            text: '',
            attachments: [{ kind: 'write_plan', plan: makePlan(), state: 'pending' }]
          }
        ]}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approuver et exécuter' }));
    expect(onApprovePlan).toHaveBeenCalledWith('wp1', undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(onRefusePlan).toHaveBeenCalledWith('wp1');
  });
});
