import React from 'react';
import { AxiosHeaders } from 'axios';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { CopilotStatus } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => {
  const service = {
    getStatus: vi.fn(),
    streamChat: vi.fn(),
    executeProposal: vi.fn(),
    listConversations: vi.fn().mockResolvedValue({ items: [] }),
    getConversation: vi.fn(),
    saveResponseFeedback: vi.fn(),
    getArtifactVersion: vi.fn(),
    listSavedAnalyses: vi.fn(),
    listScheduledReports: vi.fn(),
    setScheduledReportActive: vi.fn(),
    listTasks: vi.fn(),
    createTask: vi.fn(),
    notifyColleagues: vi.fn(),
    decideFollowUp: vi.fn(),
    setTaskCompleted: vi.fn(),
    listAnalysisRecipients: vi.fn(),
    queueImmediateReport: vi.fn(),
    listAnalysisShares: vi.fn(),
    setAnalysisPin: vi.fn(),
    getSharedAnalysis: vi.fn(),
    removeSavedAnalysis: vi.fn(),
    downloadAttachment: vi.fn(),
    transcribe: vi.fn()
  };
  return { default: service, copilotService: service };
});

vi.mock('../../services/dashboard-service', () => ({
  getTenantDashboard: vi.fn().mockResolvedValue({ data: { workQueue: [] } })
}));

vi.mock('../../utils/save-blob', async importOriginal => ({
  ...(await importOriginal<typeof import('../../utils/save-blob')>()),
  saveBlob: vi.fn()
}));
import { saveBlob } from '../../utils/save-blob';
import copilotService from '../../services/copilot-service';
import AssistantPage, { pageHeight, unavailableMessage } from '../../pages/assistant/AssistantPage';

const getStatus = vi.mocked(copilotService.getStatus);
const streamChat = vi.mocked(copilotService.streamChat);
const getConversation = vi.mocked(copilotService.getConversation);

const ENABLED: CopilotStatus = {
  enabled: true,
  provider: 'fake',
  tools: ['search_properties', 'search_leases'],
  limits: { maxMessages: 20, maxMessageChars: 2000 }
};
const DISABLED: CopilotStatus = { ...ENABLED, enabled: false, tools: [] };

const w = window as unknown as Record<string, unknown>;

function renderPage(path = '/tenant/t1/assistant') {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tenant/:tenantId/assistant" element={<AssistantPage />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  streamChat.mockImplementation(async (_t, _r, opts) => {
    opts.onEvent({ type: 'text_delta', text: 'Réponse' });
    opts.onEvent({ type: 'done', reason: 'end_turn' });
  });
});
afterEach(() => {
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
});

const ARTIFACT_EVENT = {
  type: 'artifact' as const,
  artifact: {
    kind: 'markdown' as const,
    id: 'a1',
    title: 'Synthèse du mois',
    content: 'Contenu **important**'
  }
};

function setDesktop(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: desktop && /min-width/.test(query),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    })
  });
}

