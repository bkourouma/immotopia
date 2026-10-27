import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { ConversationList } from '../../components/messaging/ConversationList';
import { MessageComposer } from '../../components/messaging/MessageComposer';
import { MessageThread } from '../../components/messaging/MessageThread';
import { NewConversationModal } from '../../components/messaging/NewConversationModal';
import type { ConversationSummary, ThreadMessage } from '../../services/messaging-service';

/** Messagerie interne : le mock du service couvre CHAQUE export utilisé par les composants testés. */

const getDirectory = vi.fn();
const createConversation = vi.fn();
const addParticipants = vi.fn();

vi.mock('../../services/messaging-service', () => ({
  MESSAGE_MAX_LENGTH: 5000,
  getDirectory: (...a: unknown[]) => getDirectory(...a),
  createConversation: (...a: unknown[]) => createConversation(...a),
  addParticipants: (...a: unknown[]) => addParticipants(...a),
  leaveConversation: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  markConversationRead: vi.fn(),
  getMessagingUnreadCount: vi.fn()
}));

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
    kind: 'DIRECT',
    title: null,
    participants: [
      { userId: 'me', label: 'Moi', kind: 'STAFF' },
      { userId: 'u2', label: 'Awa Traoré', kind: 'CLIENT' }
    ],
    lastMessage: { id: 'm1', body: 'Bonjour Awa', authorUserId: 'me', createdAt: '2026-10-19T10:00:00Z' },
    unreadCount: 0,
    lastMessageAt: '2026-10-19T10:00:00Z',
    updatedAt: '2026-10-19T10:00:00Z',
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConversationList', () => {
  it('affiche le dernier message, les non-lus et trie par activité', () => {
    render(
      <ConversationList
        currentUserId="me"
        onSelect={vi.fn()}
        conversations={[
          conversation({ id: 'old', lastMessageAt: '2026-10-01T10:00:00Z', lastMessage: null, title: 'Ancienne' }),
          conversation({ id: 'new', unreadCount: 3, title: 'Récente' })
        ]}
      />
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Récente');
    expect(items[0]).toHaveTextContent('Bonjour Awa');
    expect(items[0]).toHaveTextContent('3');
    expect(items[1]).toHaveTextContent('Ancienne');
  });

  it('affiche un état vide', () => {
    render(<ConversationList conversations={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('Aucune conversation pour le moment')).toBeInTheDocument();
  });

  it("appelle onSelect avec l'identifiant", async () => {
    const onSelect = vi.fn();
    render(<ConversationList currentUserId="me" conversations={[conversation()]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Awa Traoré/ }));
    expect(onSelect).toHaveBeenCalledWith('c1');
  });
});

describe('MessageThread', () => {
  it('rend le corps en texte brut et distingue le client', () => {
    const messages: ThreadMessage[] = [
      {
        id: 'm1',
        authorUserId: 'u2',
        authorLabel: 'Awa Traoré',
        body: '<b>gras</b>\nligne 2',
        createdAt: '2026-10-19T10:00:00Z',
        mine: false
      }
    ];
    const { container } = render(
      <MessageThread
        messages={messages}
        participants={conversation().participants}
        hasMore={false}
        onLoadMore={vi.fn()}
      />
    );
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText(/<b>gras<\/b>/)).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
  });

  it('propose de charger plus ancien', async () => {
    const onLoadMore = vi.fn();
    render(<MessageThread messages={[]} participants={[]} hasMore onLoadMore={onLoadMore} />);
    await userEvent.click(screen.getByRole('button', { name: /plus anciens/ }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});

describe('MessageComposer', () => {
  it('envoie avec Entrée puis se vide', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'Bonjour{Enter}');
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Bonjour'));
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('Maj+Entrée saute une ligne sans envoyer', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b');
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('a\nb');
  });

  it("conserve le texte quand l'envoi échoue", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('x'));
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'perdu{Enter}');
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(box).toHaveValue('perdu');
  });
});

describe('NewConversationModal', () => {
  const scope = { kind: 'agency' as const, tenantId: 't1' };

  function renderModal(onDone = vi.fn()) {
    getDirectory.mockResolvedValue([
      { userId: 'u2', label: 'Awa Traoré', kind: 'CLIENT' },
      { userId: 'u3', label: 'Koffi Yao', kind: 'STAFF' }
    ]);
    render(
      <AntApp>
        <NewConversationModal open scope={scope} onClose={vi.fn()} onDone={onDone} />
      </AntApp>
    );
    return onDone;
  }

  it('crée une discussion directe avec un seul participant, sans titre', async () => {
    createConversation.mockResolvedValue(conversation());
    const onDone = renderModal();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Awa Traoré/ }));
    expect(screen.queryByPlaceholderText('Titre du groupe (facultatif)')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Démarrer' }));
    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(scope, { participantUserIds: ['u2'] }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('crée un groupe avec titre facultatif pour plusieurs participants', async () => {
    createConversation.mockResolvedValue(conversation({ kind: 'GROUP' }));
    renderModal();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Awa Traoré/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Koffi Yao/ }));
    await userEvent.type(screen.getByPlaceholderText('Titre du groupe (facultatif)'), 'Visite');
    await userEvent.click(screen.getByRole('button', { name: 'Démarrer' }));
    await waitFor(() =>
      expect(createConversation).toHaveBeenCalledWith(scope, { participantUserIds: ['u2', 'u3'], title: 'Visite' })
    );
  });

  it('affiche un état vide quand le répertoire ne renvoie personne', async () => {
    getDirectory.mockResolvedValue([]);
    render(
      <AntApp>
        <NewConversationModal open scope={scope} onClose={vi.fn()} onDone={vi.fn()} />
      </AntApp>
    );
    expect(await screen.findByText('Aucune personne trouvée')).toBeInTheDocument();
  });
});
