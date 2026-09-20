import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarPage } from '../../pages/crm/Calendar';
import { versEvenementAgenda, grouperParJour, filtrerEvenements, lignesExport } from '../../pages/crm/calendar-model';
import type { EvenementAgenda } from '../../pages/crm/calendar-model';

/**
 * Calendrier CRM — modèle et écran.
 *
 * Les fonctions du modèle sont testées directement : elles sont pures, et ce
 * sont elles qui portent les décisions qui se voient — quel jour, quel ordre,
 * quels champs à l'export.
 *
 * Le poids du module `react-big-calendar` n'est pas vérifié ici : jsdom ne dit
 * rien des chunks. Il l'a été par la mesure du build — 8 124 o gzip pour la
 * page contre 59 616 o pour la grille chargée à la demande — et à l'écran, en
 * constatant qu'aucune ressource `CalendarGrid` n'est demandée en vue agenda.
 */

const getCalendarEvents = vi.fn();

vi.mock('../../services/crm-service', () => ({
  getCalendarEvents: (...a: unknown[]) => getCalendarEvents(...a),
  rescheduleFollowUp: vi.fn(),
  markFollowUpDone: vi.fn(),
  createActivity: vi.fn()
}));

vi.mock('../../components/crm/ActivityForm', () => ({ ActivityForm: () => null }));
vi.mock('../../components/crm/AdvancedFilters', () => ({ AdvancedFilters: () => <div>filtres avancés</div> }));
vi.mock('../../utils/export-utils', () => ({ exportToCSV: vi.fn(), exportToExcel: vi.fn() }));

const estDesktop = vi.hoisted(() => ({ value: false }));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: estDesktop.value ? 'lg' : 'xs',
    isMobile: !estDesktop.value,
    isTablet: false,
    isDesktop: estDesktop.value
  })
}));

function evenementBrut(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'ev-1',
    eventType: 'FOLLOWUP',
    title: 'Rappeler le client',
    start: '2026-05-06T09:30:00.000Z',
    end: '2026-05-06T09:30:00.000Z',
    contactId: 'c1',
    contactName: 'Aissatou Kouassi',
    dealId: null,
    dealLabel: null,
    status: 'PENDING',
    badges: [],
    canEdit: true,
    canDrag: true,
    createdByUserId: 'u1',
    ...overrides
  };
}

/** Événement déjà converti, pour les fonctions qui travaillent en aval. */
function evenement(start: Date, overrides: Partial<EvenementAgenda> = {}): EvenementAgenda {
  return {
    eventId: `ev-${start.getTime()}`,
    eventType: 'FOLLOWUP',
    title: 'Événement',
    start,
    end: start,
    contactId: 'c1',
    contactName: 'Aissatou Kouassi',
    dealId: null,
    dealLabel: null,
    badges: [],
    canEdit: true,
    canDrag: true,
    createdByUserId: 'u1',
    ...overrides
  } as EvenementAgenda;
}

describe('versEvenementAgenda — dates', () => {
  it('écarte un événement dont la date de début est illisible', () => {
    // Une date invalide produit un `Date` NaN, que la grille place n'importe
    // où — ou fait planter selon la vue. Mieux vaut ne pas l'afficher que
    // l'afficher au mauvais jour.
    expect(versEvenementAgenda(evenementBrut({ start: 'pas-une-date' }) as never)).toBeNull();
    expect(versEvenementAgenda(evenementBrut({ start: null }) as never)).toBeNull();
  });

  it('donne au moins la durée d’un instant à une relance sans fin', () => {
    const converti = versEvenementAgenda(evenementBrut({ end: null }) as never);
    expect(converti?.end.getTime()).toBe(converti?.start.getTime());
  });

  it('ignore une date de fin illisible sans écarter l’événement', () => {
    const converti = versEvenementAgenda(evenementBrut({ end: 'n’importe quoi' }) as never);
    expect(converti).not.toBeNull();
    expect(converti?.end.getTime()).toBe(converti?.start.getTime());
  });
});

