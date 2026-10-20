import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { MemoryRouter } from 'react-router-dom';
import { DataView } from '../../components/primitives/DataView';
import { AccessDenied } from '../../components/primitives/AccessDenied';

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

afterEach(async () => {
  await i18next.changeLanguage('fr');
});

type Row = { id: string };

function renderView(props: { error?: string | null; errorCause?: unknown; onRetry?: () => void }) {
  return render(
    <MemoryRouter>
      <DataView<Row>
        items={[]}
        total={0}
        page={1}
        pageSize={10}
        onPageChange={() => undefined}
        columns={[{ title: 'Id', dataIndex: 'id', key: 'id' }]}
        renderCard={r => <div>{r.id}</div>}
        rowKey={r => r.id}
        aria-label="Liste"
        {...props}
      />
    </MemoryRouter>
  );
}

const onRetry = () => undefined;

describe('DataView - refus de droits (403)', () => {
  it('403 (forme Axios) : AccessDenied, sans bouton Réessayer', () => {
    renderView({ error: 'Impossible de charger', errorCause: { response: { status: 403, data: {} } }, onRetry });
    expect(screen.getByText('Accès non autorisé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réessayer/ })).toBeNull();
  });

  it('403 (ApiError / statusCode) sans error : AccessDenied', () => {
    renderView({ errorCause: { statusCode: 403 } });
    expect(screen.getByText('Accès non autorisé')).toBeInTheDocument();
  });

  it('500 avec error : rendu d’erreur et Réessayer', () => {
    renderView({ error: 'Impossible de charger', errorCause: { response: { status: 500 } }, onRetry });
    expect(screen.getByText('Impossible de charger')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
    expect(screen.queryByText('Accès non autorisé')).toBeNull();
  });

  it('erreur sans statut : rendu d’erreur existant', () => {
    renderView({ error: 'Impossible de charger', errorCause: new Error('réseau'), onRetry });
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
  });

  it('403 avec code (abonnement) : rendu d’erreur existant', () => {
    renderView({
      error: 'Abonnement requis',
      errorCause: { response: { status: 403, data: { code: 'SUBSCRIPTION_REQUIRED' } } },
      onRetry
    });
    expect(screen.getByText('Abonnement requis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
    expect(screen.queryByText('Accès non autorisé')).toBeNull();
  });

  it('sans errorCause : inchangé', () => {
    renderView({ error: 'Impossible de charger', onRetry });
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
  });
});

describe('AccessDenied - changement de langue à chaud', () => {
  it('retraduit le titre sans recharger le module', async () => {
    i18next.addResourceBundle('ar', 'app', { 'Accès non autorisé': 'وصول غير مصرح' }, true, true);
    const view = render(
      <MemoryRouter>
        <AccessDenied reason="role" />
      </MemoryRouter>
    );
    expect(screen.getByText('Accès non autorisé')).toBeInTheDocument();
    await i18next.changeLanguage('ar');
    view.rerender(
      <MemoryRouter>
        <AccessDenied reason="role" />
      </MemoryRouter>
    );
    expect(screen.getByText('وصول غير مصرح')).toBeInTheDocument();
  });
});
