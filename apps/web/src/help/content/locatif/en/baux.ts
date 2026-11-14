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
      'A new lease is created directly as "Active", without going through "Draft". The property becomes "Let" (or "Sold" if it is only offered for sale); if its status does not allow it, the lease is created and the property is left unchanged.',
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
        a: 'Open its page with "View" and change its status. A "Completed" or "Cancelled" lease can no longer change status. The property goes back to "Available" if no other active lease covers it.'
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
          description: 'Lease prepared but not yet in force. It can be activated or cancelled.'
        },
        {
          value: 'ACTIVE',
          label: 'Active',
          description:
            'Lease in progress. This is the status of a lease when it is created. It can be suspended, ended or cancelled.'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'Lease put on hold. It can be reactivated, ended or cancelled.'
        },
        {
          value: 'ENDED',
          label: 'Completed',
          description: 'Lease that has reached its end. Its status can no longer change.'
        },
        {
          value: 'CANCELED',
          label: 'Cancelled',
          description: 'Lease that was cancelled. Its status can no longer change.'
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
  },
  {
    id: 'locatif.baux.nouveau',
    kind: 'page',
    title: 'Create a lease',
    summary:
      'This wizard creates a lease in five steps: the property, the tenant, the amounts, the penalties and your notes. The lease is active as soon as you click "Create lease".',
    purpose:
      'A lease links a property to a tenant for a period and a rent. For a property offered for sale only, the "Financial information" and "Penalties" steps are skipped: only three steps remain.',
    steps: [
      {
        title: 'General information',
        detail:
          'Choose the property and the start date. The end date, the move-in date and the move-out date are optional.'
      },
      {
        title: 'Parties involved',
        detail:
          'Choose the main tenant. The owner is optional; it is suggested automatically when the property has one.'
      },
      {
        title: 'Financial information',
        detail:
          'Enter the currency, the billing frequency, the due day, the rent, the service charges and the security deposit.'
      },
      {
        title: 'Penalties',
        detail: 'Optional step: grace days, then a percentage of the balance or a fixed amount.'
      },
      {
        title: 'Notes',
        detail: 'Add a free comment if you wish.'
      },
      {
        title: 'Create the lease',
        detail: 'On the last step, click "Create lease". "Previous" takes you back to correct a step.'
      }
    ],
    consequences: [
      'The lease is created as "Active" right away, with an automatic number of the form BAIL-year-number. You then return to the list of leases.',
      'The property becomes "Let" (or "Sold" if it is offered for sale only). If its current state does not allow it, the lease is still created and the property is left unchanged.',
      'A property can have only one current lease over a given period: if the dates overlap another lease, creation is refused.',
      'The tenant and the owner are notified by e-mail (if this notification is enabled for your agency) and by WhatsApp (if your agency has set it up). A person without an account gets one, with the link to choose a password.',
      'Creating the lease generates neither installments nor documents: installments are generated afterwards from the "Instalments" tab of the lease page.'
    ],
    faq: [
      {
        q: 'I cannot find my property in the list. Why?',
        a: 'Only properties offered for rent appear. Properties already "Let" or "Sold" and buildings that contain apartments are not listed: create the lease on the apartment.'
      },
      {
        q: 'My tenant is not in the list. What should I do?',
        a: 'The tenant must exist as a contact in your agency. Add them to your contacts first, then come back to the wizard.'
      },
      {
        q: 'The "Next" button is greyed out. Why?',
        a: 'A required field on the step is empty or holds an incorrect value (for example a rent of 0 or a due day outside 1 to 31). The error message appears under the field.'
      },
      {
        q: 'What happens if saving is refused?',
        a: 'A red message explains why. When the cause is on another step, the "Back to the step" button takes you there.'
      },
      {
        q: 'Can everything be changed afterwards?',
        a: 'No. The property, the tenant, the owner, the start date, the due day and the currency can no longer be changed once the lease is created.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Creating a lease requires "Create leases". Without this right, the "New lease" button is not shown.'
    },
    related: [
      { label: 'List of leases', helpId: 'locatif.baux.liste' },
      { label: 'Lease page', helpId: 'locatif.baux.fiche' },
      { label: 'Edit a lease', helpId: 'locatif.baux.edition' },
      { label: 'Rent installments', helpId: 'locatif.echeances.liste' }
    ],
    keywords: [
      'new lease',
      'create a lease',
      'rental contract',
      'wizard',
      'tenant',
      'rent',
      'security deposit',
      'deposit'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'bail-etapes',
          title: 'The steps',
          description:
            'The bar at the top shows where you are. Click a step you have already filled in to go back to it.'
        },
        {
          target: 'bail-bien',
          title: 'The rented property',
          description: 'Choose the property first. The rent and the owner are suggested from its record.'
        },
        {
          target: 'bail-dates',
          title: 'The dates',
          description: 'The start date is required. Without an end date, the lease has no fixed term.'
        },
        {
          target: 'bail-navigation',
          title: 'Move on and create',
          description:
            '"Next" goes to the next step. On the last step, "Create lease" saves the lease, which is then active.'
        }
      ]
    }
  },
  {
    id: 'locatif.baux.nouveau.general',
    kind: 'section',
    title: 'Step "General information"',
    summary: 'You choose the rented property and the lease period. The property and the start date are required.',
    howToRead: {
      notes: [
        'Property: the list shows the owner, the title of the property and, in brackets, the building that contains it.',
        'End date: must be after the start date. Leave it empty for a lease with no end date.',
        'Move-in date and Move-out date: optional, for information.'
      ]
    },
    steps: [
      { title: 'Choose the property', detail: 'Type in the "Property" field to search for a property.' },
      { title: 'Enter the start date', detail: 'It is required.' },
      { title: 'Enter the end date if known', detail: 'It must come after the start date.' },
      {
        title: 'Click "Next"',
        detail: 'The button stays greyed out while the property or the start date is missing.'
      }
    ],
    consequences: [
      'Choosing a property pre-fills the rent with the price on the property record, and the currency, if they are filled in there. You can correct them on the financial step.',
      'The start date can no longer be changed after the lease is created.'
    ],
    faq: [
      {
        q: 'What if the property is for sale only?',
        a: 'It is accepted: the wizard then skips the financial and penalty steps, and the lease is created with a rent of 0 FCFA.'
      },
      {
        q: 'Can I create a lease for a property that is already rented?',
        a: 'A "Let" property is not offered. And if another lease of the property covers part of the same period, creation is refused.'
      },
      {
        q: 'What does a lease with no end date mean?',
        a: 'It is an open-ended lease: it stays active until you terminate it or change its status.'
      }
    ],
    related: [{ label: 'Overview of lease creation', helpId: 'locatif.baux.nouveau' }],
    keywords: ['property', 'start date', 'end date', 'move-in', 'move-out']
  },
  {
    id: 'locatif.baux.nouveau.parties',
    kind: 'section',
    title: 'Step "Parties involved"',
    summary: 'You name the main tenant, which is required, and the owner of the property, which is optional.',
    howToRead: {
      notes: [
        "Main tenant: choose a person among your agency's contacts. The list shows their name and e-mail.",
        "Owner: suggested automatically when the e-mail of the property's owner matches a contact. You can change or clear it.",
        'For an agency that manages only its own assets, the "Owner" field is not shown.'
      ]
    },
    steps: [
      { title: 'Choose the main tenant', detail: 'Type their name to find them.' },
      { title: 'Check the owner', detail: 'Correct or clear it if needed.' }
    ],
    consequences: [
      'The chosen contact is attached to your agency as a tenant (or as an owner) if they were not already.',
      'The tenant and the owner are notified of the lease creation; an account is created for them if they have none.',
      'These two choices can no longer be changed after the lease is created. Co-tenants are managed from the lease page.'
    ],
    faq: [
      {
        q: 'Why is the owner already filled in?',
        a: 'Your agency entered an owner on the property record and their e-mail matches a contact. You can change it.'
      },
      {
        q: 'Is the owner required?',
        a: 'No. Without an owner the lease is still created, but it is not linked to an owner.'
      }
    ],
    related: [{ label: 'Overview of lease creation', helpId: 'locatif.baux.nouveau' }],
    keywords: ['tenant', 'owner', 'landlord', 'contact', 'co-tenant']
  },
  {
    id: 'locatif.baux.nouveau.finances',
    kind: 'section',
    title: 'Step "Financial information"',
    summary:
      'You set the currency, the billing rhythm, the due day and the amounts of the lease. The rent is required and must be above 0.',
    howToRead: {
      notes: [
        'Currency: FCFA, EUR or USD. FCFA is suggested by default.',
        'Billing frequency: Monthly, Quarterly, Half-yearly or Yearly.',
        'Due day (1-31): the day of the month when the rent is due. A whole number from 1 to 31 is required.',
        'Rent amount: required. It is pre-filled with the price on the property record, which you can correct.',
        'Service charges and Security deposit: optional, 0 if you leave them empty.'
      ]
    },
    steps: [
      { title: 'Check the currency and the frequency' },
      { title: 'Enter the due day' },
      { title: 'Enter the rent amount', detail: 'Example: 150 000.' },
      { title: 'Enter the charges and the security deposit', detail: 'Leave 0 if there are none.' }
    ],
    consequences: [
      'The security deposit entered here is the expected amount; it is followed in the "Security deposit" tab of the lease page.',
      'The due day and the currency can no longer be changed after creation. The rent, the charges, the deposit and the frequency can be changed afterwards.',
      'No amount is calculated at this step: installments are generated later, from the lease page, with these amounts.'
    ],
    faq: [
      {
        q: 'What happens if I enter day 31?',
        a: 'Day 31 is accepted. In a shorter month, the installment falls on the last day of the month.'
      },
      {
        q: 'Are the charges included in the rent?',
        a: 'No, they are separate. Each installment adds the rent and the service charges.'
      },
      {
        q: 'Why is the rent already filled in?',
        a: 'It takes the price on the property record. Correct it if the agreed rent is different.'
      }
    ],
    related: [
      { label: 'Overview of lease creation', helpId: 'locatif.baux.nouveau' },
      { label: 'Rent installments', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['rent', 'charges', 'security deposit', 'deposit', 'currency', 'frequency', 'due day', 'amount']
  },
  {
    id: 'locatif.baux.nouveau.penalites',
    kind: 'section',
    title: 'Step "Penalties"',
    summary:
      'You set here the penalty due in case of late payment. This step is optional: if you enter nothing, no penalty is provided for.',
    howToRead: {
      notes: [
        'Grace days before penalties: number of days before penalties apply.',
        'Penalty mode: "Percentage of the balance" or "Fixed amount".',
        'Penalty rate (%): shown with "Percentage of the balance". The penalty is calculated on the unpaid balance.',
        'Maximum penalty amount (optional): a cap, shown with "Percentage of the balance".',
        'Fixed penalty amount: shown with "Fixed amount". It applies per period of delay.'
      ]
    },
    steps: [
      { title: 'Set the grace days', detail: '0 to apply the penalty as soon as the payment is late.' },
      { title: 'Choose the penalty mode' },
      { title: 'Enter the rate, or the fixed amount', detail: 'Depending on the mode chosen.' },
      { title: 'Enter a cap if you wish', detail: 'Percentage mode only.' }
    ],
    consequences: [
      'These settings are saved in the lease. The penalties themselves are calculated afterwards on late installments: you can see them in the "Penalties" tab of the lease page.',
      'Penalties are chosen at creation: the form to edit a lease does not offer them.'
    ],
    faq: [
      {
        q: 'Do I have to fill in this step?',
        a: 'No. Click "Next" to skip it: no penalty will be provided for in the lease.'
      },
      {
        q: 'What does "Percentage of the balance" mean?',
        a: 'The penalty is a percentage of the amount left unpaid. The cap, if there is one, limits the amount of the penalty.'
      }
    ],
    related: [{ label: 'Overview of lease creation', helpId: 'locatif.baux.nouveau' }],
    keywords: ['penalty', 'late', 'grace days', 'rate', 'cap', 'fixed amount']
  },
  {
    id: 'locatif.baux.edition',
    kind: 'page',
    title: 'Edit a lease',
    summary:
      'This form corrects the information of an existing lease: end, move-in and move-out dates, amounts, billing frequency and notes. The other information is locked.',
    purpose:
      'Use it for a simple correction. For a dated rent change, a renewal or a termination, use the "Lease lifecycle" tab of the lease page instead: it keeps a record of each event.',
    howToRead: {
      notes: [
        'Locked after creation: the property, the main tenant, the owner, the start date, the due day and the currency. These fields are greyed out.',
        'Editable: the end date, the move-in date, the move-out date, the billing frequency, the rent, the service charges, the security deposit and the notes.',
        'Clearing an end date or a move-out date removes it from the lease.'
      ]
    },
    steps: [
      { title: 'Change the fields', detail: 'Change the values you want in the form.' },
      { title: 'Save', detail: 'Click "Update". "Cancel" closes the form without saving anything.' }
    ],
    consequences: [
      'If the rent or the charges change, installments that have not started yet and have no payment are recalculated. A message tells you how many. Installments that are paid, started or overdue do not change.',
      'If the security deposit changes, the expected amount of the deposit already opened follows; no recorded movement is changed.',
      'No e-mail or message is sent to the tenant or the owner.',
      'After saving, you return to the list of leases.'
    ],
    faq: [
      {
        q: 'Why can I not change the tenant or the start date?',
        a: 'This information is locked once the lease is created, because the whole history is attached to it. If it is wrong, create a new lease.'
      },
      {
        q: 'What is the difference with "Revise the rent"?',
        a: 'Here, the new rent applies to upcoming installments with no effective date and no history entry. The rent revision, in "Lease lifecycle", picks an effective month and keeps a record.'
      },
      {
        q: 'How do I change the status of the lease?',
        a: 'From the lease page, with the status list at the top of the page.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Editing a lease requires "Edit leases".'
    },
    related: [
      { label: 'Lease page', helpId: 'locatif.baux.fiche' },
      { label: 'List of leases', helpId: 'locatif.baux.liste' }
    ],
    keywords: ['edit a lease', 'correct', 'rent', 'end date', 'security deposit', 'notes']
  },
  {
    id: 'locatif.baux.fiche',
    kind: 'page',
    title: 'Lease page',
    summary:
      'The page gathers everything about a lease: its information, its management fees and, at the bottom, the tabs to follow installments, payments, signatures and documents. You also change the lease status here.',
    purpose:
      'This is the working screen for each lease. The cards at the top summarize the contract; the tabs at the bottom are for day-to-day follow-up.',
    steps: [
      {
        title: 'Read the summary',
        detail: 'The cards show the property, the tenant, the dates, the amounts and the penalties.'
      },
      { title: 'Change the status', detail: 'Use the status list at the top right.' },
      { title: 'Edit the lease', detail: 'Click "Edit" to correct the information.' },
      {
        title: 'Follow the lease',
        detail:
          'Use the tabs: Instalments, Payments, Penalties, Security deposit, Lease lifecycle, Inspection reports, Signatures, Direct debits, Documents.'
      }
    ],
    consequences: [
      'Changing the status to "Completed" or "Cancelled" is final. From "Active" or "Suspended", the property goes back to "Available" if it has no other active lease. Neither installments nor payments are touched.',
      'For a property offered for sale only, only the "General information" and "Dates" cards, the notes and the "Documents" tab are shown.'
    ],
    faq: [
      {
        q: 'Why are the "Edit" button and the status list missing or greyed out?',
        a: 'They require the "Edit leases" right. Without it, the page is read-only.'
      },
      {
        q: 'Where can I find what I did on the lease?',
        a: 'In the "Lease lifecycle" tab, the history lists rent revisions, renewals, amendments and terminations.'
      },
      {
        q: 'I do not see the "Direct debits" tab. Why?',
        a: 'It requires the right to view bank direct debits. Ask your agency administrator for it.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing the page requires "View leases". Editing, changing the status, revising, renewing, terminating and recording an amendment require "Edit leases".'
    },
    related: [
      { label: 'The tabs of the page', helpId: 'locatif.baux.fiche.onglets' },
      { label: 'Lease life', helpId: 'locatif.baux.fiche.vie' },
      { label: 'Edit a lease', helpId: 'locatif.baux.edition' },
      { label: 'List of leases', helpId: 'locatif.baux.liste' }
    ],
    keywords: ['lease page', 'lease details', 'status', 'tabs', 'lease', 'tenant']
  },
  {
    id: 'locatif.baux.fiche.identite',
    kind: 'section',
    title: 'Lease identity card and status',
    summary:
      'The "General information" card gives the lease number, its status, the property, the main tenant and the owner. The status is changed with the list at the top right of the page.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Prepared lease. It can move to "Active" or "Cancelled".'
        },
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'Current lease. It can move to "Suspended", "Completed" or "Cancelled".'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'Lease on hold. It can become "Active" again, or move to "Completed" or "Cancelled".'
        },
        {
          value: 'ENDED',
          label: 'Completed',
          description: 'Lease that has reached its end. Its status no longer changes.'
        },
        { value: 'CANCELED', label: 'Cancelled', description: 'Cancelled lease. Its status no longer changes.' }
      ],
      notes: [
        'The names of the tenant and of the owner open their contact record.',
        'If no owner is linked to the lease, "Not provided" is shown.'
      ]
    },
    steps: [
      { title: 'Open the status list', detail: 'It is at the top right of the page.' },
      {
        title: 'Choose the new status',
        detail: 'The change applies right away. A change that is not allowed is refused with a message.'
      }
    ],
    consequences: [
      'Moving to "Completed" or "Cancelled" from "Active" or "Suspended" is final. The property goes back to "Available" if no other active lease concerns it.',
      'Activating a lease or reactivating it is refused if its period overlaps another lease of the same property.',
      'Changing the status does not generate, cancel or change any installment, and sends no message. To end a lease with notice and cancel future installments, use "Terminate the lease".'
    ],
    faq: [
      {
        q: 'What is the difference between "Completed" and "Terminate the lease"?',
        a: '"Completed" only changes the status. "Terminate the lease", in "Lease lifecycle", records the notice, sets the end, cancels unpaid installments after the end and calculates the final settlement.'
      },
      {
        q: 'Why is my status change refused?',
        a: 'Some changes are forbidden, for example from "Completed" or "Cancelled". The message says from which status to which status.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Changing the status requires "Edit leases".' },
    related: [
      { label: 'Overview of the lease page', helpId: 'locatif.baux.fiche' },
      { label: 'Lease life', helpId: 'locatif.baux.fiche.vie' }
    ],
    keywords: ['status', 'active', 'suspended', 'ended', 'canceled', 'draft', 'lease number']
  },
  {
    id: 'locatif.baux.fiche.financier',
    kind: 'section',
    title: '"Financial" card',
    summary:
      'This card recalls the rent, the service charges, the security deposit, the billing frequency and the due day of the lease.',
    howToRead: {
      notes: [
        'The amounts are those saved on the lease. A rent revision planned for later only appears here on its effective date.',
        'The due day is shown in the form "On 5 of each month".'
      ]
    },
    consequences: [
      'This is a read-only card. To change an amount, use "Edit" or "Revise the rent" in "Lease lifecycle".'
    ],
    faq: [
      {
        q: 'Why is this card missing?',
        a: 'It does not exist for a property offered for sale only, which has no rent.'
      },
      {
        q: 'Is the rent shown the rent for this month?',
        a: 'It is the rent currently in force on the lease. Installments already generated keep their own amount: check them in the "Instalments" tab.'
      }
    ],
    related: [
      { label: 'Lease life', helpId: 'locatif.baux.fiche.vie' },
      { label: 'Rent installments', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['rent', 'charges', 'security deposit', 'frequency', 'due day']
  },
  {
    id: 'locatif.baux.fiche.penalites',
    kind: 'section',
    title: '"Late payment penalties" card',
    summary:
      'This card recalls the penalty rule provided for in the lease: grace days, mode, rate or fixed amount, possible cap.',
    howToRead: {
      notes: [
        'Grace days: penalties apply after this number of days late. "None" means zero days.',
        '"Percentage of the balance": the rate applies to the unpaid balance; the maximum amount limits the penalty.',
        '"Fixed amount": a fixed amount is applied per period of delay.',
        '"Percentage of the rent": the rate applies to the rent amount. This mode may exist on older leases.'
      ]
    },
    consequences: [
      'This is a read-only card: it calculates nothing. The penalties actually due appear in the "Penalties" tab.'
    ],
    faq: [
      {
        q: 'How do I change the penalty rule?',
        a: 'The form to edit a lease does not offer it: it is set when the lease is created.'
      }
    ],
    related: [{ label: 'Overview of the lease page', helpId: 'locatif.baux.fiche' }],
    keywords: ['penalty', 'late', 'grace days', 'rate', 'cap']
  },
  {
    id: 'locatif.baux.fiche.honoraires',
    kind: 'section',
    title: 'Fees and manager',
    summary:
      'This card shows who manages the lease and which management fees apply. You can set conditions specific to this lease.',
    howToRead: {
      notes: [
        'Applicable fees: the origin of the rate is given. The order of priority is: lease conditions, then owner conditions, then agency settings.',
        '"No rate set": nothing is set anywhere. The "Set the fee rate" link leads to the agency financial settings.',
        '"Percentage" mode: a rate, calculated on "Rent only" or on "Everything collected". "Flat fee per installment" mode: a fixed amount in FCFA per installment.'
      ]
    },
    steps: [
      {
        title: 'Choose the manager',
        detail: 'In the "No manager" list, choose a member of your agency, or clear the field.'
      },
      {
        title: 'Turn on the conditions specific to this lease',
        detail: 'Use the switch, then choose the mode and enter the rate or the flat fee.'
      },
      {
        title: 'Save',
        detail: 'Click "Save". The manager and the conditions are saved together.'
      }
    ],
    consequences: [
      'Fees are calculated at each collection and then frozen: a change of rate does not change fees already counted.',
      "Turning the switch off and saving removes the lease's own conditions: the owner's or the agency's rate applies again."
    ],
    faq: [
      {
        q: 'Why does it say "No rate set"?',
        a: 'No rate is defined for this lease, for its owner or for the agency. Set it in the financial settings or here, with the conditions specific to this lease.'
      },
      {
        q: 'What does "Everything collected" change compared with "Rent only"?',
        a: 'With "Everything collected", the rate applies to everything collected on the lease. With "Rent only", only the rent part counts.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Seeing this card requires "View leases". Saving requires "Edit leases". The card is absent for a property offered for sale only.'
    },
    related: [{ label: 'Overview of the lease page', helpId: 'locatif.baux.fiche' }],
    keywords: ['fees', 'commission', 'manager', 'agent', 'rate', 'flat fee', 'management']
  },
  {
    id: 'locatif.baux.fiche.onglets',
    kind: 'section',
    title: 'The tabs of the lease page',
    summary:
      'Below the cards, nine tabs are used for the day-to-day follow-up of the lease. The tab shown stays the same if you reload the page.',
    howToRead: {
      notes: [
        'Instalments: the rents to pay, month by month, with their status.',
        'Payments: the sums received for this lease.',
        'Penalties: late penalties calculated on late installments.',
        'Security deposit: the deposit expected, collected, refunded or kept.',
        'Lease lifecycle: rent revision, renewal, amendment, termination and history.',
        'Inspection reports: the entry and exit inspection of the home.',
        'Signatures: sending the lease for signature and following the signatures.',
        'Direct debits: bank direct debit of the rent (visible with the right to view direct debits).',
        'Documents: the documents of the lease, for example the signed amendment.'
      ]
    },
    consequences: ['For a property offered for sale only, only the "Documents" tab is shown.'],
    faq: [
      {
        q: 'Where do I generate the installments of the lease?',
        a: 'In the "Instalments" tab: creating the lease generates none.'
      },
      {
        q: 'Where is the signed contract kept?',
        a: 'In the "Signatures" tab for sending and follow-up, and in "Documents" for uploaded files.'
      }
    ],
    related: [
      { label: 'Rent installments', helpId: 'locatif.echeances.liste' },
      { label: 'Payments', helpId: 'locatif.paiements.liste' },
      { label: 'Bank direct debits', helpId: 'locatif.prelevements.mandats' },
      { label: 'Electronic signatures', helpId: 'locatif.signatures.liste' },
      { label: 'Lease life', helpId: 'locatif.baux.fiche.vie' }
    ],
    keywords: [
      'tabs',
      'installments',
      'payments',
      'penalties',
      'deposit',
      'inspections',
      'signatures',
      'direct debits',
      'documents'
    ]
  },
  {
    id: 'locatif.baux.fiche.vie',
    kind: 'section',
    title: 'Lease life',
    summary:
      'This tab gathers the important events of a lease: revise the rent, renew, record an amendment or terminate. Each event is kept in the history.',
    howToRead: {
      notes: [
        'Current rent, Current service charges and End date: the current state of the lease.',
        'The "Revise the rent", "Renew" and "Terminate the lease" buttons are greyed out once the lease is terminated. "Record an amendment" remains possible.',
        'A "Lease terminated — ends on …" banner appears after a termination.'
      ]
    },
    steps: [
      { title: 'Revise the rent', detail: 'For a new amount from a chosen month.' },
      { title: 'Renew', detail: 'To push back the end date.' },
      { title: 'Record an amendment', detail: 'To keep a record of an agreed change.' },
      { title: 'Terminate the lease', detail: 'To end the lease.' }
    ],
    consequences: [
      'The four actions are saved in the history with the name of the person and the date.',
      'None of these actions sends an e-mail or a message to the tenant or the owner.',
      'Termination is final. Revision and renewal can no longer be done after a termination.'
    ],
    faq: [
      {
        q: 'I do not see the buttons. Why?',
        a: 'The buttons require the "Edit leases" right. Without it, you can only view the state and the history.'
      },
      {
        q: 'What does "installment(s) already paid after the end of the lease" mean?',
        a: 'Installments paid, even in part, fall after the end date. They are not cancelled: settle them with a credit note.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires "View leases". The four actions require "Edit leases".'
    },
    related: [
      { label: 'Revise the rent', helpId: 'locatif.baux.fiche.vie.revision' },
      { label: 'Renew the lease', helpId: 'locatif.baux.fiche.vie.renouvellement' },
      { label: 'Record an amendment', helpId: 'locatif.baux.fiche.vie.avenant' },
      { label: 'Terminate the lease', helpId: 'locatif.baux.fiche.vie.resiliation' },
      { label: 'Lease history', helpId: 'locatif.baux.fiche.vie.historique' }
    ],
    keywords: ['lease life', 'revision', 'renewal', 'amendment', 'termination', 'history']
  },
  {
    id: 'locatif.baux.fiche.vie.revision',
    kind: 'section',
    title: 'Revise the rent',
    summary:
      'You set a new rent, and new charges if needed, from a chosen month. The installments concerned are recalculated.',
    howToRead: {
      notes: [
        'Effective month: the first month concerned. It is suggested as next month and cannot be before the start of the lease.',
        'Revision rate (%): optional. If entered, it calculates the new rent from the current rent; you can then correct the amount.',
        'New rent: required, above 0. New service charges: zero or more, taken from the lease by default.',
        'Reason: free text, for example "annual indexed revision".'
      ]
    },
    steps: [
      { title: 'Click "Revise the rent"' },
      { title: 'Choose the effective month' },
      { title: 'Enter the rate or the new rent' },
      { title: 'Check the charges, add a reason' },
      { title: 'Click "Revise"' }
    ],
    consequences: [
      "Installments of the period that are unpaid and have no payment are recalculated at the new amount; the difference is entered in the tenant's account.",
      'If an installment of this period is already paid, even in part, the revision is refused: choose a later effective month.',
      'For a future effective month, the rent of the lease only changes on that date; until then the revision is only planned.',
      'The revision is entered in the history. It cannot be undone from the screen.'
    ],
    faq: [
      {
        q: 'What does the revision rate do?',
        a: 'It calculates the new rent: current rent multiplied by the rate, rounded to the franc. It is only a help, the amount stays editable.'
      },
      {
        q: 'Why is my revision refused?',
        a: 'Either installments of the period are already paid, or the lease is terminated or cancelled. The message says which.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Edit leases".' },
    related: [{ label: 'Lease life', helpId: 'locatif.baux.fiche.vie' }],
    keywords: ['revise', 'revision', 'increase', 'indexation', 'new rent', 'rate']
  },
  {
    id: 'locatif.baux.fiche.vie.renouvellement',
    kind: 'section',
    title: 'Renew the lease',
    summary:
      'You push back the end date of the lease and, if you wish, change the rent and the charges from the renewal.',
    howToRead: {
      notes: [
        'New end date: required, after the current end.',
        'New rent and New service charges: optional. A new rent applies from the first month after the old end.',
        'Remarks: free text.'
      ]
    },
    steps: [
      { title: 'Click "Renew"' },
      { title: 'Choose the new end date' },
      { title: 'Enter a new rent if needed' },
      { title: 'Click "Renew"' }
    ],
    consequences: [
      'The missing installments, from the month after the old end to the new end, are created. The number is shown in the history.',
      'A new rent is also entered as a revision in the history.',
      'A lease with the status "Completed" (without having been terminated) that is renewed becomes "Active" again.',
      'The new period must not overlap another lease of the same property, otherwise the renewal is refused.'
    ],
    faq: [
      {
        q: 'Can I renew a lease with no end date?',
        a: 'No: an open-ended lease has no end to push back.'
      },
      {
        q: 'Can I renew a terminated lease?',
        a: 'No. A terminated or cancelled lease can no longer be renewed.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Edit leases".' },
    related: [{ label: 'Lease life', helpId: 'locatif.baux.fiche.vie' }],
    keywords: ['renew', 'extend', 'prolong', 'new end date']
  },
  {
    id: 'locatif.baux.fiche.vie.avenant',
    kind: 'section',
    title: 'Record an amendment',
    summary:
      'You keep in the history a record of a change agreed with the tenant. The amendment changes no amount and no date of the lease.',
    howToRead: {
      notes: [
        'Effective date: suggested as today.',
        'Subject: required, for example "change of the property\'s intended use".'
      ]
    },
    steps: [
      { title: 'Click "Record an amendment"' },
      { title: 'Choose the effective date and describe the subject' },
      { title: 'Click "Save"' },
      { title: 'Upload the signed amendment', detail: 'In the "Documents" tab.' }
    ],
    consequences: [
      'Only one line is added to the history. No document is generated and nothing is sent.',
      'To change the rent or the end, use revision, renewal or termination: the amendment alone does not change them.'
    ],
    faq: [
      {
        q: 'Is the amendment signed here?',
        a: 'No. The recorded amendment is a history note; upload the signed document in the "Documents" tab.'
      },
      {
        q: 'Can an amendment be recorded on a terminated lease?',
        a: 'Yes, it is the only one of the four events that remains possible.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Edit leases".' },
    related: [{ label: 'Lease life', helpId: 'locatif.baux.fiche.vie' }],
    keywords: ['amendment', 'contract change', 'history']
  },
  {
    id: 'locatif.baux.fiche.vie.resiliation',
    kind: 'section',
    title: 'Terminate the lease',
    summary:
      'You end the lease on a given date, stating the notice and who initiated the termination. This action is final.',
    howToRead: {
      notes: [
        'Notice date: the day the notice was given. It cannot be after the end date.',
        'End date: the last day of the lease. The month of the end remains due in full, with no pro rata.',
        'Initiated by: "Tenant", "Landlord" or "Mutual agreement".',
        'Move-out date and Reason: optional.'
      ]
    },
    steps: [
      { title: 'Click "Terminate the lease"' },
      { title: 'Enter the notice and end dates' },
      { title: 'Choose who initiated it' },
      { title: 'Click "Terminate", then confirm', detail: 'A window asks for confirmation.' }
    ],
    consequences: [
      "This action is final. Installments of the months after the end month, with no payment at all, are cancelled and their billing is reversed in the tenant's account.",
      'Installments paid, even in part, after the end are not cancelled: a banner asks you to settle them with a credit note.',
      'If the end date has passed, the lease becomes "Completed" and, if it was "Active" or "Suspended", the property goes back to "Available" when it has no other active lease. If the end is in the future, the status does not change yet.',
      'The final settlement is then shown. No e-mail or message is sent.'
    ],
    faq: [
      {
        q: 'Can a termination be undone?',
        a: 'No, not from this screen: termination is final. A terminated lease can no longer be revised or renewed.'
      },
      {
        q: 'What happens to rents already paid?',
        a: 'They are never touched. Only the following unpaid months are cancelled.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Edit leases".' },
    related: [
      { label: 'Final settlement', helpId: 'locatif.baux.fiche.vie.solde' },
      { label: 'Lease life', helpId: 'locatif.baux.fiche.vie' }
    ],
    keywords: ['terminate', 'termination', 'notice', 'end of lease', 'tenant leaving', 'cancel']
  },
  {
    id: 'locatif.baux.fiche.vie.solde',
    kind: 'section',
    title: 'Final settlement',
    summary:
      'Once the lease is terminated, this card compares the security deposit held, the arrears and the deductions from the exit inspection. It says what must be refunded or what is still owed.',
    howToRead: {
      notes: [
        'Deposit held: the amount collected, minus what has already been refunded or kept.',
        'Arrears: overdue installments not settled, with penalties and fees.',
        'Deductions (inspection report): amounts withheld entered in the exit inspection, with their total.',
        'Result: "To refund to the tenant" if the deposit covers everything, "Still owed by the tenant" otherwise.'
      ]
    },
    consequences: [
      'It is a calculation to read: it refunds and collects nothing. The refund is made in the "Security deposit" tab.',
      'If the exit inspection is not finalized, a warning says the deductions may still change.'
    ],
    faq: [
      {
        q: 'Why does the balance change?',
        a: 'It follows payments, overdue installments and the exit inspection. Finalize the inspection to freeze the deductions.'
      }
    ],
    related: [{ label: 'Terminate the lease', helpId: 'locatif.baux.fiche.vie.resiliation' }],
    keywords: ['final settlement', 'refund', 'deposit', 'security deposit', 'deductions', 'arrears']
  },
  {
    id: 'locatif.baux.fiche.vie.historique',
    kind: 'section',
    title: 'Lease history',
    summary:
      'The list shows, from newest to oldest, each revision, renewal, amendment and termination, with who did it and when.',
    howToRead: {
      notes: [
        'Each line is a full sentence: for example the rent before and after a revision, or the new end date.',
        'The line below reads "By …, on …": the person and the date of entry. "System" means an automatic action.'
      ]
    },
    consequences: ['The history cannot be edited or erased from the screen.'],
    faq: [
      {
        q: 'What does "installment(s) recalculated" mean?',
        a: 'It is the number of installments whose amount changed because of the revision.'
      }
    ],
    related: [{ label: 'Lease life', helpId: 'locatif.baux.fiche.vie' }],
    keywords: ['history', 'events', 'log']
  }
];

export default entries;