describe('grouperParJour', () => {
  it('regroupe sur le jour LOCAL, pas sur la date UTC', () => {
    // Un événement à 23 h heure locale appartient au jour que l'utilisateur
    // voit. Une clé bâtie sur `toISOString()` le rangerait au lendemain pour
    // tout fuseau à l'est de Greenwich — et la veille à l'ouest.
    const tard = new Date(2026, 4, 6, 23, 30);
    const tot = new Date(2026, 4, 6, 1, 0);

    const groupes = grouperParJour([tard, tot].map(d => evenement(d)));
    expect(groupes).toHaveLength(1);
    expect(groupes[0].evenements).toHaveLength(2);
  });

  it('ordonne les journées et les événements de chaque journée', () => {
    const groupes = grouperParJour([
      evenement(new Date(2026, 4, 8, 10)),
      evenement(new Date(2026, 4, 6, 15)),
      evenement(new Date(2026, 4, 6, 9))
    ]);

    expect(groupes.map(g => g.jour.getDate())).toEqual([6, 8]);
    expect(groupes[0].evenements.map(e => e.start.getHours())).toEqual([9, 15]);
  });

  it('rend une liste vide sans se plaindre', () => {
    expect(grouperParJour([])).toEqual([]);
  });
});

describe('filtrerEvenements', () => {
  const jeu = [
    evenement(new Date(2026, 4, 6, 9), { eventType: 'FOLLOWUP', assignedToUserId: 'u1', contactName: 'Aissatou' }),
    evenement(new Date(2026, 4, 6, 10), {
      eventType: 'PROPERTY_VISIT',
      assignedToUserId: 'u2',
      contactName: 'Mamadou'
    })
  ];

  it('filtre par nature d’événement', () => {
    expect(filtrerEvenements(jeu, { type: 'FOLLOWUP' })).toHaveLength(1);
    expect(filtrerEvenements(jeu, { type: 'VISITE' })[0].eventType).toBe('PROPERTY_VISIT');
  });

  it('filtre par collaborateur assigné', () => {
    expect(filtrerEvenements(jeu, { assignedTo: 'u2' })[0].contactName).toBe('Mamadou');
  });

  it('cherche un nom sans tenir compte de la casse ni des espaces', () => {
    expect(filtrerEvenements(jeu, { contactName: '  aiss ' })).toHaveLength(1);
  });

  it('ne filtre rien quand aucun critère n’est posé', () => {
    expect(filtrerEvenements(jeu, {})).toHaveLength(2);
  });
});

describe('lignesExport', () => {
  it('produit les mêmes lignes pour le CSV et pour le tableur', () => {
    // Les deux boutons d'export dupliquaient vingt lignes de préparation à
    // l'identique. Deux copies finissent par diverger, et l'on obtient alors
    // deux exports différents du même écran.
    const lignes = lignesExport([evenement(new Date(2026, 4, 6, 9), { title: 'Rappel', dealLabel: 'Affaire X' })]);
    expect(lignes).toHaveLength(1);
    expect(Object.keys(lignes[0])).toEqual([
      'Type',
      'Titre',
      'Contact',
      'Affaire',
      'Date début',
      'Date fin',
      "Type d'action",
      'Lieu',
      'Statut',
      'Badges'
    ]);
    expect(lignes[0].Type).toBe('Relance');
  });
});

function mount(url: string) {
  getCalendarEvents.mockResolvedValue({ success: true, events: [evenementBrut()] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/crm/calendar" element={<CalendarPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  estDesktop.value = false;
});

describe('Calendrier — vue par défaut selon le palier', () => {
  it('affiche l’agenda sous 992 px, sans charger la grille', async () => {
    // Le §8.1 le demande nommément. La grille pèse 59 616 o gzip pour un
    // rendu illisible sur 375 px.
    mount('/tenant/agence-1/crm/calendar');
    await waitFor(() => expect(getCalendarEvents).toHaveBeenCalled());
    expect(await screen.findByText('Rappeler le client', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(document.querySelector('.rbc-calendar')).toBeNull();
  });

  it('respecte un choix explicite porté par l’URL, même sur mobile', async () => {
    // On peut vouloir la grille malgré tout : le choix de l'utilisateur
    // l'emporte sur le défaut du palier.
    mount('/tenant/agence-1/crm/calendar?vue=month');
    await waitFor(() => expect(getCalendarEvents).toHaveBeenCalled());
    // La grille est chargée dynamiquement : on n'attend pas son rendu ici,
    // seulement que l'agenda ne soit PAS choisi.
    expect(screen.queryByText("Aujourd'hui —")).not.toBeInTheDocument();
  });
});

describe('Calendrier — une seule action primaire', () => {
  it('n’offre plus deux boutons qui font la même chose', async () => {
    // « Nouvelle activité » et « Nouvelle relance » ouvraient le même
    // formulaire avec les mêmes valeurs.
    mount('/tenant/agence-1/crm/calendar');
    await screen.findByText('Rappeler le client', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: /Nouvelle activité/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Nouvelle relance/ })).toHaveLength(1);
  });
});
