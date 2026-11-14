import type { HelpEntry } from '../../../types';

/** « proprietaire-suivi » zone of the « portails » module (en). */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------ Mon compte
  {
    id: 'portails.proprietaire.compte',
    kind: 'page',
    title: 'My account',
    summary:
      'The running account the agency keeps for you: what it owes you (or what you owe it), what makes up that balance and the payouts it has made to you. The screen is read-only.',
    purpose:
      'The agency collects the rent of your properties, deducts its fees and expenses, then pays you the rest. This screen lets you check those entries without calling the agency. It does not let you request a payout or change an entry.',
    steps: [
      {
        title: 'Read the balance',
        detail:
          'The sentence at the top of the page tells you which way the balance goes: « The agency owes you », « You owe the agency » or « Your account is up to date ». The amount is shown below it, except when the account is up to date.'
      },
      {
        title: 'Understand the balance',
        detail:
          'The cards « Rent collected », « Management fees », « VAT on fees », « Expenses » and « Payouts received » detail what makes it up.'
      },
      {
        title: 'See the payouts',
        detail: '« Payouts received » tab: every sum the agency has paid you.'
      },
      {
        title: 'See every entry',
        detail: '« Movement detail » tab: all entries of the account, with the balance after each one.'
      },
      {
        title: 'Search or export',
        detail: 'Use the search above each list, or the list export button.'
      },
      {
        title: 'Refresh',
        detail: 'The « Refresh » button reloads the account.'
      }
    ],
    consequences: [
      'This screen is read-only: nothing you do here changes your account. Entries are recorded by the agency.',
      'A canceled payout stays visible, marked « Cancelled », so that your history remains complete.'
    ],
    faq: [
      {
        q: 'What does « You owe the agency » mean?',
        a: 'The balance is negative: the fees and expenses recorded exceed the rent collected for you. Contact the agency to find out what happens next.'
      },
      {
        q: 'Why do some cards not appear?',
        a: '« Withholding tax », « Security deposit retained » and « Other movements » only appear when their amount is not zero.'
      },
      {
        q: 'A transfer I received is not in the list. What should I do?',
        a: 'Only payouts recorded by the agency appear. Ask the agency to record it.'
      },
      {
        q: 'The account does not load.',
        a: 'Click « Try again ». If the message comes back, contact your agency.'
      }
    ],
    related: [
      { label: 'The balance and its cards', helpId: 'portails.proprietaire.compte.solde' },
      { label: 'Payouts received', helpId: 'portails.proprietaire.compte.reversements' },
      { label: 'Entry details', helpId: 'portails.proprietaire.compte.mouvements' }
    ],
    keywords: ['account', 'balance', 'payout', 'transfer', 'fees', 'statement', 'money', 'owner', 'owed']
  },
  {
    id: 'portails.proprietaire.compte.solde',
    kind: 'section',
    title: 'Account balance and indicators',
    summary:
      'A sentence tells who owes money to whom, then cards show what makes up that balance. Each card shows a total in FCFA.',
    howToRead: {
      columns: [],
      notes: [
        '« The agency owes you »: the balance is positive, it is the sum the agency has to pay you. « You owe the agency »: the balance is negative. « Your account is up to date »: the balance is zero.',
        '« Rent collected »: the rent the agency has received for your properties.',
        '« Management fees » and « VAT on fees »: what the agency keeps for its management, tax included.',
        '« Expenses »: costs paid by the agency for your properties (repairs, for example).',
        '« Payouts received »: the sums already paid by the agency.',
        '« Withholding tax » lowers the balance; « Security deposit retained » raises it; « Other movements » groups any other entry, with its sign. These three cards only appear when their amount is not zero.'
      ]
    },
    consequences: ['These figures are totals calculated by the agency; you cannot change them here.'],
    faq: [
      {
        q: 'Why does the balance not match what I expected to receive?',
        a: 'The balance takes every total into account: rent collected minus fees, tax, expenses, payouts and withholdings. Browse the entry details to see each entry.'
      },
      {
        q: 'Where can I see what an expense was for?',
        a: 'In « Movement detail »: the « Label » column describes each entry and « Property » shows the property concerned.'
      },
      {
        q: "Is my tenant's security deposit part of my balance?",
        a: 'Only the part the agency has kept (« Security deposit retained »). The rest is held for the tenant and can be read on the « Security deposits » screen.'
      }
    ],
    related: [
      { label: 'Security deposits', helpId: 'portails.proprietaire.cautions' },
      { label: 'Entry details', helpId: 'portails.proprietaire.compte.mouvements' }
    ],
    keywords: ['balance', 'fees', 'vat', 'withholding tax', 'expenses', 'rent collected']
  },
  {
    id: 'portails.proprietaire.compte.reversements',
    kind: 'table',
    title: 'Payouts received',
    summary:
      'Each row is a sum the agency has paid you. The table shows the date, number, payment method, reference, amount and any cancellation.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The day the payout was made.' },
        { key: 'number', label: 'Number', description: 'The payout number, assigned by the agency.' },
        {
          key: 'mode',
          label: 'Method',
          description: 'Cash, Bank transfer, Cheque, Mobile Money or Other.'
        },
        {
          key: 'reference',
          label: 'Reference',
          description: 'For example a transfer or check number. A dash (—) means no reference is recorded.'
        },
        { key: 'montant', label: 'Amount', description: 'The sum paid, in FCFA.' },
        {
          key: 'statut',
          label: 'Status',
          description: 'Empty for a valid payout; « Cancelled » for a payout canceled by the agency.'
        }
      ],
      statuses: [
        { value: 'VALIDATED', label: '(no label)', description: 'Valid payout.' },
        {
          value: 'VOIDED',
          label: 'Cancelled',
          description: 'Payout canceled by the agency; it is kept in the history.'
        }
      ],
      notes: ['On a phone, each payout is shown as a card.']
    },
    steps: [
      { title: 'Search', detail: 'Type a number or a reference in the search.' },
      { title: 'Filter', detail: 'Narrow the list by Method, Status or Date.' },
      { title: 'Export', detail: 'The export button downloads the list, filters included.' }
    ],
    faq: [
      {
        q: 'Why is a payout « Cancelled »?',
        a: 'The agency canceled it after recording it, for example to correct a mistake. Ask it for details.'
      },
      {
        q: 'The list is empty.',
        a: '« No payout has been made yet »: the agency has not paid you anything yet.'
      },
      {
        q: 'Does a canceled payout count in my balance?',
        a: 'To be confirmed with your agency: the screen shows the status but does not detail its effect on the balance.'
      }
    ],
    related: [{ label: 'My account', helpId: 'portails.proprietaire.compte' }],
    keywords: ['payout', 'transfer', 'payment received', 'remittance', 'mobile money', 'check']
  },
  {
    id: 'portails.proprietaire.compte.mouvements',
    kind: 'table',
    title: 'Entry details',
    summary:
      'Each row is an entry of your account: rent collected, fees, expense, payout, etc. The last column gives the balance after the entry.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The date of the entry.' },
        {
          key: 'type',
          label: 'Type',
          description:
            'Rent collected, Management fees, VAT on fees, Expense, Payout, Cancellation, Withholding tax or Security deposit retained.'
        },
        { key: 'libelle', label: 'Label', description: 'The text of the entry, written by the agency.' },
        {
          key: 'bien',
          label: 'Property',
          description: 'The property concerned, or otherwise the lease number. A dash (—) if none is attached.'
        },
        {
          key: 'montant',
          label: 'Amount',
          description: 'Preceded by + when the sum enters your account, in red with a minus sign when it leaves it.'
        },
        { key: 'solde', label: 'Balance after', description: 'Your balance right after this entry.' }
      ],
      notes: ['On a phone, each entry is shown as a card.']
    },
    steps: [
      { title: 'Search', detail: 'Type a label, a property or a lease number.' },
      { title: 'Filter', detail: 'Narrow the list by Type, Property or Date.' },
      { title: 'Export', detail: 'The export button downloads the list, filters included.' }
    ],
    faq: [
      {
        q: 'What does « Cancellation » mean?',
        a: 'The agency canceled a previous entry. Both lines remain visible to keep a trace.'
      },
      {
        q: 'Why is an amount in red?',
        a: 'It is a sum leaving your account (fees, expense, payout…).'
      },
      {
        q: 'I do not understand a label.',
        a: 'The label is written by the agency. Contact it, quoting the date and the amount.'
      }
    ],
    related: [{ label: 'Balance and indicators', helpId: 'portails.proprietaire.compte.solde' }],
    keywords: ['entry', 'movement', 'transaction', 'rent collected', 'fees', 'expense']
  },

  // -------------------------------------------------- Security deposits
  {
    id: 'portails.proprietaire.cautions',
    kind: 'page',
    title: 'Security deposits',
    summary:
      'Tracking of the security deposits paid by the tenants of your properties: planned amount, sum held by the agency, sum withheld, and the history of each deposit. The screen is read-only.',
    purpose:
      "A security deposit is a sum the tenant pays at move-in and the agency holds on the tenant's behalf. It is not income: it does not enter your revenue. Here you see where it stands.",
    steps: [
      {
        title: 'Read the totals',
        detail:
          'The cards « Total » (number of deposits), « Total held », « Total withheld » and « Total released » summarize everything.'
      },
      {
        title: 'Browse the list',
        detail: 'Each row is a deposit, with the property, the tenant, the amounts and the status.'
      },
      {
        title: "See a deposit's history",
        detail: 'Click « Movements »: a window lists each operation (collection, withholding, refund…).'
      },
      { title: 'Refresh', detail: 'The « Refresh » button reloads the list.' }
    ],
    consequences: [
      'This screen is read-only: deposits are managed by the agency.',
      'The deposit is never counted in your revenue or in the « My account » balance, except the part the agency keeps (« Security deposit retained »).'
    ],
    faq: [
      {
        q: 'What is the difference between « Amount held » and « Amount withheld »?',
        a: '« Held » is what the agency keeps for the tenant (collected minus refunded and forfeited). « Withheld » groups ongoing withholdings and forfeited sums.'
      },
      {
        q: 'Why is the status « Pending »?',
        a: 'Nothing has been collected on this deposit yet.'
      },
      {
        q: 'I see no deposit.',
        a: 'No deposit is recorded for your properties: the screen shows « No security deposit found ».'
      }
    ],
    related: [
      { label: 'Deposits table', helpId: 'portails.proprietaire.cautions.tableau' },
      { label: 'My account', helpId: 'portails.proprietaire.compte' }
    ],
    keywords: ['deposit', 'security deposit', 'guarantee', 'refund', 'withholding', 'tenant']
  },
  {
    id: 'portails.proprietaire.cautions.indicateurs',
    kind: 'section',
    title: 'Security deposit totals',
    summary:
      'Four cards sum up your security deposits: their number, the amount held, the amount withheld and the amount released.',
    purpose: "They show at a glance where your tenants' deposits stand, without reading the list line by line.",
    howToRead: {
      notes: [
        'Total: the number of security deposits on your properties.',
        'Total held: the amount the agency keeps for the tenants (collected, minus returned, minus forfeited).',
        'Total withheld: ongoing withholdings plus forfeited amounts.',
        'Total released: for deposits with the status « Refunded » or « Forfeited », the deposit amount minus what the agency still holds.',
        'Amounts are in FCFA and cover all your deposits, not only the displayed page.'
      ]
    },
    faq: [
      {
        q: 'Are these amounts part of my revenue?',
        a: 'No. A security deposit is held for the tenant and is not part of your revenue.'
      },
      {
        q: 'Why is « Total released » at zero?',
        a: 'None of your deposits has the status « Refunded » or « Forfeited » yet.'
      },
      {
        q: 'Where can I see the detail of each deposit?',
        a: 'In the list below: the « Amount held » column and the « Movements » button give the detail.'
      }
    ],
    related: [{ label: 'Security deposits', helpId: 'portails.proprietaire.cautions' }],
    keywords: ['total held', 'total withheld', 'total released', 'deposit', 'security deposit']
  },
  {
    id: 'portails.proprietaire.cautions.tableau',
    kind: 'table',
    title: 'List of security deposits',
    summary:
      'One row per security deposit on your properties. You see the planned amount, what the agency holds, what it has withheld and the state of the deposit.',
    howToRead: {
      columns: [
        { key: 'propertyAddress', label: 'Property', description: 'Address of the rented property.' },
        { key: 'tenantName', label: 'Tenant', description: 'The main tenant of the lease.' },
        {
          key: 'depositAmount',
          label: 'Deposit amount',
          description: 'The planned amount for this deposit, in FCFA.'
        },
        {
          key: 'currentHeldAmount',
          label: 'Amount held',
          description: 'What the agency keeps for the tenant: collected, minus returned, minus forfeited.'
        },
        {
          key: 'withheldAmount',
          label: 'Amount withheld',
          description:
            'Ongoing withholdings plus forfeited sums. Zero for an untouched deposit. Click the header to sort.'
        },
        { key: 'status', label: 'Status', description: 'The state of the deposit (see below).' },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Movements » opens the deposit history.'
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'Nothing has been collected yet.' },
        {
          value: 'COLLECTED',
          label: 'Collected',
          description: 'The deposit is collected and no withholding or refund is recorded.'
        },
        { value: 'HELD', label: 'Withheld', description: 'Part of the deposit is withheld.' },
        { value: 'REFUNDED', label: 'Refunded', description: 'A sum has been refunded to the tenant.' },
        { value: 'FORFEITED', label: 'Forfeited', description: 'A sum has been forfeited.' }
      ],
      notes: ['The status is derived from the deposit amounts, in this order: withheld, then refunded, then forfeited.']
    },
    steps: [
      { title: 'Open the history', detail: 'Click « Movements » on the row you want.' },
      { title: 'Export', detail: 'The export button downloads the list.' }
    ],
    faq: [
      {
        q: 'Why does a « Refunded » deposit still show a held amount?',
        a: 'The refund may be partial. The held amount remains what the agency keeps.'
      },
      {
        q: 'Who decides on the withholding or the refund?',
        a: 'The agency records these operations. You view them here without being able to change them.'
      },
      {
        q: 'Are the amounts included in my revenue?',
        a: 'No. A security deposit is a sum held for the tenant, not income.'
      }
    ],
    related: [{ label: 'Movement history', helpId: 'portails.proprietaire.cautions.mouvements' }],
    keywords: ['deposit', 'withholding', 'refunded', 'forfeited', 'held']
  },
  {
    id: 'portails.proprietaire.cautions.mouvements',
    kind: 'table',
    title: 'Deposit movement history',
    summary:
      'The list of all operations recorded on a security deposit, from the most recent to the oldest. It opens with « Movements ».',
    howToRead: {
      columns: [
        {
          key: 'type',
          label: 'Type',
          description: 'Collection, Withholding, Release, Refund, Forfeiture or Adjustment.'
        },
        { key: 'amount', label: 'Amount', description: 'The amount of the operation, in FCFA.' },
        { key: 'createdAt', label: 'Date', description: 'Date and time of recording.' },
        { key: 'note', label: 'Note', description: "The agency's comment. A dash (-) if there is none." },
        { key: 'createdBy', label: 'Created by', description: 'The agency person who recorded the operation.' }
      ]
    },
    faq: [
      {
        q: 'What does « Release » mean?',
        a: 'A withheld sum is released. This label comes from the agency; if in doubt, ask it for details.'
      },
      {
        q: 'Why is the window empty?',
        a: 'No operation is recorded on this deposit: « No movement found ».'
      },
      {
        q: 'Can I correct an operation?',
        a: 'No, only the agency can.'
      }
    ],
    related: [{ label: 'List of deposits', helpId: 'portails.proprietaire.cautions.tableau' }],
    keywords: ['movement', 'history', 'collection', 'withholding', 'refund', 'forfeiture']
  },

  // -------------------------------------------------- Maintenance
  {
    id: 'portails.proprietaire.incidents',
    kind: 'page',
    title: 'Maintenance',
    summary:
      'Tracking of the maintenance tickets opened on your properties: repairs, breakdowns, works. You see how each ticket is going; the agency handles them.',
    purpose:
      'When a tenant reports a problem or the agency opens one, a ticket is created. This screen keeps you informed without calling the agency. It does not let you create a ticket, reply to it or close it.',
    steps: [
      {
        title: 'Read the totals',
        detail:
          '« Total », « Open » (declared tickets), « In progress » (in progress or assigned) and « Resolved » follow your filters.'
      },
      {
        title: 'Search and filter',
        detail: 'Search a title or a property, then filter by Status, Priority, Category or Property.'
      },
      { title: 'Open a ticket', detail: 'Click « Details » to see its full record.' },
      { title: 'Refresh', detail: 'The « Refresh » button reloads the list.' }
    ],
    consequences: [
      'This screen is read-only: you cannot create or change a ticket.',
      'The cost of a ticket is not shown here.'
    ],
    faq: [
      {
        q: 'How do I report a breakdown in my property?',
        a: 'Not from this screen: contact the agency or ask your tenant to report it from their portal.'
      },
      {
        q: 'What does « Open » count?',
        a: 'Tickets with the status « Reported », not yet taken on.'
      },
      {
        q: 'Why do the totals change when I filter?',
        a: 'They are calculated on the tickets matching your filters.'
      }
    ],
    related: [
      { label: 'Tickets table', helpId: 'portails.proprietaire.incidents.tableau' },
      { label: 'A ticket record', helpId: 'portails.proprietaire.incidents.detail' }
    ],
    keywords: ['maintenance', 'incident', 'breakdown', 'repair', 'ticket', 'works', 'plumbing', 'electricity']
  },
  {
    id: 'portails.proprietaire.incidents.indicateurs',
    kind: 'section',
    title: 'Ticket totals',
    summary:
      'Four cards count your maintenance tickets: the total, the open ones, those in progress and the resolved ones.',
    purpose: 'They show at a glance how many tickets are waiting for the agency and how many are settled.',
    howToRead: {
      notes: [
        'Total: all the tickets matching the search and filters.',
        'Open: tickets with the status « Reported », not yet taken on.',
        'In progress: tickets being handled or already assigned.',
        'Resolved: tickets with the status « Resolved ».',
        'Other statuses are counted in « Total » only.',
        'The figures are computed on all matching tickets, not only the displayed page.'
      ]
    },
    faq: [
      {
        q: 'Why is the sum of the three cards lower than the total?',
        a: 'A ticket that is neither declared, in progress nor resolved is counted in « Total » only.'
      },
      {
        q: 'The figures change when I filter. Is that normal?',
        a: 'Yes, the cards follow the search and filters you have chosen.'
      },
      {
        q: 'Where can I see the cost of the tickets?',
        a: 'Nowhere on this screen: the cost of a ticket is not displayed.'
      }
    ],
    related: [{ label: 'Maintenance', helpId: 'portails.proprietaire.incidents' }],
    keywords: ['open', 'in progress', 'resolved', 'tickets', 'maintenance']
  },
  {
    id: 'portails.proprietaire.incidents.tableau',
    kind: 'table',
    title: 'List of tickets',
    summary:
      'Each row is a maintenance ticket on one of your properties, with its category, priority, status and date.',
    howToRead: {
      columns: [
        { key: 'propertyAddress', label: 'Property', description: 'Address of the property concerned.' },
        { key: 'title', label: 'Title', description: 'The summary of the problem.' },
        { key: 'category', label: 'Category', description: 'Plumbing, Electrical, Air conditioning or Other.' },
        { key: 'priority', label: 'Priority', description: 'Low, Medium, High or Urgent.' },
        { key: 'status', label: 'Status', description: 'The progress of the ticket (see below).' },
        { key: 'createdAt', label: 'Date', description: 'The creation date of the ticket.' },
        { key: 'actions', label: 'Actions', description: '« Details » opens the ticket record.' }
      ],
      statuses: [
        { value: 'DECLARED', label: 'Reported', description: 'The problem is reported, not yet taken on.' },
        { value: 'ASSIGNED', label: 'Assigned', description: 'The ticket is entrusted to a person or a provider.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'Handling has started.' },
        { value: 'RESOLVED', label: 'Resolved', description: 'The problem is fixed.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The ticket has been canceled.' }
      ],
      notes: ['The most recent tickets appear first.']
    },
    steps: [
      { title: 'Search', detail: 'Type a title or an address.' },
      { title: 'Filter', detail: 'Status, Priority, Category or Property.' },
      { title: 'Open', detail: 'Click « Details ».' },
      { title: 'Export', detail: 'The export button downloads the list, filters included.' }
    ],
    faq: [
      {
        q: 'I do not see a ticket I know about.',
        a: 'Check your filters. Only tickets on your own properties are shown.'
      },
      {
        q: 'Who changes the status?',
        a: 'The agency, as the ticket is handled.'
      },
      {
        q: 'Why is no cost shown?',
        a: 'Maintenance costs are not displayed on this screen.'
      }
    ],
    related: [{ label: 'A ticket record', helpId: 'portails.proprietaire.incidents.detail' }],
    keywords: ['ticket', 'breakdown', 'priority', 'urgent', 'status', 'maintenance']
  },
  {
    id: 'portails.proprietaire.incidents.detail',
    kind: 'section',
    title: 'Ticket details',
    summary:
      'The full record of a ticket: information, attachments, comments and status history. It opens with « Details ».',
    howToRead: {
      notes: [
        'Information: title, status, category, priority, property, creation date, location if any and description.',
        '« Assigned salesperson »: the designated provider, with their phone if known, when there is one. « Assigned user »: the agency person in charge of the ticket, or « Unassigned ».',
        '« Attachments »: the files linked to the ticket, to download.',
        '« Comments »: the messages exchanged on the ticket, with their author and date.',
        '« Status history »: each change, from the old status to the new one, with the date, a note if any and the person.'
      ]
    },
    faq: [
      {
        q: 'Why does the history show English words (DECLARED, IN_PROGRESS)?',
        a: 'The history repeats the statuses as the application records them: DECLARED = Reported, ASSIGNED = Assigned, IN_PROGRESS = In progress, RESOLVED = Resolved, CANCELED = Cancelled.'
      },
      {
        q: 'Can I write a comment?',
        a: 'No, this window is read-only.'
      },
      {
        q: 'Where can I find the repair cost?',
        a: 'It is not shown here. Ask the agency.'
      }
    ],
    related: [{ label: 'List of tickets', helpId: 'portails.proprietaire.incidents.tableau' }],
    keywords: ['ticket', 'detail', 'comment', 'attachment', 'history', 'provider']
  },

  // -------------------------------------------------- Documents
  {
    id: 'portails.proprietaire.documents',
    kind: 'page',
    title: 'Documents',
    summary:
      'The rental documents linked to your properties: lease contracts, addenda, receipts, deposit receipts and statements. You can search, filter and download them.',
    purpose:
      'The agency produces these documents to manage your properties. Here you find those attached to a lease, an installment or a payment of your properties, without asking the agency.',
    steps: [
      { title: 'Search', detail: 'Type a title or a document number.' },
      { title: 'Filter', detail: 'Choose one or more Types, or a Property.' },
      {
        title: 'Read the list',
        detail: 'Documents are arranged in cards by type, with their status, the property and the issue date.'
      },
      { title: 'Download', detail: 'Click « Download » on the document row.' },
      { title: 'Browse', detail: 'If the list is long, use the pagination at the bottom of the page.' }
    ],
    consequences: [
      'Downloading saves the file on your device; it changes nothing.',
      'Only documents of your own properties are visible. Canceled documents do not appear.'
    ],
    faq: [
      {
        q: 'What does « Draft » mean?',
        a: 'The document is not final yet. « Final » means a validated document; a canceled document is not shown.'
      },
      {
        q: 'The download fails.',
        a: 'An error message appears. Try again, then contact the agency if it persists: the file may not have been saved.'
      },
      {
        q: 'Where are the documents of my estate (title deed, plans)?',
        a: 'In the record of a property in « My patrimony », « Documents » tab, if your agency has enabled that view.'
      }
    ],
    related: [{ label: 'Estate property record', helpId: 'portails.proprietaire.patrimoine-detail' }],
    keywords: ['document', 'contract', 'receipt', 'addendum', 'statement', 'download', 'pdf']
  },
  {
    id: 'portails.proprietaire.documents.liste',
    kind: 'section',
    title: 'Documents by type',
    summary:
      'The documents of the page are grouped by type, each type having its card with the number of documents. Each row shows the title, the status, the property and the date.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Document not final yet.' },
        { value: 'FINAL', label: 'Final', description: 'Validated document.' },
        {
          value: 'VOID',
          label: 'Cancelled',
          description: 'This status exists, but these documents are not shown in the portal.'
        }
      ],
      notes: [
        'Types: Lease agreement, Amendment, Rent receipt, Settlement receipt, Deposit receipt, Statement, Other.',
        'The number in the badge is that of the displayed page, not of the total.',
        '« Issued on » is the document issue date; it may be missing.'
      ]
    },
    faq: [
      {
        q: 'Why is a type missing?',
        a: 'No document of this type exists for your properties, or it is on another page or outside your filters.'
      },
      {
        q: 'What is the difference between « Rent receipt » and « Settlement receipt »?',
        a: 'They are two distinct types in the application. If in doubt, open the document.'
      },
      {
        q: 'A document has no title.',
        a: 'The screen then shows its number or a short identifier.'
      }
    ],
    related: [{ label: 'Documents', helpId: 'portails.proprietaire.documents' }],
    keywords: ['document type', 'draft', 'final', 'receipt', 'contract']
  },

  // -------------------------------------------------- Rapports
  {
    id: 'portails.proprietaire.rapports',
    kind: 'page',
    title: 'Reports',
    summary:
      'Three forms to download a file: a revenue report, an occupancy report, or a data export (payments, installments, leases).',
    purpose:
      'These files serve your accounting or your records. They only cover your properties. Nothing is sent to anyone: the file downloads to your device.',
    steps: [
      {
        title: 'Choose the form',
        detail: '« Income report », « Occupancy report » or « Data export ».'
      },
      { title: 'Fill in the fields', detail: 'Required fields must be filled in; « optional » ones can stay empty.' },
      { title: 'Generate', detail: 'Click « Generate the report » (or « Export the data »).' },
      { title: 'Get the file', detail: 'The browser downloads the file; a message confirms success or failure.' }
    ],
    consequences: [
      'Generating a report changes no data.',
      'Reports download without a preview: open the file from your downloads.'
    ],
    faq: [
      {
        q: 'Why did I receive nothing?',
        a: 'An error message appears if generation fails, for example if no property is attached to your account.'
      },
      {
        q: 'Which format should I choose?',
        a: 'PDF to read or print; CSV or Excel to work on the figures in a spreadsheet.'
      },
      {
        q: "Do reports contain other owners' properties?",
        a: 'No, only yours.'
      }
    ],
    related: [
      { label: 'Revenue report', helpId: 'portails.proprietaire.rapports.revenus' },
      { label: 'Occupancy report', helpId: 'portails.proprietaire.rapports.occupation' },
      { label: 'Data export', helpId: 'portails.proprietaire.rapports.export' }
    ],
    keywords: ['report', 'export', 'pdf', 'excel', 'csv', 'revenue', 'occupancy', 'download']
  },
  {
    id: 'portails.proprietaire.rapports.revenus',
    kind: 'section',
    title: 'Revenue report',
    summary:
      'A file that totals the rent collected over the chosen period, by property and by month. It downloads as PDF, CSV or Excel.',
    howToRead: {
      notes: [
        'Period: required, from the start day to the end day. Only successful payments of this period are counted.',
        'Property: optional. When empty, the report covers all your properties.',
        'Format: PDF (default), CSV or Excel.',
        'The file contains the total revenue, the number of payments, and the breakdown by property and by month.',
        'A collected security deposit is not income: it is not counted.'
      ]
    },
    steps: [
      { title: 'Period', detail: 'Choose the start date and the end date.' },
      { title: 'Property', detail: 'If needed, limit the report to one property.' },
      { title: 'Format', detail: 'PDF, CSV or Excel.' },
      { title: 'Generate', detail: 'Click « Generate the report ».' }
    ],
    consequences: ["The file is named « revenue-report » followed by today's date."],
    faq: [
      {
        q: 'The total does not match my « My account » statement.',
        a: 'The report counts rent collected over the period, without fees or expenses. The account takes deductions and payouts into account.'
      },
      {
        q: 'The form refuses to submit.',
        a: 'The period and the format are required.'
      },
      {
        q: 'A chosen property gives an error.',
        a: 'Only your own properties are accepted; a property outside your list is treated as not found.'
      }
    ],
    related: [{ label: 'Revenues', to: '/owner/revenues' }],
    keywords: ['revenue', 'rent collected', 'financial report', 'period']
  },
  {
    id: 'portails.proprietaire.rapports.occupation',
    kind: 'section',
    title: 'Occupancy report',
    summary:
      'A file that says, on the chosen date, which properties were rented or available and the occupancy rate. It downloads as PDF, CSV or Excel.',
    howToRead: {
      notes: [
        'Date: required, today by default. A property is « Let » if it had an active or ended lease covering that date, otherwise « Available ».',
        'Format: PDF (default), CSV or Excel.',
        'The file gives the number of properties, rented and available ones, the occupancy rate, and for each property the current lease (number, tenant, dates).'
      ]
    },
    steps: [
      { title: 'Date', detail: 'Choose the date to examine (past or present).' },
      { title: 'Format', detail: 'PDF, CSV or Excel.' },
      { title: 'Generate', detail: 'Click « Generate the report ».' }
    ],
    consequences: ['The report does not target a specific property: it covers all your properties.'],
    faq: [
      {
        q: 'Can I see occupancy on a past date?',
        a: 'Yes: choose that date. The result reflects the leases of the time, not the current state of the property.'
      },
      {
        q: 'How is the occupancy rate calculated?',
        a: 'Number of properties rented on the date, divided by the total number of your properties.'
      },
      {
        q: 'Why is a property « Available » although it is occupied?',
        a: 'No active or ended lease covers the chosen date. Check the date or the lease with the agency.'
      }
    ],
    related: [{ label: 'Revenue report', helpId: 'portails.proprietaire.rapports.revenus' }],
    keywords: ['occupancy', 'occupancy rate', 'rented', 'available', 'vacancy']
  },
  {
    id: 'portails.proprietaire.rapports.export',
    kind: 'section',
    title: 'Data export',
    summary:
      'A CSV or Excel file containing your payments, your installments or your leases, which you can limit by period and by property.',
    howToRead: {
      notes: [
        'Data type: required, « Payments », « Instalments » or « Leases ».',
        'Format: Excel (default) or CSV. No PDF for this export.',
        'Period and Property: optional. When empty, the export covers all dates and all your properties.'
      ]
    },
    steps: [
      { title: 'Data type', detail: 'Payments, Instalments or Leases.' },
      { title: 'Format', detail: 'Excel or CSV.' },
      { title: 'Limit', detail: 'If needed, choose a period and a property.' },
      { title: 'Export', detail: 'Click « Export the data ».' }
    ],
    consequences: ["The file is named after the chosen type, followed by « Export » and today's date."],
    faq: [
      {
        q: 'What is the period for with leases?',
        a: 'To be confirmed: the screen offers it for all three types, but its effect on leases is not detailed.'
      },
      {
        q: 'Can I open the CSV in Excel?',
        a: 'Yes. Choose Excel if you prefer a ready-to-use file.'
      },
      {
        q: 'Is the data limited to my properties?',
        a: 'Yes, always.'
      }
    ],
    related: [
      { label: 'Payments', to: '/owner/payments' },
      { label: 'Installments', to: '/owner/installments' }
    ],
    keywords: ['export', 'excel', 'csv', 'payments', 'installments', 'leases', 'data']
  },

  // -------------------------------------------------- Préférences
  {
    id: 'portails.proprietaire.preferences',
    kind: 'page',
    title: 'Preferences',
    summary:
      "A single setting for now: whether or not to receive your agency's newsletters and communications. It is saved as soon as you click.",
    purpose:
      'Your agency may write to you with news, tips or offers. This setting tells whether you accept these messages. It does not concern messages related to the management of your properties.',
    steps: [
      { title: 'Open the page', detail: 'The switch shows « Yes » or « No » depending on your current choice.' },
      { title: 'Change', detail: 'Click the switch to go from « No » to « Yes », or the reverse.' },
      {
        title: 'Check',
        detail:
          'A message confirms: « You will receive the newsletters. » or « You will no longer receive the newsletters. »'
      }
    ],
    consequences: [
      'The change is saved immediately, with no « Save » button.',
      'With « Yes », the agency may include you in its newsletter mailings to its owners. With « No », you are not included.',
      'You can change your mind at any time.'
    ],
    faq: [
      {
        q: 'Does this change the messages about my rents or my properties?',
        a: 'To be confirmed: this setting only covers the newsletter. It does not turn off management messages.'
      },
      {
        q: 'I do not see the confirmation.',
        a: 'An error message appears if saving fails. Try again.'
      },
      {
        q: 'Who sees my choice?',
        a: 'Your agency, which uses it to build the list of its mailings.'
      }
    ],
    related: [{ label: 'Receive the newsletter', helpId: 'portails.proprietaire.preferences.newsletter' }],
    keywords: ['preferences', 'newsletter', 'communications', 'subscription', 'consent']
  },
  {
    id: 'portails.proprietaire.preferences.newsletter',
    kind: 'section',
    title: 'Receive the newsletter',
    summary:
      'An « Yes » / « No » switch that allows your agency to send you its newsletters and communications (news, tips, offers).',
    howToRead: {
      notes: [
        '« Yes »: you accept receiving these messages. « No »: you refuse them (default value as long as you have not chosen).'
      ]
    },
    consequences: [
      'Saving is immediate and reversible.',
      'Your choice is kept by the agency; the list of its newsletter mailings only keeps the owners who said « Yes ».'
    ],
    faq: [
      {
        q: 'What happens if I say « No »?',
        a: 'The agency no longer includes you in its newsletter mailings.'
      },
      {
        q: 'How many messages will I receive?',
        a: 'It depends on your agency; the screen does not say.'
      },
      {
        q: 'Can I choose the channel (e-mail, WhatsApp)?',
        a: 'No, this setting does not allow it.'
      }
    ],
    keywords: ['newsletter', 'consent', 'e-mail', 'communications']
  },

  // -------------------------------------------------- Patrimoine
  {
    id: 'portails.proprietaire.patrimoine',
    kind: 'page',
    title: 'My estate',
    summary:
      'The overview of your properties: estimated value of your share, unrealized gain, yields and remaining loans. The information shown depends on what your agency has chosen to show you.',
    purpose:
      'This screen helps you measure what your properties are worth and what they earn. It is read-only: valuations, loans and works are entered by the agency.',
    steps: [
      {
        title: 'Read the cards',
        detail:
          '« Number of properties » is always there. « Estimated value (your share) », « Latent capital gain » and « Outstanding capital » appear if your agency has enabled them.'
      },
      {
        title: 'Browse « Your properties »',
        detail:
          'Each row gives the property, your share, and depending on the settings: valuation, gain, yields, remaining capital.'
      },
      { title: 'Open a property', detail: 'Click « View the detail » for the property record.' },
      { title: 'Refresh', detail: 'The « Refresh » button reloads the view.' }
    ],
    consequences: [
      'This screen is read-only.',
      'If the agency hides the estate view, the screen shows « View unavailable ».'
    ],
    faq: [
      {
        q: 'Why do I not see the yields or the loans?',
        a: 'Your agency chooses what it shows you (valuation, yield, loans, works, documents). Ask it to enable it.'
      },
      {
        q: 'What does « Not provided » mean?',
        a: 'The information has not been entered by the agency, for example no valuation or no acquisition price. It is not zero.'
      },
      {
        q: 'What does « Whole property » mean in « Share »?',
        a: 'You own the property in full. Otherwise, a percentage shows your share.'
      },
      {
        q: 'How do I read « Latent capital gain »?',
        a: 'It is the estimated value minus the cost basis (purchase price and capitalized expenses). It is not cashed in until the property is sold.'
      }
    ],
    related: [
      { label: '« Your properties » table', helpId: 'portails.proprietaire.patrimoine.biens' },
      { label: 'A property record', helpId: 'portails.proprietaire.patrimoine-detail' }
    ],
    keywords: ['estate', 'value', 'valuation', 'unrealized gain', 'yield', 'loan', 'share']
  },
  {
    id: 'portails.proprietaire.patrimoine.indicateurs',
    kind: 'section',
    title: 'Key wealth figures',
    summary:
      'Up to four cards sum up your properties: their number, the estimated value of your share, the latent capital gain and the remaining capital due. Your agency chooses which ones you see.',
    purpose: 'They give a quick view of what your properties are worth and what is left to repay.',
    howToRead: {
      notes: [
        'Number of properties: the number of properties in your portfolio. This card is always shown.',
        'Estimated value (your share): the sum of the latest valuations of your properties, each brought down to your share. « Not provided » if no property has a valuation.',
        'Latent capital gain: the sum of the known capital gains, brought down to your share. « Not provided » if none can be calculated.',
        'Outstanding capital: the sum of the remaining capital of ongoing loans, brought down to your share.',
        'The last three cards appear only if your agency has enabled them (valuation for the first two, loans for the last one).',
        'Amounts are in FCFA.'
      ]
    },
    faq: [
      {
        q: 'Why do I only see « Number of properties »?',
        a: 'Your agency has enabled neither the display of valuation nor that of loans. Ask it to do so.'
      },
      {
        q: 'What does « Not provided » mean?',
        a: 'The agency has not entered the information, for example no valuation. It is not zero.'
      },
      {
        q: 'Is the latent capital gain money I have received?',
        a: 'No. It is an estimated difference, only cashed in if the property is sold.'
      }
    ],
    related: [{ label: 'My wealth', helpId: 'portails.proprietaire.patrimoine' }],
    keywords: ['estimated value', 'latent capital gain', 'remaining capital', 'number of properties', 'wealth']
  },
  {
    id: 'portails.proprietaire.patrimoine.biens',
    kind: 'table',
    title: 'Your properties (estate)',
    summary:
      "One row per property: your share, then depending on your agency's settings the latest valuation, the gain, the yields and the remaining capital.",
    howToRead: {
      columns: [
        { key: 'title', label: 'Property', description: 'The name of the property and its address.' },
        {
          key: 'ownerSharePercent',
          label: 'Share',
          description: 'Your share as a percentage, or « Whole property » if you own all of it.'
        },
        {
          key: 'valuation',
          label: 'Latest valuation',
          description: 'The most recent estimated value of the property, in FCFA; a dash (—) if none.'
        },
        {
          key: 'latentCapitalGain',
          label: 'Latent capital gain',
          description: 'Estimated value minus cost basis. « Not provided » if one of the two is missing.'
        },
        {
          key: 'grossYield',
          label: 'Gross yield',
          description: 'Annual rent divided by the estimated value.'
        },
        {
          key: 'netYield',
          label: 'Net yield',
          description: 'Annual rent minus annual expenses, divided by the estimated value.'
        },
        {
          key: 'netNetYield',
          label: 'Net-net yield',
          description:
            'Rent minus expenses and loan payments of the next 12 months, divided by the cost basis. Only shown if loans are visible.'
        },
        {
          key: 'loanSummary',
          label: 'Outstanding capital',
          description: 'What remains to be repaid on the active loans of the property.'
        }
      ],
      notes: [
        'The valuation, yield and loan columns only appear if your agency has enabled them.',
        'Yields are calculated on the value of the whole property; the card totals apply your share.',
        'A « Not provided » yield means no estimated value is recorded.'
      ]
    },
    steps: [
      { title: 'Open a property', detail: 'Click « View the detail » at the end of the row.' },
      { title: 'Export', detail: 'The export button downloads the list.' }
    ],
    faq: [
      {
        q: 'Why is my yield « Not provided »?',
        a: 'Without an estimated value, the yield cannot be calculated. The agency has to enter a valuation.'
      },
      {
        q: 'Does the yield take my share into account?',
        a: 'No, it is calculated on the whole property. The total cards do apply your share.'
      },
      {
        q: 'A property is missing from the list.',
        a: 'Only properties attached to you appear. Ask the agency to check the ownership.'
      }
    ],
    related: [{ label: 'My estate', helpId: 'portails.proprietaire.patrimoine' }],
    keywords: ['properties', 'yield', 'valuation', 'unrealized gain', 'share', 'remaining capital']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail',
    kind: 'page',
    title: 'Estate property record',
    summary:
      "Everything the agency has recorded about one of your properties: your share, its valuation, its yields, its loans, its works and its documents. The blocks shown depend on your agency's settings.",
    purpose:
      'Here you follow the value and profitability of a specific property. The screen is read-only: the agency enters and updates this data.',
    steps: [
      { title: 'Check your share', detail: 'The « Share » card says « Whole property » or the percentage you own.' },
      { title: 'Read the valuation and yield', detail: '« Valuation » and « Yield » cards, if visible.' },
      { title: 'Open a tab', detail: '« Valuation history », « Loans », « Works » or « Documents ».' },
      { title: 'Download a document', detail: 'In « Documents », click « Download ».' },
      { title: 'Go back', detail: 'The « Back » button takes you back to « My patrimony ».' }
    ],
    consequences: ['This screen is read-only.', 'Downloading a document saves it on your device and changes nothing.'],
    faq: [
      {
        q: 'Why is a tab missing?',
        a: 'Your agency has chosen not to show it, or there is nothing to show (the valuation history only appears if one exists).'
      },
      {
        q: 'What does « View unavailable » mean?',
        a: 'The estate view is hidden by the agency, or the property does not belong to you.'
      },
      {
        q: 'My changes are not taken into account.',
        a: 'You cannot change anything here; entry is done by the agency.'
      }
    ],
    related: [{ label: 'My estate', helpId: 'portails.proprietaire.patrimoine' }],
    keywords: ['property', 'record', 'estate', 'valuation', 'yield', 'loan', 'works']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.quote-part',
    kind: 'section',
    title: 'Share',
    summary: 'Your share in this property: « Whole property » if you own it in full, otherwise a percentage.',
    howToRead: {
      notes: [
        'This share is used to calculate the totals of the « My patrimony » page (estimated value, gain, remaining capital).',
        'The amounts on a property record concern the whole property, not your share.'
      ]
    },
    faq: [
      { q: 'My share is wrong.', a: 'Report it to the agency: it is the one that records it.' },
      { q: 'What does « Whole property » mean?', a: 'You own 100% of the property.' },
      {
        q: 'Is my income proportional to this share?',
        a: 'To be confirmed with your agency: this screen does not detail how rent is split.'
      }
    ],
    keywords: ['share', 'joint ownership', 'part', 'co-ownership']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.valorisation',
    kind: 'section',
    title: 'Valuation',
    summary:
      'The latest estimated value of the property, its date, the acquisition price and the unrealized gain. Visible if your agency has enabled valuation.',
    howToRead: {
      notes: [
        '« Estimated value »: the most recent recorded value, in FCFA.',
        '« Valued on »: the date of this estimate.',
        '« Acquisition price »: what the property cost; « Not provided » if it is not entered.',
        '« Latent capital gain »: estimated value minus cost basis. « Not provided » if the acquisition price is unknown.'
      ]
    },
    faq: [
      {
        q: 'Why « No valuation recorded »?',
        a: 'The agency has not yet entered an estimate for this property.'
      },
      {
        q: 'Is the gain a real gain?',
        a: 'No, it is « unrealized »: it only becomes a gain if the property is sold at that price.'
      },
      {
        q: 'Who estimates the value?',
        a: 'The agency records it; the history shows the method (Manual, Market estimate or Expert appraisal).'
      }
    ],
    keywords: ['valuation', 'estimated value', 'unrealized gain', 'acquisition price']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.rendement',
    kind: 'section',
    title: 'Yield',
    summary:
      'The yields of the property as percentages, with its annual rent and expenses. Visible if your agency has enabled yields.',
    howToRead: {
      notes: [
        '« Gross »: annual rent divided by the estimated value.',
        '« Net »: (annual rent minus annual expenses) divided by the estimated value.',
        '« Net-net »: after also deducting loan payments of the next 12 months, relative to the cost basis. Only shown if loans are visible.',
        "« Annual rent »: sum of the rents of the property's active leases, brought to a year. « Annual expenses »: the year's expenses.",
        '« Not provided »: the calculation is impossible, for example without an estimated value.'
      ]
    },
    faq: [
      {
        q: 'Why do these yields change?',
        a: 'They follow the active leases, expenses and latest valuation recorded.'
      },
      {
        q: 'My figures look low.',
        a: 'Check with the agency the estimated value and the recorded expenses: they enter directly into the calculation.'
      },
      {
        q: 'Is a yield guaranteed?',
        a: 'No, it is a calculation from recorded data, not a promise.'
      }
    ],
    keywords: ['gross yield', 'net yield', 'net-net', 'profitability', 'annual rent']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.valorisations',
    kind: 'section',
    title: 'Valuation history',
    summary:
      'The list of successive estimates of the property: date, estimated value and method. This tab only appears if at least one estimate exists.',
    howToRead: {
      columns: [
        { key: 'valuatedAt', label: 'Date', description: 'The date of the estimate.' },
        { key: 'estimatedValue', label: 'Estimated value', description: 'The value estimated on that date, in FCFA.' },
        { key: 'method', label: 'Method', description: 'Manual, Market estimate or Expert appraisal.' }
      ]
    },
    faq: [
      { q: 'Which estimate is used?', a: 'The most recent one, shown in the « Valuation » card.' },
      {
        q: 'What does « Expert appraisal » mean?',
        a: 'The value comes from an appraisal, not from a manual or market estimate.'
      },
      { q: 'Can I add an estimate?', a: 'Not here: only the agency can.' }
    ],
    keywords: ['history', 'valuation', 'appraisal', 'estimate']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.emprunts',
    kind: 'section',
    title: 'Loans',
    summary:
      'The loans attached to the property: lender, capital, remaining capital, rate, monthly payment, dates and status. Visible if your agency has enabled loans.',
    howToRead: {
      columns: [
        { key: 'lender', label: 'Lender', description: 'The institution that lent the money.' },
        { key: 'capitalAmount', label: 'Capital borrowed', description: 'The sum borrowed at the start.' },
        { key: 'remainingCapital', label: 'Outstanding capital', description: 'What remains to be repaid.' },
        { key: 'interestRate', label: 'Rate', description: 'The interest rate, as a percentage.' },
        { key: 'monthlyPayment', label: 'Monthly payment', description: 'The amount repaid each month.' },
        { key: 'startDate', label: 'Start', description: 'The loan start date.' },
        { key: 'endDate', label: 'End', description: 'The planned end date.' },
        { key: 'status', label: 'Status', description: 'Active, Closed or Defaulted.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The loan is being repaid.' },
        { value: 'CLOSED', label: 'Closed', description: 'The loan is paid off or over.' },
        { value: 'DEFAULTED', label: 'Defaulted', description: 'The loan is in payment default.' }
      ],
      notes: ['The total cards only count « Active » loans.']
    },
    faq: [
      { q: 'The tab says « No loan recorded ».', a: 'The agency has not entered any loan for this property.' },
      {
        q: 'Where can I see the total for all my properties?',
        a: 'In « My patrimony », « Outstanding capital » card.'
      },
      {
        q: 'Are monthly payments debited by the agency?',
        a: 'The screen does not say: it only records the loan data.'
      }
    ],
    keywords: ['loan', 'credit', 'monthly payment', 'remaining capital', 'bank']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.travaux',
    kind: 'section',
    title: 'Works',
    summary:
      'The works programs of the property: label, status, dates and estimated and actual costs. Visible if your agency has enabled works.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Works', description: 'The label of the program.' },
        { key: 'status', label: 'Status', description: 'Planned, In progress, Completed or Cancelled.' },
        {
          key: 'plannedDate',
          label: 'Planned date',
          description: 'When the works are planned; a dash (—) if unknown.'
        },
        { key: 'completedDate', label: 'End date', description: 'When they ended; a dash (—) if in progress.' },
        {
          key: 'estimatedCost',
          label: 'Estimated cost',
          description: 'The planned budget, in FCFA, or « Not provided ».'
        },
        { key: 'actualCost', label: 'Actual cost', description: 'The final cost, in FCFA, or « Not provided ».' }
      ],
      statuses: [
        { value: 'PLANNED', label: 'Planned', description: 'The works are scheduled.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'The works have started.' },
        { value: 'COMPLETED', label: 'Completed', description: 'The works are finished.' },
        { value: 'CANCELLED', label: 'Cancelled', description: 'The works are abandoned.' }
      ]
    },
    steps: [
      { title: 'Search', detail: 'Type a label in the search.' },
      { title: 'Filter', detail: 'Filter by Status.' }
    ],
    faq: [
      {
        q: 'Why is the actual cost « Not provided »?',
        a: 'The works are not finished or the agency has not yet entered the final cost.'
      },
      {
        q: 'Are these works the Maintenance tickets?',
        a: 'No: they are estate works programs, distinct from the tickets on the « Maintenance » screen.'
      },
      { q: 'The tab says « No works programme ».', a: 'No program is recorded for this property.' }
    ],
    related: [{ label: 'Maintenance', helpId: 'portails.proprietaire.incidents' }],
    keywords: ['works', 'renovation', 'construction site', 'estimated cost', 'actual cost']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.documents',
    kind: 'section',
    title: 'Property documents',
    summary:
      "The property's papers: title deed, plans, insurance, etc. Each document can be downloaded if your agency has enabled documents.",
    howToRead: {
      notes: [
        'Each row shows the file name, its type, the date added and, if any, its expiry date.',
        'Possible types: Title deed, Final concession order (ACD), Notarial deed, Building permit, Plan, Technical survey, Insurance, Tax document, Mandate, Meeting minutes, Trustee budget, Trustee contract, Co-ownership bylaws, Other.'
      ]
    },
    steps: [
      { title: 'Search', detail: 'Type a file name or a type.' },
      { title: 'Download', detail: 'Click « Download ».' }
    ],
    consequences: ['Downloading saves the file on your device and changes nothing.'],
    faq: [
      {
        q: 'Where are my receipts and lease contracts?',
        a: 'On the « Documents » screen of the menu: they are rental documents.'
      },
      {
        q: 'What does « Expires on » mean?',
        a: 'The date after which the document is no longer valid, for example an insurance policy.'
      },
      { q: 'I cannot add a document.', a: 'That is normal: documents are added by the agency.' }
    ],
    related: [{ label: 'Rental documents', helpId: 'portails.proprietaire.documents' }],
    keywords: ['documents', 'title deed', 'acd', 'insurance', 'plan', 'mandate']
  }
];

export default entries;
