import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MessagesPage from '../../pages/messages/MessagesPage';
import type { ConversationSummary } from '../../services/messaging-service';

/** Liste des conversations de la messagerie : volume (50 puis 100) lu à la demande. */

const listConversations = vi.fn();

vi.mock('../../services/messaging-service', () => ({
  MESSAGE_MAX_LENGTH: 5000,
  getDirectory: vi.fn(),
  createConversation: vi.fn(),
  addParticipants: vi.fn(),
  leaveConversation: vi.fn(),
  listConversations: (...a: unknown[]) => listConversations(...a),
  getConversation: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  markConversationRead: vi.fn(),
  getMessagingUnreadCount: vi.fn()
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' }, activeTenantId: 'tenant-1' })
}));

const SCOPE = { kind: 'agency', tenantId: 'tenant-1' };

function conversation(index: number): ConversationSummary {
  return {
    id: `c${index}`,
    kind: 'GROUP',
    title: `Conversation ${index}`,
    participants: [{ userId: 'me', label: 'Moi', kind: 'STAFF' }],
    lastMessage: null,
    unreadCount: 0,
    lastMessageAt: null,
    updatedAt: '2026-10-19T10:00:00Z'
  };
}

function mount(initial = '/messages') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/messages" element={<MessagesPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<MessagesPage> — liste des conversations', () => {
  it('lit 50 conversations, puis 100 sur demande quand le serveur en a davantage', async () => {
    listConversations.mockImplementation(async (_scope: unknown, params: { pageSize: number }) => ({
      items: Array.from({ length: Math.min(params.pageSize, 120) }, (_, i) => conversation(i)),
      total: 120,
      page: 1,
      pageSize: params.pageSize
    }));
    const user = userEvent.setup();
    mount();

    const more = await screen.findByRole('button', { name: 'Afficher plus de conversations' });
    expect(listConversations).toHaveBeenCalledWith(SCOPE, { page: 1, pageSize: 50 });

    await user.click(more);

    await waitFor(() => expect(listConversations).toHaveBeenLastCalledWith(SCOPE, { page: 1, pageSize: 100 }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Afficher plus de conversations' })).not.toBeInTheDocument()
    );
  });

  it('pas de bouton quand tout tient dans la première lecture', async () => {
    listConversations.mockResolvedValue({ items: [conversation(1)], total: 1, page: 1, pageSize: 50 });
    mount();

    await screen.findByText('Conversation 1');
    expect(screen.queryByRole('button', { name: 'Afficher plus de conversations' })).not.toBeInTheDocument();
  });

  it('la recherche part à l’API (rognée) et se retrouve dans l’URL ; sans résultat, message dédié', async () => {
    listConversations.mockImplementation(async (_scope: unknown, params: { search?: string }) => ({
      items: params.search ? [] : [conversation(1)],
      total: params.search ? 0 : 1,
      page: 1,
      pageSize: 50
    }));
    const user = userEvent.setup();
    mount();
    await screen.findByText('Conversation 1');

    await user.type(screen.getByPlaceholderText('Titre ou participant…'), 'soleil');

    await vi.waitFor(
      () => expect(listConversations).toHaveBeenLastCalledWith(SCOPE, { page: 1, pageSize: 50, search: 'soleil' }),
      { timeout: 8000 }
    );
    expect(await screen.findByText('Aucune conversation ne correspond à votre recherche.')).toBeInTheDocument();
  });

  it('une nouvelle recherche revient à 50 conversations après « Afficher plus »', async () => {
    listConversations.mockImplementation(async (_scope: unknown, params: { pageSize: number }) => ({
      items: Array.from({ length: Math.min(params.pageSize, 120) }, (_, i) => conversation(i)),
      total: 120,
      page: 1,
      pageSize: params.pageSize
    }));
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: 'Afficher plus de conversations' }));
    await waitFor(() => expect(listConversations).toHaveBeenLastCalledWith(SCOPE, { page: 1, pageSize: 100 }));

    await user.type(screen.getByPlaceholderText('Titre ou participant…'), 'soleil');
    await vi.waitFor(
      () => expect(listConversations).toHaveBeenLastCalledWith(SCOPE, { page: 1, pageSize: 50, search: 'soleil' }),
      { timeout: 8000 }
    );
  });

  it('applique la recherche d’une URL partagée', async () => {
    listConversations.mockResolvedValue({ items: [conversation(2)], total: 1, page: 1, pageSize: 50 });
    mount('/messages?q=awa');
    await screen.findByText('Conversation 2');
    expect(listConversations).toHaveBeenCalledWith(SCOPE, { page: 1, pageSize: 50, search: 'awa' });
  });
});
