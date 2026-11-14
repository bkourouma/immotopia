import type { HelpEntry } from '../../../types';

/** Zone « baux » du module « locatif » (en). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.baux.liste',
    kind: 'page',
    title: 'Lease list',
    summary:
      "Find all your agency's leases here, with the property, tenant, period, amount and status of each one. This is the starting point to create, open, edit or delete a lease.",
    purpose:
      'A lease links a property to its tenant for a given period, with a rent. Each lease opens its own page, where you follow its instalments, payments and documents.',
    steps: [
      {
        title: 'Create a lease',
        detail: 'Click "New lease", then fill in the form: property, tenant, dates, rent.'
      },
      {
        title: 'Search',
        detail: 'Type a lease number, a property or a tenant name in the search field.'
      },
      {
        title: 'Filter',
        detail: 'Narrow the list with the Status, Tenant and Property filters.'
      },
      {
        title: 'Open a lease',
        detail: 'Click "View". From the lease page you change the status: suspend, end, cancel.'
      },
      {
        title: 'Edit a lease',
        detail: 'Row "⋮" menu, then "Edit lease".'
      },
      {
        title: 'Delete a lease',
        detail: '"⋮" menu, then "Delete" and confirm.'
      },
      {
        title: 'Export',
        detail:
          '"Export" button: Excel, CSV or PDF. Every lease matching your filters is exported, not just the page on screen.'
      }
    ],
    consequences: [
      'A new lease is created directly as "Active", without going through "Draft". The property becomes "Rented" (or "Sold" if it is only offered for sale); if its status does not allow it, the lease is created and the property is left unchanged.',
      'When a lease is created, the tenant and the owner are notified by e-mail (if this notification is enabled for your agency) and by WhatsApp (if your agency has set it up). Without an account, one is created and the message contains the link to choose a password.',
      'Creation does not generate instalments or documents: instalments are generated afterwards from the lease page.',
      'If you change the rent, upcoming instalments are recalculated; those already paid, started or overdue do not change.',
      'Deletion cannot be undone: the lease and its instalments are erased. It is refused if a payment is linked to an instalment. To keep a record, prefer ending or canceling the lease.'
    ],
    faq: [
      {
        q: 'Why is my new lease already "Active"?',
        a: 'A lease created from the form is activated immediately: check the information before saving.'
      },
      {
        q: 'How do I end or suspend a lease?',
        a: 'Open its page with "View" and change its status. An "Ended" or "Canceled" lease can no longer change status. The property goes back to "Available" if no other active lease covers it.'
      },
      {
        q: 'I cannot see "New lease" or the "⋮" menu. Why?',
        a: 'These actions depend on your permissions: "Create leases" to create, "Edit leases" to edit, change the status or delete. Ask your agency administrator.'
      },
      {
        q: 'Why is the amount sometimes the property price?',
        a: 'A property offered only for sale has no rent, so its price is shown instead.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing the list requires "View leases", creating requires "Create leases", editing, changing the status and deleting require "Edit leases".'
    },
    related: [
      { label: 'How to read the lease table', helpId: 'locatif.baux.liste.tableau' },
      { label: 'Create a new lease', to: '/tenant/:tenantId/rental/leases/new' }
    ],
    keywords: [
      'lease',
      'leases',
      'rental contract',
      'contract',
      'rental',
      'tenant',
      'rent',
      'create a lease',
      'delete a lease',
      'terminate',
      'export'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'baux-nouveau',
          title: 'Create a lease',
          description: 'This button opens the creation form. The lease is active as soon as it is saved.'
        },
        {
          target: 'baux-tableau',
          title: 'The lease list',
          description: 'Click "View" to open a lease, or "⋮" to edit or delete it.'
        }
      ]
    }
  },
  {
    id: 'locatif.baux.liste.tableau',
    kind: 'table',
    title: 'Lease table',
    summary:
      'Each row is a lease of your agency. The table shows the property, tenant, period, reference amount and status.',
    howToRead: {
      columns: [
        {
          key: 'bail',
          label: 'Lease',
          description: 'The lease number, with the property concerned underneath.'
        },
        {
          key: 'locataire',
          label: 'Tenant',
          description: 'The main tenant of the lease.'
        },
        {
          key: 'periode',
          label: 'Period',
          description:
            'The start and end dates of the lease. A dash (—) in place of a date means no date is recorded, for example no end date.'
        },
        {
          key: 'montant',
          label: 'Amount',
          description:
            'The lease rent in FCFA. If the property is offered only for sale, the property price is shown instead.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'The current state of the lease (see the statuses below).'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View" opens the lease page. The "⋮" menu offers "Edit lease" and "Delete".'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Lease prepared but not yet in force. It can be activated or canceled.'
        },
        {
          value: 'ACTIVE',
          label: 'Active',
          description:
            'Lease in progress. This is the status of a lease when it is created. It can be suspended, ended or canceled.'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'Lease put on hold. It can be reactivated, ended or canceled.'
        },
        {
          value: 'ENDED',
          label: 'Ended',
          description: 'Lease that has reached its end. Its status can no longer change.'
        },
        {
          value: 'CANCELED',
          label: 'Canceled',
          description: 'Lease that was canceled. Its status can no longer change.'
        }
      ],
      notes: [
        'On a phone or small screen, the table becomes a list of cards: the same information is shown, with the "⋮" menu on each card.',
        'The "Export" button offers Excel, CSV and PDF. The export contains every lease that matches your filters, not just the page on screen. In the file, the amount is a number you can add up.',
        'The list cannot be sorted by column: use the search and filters to find a lease.'
      ]
    },
    steps: [
      {
        title: 'Find a specific lease',
        detail: 'Type its number, the tenant name or the property address in the search.'
      },
      {
        title: 'See all Active leases',
        detail: 'Choose the Status filter, then "Active".'
      }
    ],
    consequences: [
      'Changing a filter or the search does not modify any lease: it only changes what is displayed and what will be exported.'
    ],
    faq: [
      {
        q: 'Is the tenant shown the only one on the lease?',
        a: 'No, it is the main tenant. Any co-tenants can be seen on the lease page.'
      },
      {
        q: 'What does a dash in the Period column mean?',
        a: 'No date is recorded there, for example a lease with no end date.'
      }
    ],
    related: [{ label: 'Lease list overview', helpId: 'locatif.baux.liste' }],
    keywords: ['columns', 'statuses', 'table', 'export', 'excel', 'csv', 'pdf', 'amount', 'period']
  }
];

export default entries;
