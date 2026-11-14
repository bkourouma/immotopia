import type { HelpEntry } from '../../../types';

/** « proprietaire-biens » zone of the « portails » module (en): the owner's properties, leases, revenues, installments and payments. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Home
  {
    id: 'portails.proprietaire.accueil',
    kind: 'page',
    title: 'Owner portal home',
    summary:
      'Your owner dashboard: the state of your properties, your revenues, the upcoming installments, the latest payments received and the latest incidents. It is the starting screen to follow the properties you entrusted to the agency.',
    purpose:
      'The portal lets you follow your properties without calling the agency. The figures come from the properties, leases and payments the agency records for you: you only see the properties linked to you.',
    steps: [
      {
        title: 'Read the situation of your properties',
        detail:
          'The cards at the top count your properties, those that are rented, available or under maintenance, and the occupancy rate.'
      },
      {
        title: 'Look at your revenues',
        detail:
          'The « Income this month », « Income this year » and « Income last month » cards add up the payments collected.'
      },
      {
        title: 'Anticipate the next payments',
        detail: 'The « Upcoming payments » card lists the next 5 installments to be paid.'
      },
      {
        title: 'Check what happened',
        detail:
          'The « Recent payments » card lists the last 5 payments received, and « Recent maintenance tickets » the last 5 incidents.'
      },
      { title: 'Refresh', detail: 'The « Refresh » button reloads all the data on the screen.' }
    ],
    consequences: [
      'This screen is read-only: nothing you do here changes your properties, leases or payments.',
      'The amounts are sums collected from tenants. They do not tell you what the agency has already paid out to you.'
    ],
    faq: [
      {
        q: 'Why is a property missing from my dashboard?',
        a: 'Only the properties the agency has linked to you appear: properties you own, properties under a current management mandate, or properties rented under a lease where you are named as owner. If one is missing, contact your agency.'
      },
      {
        q: 'Do revenues include the security deposit?',
        a: 'No. The security deposit is money held on behalf of the tenant: it is never counted in your revenues. You follow it in the « Security deposits » screen.'
      },
      {
        q: 'A figure is wrong. What should I do?',
        a: 'You cannot correct it yourself: contact your agency, which manages the data of your leases and payments.'
      }
    ],
    permissions: {
      roles: ['Owner'],
      note: 'Owner portal screen. It only shows the properties the agency has linked to your account.'
    },
    related: [
      { label: 'My properties', helpId: 'portails.proprietaire.biens' },
      { label: 'Revenues', helpId: 'portails.proprietaire.revenus' },
      { label: 'Installments', helpId: 'portails.proprietaire.echeances' },
      { label: 'Payments', helpId: 'portails.proprietaire.paiements' }
    ],
    keywords: ['dashboard', 'home', 'owner', 'portfolio', 'revenues', 'occupancy', 'portal'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'proprietaire-portefeuille',
          title: 'Your properties at a glance',
          description:
            'This card counts all the properties linked to you. Next to it, you see how many are rented, available or under maintenance.'
        },
        {
          target: 'proprietaire-occupation',
          title: 'The occupancy rate',
          description:
            'It is the share of your properties that have a lease in progress. The closer to 100 %, the fewer empty properties you have.'
        },
        {
          target: 'proprietaire-revenus-mois',
          title: 'Your revenues this month',
          description:
            'This amount adds up the rent payments collected this month on your properties. The security deposit is not part of it.'
        },
        {
          target: 'proprietaire-prochains-paiements',
          title: 'The upcoming installments',
          description:
            'Here are the next 5 installments to be paid, with the property, the tenant and the date. The full list is in « Instalments ».'
        },
        {
          target: 'proprietaire-paiements-recents',
          title: 'The latest payments received',
          description:
            'Each line is a successful payment, with its amount, method and date. Find the full history in « Payments ».'
        }
      ]
    }
  },
  {
    id: 'portails.proprietaire.accueil.portefeuille',
    kind: 'section',
    title: 'Your portfolio indicators',
    summary:
      'Five cards summarize the state of your properties: the total, those that are rented, available or under maintenance, and the occupancy rate.',
    howToRead: {
      notes: [
        'Total properties: all the properties linked to you by the agency.',
        'Let: properties that have an active lease. The lease is what counts: a property marked « Let » but without an active lease is not counted as rented.',
        'Under maintenance: properties without an active lease whose status is « Under review ».',
        'Available: properties without an active lease that are not under maintenance, sold, archived or in draft.',
        'Occupancy rate: the number of rented properties divided by the total, as a percentage with one decimal (for example 66.7 %).',
        'A sold, archived or draft property is counted in the total but not in the other three cards: the sum of the three can therefore be smaller than the total.'
      ]
    },
    faq: [
      {
        q: 'Why do « Let » and « Available » not add up to the total?',
        a: 'Properties under maintenance, sold, archived or in draft are counted separately or not at all. Only « Total properties » includes them all.'
      },
      {
        q: 'My property is rented but appears as available. Why?',
        a: 'The screen relies on the lease: without an active lease linked to the property, it is not counted as rented. Ask your agency to check the lease.'
      },
      { q: 'Where can I see the list of my properties?', a: 'Open « My properties » in the menu.' }
    ],
    related: [{ label: 'My properties', helpId: 'portails.proprietaire.biens' }],
    keywords: ['total', 'rented', 'available', 'maintenance', 'rate', 'occupancy', 'portfolio']
  },
  {
    id: 'portails.proprietaire.accueil.revenus',
    kind: 'section',
    title: 'Revenue indicators',
    summary: 'Three cards add up the rent collected on your properties: this month, this year and last month.',
    howToRead: {
      notes: [
        'Income this month: successful payments dated in the current month.',
        'Income this year: successful payments since 1 January of the current year.',
        'Income last month: successful payments of the previous month.',
        'Payments used to build up a security deposit are not counted: it is not revenue.',
        'These are the amounts paid by tenants, as recorded. They do not tell you what the agency has paid out to you.'
      ]
    },
    faq: [
      {
        q: 'A payment from this month is not in « Income this month ». Why?',
        a: 'Only successful payments count, on the date they succeeded. A payment awaiting validation is not counted yet.'
      },
      {
        q: 'Where can I see the detail by month and by property?',
        a: 'Open « Income » in the menu: a monthly chart and a table by property are provided there.'
      },
      {
        q: 'Why are the revenues of past years not here?',
        a: 'This screen only shows three recent periods. The « Income » screen gives the total since the beginning and the months of the last five years.'
      }
    ],
    related: [{ label: 'Revenues', helpId: 'portails.proprietaire.revenus' }],
    keywords: ['revenues', 'rent collected', 'month', 'year']
  },
  {
    id: 'portails.proprietaire.accueil.prochains-paiements',
    kind: 'section',
    title: 'Upcoming payments',
    summary: 'The next 5 rent installments to be paid on your properties, from the nearest to the furthest.',
    howToRead: {
      notes: [
        'Each line shows the installment amount, its « Due date » status, the property, the tenant, the period (year-month) and the due date.',
        'The amount is the total of the installment: rent, service charges, other fees and any penalty.',
        'Only installments « to be paid » whose date has not passed yet appear here. An overdue or partly paid installment is not listed: it is in the « Instalments » screen.',
        '« No upcoming instalment » is displayed when there are none.'
      ]
    },
    faq: [
      {
        q: 'Where can I see overdue installments?',
        a: 'In « Instalments »: the « Overdue » card counts them and the table lets you filter on this status.'
      },
      {
        q: 'Does this list show more than 5 installments?',
        a: 'No, only the 5 nearest. For the full list, open « Instalments ».'
      },
      {
        q: 'Is the amount what I will receive?',
        a: 'No, it is what the tenant has to pay for the installment. It does not take into account what the agency pays out.'
      }
    ],
    related: [{ label: 'Installments', helpId: 'portails.proprietaire.echeances' }],
    keywords: ['upcoming installments', 'rent due', 'next installment']
  },
  {
    id: 'portails.proprietaire.accueil.paiements-recents',
    kind: 'section',
    title: 'Recent payments',
    summary: 'The last 5 rent payments received on your properties, from the most recent to the oldest.',
    howToRead: {
      notes: [
        'Each line shows the amount, the method (Cash, Bank transfer, Cheque, Mobile Money, Direct debit, Card or Other), the property, the tenant and the date.',
        'Only successful payments are listed, excluding security deposits.',
        '« No recent payment » is displayed when there are none.'
      ]
    },
    faq: [
      {
        q: 'Where can I see all the payments?',
        a: 'In the « Payments » screen, which offers search, filters, export and the detail of each payment.'
      },
      {
        q: 'A payment the tenant made is not here. Why?',
        a: 'It is probably awaiting validation by the agency. It appears here once it is recorded as successful.'
      },
      {
        q: 'Why is the date written out in full?',
        a: 'It is the date on which the payment succeeded, displayed in words.'
      }
    ],
    related: [{ label: 'Payments', helpId: 'portails.proprietaire.paiements' }],
    keywords: ['payments received', 'latest payments', 'collections']
  },
  {
    id: 'portails.proprietaire.accueil.incidents',
    kind: 'section',
    title: 'Recent maintenance tickets',
    summary: 'The last 5 incidents reported on your properties, from the most recent to the oldest.',
    howToRead: {
      notes: [
        'Each line shows the ticket title, its status, the property concerned and the creation date.',
        'The « In progress » and « Resolved » statuses are translated. Other statuses may appear as the system records them.',
        '« No recent ticket » is displayed when there are none.'
      ]
    },
    faq: [
      {
        q: 'Where can I see the detail of an incident?',
        a: 'In the « Maintenance » screen of the portal, which lists all the incidents of your properties.'
      },
      { q: 'Can I report an incident from this screen?', a: 'No, this card is read-only.' },
      { q: 'How many incidents are shown?', a: 'The 5 most recent, whatever their status.' }
    ],
    related: [{ label: 'Maintenance', helpId: 'portails.proprietaire.incidents' }],
    keywords: ['maintenance', 'incident', 'ticket', 'repair']
  },

  // ------------------------------------------------------------ Properties
  {
    id: 'portails.proprietaire.biens',
    kind: 'page',
    title: 'My properties',
    summary:
      'The list of your properties as cards, with their status, their type and, if there is one, the active lease. This screen is used to find a property and open its file.',
    purpose:
      'You see all the properties the agency has linked to you: properties you own, properties under a current management mandate, or properties rented under a lease where you are the owner.',
    steps: [
      { title: 'Read the cards at the top', detail: 'They count all your properties, whatever the current search.' },
      {
        title: 'Search for a property',
        detail:
          'Type part of the address or the tenant name in « Search ». The « Status », « Property type » and « Transaction mode » filters narrow the list.'
      },
      { title: 'Open the file', detail: 'Click « View details » at the bottom of the property card.' },
      { title: 'Go back to the full list', detail: 'Use « Clear filters » when no property matches.' }
    ],
    consequences: [
      'This screen is read-only: you cannot add, change or delete a property.',
      'The cards are displayed 12 at a time, with pagination to see the next ones.'
    ],
    faq: [
      {
        q: 'Why does a property marked « Let » appear as « Available »?',
        a: 'The card relies on the lease: a property without an active lease is displayed as « Available », even if its recorded status is « Let ».'
      },
      {
        q: 'How do I add or correct a property?',
        a: 'You cannot do it here. Contact your agency, which manages the file of each property.'
      },
      {
        q: 'Where can I see the rent and payments of a property?',
        a: 'Open its file: the « Active lease » and « Income statistics » tabs detail them.'
      }
    ],
    permissions: { roles: ['Owner'], note: 'Only shows the properties linked to your account.' },
    related: [
      { label: 'Property file', helpId: 'portails.proprietaire.bien-detail' },
      { label: 'My leases', helpId: 'portails.proprietaire.baux' }
    ],
    keywords: ['properties', 'buildings', 'housing', 'assets', 'cards']
  },
  {
    id: 'portails.proprietaire.biens.indicateurs',
    kind: 'section',
    title: 'Your property indicators',
    summary: 'Four cards count your properties: the total, and those that are rented, available or under maintenance.',
    howToRead: {
      notes: [
        'Total: all your properties, even those hidden by the search.',
        'Let: properties that have an active lease.',
        'Available: properties without an active lease, not under maintenance, sold, archived or in draft.',
        'Under maintenance: properties without an active lease whose status is « Under review ».',
        'A sold, archived or draft property is counted in the total only.'
      ]
    },
    faq: [
      {
        q: 'Why is the total larger than the sum of the other cards?',
        a: 'A sold, archived or draft property is counted in the total only.'
      },
      {
        q: 'When is a property counted in « Available »?',
        a: 'When it has no active lease and is not under maintenance, sold, archived or in draft.'
      },
      {
        q: 'Does the total change when I type a search?',
        a: 'No: the total counts all your properties, even those hidden by the search.'
      }
    ],
    related: [{ label: 'Home indicators', helpId: 'portails.proprietaire.accueil.portefeuille' }],
    keywords: ['total', 'rented', 'available', 'maintenance']
  },
  {
    id: 'portails.proprietaire.biens.liste',
    kind: 'section',
    title: 'Your property cards',
    summary:
      'One card per property, with the address, the status, the type, the transaction modes and the active lease. Search and filters are above.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'The property is being prepared by the agency.' },
        { value: 'UNDER_REVIEW', label: 'Under review', description: 'The property is being checked by the agency.' },
        { value: 'AVAILABLE', label: 'Available', description: 'The property is free and can be rented.' },
        { value: 'RESERVED', label: 'Reserved', description: 'The property is reserved.' },
        { value: 'UNDER_OFFER', label: 'Under offer', description: 'An offer is in progress on the property.' },
        { value: 'RENTED', label: 'Let', description: 'The property is rented.' },
        { value: 'SOLD', label: 'Sold', description: 'The property is sold.' },
        { value: 'ARCHIVED', label: 'Archived', description: 'The property is no longer active.' }
      ],
      notes: [
        'Property types: Flat, House / Villa, Studio, Duplex / Triplex, Room / House share, Office, Shop / Retail, Warehouse / Industrial, Plot, Building, Parking / Garage, New-build unit.',
        'Transaction modes: Sale, Rental, Short-term rental.',
        'The « Active lease » box gives the tenant and the rent per month. Without an active lease, an available property shows « Property available ».',
        'The « Status » filter relies on the recorded status of the property, whereas the card displays « Available » for a property marked « Let » without an active lease.',
        'The search criteria are: address and tenant name, status, property type and transaction mode.'
      ]
    },
    faq: [
      {
        q: 'How do I find a specific property?',
        a: 'Type part of its address or the tenant name in « Search ».'
      },
      { q: 'What does « View details » do?', a: 'It opens the full file of the property, with its tabs.' },
      {
        q: 'Why does a card have no rent?',
        a: 'The rent comes from the active lease. Without an active lease on the property, no rent is displayed.'
      }
    ],
    related: [{ label: 'Property file', helpId: 'portails.proprietaire.bien-detail' }],
    keywords: ['card', 'search', 'filter', 'property status', 'property type']
  },

  // ------------------------------------------------------------ Property file
  {
    id: 'portails.proprietaire.bien-detail',
    kind: 'page',
    title: 'Property file',
    summary:
      'The full file of one of your properties, in five tabs: information, active lease, lease history, revenue statistics and maintenance history.',
    purpose:
      'You follow one property in particular: who occupies it, what it earns and what has happened there. The figures come from the leases and payments recorded by the agency.',
    steps: [
      { title: 'Choose a tab', detail: 'The last tab opened is kept in the page address.' },
      {
        title: 'Read the active lease',
        detail: 'The « Active lease » tab gives the tenant, the dates, the rent and the service charges.'
      },
      {
        title: 'Consult the revenues',
        detail: 'The « Income statistics » tab gives the total received, the current month and the monthly average.'
      },
      { title: 'Go back to the list', detail: 'The « Back » button takes you back to « My properties ».' }
    ],
    consequences: ['This screen is read-only: no change is possible.'],
    faq: [
      {
        q: 'Why is the « Active lease » tab empty?',
        a: 'The property has no lease in progress. Ended leases are in « Lease history ».'
      },
      {
        q: 'Where can I see the photos and documents of the property?',
        a: 'This screen does not display them. The documents of your leases are in the « Documents » screen of the portal.'
      },
      {
        q: 'An « unauthorized access » message appears. Why?',
        a: 'The property is not linked to your account. Contact your agency.'
      }
    ],
    permissions: { roles: ['Owner'], note: 'Reserved for the properties linked to your account.' },
    related: [
      { label: 'My properties', helpId: 'portails.proprietaire.biens' },
      { label: 'Documents', helpId: 'portails.proprietaire.documents' }
    ],
    keywords: ['file', 'property detail', 'property', 'tabs']
  },
  {
    id: 'portails.proprietaire.bien-detail.informations',
    kind: 'section',
    title: 'Property information',
    summary: 'The characteristics of the property: address, type, status, transaction modes and description.',
    howToRead: {
      notes: [
        'Status: Draft, Under review, Available, Reserved, Under offer, Let, Sold or Archived. It is the recorded status, which may differ from the one on the card in « My properties ».',
        'Transaction modes: Sale, Rental, Short-term rental.',
        'The property title is displayed at the top of the page, under the « Back » button.'
      ]
    },
    faq: [
      {
        q: 'Why does the status differ from the one on the card?',
        a: 'The recorded status is shown here, and it may differ from the one on the card in « My properties ».'
      },
      {
        q: 'What statuses can a property have?',
        a: 'Draft, Under review, Available, Reserved, Under offer, Let, Sold or Archived.'
      },
      { q: 'Where can I see the property title?', a: 'At the top of the page, under the « Back » button.' }
    ],
    related: [{ label: 'Your property cards', helpId: 'portails.proprietaire.biens.liste' }],
    keywords: ['address', 'type', 'description', 'characteristics']
  },
  {
    id: 'portails.proprietaire.bien-detail.bail-actif',
    kind: 'section',
    title: 'Active lease of the property',
    summary: 'The lease in progress on this property: main tenant, dates, rent, service charges and co-tenants.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The lease is in progress.' },
        { value: 'SUSPENDED', label: 'Suspended', description: 'The agency has put the lease on hold.' },
        { value: 'DRAFT', label: 'Draft', description: 'The lease is prepared but not yet in force.' }
      ],
      notes: [
        '« Not set » in place of the end date means no end date is recorded.',
        '« Monthly rent » and « Charges » are the lease amounts, in FCFA.',
        'The co-tenants, when there are any, are listed under the table.'
      ]
    },
    faq: [
      { q: 'What does « Not set » mean in place of the end date?', a: 'That no end date is recorded for this lease.' },
      { q: 'Where can I see the co-tenants?', a: 'Under the table, when the lease has any.' },
      { q: 'In what unit are the amounts?', a: 'In FCFA: « Monthly rent » and « Charges » are the lease amounts.' }
    ],
    related: [{ label: 'Lease file', helpId: 'portails.proprietaire.bail-detail' }],
    keywords: ['current lease', 'tenant', 'rent', 'service charges', 'co-tenants']
  },
  {
    id: 'portails.proprietaire.bien-detail.historique-baux',
    kind: 'section',
    title: 'Lease history of the property',
    summary:
      'The former leases of this property, with the tenant, the period and the rent. A search by tenant name is provided.',
    howToRead: {
      notes: [
        'Only ended leases are listed, with the « Completed » status.',
        'Each line shows the tenant, the « From … to … » period and the rent per month.',
        'A missing end date is displayed as « N/A ».'
      ]
    },
    faq: [
      { q: 'Which leases are listed here?', a: 'Only ended leases, with the « Completed » status.' },
      { q: 'Why « N/A » in place of the end date?', a: 'No end date is recorded for this lease.' },
      { q: 'How can I find a former tenant?', a: 'Use the search by tenant name offered in this section.' }
    ],
    related: [{ label: 'My leases', helpId: 'portails.proprietaire.baux' }],
    keywords: ['former leases', 'previous tenants', 'history']
  },
  {
    id: 'portails.proprietaire.bien-detail.revenus',
    kind: 'section',
    title: 'Revenue statistics of the property',
    summary:
      'Three figures on the rent collected for this property: the total received, the current month and the monthly average.',
    howToRead: {
      notes: [
        'Total received: all successful payments on this property since the beginning, excluding security deposits.',
        'This month: the successful payments of the current month.',
        'Monthly average: the total received divided by the number of months elapsed since the first payment (in 30-day periods, at least one month).',
        'These are sums collected from the tenant, not payouts by the agency.'
      ]
    },
    faq: [
      {
        q: 'Why is the average low?',
        a: 'It spreads the total over all the months since the first payment, including months without payment.'
      },
      { q: 'Is the security deposit counted?', a: 'No, it is never counted in revenues.' },
      { q: 'Where can I see the revenues of all my properties?', a: 'In the « Income » screen of the menu.' }
    ],
    related: [{ label: 'Revenues', helpId: 'portails.proprietaire.revenus' }],
    keywords: ['total received', 'monthly average', 'property revenues']
  },
  {
    id: 'portails.proprietaire.bien-detail.maintenance',
    kind: 'section',
    title: 'Maintenance history of the property',
    summary:
      'The incidents reported on this property, from the most recent to the oldest, with a search by title, category or status.',
    howToRead: {
      notes: [
        'Each line shows the title, the status, the category, the priority and the creation date.',
        'The status, category and priority are displayed as the system records them, without translation.',
        'A « RESOLVED » ticket is shown in green, the others in blue.'
      ]
    },
    faq: [
      { q: 'What does each line show?', a: 'The title, status, category, priority and creation date of the incident.' },
      {
        q: 'Why are some words not translated?',
        a: 'The status, category and priority are displayed as the system records them, without translation.'
      },
      {
        q: 'How can I find a specific incident?',
        a: 'Search by title, category or status; incidents are sorted from the most recent to the oldest.'
      }
    ],
    related: [{ label: 'Maintenance', helpId: 'portails.proprietaire.incidents' }],
    keywords: ['incidents', 'repairs', 'tickets', 'works']
  },

  // ------------------------------------------------------------------ Leases
  {
    id: 'portails.proprietaire.baux',
    kind: 'page',
    title: 'My leases',
    summary:
      'The list of the rental contracts of your properties, with the tenant, the period and the rent. It is used to find a lease and open its file.',
    purpose:
      'Each lease links one of your properties to a tenant. You see all the leases of your properties, whatever their status, and the three counters at the top.',
    steps: [
      {
        title: 'Read the counters',
        detail: 'Active, ended and suspended leases, all leases together, whatever the search.'
      },
      {
        title: 'Search for a lease',
        detail:
          'Type the property or the tenant in « Search ». The « Status », « Property » and « Lease start » filters narrow the list.'
      },
      { title: 'Open the file', detail: 'Click « View details » on the right of the line.' }
    ],
    consequences: ['This screen is read-only: you cannot create, change or terminate a lease.'],
    faq: [
      {
        q: 'Where is the lease of my property?',
        a: 'If the lease is not here, the agency has not recorded it yet for this property. Contact it.'
      },
      { q: 'What does « Not set » mean?', a: 'The lease has no end date recorded.' },
      { q: 'Can I change the rent?', a: 'No. Only the agency can change a lease.' }
    ],
    permissions: { roles: ['Owner'], note: 'Only shows the leases of your properties.' },
    related: [
      { label: 'Lease file', helpId: 'portails.proprietaire.bail-detail' },
      { label: 'My properties', helpId: 'portails.proprietaire.biens' }
    ],
    keywords: ['leases', 'rental contracts', 'tenants', 'rent']
  },
  {
    id: 'portails.proprietaire.baux.indicateurs',
    kind: 'section',
    title: 'Lease counters',
    summary: 'Three cards count your leases by status: active, ended and suspended.',
    howToRead: {
      notes: [
        'Active leases: leases in progress.',
        'Ended leases: leases that have reached their end.',
        'Suspended leases: leases put on hold by the agency.',
        'The counters cover all your leases, even those hidden by the search. Canceled or draft leases are not counted here, but appear in the list.'
      ]
    },
    faq: [
      {
        q: 'Why is a canceled lease not counted in these cards?',
        a: 'Canceled or draft leases are not counted here, but they appear in the list.'
      },
      {
        q: 'Does the search change the counters?',
        a: 'No: they cover all your leases, even those hidden by the search.'
      },
      { q: 'What does « Suspended leases » mean?', a: 'These are the leases put on hold by the agency.' }
    ],
    related: [{ label: 'Lease list', helpId: 'portails.proprietaire.baux.liste' }],
    keywords: ['active leases', 'ended leases', 'suspended leases']
  },
  {
    id: 'portails.proprietaire.baux.liste',
    kind: 'section',
    title: 'Lease list',
    summary: 'Each line is a lease: the property, its status, the tenant, the dates and the rent per month.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The lease is in progress.' },
        { value: 'ENDED', label: 'Completed', description: 'The lease has reached its end.' },
        { value: 'SUSPENDED', label: 'Suspended', description: 'The agency has put the lease on hold.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The lease has been canceled.' },
        { value: 'DRAFT', label: 'Draft', description: 'The lease is prepared but not yet in force.' }
      ],
      notes: [
        'Each line indicates « Renter: … », « From … to … » (or « Not set ») and « Rent: … / month ».',
        'Filters: « Status » (Active, Completed, Suspended, Cancelled), « Property » and « Lease start » (a range of dates).',
        'Leases are sorted from the most recent to the oldest by start date.'
      ]
    },
    faq: [
      { q: 'How do I see only the leases in progress?', a: 'Choose « Active » in the « Status » filter.' },
      {
        q: 'Two leases have the same address. How do I tell them apart?',
        a: 'Use the « Property » filter, which recognizes each property, even when two units of a building share the address.'
      },
      {
        q: 'Where can I see the payment detail of a lease?',
        a: 'Click « View details » then open the « Payment history » tab.'
      }
    ],
    related: [{ label: 'Lease file', helpId: 'portails.proprietaire.bail-detail' }],
    keywords: ['list', 'search', 'filter', 'lease status']
  },

  // ------------------------------------------------------------ Lease file
  {
    id: 'portails.proprietaire.bail-detail',
    kind: 'page',
    title: 'Lease file',
    summary:
      'The full file of a lease, in six tabs: information, tenants, installments, payment history, balance and security deposit.',
    purpose:
      'You follow a rental contract: what the tenant owes, what they have paid and the security deposit. The figures come from the installments and payments recorded by the agency.',
    steps: [
      {
        title: 'Read the information',
        detail:
          'The « Information » tab gives the number, the dates, the rent, the service charges and the security deposit.'
      },
      {
        title: 'See what is owed',
        detail:
          'The « Instalments » tab lists the schedule. The « Balance » tab sums up the total due, paid and the remaining balance.'
      },
      {
        title: 'Check the payments',
        detail: 'The « Payment history » tab shows each successful payment and the installments it settled.'
      },
      {
        title: 'Check the deposit',
        detail: 'The « Security deposit » tab gives the target, held and refunded amounts.'
      }
    ],
    consequences: ['This screen is read-only: nothing here changes the lease, the installments or the payments.'],
    faq: [
      {
        q: 'Why is the « Left to pay » smaller than the total of the installments?',
        a: 'It only counts the installments whose date has arrived. Upcoming installments are reported separately in a blue box.'
      },
      {
        q: 'The « Security deposit » tab is empty. Why?',
        a: 'No deposit is recorded on this lease. Contact the agency if you expected one.'
      },
      { q: 'Can the tenant names be edited?', a: 'No. Only the agency can edit them.' }
    ],
    permissions: { roles: ['Owner'], note: 'Reserved for the leases of your properties.' },
    related: [
      { label: 'My leases', helpId: 'portails.proprietaire.baux' },
      { label: 'Security deposits', helpId: 'portails.proprietaire.cautions' }
    ],
    keywords: ['lease file', 'contract', 'balance', 'schedule', 'tabs']
  },
  {
    id: 'portails.proprietaire.bail-detail.informations',
    kind: 'section',
    title: 'Lease information',
    summary: 'The terms of the lease: property, number, dates, rent, service charges, security deposit and status.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The lease is in progress.' },
        { value: 'ENDED', label: 'Completed', description: 'The lease has reached its end.' },
        { value: 'SUSPENDED', label: 'Suspended', description: 'The agency has put the lease on hold.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The lease has been canceled.' },
        { value: 'DRAFT', label: 'Draft', description: 'The lease is prepared but not yet in force.' }
      ],
      notes: [
        '« Not set » in place of the end date means no end date is recorded.',
        'The « Security deposit » shown here is the amount provided for in the lease. The sums actually paid are read in the « Security deposit » tab.'
      ]
    },
    faq: [
      {
        q: 'Is the « Security deposit » shown the sum I paid?',
        a: 'No: it is the amount provided for in the lease. The sums actually paid are read in the « Security deposit » tab.'
      },
      { q: 'What does « Not set » mean in place of the end date?', a: 'That no end date is recorded for this lease.' },
      { q: 'What statuses can a lease have?', a: 'Active, Completed, Suspended, Cancelled or Draft.' }
    ],
    keywords: ['lease number', 'monthly rent', 'service charges', 'dates']
  },
  {
    id: 'portails.proprietaire.bail-detail.locataires',
    kind: 'section',
    title: 'Lease tenants',
    summary: 'The main tenant (name and e-mail) and, if there are any, the co-tenants.',
    howToRead: {
      notes: [
        'The « Co-tenants » box only appears if the lease has any.',
        'Only the name and the e-mail are displayed.'
      ]
    },
    faq: [
      { q: 'What information is shown about the tenant?', a: 'Only the name and the e-mail are displayed.' },
      { q: 'Why is the « Co-tenants » box missing?', a: 'It only appears if the lease has co-tenants.' },
      {
        q: 'Where can I see the installments and the security deposit of this lease?',
        a: 'In the other parts of the lease file: the installment schedule and the « Security deposit » tab.'
      }
    ],
    keywords: ['main tenant', 'co-tenants', 'e-mail']
  },
  {
    id: 'portails.proprietaire.bail-detail.echeances',
    kind: 'table',
    title: 'Installment schedule of the lease',
    summary:
      'All the installments of the lease, from the most recent to the oldest, with the amount due, the amount paid and the status.',
    howToRead: {
      columns: [
        {
          key: 'period',
          label: 'Period',
          description: 'The month concerned, written year-month (for example 2026-11).'
        },
        { key: 'due_date', label: 'Due date', description: 'The payment deadline of the installment.' },
        {
          key: 'amount',
          label: 'Amount',
          description: 'The total of the installment: rent, service charges, other fees and any penalty.'
        },
        { key: 'amount_paid', label: 'Paid', description: 'The sum already recorded as paid on this installment.' },
        { key: 'status', label: 'Status', description: 'The state of the installment.' }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'The installment is prepared but not yet payable.' },
        { value: 'DUE', label: 'Due date', description: 'The installment is to be paid.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Only part of it has been paid.' },
        { value: 'PAID', label: 'Paid', description: 'The installment is settled.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'The date has passed and an amount remains to be paid.' }
      ],
      notes: ['The table offers a search by period, filters and an export.']
    },
    faq: [
      {
        q: 'Why is « Paid » smaller than « Amount »?',
        a: 'The tenant has only paid part of it. The rest still has to be settled.'
      },
      {
        q: 'Where does the penalty come from?',
        a: 'It is added by the agency in case of delay and is part of the « Amount ».'
      },
      { q: 'How do I export the schedule?', a: 'Use the export button above the table.' }
    ],
    related: [{ label: 'Installments of all your leases', helpId: 'portails.proprietaire.echeances' }],
    keywords: ['schedule', 'calendar', 'rent due', 'delays']
  },
  {
    id: 'portails.proprietaire.bail-detail.paiements',
    kind: 'section',
    title: 'Payment history of the lease',
    summary:
      'The successful payments on this lease, from the most recent to the oldest, with the installments they settled.',
    howToRead: {
      notes: [
        'Each line shows the amount, the method (Cash, Bank transfer, Cheque, Mobile Money, Direct debit, Card or Other) and the date.',
        '« Allocations: » indicates which installments the payment was applied to, in the form « period (amount) ».',
        'A search by method and by date is provided above the list.'
      ]
    },
    faq: [
      {
        q: 'What is an allocation?',
        a: 'It is the part of a payment applied to an installment. One payment can settle several installments.'
      },
      { q: 'Does a pending payment appear here?', a: 'No, only successful payments are listed.' },
      { q: 'Where can I see the payments of all my leases?', a: 'In the « Payments » screen.' }
    ],
    related: [{ label: 'Payments', helpId: 'portails.proprietaire.paiements' }],
    keywords: ['lease payments', 'allocations', 'settlements']
  },
  {
    id: 'portails.proprietaire.bail-detail.solde',
    kind: 'section',
    title: 'Lease balance',
    summary: 'Three amounts to know where the lease stands: the total due, the total paid and the remaining balance.',
    howToRead: {
      notes: [
        'Total due: all the installments of the lease, paid or not, except canceled installments and unpaid drafts. Upcoming installments are part of it.',
        'Total paid: everything the successful payments have settled on the lease.',
        'Left to pay: what remains due on the installments whose date has arrived. It turns green when it is zero.',
        'The « Upcoming installments (not yet due) » box gives the amount of unpaid future installments. It is not included in the remaining balance.',
        'The « Amount awaiting payment » box appears when the remaining balance is above zero.'
      ]
    },
    faq: [
      {
        q: 'The remaining balance is zero but the tenant still owes rent?',
        a: 'These are probably upcoming installments: they are shown separately and will become payable on their date.'
      },
      {
        q: 'Are these amounts paid out by the agency?',
        a: 'No, they describe the relationship between the tenant and the lease, not payouts to the owner.'
      },
      {
        q: 'Does the total paid include the security deposit?',
        a: 'No, the deposit is read in the « Security deposit » tab.'
      }
    ],
    keywords: ['balance', 'total due', 'total paid', 'remaining balance', 'unpaid']
  },
  {
    id: 'portails.proprietaire.bail-detail.depot',
    kind: 'section',
    title: 'Security deposit of the lease',
    summary: 'The security deposit of this lease: target amount, held amount, refunded amount and movement history.',
    howToRead: {
      notes: [
        'Target amount: the deposit provided for in the lease.',
        'Amount held: the current balance of the deposit, that is what was collected minus what was refunded or forfeited.',
        'Amount refunded: the sum already returned to the tenant.',
        'Movement history: types Collection, Holding, Release, Refund, Forfeiture and Adjustment, with amount, date and optional note. The box only appears if there are movements.'
      ]
    },
    faq: [
      {
        q: 'Is the deposit revenue?',
        a: 'No, it is money held on behalf of the tenant. It is part of no revenue total.'
      },
      { q: 'Where can I see all my deposits?', a: 'In the « Security deposits » screen of the portal.' },
      {
        q: 'Nothing is displayed. Why?',
        a: 'No deposit is recorded on this lease: « No security deposit recorded ».'
      }
    ],
    related: [{ label: 'Security deposits', helpId: 'portails.proprietaire.cautions' }],
    keywords: ['deposit', 'security deposit', 'refund', 'forfeiture']
  },

  // ---------------------------------------------------------------- Revenues
  {
    id: 'portails.proprietaire.revenus',
    kind: 'page',
    title: 'Revenues',
    summary:
      'The analysis of the rent collected on your properties: four totals, a chart by month and a table by property.',
    purpose:
      'You see how much your properties have earned, month by month and property by property. The figures add up the successful payments recorded by the agency.',
    steps: [
      { title: 'Read the totals', detail: 'The four cards do not depend on the filters.' },
      { title: 'Choose a year', detail: 'The « Year (monthly income) » filter changes the chart by month.' },
      {
        title: 'Choose a period',
        detail: 'The « Period » filter limits the chart and the « Income by property » table to these dates.'
      },
      { title: 'Compare your properties', detail: 'The table ranks revenues by property with the number of payments.' }
    ],
    consequences: [
      'This screen is read-only.',
      'The security deposit is never counted in revenues.',
      'These are collections from tenants, not payouts by the agency.'
    ],
    faq: [
      {
        q: 'Why does the monthly chart not move when I choose a period?',
        a: 'The chart by month only follows the chosen year. The period applies to the chart and the table by property.'
      },
      {
        q: 'Why does my total for the month differ from my transfer?',
        a: 'These figures are collections. The agency transfer may follow other rules, which this screen does not show.'
      },
      { q: 'Can the table be exported?', a: 'Yes, with the export button above the table.' }
    ],
    permissions: { roles: ['Owner'], note: 'Only shows the revenues of your properties.' },
    related: [
      { label: 'Payments', helpId: 'portails.proprietaire.paiements' },
      { label: 'Reports', helpId: 'portails.proprietaire.rapports' }
    ],
    keywords: ['revenues', 'rent', 'chart', 'profitability', 'collections']
  },
  {
    id: 'portails.proprietaire.revenus.indicateurs',
    kind: 'section',
    title: 'Revenue totals',
    summary: 'Four cards sum up your revenues: this month, this year, all time and the monthly average.',
    howToRead: {
      notes: [
        'This month: successful payments of the current month.',
        'This year: successful payments since 1 January.',
        'All time: all successful payments on your properties.',
        'Monthly average: the all-time total divided by the number of months elapsed since the first payment (in 30-day periods, at least one month).',
        'The security deposit is not counted. The cards do not change with the filters.'
      ]
    },
    faq: [
      {
        q: 'Why does the monthly average drop when I have no payment?',
        a: 'The total is spread over a number of months that grows every month, even without payment.'
      },
      {
        q: 'Do these totals change with the « Period » filter?',
        a: 'No, they always cover all your properties and all dates.'
      },
      {
        q: 'Where is last year’s total?',
        a: 'Choose the desired year in the « Year (monthly income) » filter to see its months.'
      }
    ],
    keywords: ['this month', 'this year', 'all time', 'monthly average']
  },
  {
    id: 'portails.proprietaire.revenus.filtres',
    kind: 'section',
    title: 'Revenue filters',
    summary: 'Two choices: a date range for the revenues by property and a year for the revenues by month.',
    howToRead: {
      notes: [
        'Period: two dates (day/month/year). It limits the « Income by property » table and chart, according to the date the payments succeeded.',
        'Year (monthly income): the current year and the four previous ones. It drives the « Revenue by month » chart.',
        'Changing a filter reloads the screen.'
      ]
    },
    faq: [
      {
        q: 'What does the « Period » filter act on?',
        a: 'On the « Income by property » table and chart, according to the date the payments succeeded. It does not act on the « Revenue by month » chart.'
      },
      { q: 'Which years can I choose?', a: 'The current year and the four previous ones.' },
      { q: 'What happens when I change a filter?', a: 'The screen reloads with the new choice.' }
    ],
    keywords: ['filters', 'period', 'year']
  },
  {
    id: 'portails.proprietaire.revenus.graphique',
    kind: 'section',
    title: 'Revenue by month chart',
    summary:
      'A line of your revenues month by month for the chosen year. All 12 months appear, even those without payment.',
    howToRead: {
      notes: [
        'At the bottom: the months of the year. On the left: the amounts in FCFA.',
        'Hover over a point (or tap it) to see the exact amount for the month.',
        'The line adds up the successful payments of each month, excluding security deposits.',
        'A month without payment is worth 0 FCFA.'
      ]
    },
    faq: [
      { q: 'How do I see another year?', a: 'Change the value of the « Year (monthly income) » filter.' },
      { q: 'The line is flat. Why?', a: 'No successful payment is recorded for the chosen year.' },
      { q: 'Does the « Period » filter act here?', a: 'No, this chart only follows the year.' }
    ],
    keywords: ['line', 'chart', 'month', 'trend']
  },
  {
    id: 'portails.proprietaire.revenus.par-bien',
    kind: 'section',
    title: 'Revenue by property chart',
    summary: 'A bar chart comparing the revenues of each of your properties over the chosen period.',
    howToRead: {
      notes: [
        'One bar per property: its height is the total of the property’s successful payments.',
        'With no period chosen, the chart covers all dates.',
        'The table below gives the same figures and the number of payments.'
      ]
    },
    faq: [
      { q: 'What does the height of a bar represent?', a: "The total of the property's successful payments." },
      { q: 'What does the chart show if I do not choose a period?', a: 'It covers all dates.' },
      { q: 'Where can I see the number of payments of each property?', a: 'In the table below the chart.' }
    ],
    keywords: ['bar chart', 'comparison', 'by property']
  },
  {
    id: 'portails.proprietaire.revenus.tableau',
    kind: 'table',
    title: 'Revenue by property table',
    summary: 'The revenue and number of payments of each property over the chosen period.',
    howToRead: {
      columns: [
        {
          key: 'propertyAddress',
          label: 'Property',
          description: 'The property concerned, identified by its address.'
        },
        { key: 'revenue', label: 'Income', description: 'The sum of the property’s successful payments, in FCFA.' },
        {
          key: 'paymentCount',
          label: 'Number of payments',
          description: 'How many payments were received for this property.'
        }
      ],
      notes: [
        'The search applies to the property name.',
        'Only properties that received at least one payment over the period appear.'
      ]
    },
    faq: [
      {
        q: 'A property is missing from the table. Why?',
        a: 'It received no successful payment over the chosen period.'
      },
      { q: 'Can this table be exported?', a: 'Yes, with the export button above the table.' },
      { q: 'How do I change the period?', a: 'Use the « Period » filter in the « Filters » card.' }
    ],
    keywords: ['revenue by property', 'payments by property', 'export']
  },

  // ------------------------------------------------------------ Installments
  {
    id: 'portails.proprietaire.echeances',
    kind: 'page',
    title: 'Installments',
    summary:
      'The follow-up of the rent installments of all your leases: counters, two amounts and a table with search and filters.',
    purpose:
      'An installment is the sum a tenant must pay on a given date. You see here which ones are paid, to be paid or overdue.',
    steps: [
      {
        title: 'Read the counters',
        detail: 'They cover all the installments matching your search and filters.'
      },
      {
        title: 'Search',
        detail: 'Use « Search » (property, tenant…), then the « Status », « Property » and « Period » filters.'
      },
      {
        title: 'See the detail of a line',
        detail: 'Under the amount, « Paid » and « of which penalty » specify what has been settled.'
      },
      { title: 'Export', detail: 'Use the export button above the table.' }
    ],
    consequences: ['This screen is read-only: you cannot collect or change an installment.'],
    faq: [
      {
        q: 'Why does a « To pay » installment count in « Overdue »?',
        a: 'An installment whose date has passed and which is not settled is counted as overdue, even if the line label stays « To pay ».'
      },
      { q: 'What does the « Period » filter apply to?', a: 'To the due date, not to the payment date.' },
      {
        q: 'A tenant has paid but the installment is « Overdue »?',
        a: 'The payment may be awaiting validation by the agency. Contact it if this lasts.'
      }
    ],
    permissions: { roles: ['Owner'], note: 'Only shows the installments of your leases.' },
    related: [
      { label: 'Payments', helpId: 'portails.proprietaire.paiements' },
      { label: 'My leases', helpId: 'portails.proprietaire.baux' }
    ],
    keywords: ['installments', 'rent due', 'delays', 'unpaid', 'schedule']
  },
  {
    id: 'portails.proprietaire.echeances.indicateurs',
    kind: 'section',
    title: 'Installment counters',
    summary: 'Four cards count your installments: the total, those to be paid, overdue and paid.',
    howToRead: {
      notes: [
        'Total: all the installments matching the search and filters.',
        'To pay: installments to be paid whose date has not passed yet.',
        'Overdue: overdue installments, plus those to be paid whose date has passed.',
        'Paid: settled installments.',
        'A partly paid installment is counted in « Total » only.',
        'The figures are computed on all matching lines, not only the displayed page.'
      ]
    },
    faq: [
      {
        q: 'Why does a partly paid installment not appear in « To pay »?',
        a: 'A partly paid installment is counted in « Total » only.'
      },
      {
        q: 'Is an installment whose date has passed « Overdue »?',
        a: 'Yes: « Overdue » also counts the installments to be paid whose date has passed.'
      },
      {
        q: 'Do the figures cover only the displayed page?',
        a: 'No: they are computed on all lines matching the search and filters.'
      }
    ],
    keywords: ['total', 'to be paid', 'overdue', 'paid']
  },
  {
    id: 'portails.proprietaire.echeances.montants',
    kind: 'section',
    title: 'Installment amounts',
    summary: 'Two cards give the amounts: the total of the installments and what remains due.',
    howToRead: {
      notes: [
        'Total amount: the sum of the amounts of all matching installments (rent, service charges, other fees and penalties).',
        'Amount due: what remains to be paid on installments to be paid, overdue or partial. Upcoming installments are included.',
        'The amounts follow the search and filters.'
      ]
    },
    faq: [
      {
        q: 'The amount due is larger than my overdue amounts. Why?',
        a: 'It also includes unpaid upcoming installments, not only the overdue ones.'
      },
      { q: 'Are penalties included?', a: 'Yes, they are part of the amount of each installment.' },
      { q: 'Is this amount what I should receive?', a: 'No, it is what tenants have to pay.' }
    ],
    keywords: ['total amount', 'amount due', 'penalties']
  },
  {
    id: 'portails.proprietaire.echeances.tableau',
    kind: 'table',
    title: 'Installment list',
    summary:
      'One line per installment, from the most recent to the oldest, with the property, the tenant, the period, the amount and the status.',
    howToRead: {
      columns: [
        {
          key: 'propertyAddress',
          label: 'Property',
          description: 'The property title or, failing that, its address.'
        },
        { key: 'tenantName', label: 'Tenant', description: 'The main tenant of the lease.' },
        { key: 'period', label: 'Period', description: 'The month concerned, written month/year.' },
        { key: 'dueDate', label: 'Due date', description: 'The payment deadline.' },
        {
          key: 'amount',
          label: 'Amount',
          description: 'The total of the installment, with below it the sum already paid and the penalty share.'
        },
        {
          key: 'penaltyAmount',
          label: 'Penalty',
          description: 'The penalty added in case of delay, or a dash if there is none.'
        },
        { key: 'status', label: 'Status', description: 'The state of the installment.' }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'The installment is prepared but not yet payable.' },
        { value: 'DUE', label: 'To pay', description: 'The installment is to be paid.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Only part of it has been paid.' },
        { value: 'PAID', label: 'Paid', description: 'The installment is settled.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'The date has passed and an amount remains to be paid.' }
      ],
      notes: [
        'The status is recalculated from the successful payments: everything paid gives « Paid », part paid gives « Partial ».',
        'The « Period » filter applies to the due date. The search applies to the property and the tenant.',
        'The table cannot be sorted by column.'
      ]
    },
    faq: [
      { q: 'How do I see only the overdue ones?', a: 'Choose « Overdue » in the « Status » filter.' },
      {
        q: 'What does « of which penalty » mean?',
        a: 'It is the part of the amount that corresponds to a late penalty.'
      },
      {
        q: 'How do I export the list?',
        a: 'With the export button. It includes all the lines matching your filters, not only the displayed page.'
      }
    ],
    related: [{ label: 'Payments', helpId: 'portails.proprietaire.paiements.tableau' }],
    keywords: ['installments', 'table', 'delay', 'penalty', 'status']
  },

  // ---------------------------------------------------------------- Payments
  {
    id: 'portails.proprietaire.paiements',
    kind: 'page',
    title: 'Payments',
    summary:
      'The history of the rent payments received on your properties: four counters and a table with search, filters and the detail of each payment.',
    purpose:
      'You find each successful payment here, with the tenant, the method and the date, and can see which installments it was used for.',
    steps: [
      { title: 'Read the counters', detail: 'They follow the chosen search and filters.' },
      {
        title: 'Search for a payment',
        detail: 'Use « Search » (property, tenant, reference…), then « Property », « Method » and « Period ».'
      },
      { title: 'Open the detail', detail: 'Click « Details » on the right of the line.' },
      { title: 'Export', detail: 'Use the export button above the table.' }
    ],
    consequences: [
      'This screen is read-only: you cannot record, change or cancel a payment.',
      'Only successful payments are listed. Payments that make up a security deposit do not appear.'
    ],
    faq: [
      {
        q: 'Why do « This month » and « This year » show a number and not an amount?',
        a: 'These two cards count payments. The total amount is given by the « Total amount » card.'
      },
      {
        q: 'A payment cannot be found.',
        a: 'It may still be awaiting validation, or linked to a security deposit. In both cases it does not appear here.'
      },
      {
        q: 'Are these amounts what the agency paid out to me?',
        a: 'No, they are the payments received from tenants. Payouts are not shown here.'
      }
    ],
    permissions: { roles: ['Owner'], note: 'Only shows the payments of your leases.' },
    related: [
      { label: 'Installments', helpId: 'portails.proprietaire.echeances' },
      { label: 'Revenues', helpId: 'portails.proprietaire.revenus' }
    ],
    keywords: ['payments', 'collections', 'rent received', 'mobile money', 'history']
  },
  {
    id: 'portails.proprietaire.paiements.indicateurs',
    kind: 'section',
    title: 'Payment counters',
    summary:
      'Four cards sum up your payments: their number, their total amount, and how many took place this month and this year.',
    howToRead: {
      notes: [
        'Total: the number of payments matching the search and filters.',
        'Total amount: the sum of these payments, in FCFA.',
        'This month: the number of payments dated in the current month.',
        'This year: the number of payments dated in the current year.',
        '« This month » and « This year » are numbers of payments, not amounts.',
        'The figures cover all matching lines, not only the displayed page.'
      ]
    },
    faq: [
      {
        q: 'Is « This month » an amount?',
        a: 'No: « This month » and « This year » are numbers of payments, not amounts.'
      },
      { q: 'What does the « Total » card count?', a: 'The number of payments matching the search and filters.' },
      {
        q: 'Do the figures cover only the displayed page?',
        a: 'No: they cover all matching lines. The total amount is expressed in FCFA.'
      }
    ],
    keywords: ['total', 'total amount', 'this month', 'this year']
  },
  {
    id: 'portails.proprietaire.paiements.tableau',
    kind: 'table',
    title: 'Payment history',
    summary:
      'One line per successful payment, from the most recent to the oldest, with the property, the tenant, the amount, the date, the method and the status.',
    howToRead: {
      columns: [
        {
          key: 'propertyAddress',
          label: 'Property',
          description: 'The property title or, failing that, its address.'
        },
        { key: 'tenantName', label: 'Tenant', description: 'The main tenant of the lease.' },
        { key: 'amount', label: 'Amount', description: 'The sum received, in FCFA.' },
        {
          key: 'date',
          label: 'Date',
          description: 'The date and time at which the payment succeeded (day/month/year and time).'
        },
        {
          key: 'method',
          label: 'Method',
          description: 'Mobile Money, Direct debit, Bank transfer, Cash, Cheque or Bank card.'
        },
        { key: 'status', label: 'Status', description: 'The state of the payment.' },
        { key: 'actions', label: 'Actions', description: 'The « Details » button opens the payment window.' }
      ],
      statuses: [{ value: 'SUCCESS', label: 'Successful', description: 'The payment is recorded as received.' }],
      notes: [
        'Only successful payments are listed: pending, failed or canceled payments do not appear here.',
        'Filters: « Property », « Method » and « Period » (dates). The search applies to the property, the tenant and the reference.',
        'The table cannot be sorted by column.'
      ]
    },
    faq: [
      { q: 'How do I see the Mobile Money payments?', a: 'Choose « Mobile Money » in the « Method » filter.' },
      {
        q: 'What does « Details » do?',
        a: 'It opens a window showing the payment information and the installments it settled.'
      },
      {
        q: 'How do I export the list?',
        a: 'With the export button. It includes all the lines matching your filters, not only the displayed page.'
      }
    ],
    related: [{ label: 'Payment detail', helpId: 'portails.proprietaire.paiements.detail' }],
    keywords: ['payments', 'history', 'method', 'mobile money', 'export']
  },
  {
    id: 'portails.proprietaire.paiements.detail',
    kind: 'section',
    title: 'Payment detail',
    summary: 'The « Payment details » window: the payment information and the installments it settled.',
    howToRead: {
      notes: [
        'Payment details: Amount, Status, Method, Date, Property.',
        'If the payment was made online or by Mobile Money, lines may be added: « PSP transaction ID » and « PSP reference » (references given by the payment provider) and « Mobile Money operator ». They only appear if the information exists.',
        'Allocations to instalments: a table shows, for each settled installment, the period, the property and the allocated amount.',
        '« No allocation found for this payment. » is displayed when the payment was applied to no installment.'
      ]
    },
    faq: [
      {
        q: 'Can a payment settle several installments?',
        a: 'Yes. Each line of the allocation table gives the part applied to one installment.'
      },
      {
        q: 'What is the provider reference for?',
        a: 'It lets the agency find the payment with the operator in case of a question.'
      },
      { q: 'Can the payment be edited?', a: 'No, the window is read-only. Close it with the cross at the top right.' }
    ],
    related: [{ label: 'Payment history', helpId: 'portails.proprietaire.paiements.tableau' }],
    keywords: ['payment details', 'allocations', 'reference', 'operator']
  },
  {
    id: 'portails.proprietaire.paiements.allocations',
    kind: 'table',
    title: 'Allocations to installments',
    summary: 'The installments a payment settled, with the amount applied to each.',
    howToRead: {
      columns: [
        {
          key: 'installment',
          label: 'Due date',
          description: 'The period settled, written « Installment month/year ».'
        },
        { key: 'property', label: 'Property', description: 'The property concerned by this installment.' },
        {
          key: 'amount',
          label: 'Amount allocated',
          description: 'The part of the payment applied to this installment, in FCFA.'
        }
      ],
      notes: ['The sum of the allocated amounts matches the payment amount when it is fully applied.']
    },
    faq: [
      {
        q: 'Why is the sum smaller than the payment?',
        a: 'Part of the payment may not yet have been applied to an installment.'
      },
      {
        q: 'Where can I see the status of each installment?',
        a: 'In the « Instalments » screen or the « Instalments » tab of the lease file.'
      },
      { q: 'Can this table be exported?', a: 'Yes, with the export button above the table.' }
    ],
    keywords: ['allocations', 'settled installments', 'application']
  }
];

export default entries;