describe('AssistantPage — artefacts', () => {
  afterEach(() => setDesktop(false));

  it('rouvre un formulaire métier depuis une alerte budgétaire conservée dans le fil', async () => {
    getStatus.mockResolvedValue(ENABLED);
    getConversation.mockResolvedValueOnce({
      id: 'c1',
      title: 'Chantier',
      pinned: false,
      archived: false,
      updatedAt: '2026-11-14',
      turns: [
        {
          id: 't1',
          question: 'Prépare une alerte à 80 %',
          response: 'Le formulaire est prêt.',
          outcome: 'end_turn',
          result: [
            {
              type: 'prepared_alert',
              alert: {
                kind: 'construction_budget',
                siteId: 'site-1',
                siteName: 'Atrium',
                thresholdPercent: 80
              }
            }
          ]
        }
      ]
    });
    renderPage('/tenant/t1/assistant?c=c1');
    expect(await screen.findByRole('link', { name: 'Ouvrir le formulaire d’alerte' })).toHaveAttribute(
      'href',
      '/tenant/t1/finance/chantiers/site-1/budget?alerte-budget=80'
    );
    expect(screen.getByText(/Atrium · Seuil de 80 % du budget révisé/)).toBeInTheDocument();
  });

  it('restaure et confirme une proposition durable dans le fil', async () => {
    getStatus.mockResolvedValue(ENABLED);
    getConversation.mockResolvedValueOnce({
      id: 'c1',
      title: 'Suivi',
      pinned: false,
      archived: false,
      updatedAt: '2026-11-14',
      turns: [
        {
          id: 't1',
          question: 'Prépare une notification',
          response: 'La carte est prête.',
          result: null,
          outcome: 'end_turn',
          followUps: [
            {
              id: 'p1',
              kind: 'notify',
              status: 'PENDING',
              display: { recipients: ['Camille'], message: 'Merci de relire le document.' }
            }
          ]
        }
      ]
    });
    vi.mocked(copilotService.decideFollowUp).mockResolvedValueOnce({ status: 'CONFIRMED' });
    renderPage('/tenant/t1/assistant?c=c1');
    expect(await screen.findByText('Merci de relire le document.')).toBeInTheDocument();
    expect(screen.getByText(/Destinataires · Camille/)).toBeInTheDocument();
    expect(copilotService.decideFollowUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(copilotService.decideFollowUp).toHaveBeenCalledWith('t1', 'p1', true);
    expect(await screen.findByText('Confirmée')).toBeInTheDocument();
  });

  it('attend la confirmation avant de notifier des collègues depuis une analyse', async () => {
    getStatus.mockResolvedValue(ENABLED);
    vi.mocked(copilotService.listSavedAnalyses).mockResolvedValueOnce({
      items: [{ conversationId: 'c1', artifactId: 'a1', title: 'Situation locative', createdAt: '2026-11-14' }]
    });
    vi.mocked(copilotService.listAnalysisRecipients).mockResolvedValueOnce([
      { userId: 'recipient-1', displayName: 'Camille Destinataire' }
    ]);
    vi.mocked(copilotService.notifyColleagues).mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Mes analyses' }));
    const drawer = await screen.findByRole('dialog', { name: 'Mes analyses' });
    fireEvent.click(await within(drawer).findByRole('button', { name: 'Notifier des collègues' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmer l’envoi' });
    const dialog = within(confirm.closest<HTMLElement>('[role="dialog"]')!);
    expect(dialog.getByText(/partage aussi l’analyse en lecture seule/)).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Destinataires' }));
    fireEvent.click(await screen.findByText('Camille Destinataire', { selector: '.ant-select-item-option-content' }));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Message' }), { target: { value: 'Relire le tableau.' } });
    expect(copilotService.notifyColleagues).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(copilotService.notifyColleagues).toHaveBeenCalledWith('t1', {
      analysis: { conversationId: 'c1', artifactId: 'a1' },
      recipientIds: ['recipient-1'],
      message: 'Relire le tableau.',
      requestId: expect.any(String)
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmer l’envoi' })).not.toBeInTheDocument());
  });

  it('ouvre une tâche assignée depuis sa notification et permet de la terminer', async () => {
    getStatus.mockResolvedValue(ENABLED);
    const id = 'task-1';
    const task = {
      id,
      title: 'Vérifier les encaissements',
      description: null,
      dueDate: '2028-02-29',
      priority: 'high' as const,
      completedAt: null,
      canComplete: true,
      shareId: 'share-1',
      creator: { fullName: 'Adama' },
      assignee: { fullName: 'Camille' }
    };
    vi.mocked(copilotService.listTasks)
      .mockResolvedValueOnce({ items: [task] })
      .mockResolvedValueOnce({ items: [{ ...task, completedAt: '2028-02-29T08:00:00Z' }] });
    vi.mocked(copilotService.setTaskCompleted).mockResolvedValueOnce(undefined);
    renderPage('/tenant/t1/assistant?tache=' + id);
    const drawer = await screen.findByRole('dialog', { name: 'Tâches' });
    expect(await within(drawer).findByText(task.title)).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Ouvrir l’analyse' })).toHaveAttribute(
      'href',
      '/tenant/t1/assistant?partage=share-1'
    );
    expect(copilotService.listTasks).toHaveBeenCalledWith('t1', undefined, id, expect.anything());
    fireEvent.click(within(drawer).getByRole('button', { name: 'Terminer la tâche' }));
    expect(copilotService.setTaskCompleted).toHaveBeenCalledWith('t1', id, true);
    expect(await within(drawer).findByRole('button', { name: 'Rouvrir la tâche' })).toBeEnabled();
  });

  it('confirme la création d’une tâche depuis Mes analyses', async () => {
    getStatus.mockResolvedValue(ENABLED);
    const title = 'Situation locative';
    vi.mocked(copilotService.listSavedAnalyses).mockResolvedValueOnce({
      items: [{ conversationId: 'c1', artifactId: 'a1', title, createdAt: '2026-11-14' }]
    });
    vi.mocked(copilotService.listAnalysisRecipients).mockResolvedValueOnce([
      { userId: 'recipient-1', displayName: 'Camille Destinataire' }
    ]);
    vi.mocked(copilotService.createTask).mockResolvedValueOnce({ id: 'task-2' });
    vi.mocked(copilotService.listTasks).mockResolvedValueOnce({ items: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Mes analyses' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une tâche' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmer la création' });
    const dialog = within(confirm.closest<HTMLElement>('[role="dialog"]')!);
    expect(confirm).toBeDisabled();
    expect(dialog.getByText(/accès en lecture seule à l’analyse/)).toBeInTheDocument();
    fireEvent.change(dialog.getByRole('textbox', { name: 'Titre' }), { target: { value: 'Vérifier le dossier' } });
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Collaborateur assigné' }));
    fireEvent.click(await screen.findByText('Camille Destinataire', { selector: '.ant-select-item-option-content' }));
    expect(copilotService.createTask).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(copilotService.createTask).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        title: 'Vérifier le dossier',
        assigneeId: 'recipient-1',
        priority: 'normal',
        analysis: { conversationId: 'c1', artifactId: 'a1' },
        requestId: expect.any(String)
      })
    );
    expect(await screen.findByRole('dialog', { name: 'Tâches' })).toBeInTheDocument();
  });

  it('ouvre les rapports depuis une notification et active le brouillon', async () => {
    getStatus.mockResolvedValue(ENABLED);
    const report = {
      id: 'report-1',
      schedule: { frequency: 'weekly' as const, day: 1, time: '08:00', timeZone: 'Africa/Abidjan' },
      formats: ['pdf' as const],
      active: false,
      sharesCreated: false,
      shareRecipients: ['Camille Destinataire'],
      nextRunAt: null,
      lastRunAt: null,
      lastStatus: null,
      analysis: { title: 'Situation locative' }
    };
    vi.mocked(copilotService.listScheduledReports)
      .mockResolvedValueOnce({ items: [report] })
      .mockResolvedValueOnce({ items: [{ ...report, active: true, nextRunAt: '2026-11-16T08:00:00Z' }] });
    vi.mocked(copilotService.setScheduledReportActive).mockResolvedValue(undefined);
    renderPage('/tenant/t1/assistant?rapports=1');

    const drawer = await screen.findByRole('dialog', { name: 'Rapports' });
    expect(await within(drawer).findByText('Situation locative')).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Activer' }));
    expect(await screen.findByText('Camille Destinataire')).toBeInTheDocument();
    expect(copilotService.setScheduledReportActive).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Activer et partager' }));
    expect(copilotService.setScheduledReportActive).toHaveBeenCalledWith('t1', 'report-1', true, true);
    expect(await within(drawer).findByRole('button', { name: 'Mettre en pause' })).toBeEnabled();
    expect(within(drawer).getByText(/Prochaine échéance/)).toBeInTheDocument();
  });

  it('attend la confirmation avant de mettre un envoi ponctuel en file', async () => {
    getStatus.mockResolvedValue(ENABLED);
    vi.mocked(copilotService.listSavedAnalyses).mockResolvedValueOnce({
      items: [{ conversationId: 'c1', artifactId: 'a1', title: 'Situation locative', createdAt: '2026-11-14' }]
    });
    vi.mocked(copilotService.listAnalysisRecipients).mockResolvedValueOnce([
      { userId: 'recipient-1', displayName: 'Camille Destinataire' }
    ]);
    vi.mocked(copilotService.queueImmediateReport).mockResolvedValueOnce({ id: 'report-2' });
    vi.mocked(copilotService.listScheduledReports).mockResolvedValueOnce({
      items: [
        {
          id: 'report-2',
          schedule: null,
          sharesCreated: true,
          shareRecipients: [],
          formats: ['pdf'],
          active: true,
          nextRunAt: '2026-11-16T08:00:00Z',
          lastRunAt: null,
          lastStatus: null,
          analysis: { title: 'Situation locative' }
        }
      ]
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Mes analyses' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer par e-mail' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmer l’envoi' });
    const dialog = confirm.closest<HTMLElement>('[role="dialog"]')!;
    expect(confirm).toBeDisabled();
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Destinataires' }));
    fireEvent.click(await screen.findByText('Camille Destinataire', { selector: '.ant-select-item-option-content' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Message facultatif' }), {
      target: { value: 'Bonjour' }
    });
    expect(copilotService.queueImmediateReport).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(copilotService.queueImmediateReport).toHaveBeenCalledWith('t1', {
      conversationId: 'c1',
      artifactId: 'a1',
      recipientIds: ['recipient-1'],
      formats: ['pdf'],
      message: 'Bonjour',
      requestId: expect.any(String)
    });
    const reports = await screen.findByRole('dialog', { name: 'Rapports' });
    expect(await within(reports).findByText('En attente d’envoi')).toBeInTheDocument();
  });

  it('ouvre les résultats d’une conversation partagée en lecture seule', async () => {
    getStatus.mockResolvedValue(ENABLED);
    vi.mocked(copilotService.listAnalysisShares).mockResolvedValue({ items: [] });
    vi.mocked(copilotService.getSharedAnalysis).mockResolvedValueOnce({
      turns: [{ id: 'turn-1', startedAt: '2026-11-14', artifacts: [ARTIFACT_EVENT.artifact] }]
    });
    renderPage('/tenant/t1/assistant?partage=thread-share');
    const drawer = await screen.findByRole('dialog', { name: 'Partages' });
    expect(await within(drawer).findByText('important')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Enregistrer dans Mes analyses' })).toBeNull();
  });

  it('ouvre le partage indiqué par le lien de notification', async () => {
    getStatus.mockResolvedValue(ENABLED);
    vi.mocked(copilotService.listAnalysisShares).mockResolvedValue({ items: [] });
    vi.mocked(copilotService.getSharedAnalysis).mockResolvedValueOnce(ARTIFACT_EVENT.artifact);
    renderPage('/tenant/t1/assistant?partage=notification-share');
    const drawer = await screen.findByRole('dialog', { name: 'Partages' });
    expect(await within(drawer).findByText('important')).toBeInTheDocument();
    expect(copilotService.getSharedAnalysis).toHaveBeenCalledWith('t1', 'notification-share');
  });

  it('ouvre un tableau reçu dans un panneau en lecture seule', async () => {
    getStatus.mockResolvedValue(ENABLED);
    vi.mocked(copilotService.listAnalysisShares).mockResolvedValue({
      items: [{ id: 'p1', colleague: 'Camille', createdAt: '2026-11-14' }]
    });
    vi.mocked(copilotService.getSharedAnalysis).mockResolvedValue({
      id: 'a1',
      kind: 'table',
      title: 'Charges par lot',
      columns: [{ key: 'lot', label: 'Lot' }],
      rows: [{ lot: 'A01' }]
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Partages' }));
    const drawer = await screen.findByRole('dialog', { name: 'Partages' });
    fireEvent.click(await within(drawer).findByRole('button', { name: 'Épingler au tableau de bord' }));
    expect(await within(drawer).findByRole('button', { name: 'Désépingler' })).toBeEnabled();
    expect(copilotService.setAnalysisPin).toHaveBeenCalledWith('t1', 'p1', true);
    fireEvent.click(await within(drawer).findByRole('button', { name: 'Ouvrir' }));
    expect(await within(drawer).findByText('A01')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Télécharger' })).toBeEnabled();
    expect(within(drawer).queryByRole('button', { name: 'Enregistrer dans Mes analyses' })).toBeNull();
  });

  it('ouvre et retire une analyse enregistrée depuis la page Assistant', async () => {
    getStatus.mockResolvedValue(ENABLED);
    const item = {
      conversationId: 'c1',
      artifactId: 'a1',
      title: ARTIFACT_EVENT.artifact.title,
      createdAt: '2026-11-14'
    };
    const list = vi.mocked(copilotService.listSavedAnalyses);
    list.mockResolvedValueOnce({ items: [item] }).mockResolvedValue({ items: [] });
    const payload = {
      artifact: ARTIFACT_EVENT.artifact,
      version: 1,
      latest: 1,
      versions: [{ version: 1, createdAt: null }]
    };
    vi.mocked(copilotService.getArtifactVersion).mockResolvedValueOnce(payload).mockResolvedValueOnce(payload);
    vi.mocked(copilotService.removeSavedAnalysis).mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Mes analyses' }));
    const drawer = await screen.findByRole('dialog', { name: 'Mes analyses' });
    fireEvent.click(await within(drawer).findByRole('button', { name: item.title }));
    expect(await within(drawer).findByText('important')).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Retour aux analyses' }));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Retirer' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Retirer' })).at(-1)!);
    await waitFor(() => expect(copilotService.removeSavedAnalysis).toHaveBeenCalledWith('t1', item));
    expect(await within(drawer).findByText('Aucune analyse enregistrée.')).toBeInTheDocument();
  });

  async function sendWithArtifact() {
    getStatus.mockResolvedValue(ENABLED);
    streamChat.mockImplementation(async (_t, _r, opts) => {
      opts.onEvent({ type: 'text_delta', text: 'Voilà' });
      opts.onEvent(ARTIFACT_EVENT);
      opts.onEvent({ type: 'done', reason: 'end_turn' });
    });
    renderPage();
    const input = await screen.findByLabelText('Votre message');
    fireEvent.change(input, { target: { value: 'synthèse' } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  it('ordinateur : le panneau apparaît seul et peut être refermé', async () => {
    setDesktop(true);
    await sendWithArtifact();
    const panel = await screen.findByRole('complementary', { name: 'Résultats et documents' });
    expect(within(panel).getByText('important')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Fermer le panneau' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir : Synthèse du mois' }));
    expect(await screen.findByRole('complementary')).toBeInTheDocument();
  });

  it('mobile : le panneau reste replié, la pastille ouvre un tiroir', async () => {
    setDesktop(false);
    await sendWithArtifact();
    const chip = await screen.findByRole('button', { name: 'Ouvrir : Synthèse du mois' });
    expect(screen.queryByText('important')).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(await screen.findByText('important')).toBeInTheDocument();
  });
});

describe('AssistantPage', () => {
  it('joint un classeur et peut envoyer le message sans saisie', async () => {
    getStatus.mockResolvedValue(ENABLED);
    const { container } = renderPage();
    const attach = await screen.findByRole('button', { name: 'Joindre des fichiers' });
    expect(attach).toBeEnabled();
    const picker = container.querySelector('input[type=file]')!;
    const file = new File(['workbook'], 'loyers.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(screen.getByRole('button', { name: 'Retirer loyers.xlsx' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    expect(streamChat.mock.calls[0][1].messages).toEqual([{ role: 'user', content: 'Analyse les fichiers joints.' }]);
    expect(streamChat.mock.calls[0][2].files).toEqual([file]);
    expect(await screen.findByText('loyers.xlsx')).toBeVisible();
  });

  it('affiche le fil, la saisie et l’emplacement de l’artefact', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    expect(await screen.findByLabelText('Votre message')).toBeInTheDocument();
    expect(screen.getByRole('log')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  });

  it('annonce que l’assistant est désactivé et n’affiche pas de saisie', async () => {
    getStatus.mockResolvedValue(DISABLED);
    renderPage();
    expect(await screen.findByText("L'assistant n'est pas activé pour cette agence.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Votre message')).not.toBeInTheDocument();
  });

  it('envoie le message avec Entrée et vide la zone', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    const input = await screen.findByLabelText('Votre message');
    fireEvent.change(input, { target: { value: 'Montre les biens' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    expect(streamChat.mock.calls[0][0]).toBe('t1');
    expect(JSON.stringify(streamChat.mock.calls[0][1])).toContain('Montre les biens');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('n’envoie pas avec Maj+Entrée (saut de ligne)', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    const input = await screen.findByLabelText('Votre message');
    fireEvent.change(input, { target: { value: 'ligne 1' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(streamChat).not.toHaveBeenCalled();
    expect(input).toHaveValue('ligne 1');
  });

  it('masque le bouton de dictée si le navigateur n’a pas l’API', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    await screen.findByLabelText('Votre message');
    expect(screen.queryByRole('button', { name: 'Dicter un message' })).not.toBeInTheDocument();
  });

  it('utilise la transcription serveur et laisse le texte dans le brouillon', async () => {
    const stopTrack = vi.fn();
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported() {
          return true;
        }
        state = 'inactive';
        mimeType = 'audio/webm;codecs=opus';
        ondataavailable?: (event: { data: Blob }) => void;
        onstop?: () => void;
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({ data: new Blob(['audio']) });
          this.onstop?.();
        }
      }
    );
    const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) }
    });
    try {
      getStatus.mockResolvedValue({ ...ENABLED, transcription: true });
      vi.mocked(copilotService.transcribe).mockResolvedValue('Bilan des loyers');
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Dicter un message' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Arrêter la dictée' }));
      await waitFor(() => expect(screen.getByLabelText('Votre message')).toHaveValue('Bilan des loyers'));
      expect(copilotService.transcribe).toHaveBeenCalledWith('t1', expect.any(Blob), expect.any(AbortSignal));
      expect(stopTrack).toHaveBeenCalled();
      expect(streamChat).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      if (original) Object.defineProperty(navigator, 'mediaDevices', original);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  it('dicte du texte dans la zone sans l’envoyer', async () => {
    class Fake {
      static last: Fake;
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        Fake.last = this;
      }
    }
    w.SpeechRecognition = Fake;
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    const input = await screen.findByLabelText('Votre message');
    fireEvent.click(screen.getByRole('button', { name: 'Dicter un message' }));
    expect(await screen.findByRole('button', { name: 'Arrêter la dictée' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Écoute en cours…')).toBeInTheDocument();

    const final = Object.assign([{ transcript: 'bonjour' }], { isFinal: true });
    Fake.last.onresult?.({ resultIndex: 0, results: [final] });
    await waitFor(() => expect(input).toHaveValue('bonjour'));
    expect(streamChat).not.toHaveBeenCalled();
  });
});

it('enregistre un avis avec commentaire sur la révision affichée', async () => {
  getStatus.mockResolvedValue(ENABLED);
  const id = '5258bdd1-74d6-47ea-a37f-ab4d1e8eae45';
  getConversation.mockResolvedValueOnce({
    id,
    title: 'Analyse',
    pinned: false,
    archived: false,
    updatedAt: '2026-11-14T12:00:00Z',
    turns: [
      {
        id: 'tour-1',
        question: 'Bilan',
        response: 'Voici le bilan.',
        responseRevision: 3,
        result: null,
        outcome: 'end_turn'
      }
    ]
  });
  vi.mocked(copilotService.saveResponseFeedback).mockResolvedValueOnce(undefined);
  renderPage(`/tenant/t1/assistant?c=${id}`);
  fireEvent.click(await screen.findByRole('button', { name: 'Donner un avis' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Peu utile' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Commentaire facultatif' }), {
    target: { value: 'À préciser.' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByRole('button', { name: 'Modifier mon avis' })).toBeVisible();
  expect(copilotService.saveResponseFeedback).toHaveBeenCalledWith('t1', id, 'tour-1', {
    revision: 3,
    helpful: false,
    comment: 'À préciser.'
  });
});

it('affiche la nouvelle réponse après confirmation du serveur', async () => {
  getStatus.mockResolvedValue(ENABLED);
  const id = '5258bdd1-74d6-47ea-a37f-ab4d1e8eae45';
  const turn = {
    id: 'tour-1',
    question: 'Bilan du mois',
    response: 'Ancien bilan.',
    result: null,
    outcome: 'end_turn'
  };
  const conversation = {
    id,
    title: 'Analyse',
    pinned: false,
    archived: false,
    updatedAt: '2026-11-14T12:00:00Z',
    turns: [turn]
  };
  getConversation.mockResolvedValueOnce(conversation).mockResolvedValueOnce({
    ...conversation,
    turns: [{ ...turn, response: 'Nouveau bilan.' }]
  });
  renderPage(`/tenant/t1/assistant?c=${id}`);
  expect(await screen.findByText('Ancien bilan.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Régénérer la dernière réponse' }));
  expect(await screen.findByText('Nouveau bilan.')).toBeVisible();
  expect(screen.queryByText('Ancien bilan.')).toBeNull();
  expect(streamChat.mock.calls[0][1]).toMatchObject({ conversationId: id, regenerateTurnId: turn.id });
});

it('prépare une relance sur la version du résultat affichée', async () => {
  getStatus.mockResolvedValue(ENABLED);
  const id = '5258bdd1-74d6-47ea-a37f-ab4d1e8eae45';
  getConversation.mockResolvedValueOnce({
    id,
    title: 'Analyse',
    pinned: false,
    archived: false,
    updatedAt: '2026-11-14T12:00:00Z',
    turns: [
      {
        id: 'tour-1',
        question: 'Bilan du mois',
        response: 'Voici le bilan.',
        outcome: 'end_turn',
        result: [ARTIFACT_EVENT]
      }
    ]
  });
  vi.mocked(copilotService.getArtifactVersion).mockResolvedValue({
    artifact: ARTIFACT_EVENT.artifact,
    version: 2,
    latest: 2,
    versions: [{ version: 2, createdAt: null }]
  });
  renderPage(`/tenant/t1/assistant?c=${id}`);
  fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir : Synthèse du mois' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Poser une question sur ce résultat' }));
  expect(screen.getByLabelText('Votre message')).toHaveValue('Explique les points importants de ce résultat.');
  expect(streamChat).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  await waitFor(() =>
    expect(streamChat.mock.calls[0][1]).toMatchObject({
      conversationId: id,
      focus: { artifactId: ARTIFACT_EVENT.artifact.id, version: 2 }
    })
  );
});

it('rouvre le fil et ses artefacts depuis le lien de conversation', async () => {
  getStatus.mockResolvedValue(ENABLED);
  const id = '5258bdd1-74d6-47ea-a37f-ab4d1e8eae45';
  getConversation.mockResolvedValue({
    id,
    title: 'Analyse',
    pinned: false,
    archived: false,
    updatedAt: '2026-11-14T12:00:00Z',
    turns: [
      {
        id: 'tour-1',
        question: 'Bilan du mois',
        attachments: [{ name: 'bilan.pdf', position: 0 }],
        response: 'Voici le bilan.',
        result: [ARTIFACT_EVENT],
        outcome: 'end_turn'
      }
    ]
  });
  renderPage(`/tenant/t1/assistant?c=${id}`);
  expect(await screen.findByText('Voici le bilan.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ouvrir : Synthèse du mois' })).toBeInTheDocument();
  expect(getConversation).toHaveBeenCalledWith('t1', id);
  const file = new Blob(['bilan']);
  vi.mocked(copilotService.downloadAttachment).mockResolvedValue({
    data: file,
    headers: { 'content-disposition': 'attachment; filename="bilan.pdf"' },
    status: 200,
    statusText: 'OK',
    config: { headers: new AxiosHeaders() }
  });
  fireEvent.click(screen.getByRole('button', { name: 'bilan.pdf' }));
  await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(file, 'bilan.pdf'));
  expect(copilotService.downloadAttachment).toHaveBeenCalledWith('t1', id, 'tour-1', 0);
});

describe('AssistantPage — hauteur', () => {
  it('retranche la barre d’onglets au lieu de l’ajouter (bas parenthésé)', () => {
    expect(pageHeight(true)).toBe(
      'calc(100dvh - 64px - var(--page-padding) - (var(--control-h-lg) + var(--space-6) + env(safe-area-inset-bottom, 0px)))'
    );
    expect(pageHeight(false)).toBe('calc(100dvh - 64px - var(--page-padding) - var(--page-padding))');
  });
});

describe('AssistantPage — messages d’accès', () => {
  it('désactivé pour l’agence', () => {
    expect(unavailableMessage(DISABLED, true).title).toBe("L'assistant n'est pas activé pour cette agence.");
    expect(unavailableMessage({ ...DISABLED, reason: 'NOT_CONFIGURED' }, true).title).toBe(
      "L'assistant n'est pas activé pour cette agence."
    );
  });
  it('refusé pour ce compte (403)', () => {
    const m = unavailableMessage({ ...DISABLED, reason: 'FORBIDDEN' }, true);
    expect(m.title).toBe("L'assistant n'est pas disponible pour ce compte.");
    expect(m.subTitle).toMatch(/collaborateurs/);
  });
  it('aucune agence rattachée (pas d’identifiant ou 404)', () => {
    expect(unavailableMessage(null, false).title).toBe("Aucune agence n'est rattachée à cette page.");
    expect(unavailableMessage({ ...DISABLED, reason: 'NOT_FOUND' }, true).title).toBe(
      "Aucune agence n'est rattachée à cette page."
    );
  });
  it('la page affiche le message du refus', async () => {
    getStatus.mockResolvedValue({ ...DISABLED, reason: 'FORBIDDEN' });
    renderPage();
    expect(await screen.findByText("L'assistant n'est pas disponible pour ce compte.")).toBeInTheDocument();
    expect(screen.queryByText("L'assistant n'est pas activé pour cette agence.")).not.toBeInTheDocument();
  });
});
