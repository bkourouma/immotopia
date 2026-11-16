import type { HelpEntry } from '../../../types';

/** Zone « enligne » du module « locatif » (en). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.enligne.liste',
    kind: 'page',
    title: 'Online payments',
    summary:
      'Follow here the rents your tenants pay online, decide on payments that need checking and view the collection account. The screen has two tabs: "Online payment tracking" (tracking) and "Collection account" (collection account).',
    purpose:
      'A tenant pays an instalment from their portal or from a payment link. Each attempt appears here with its status. When the payment gateway (PaySecureHub) reports something unexpected, the payment is not collected on its own: it becomes "To decide" (to decide) and the decision is yours.',
    steps: [
      {
        title: 'Spot payments to decide',
        detail:
          'A "To be checked" badge on the "Online payment tracking" tab shows the number of cases waiting for a decision.'
      },
      {
        title: 'Find a payment',
        detail: 'Filter by status, type a payment code, a tenant or a lease, or pick a period with "From" "to".'
      },
      {
        title: 'Refresh a payment',
        detail: '"Check" asks the gateway and updates the status if something has changed.'
      },
      {
        title: 'Decide on a case',
        detail: '"Decide" opens the decision: accept (collect the money) or reject.'
      },
      {
        title: 'Follow the collection account',
        detail: 'Open the "Collection account" tab to see the balance and pay out to the treasury.'
      }
    ],
    consequences: [
      'If online payment is not available for your agency (not configured, disabled, simulator mode not allowed, or a subscription without this option), a yellow banner at the top of the screen gives the reason.',
      'Accepting a payment to decide collects the amount received and applies it to the instalments still open. Rejecting records nothing and refunds nobody.',
      'Every decision and every payout is recorded in the audit log.'
    ],
    faq: [
      {
        q: 'Why is a payment "To decide"?',
        a: 'The gateway reported a case to check: a different amount, a contrary state, a transaction already recorded, or an instalment that is no longer available. The reason is written under the status.'
      },
      {
        q: 'I cannot see the "Check" and "Decide" buttons. Why?',
        a: 'They require the "Allocate payments" permission. Viewing the screen requires "View payments". Ask your agency administrator for the permission.'
      },
      {
        q: 'Does this screen show all rent payments?',
        a: 'No, only online payment attempts. Other payments are in the rent payments list.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing the screen requires "View payments". "Check", "Decide" and the payout require "Allocate payments". The payout also requires "Create financial documents".'
    },
    related: [
      { label: 'How to read the online payments table', helpId: 'locatif.enligne.liste.tableau' },
      { label: 'The collection account', helpId: 'locatif.enligne.collecte' },
      { label: 'Decide on a payment', helpId: 'locatif.enligne.decision' },
      { label: 'Rent payments list', helpId: 'locatif.paiements.liste' }
    ],
    keywords: [
      'online payment',
      'mobile money',
      'payment link',
      'paysecurehub',
      'gateway',
      'checkout',
      'to decide',
      'dispute',
      'rent paid online'
    ]
  },
  {
    id: 'locatif.enligne.liste.tableau',
    kind: 'table',
    title: 'Online payments table',
    summary:
      'Each row is an online payment attempt by a tenant. The status tells where it stands; the "Check" and "Decide" buttons appear depending on the status and your permissions.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date and time the attempt was created.' },
        {
          key: 'codePaiement',
          label: 'Code',
          description: 'The payment code (copyable). The "Simulator" tag marks a test with no real money.'
        },
        { key: 'lease', label: 'Lease', description: 'The lease reference, with the property below it.' },
        {
          key: 'renter',
          label: 'Tenant',
          description: 'The tenant who started the payment. "Record not found" if their record no longer exists.'
        },
        {
          key: 'installments',
          label: 'Instalments',
          description: 'The instalments concerned, in month/year format (for example 03/2026).'
        },
        {
          key: 'amount',
          label: 'Amount',
          description:
            'The amount requested in FCFA. If the gateway reported a different amount, "Received: …" (received) is shown below.'
        },
        {
          key: 'origin',
          label: 'Source',
          description:
            '"Portal" (the tenant paid from their space) or "Payment link" (payment link), with the payment method used below.'
        },
        {
          key: 'status',
          label: 'Status',
          description:
            'The state of the attempt (see below). For a payment "To decide", the reason is written below; once decided, "Accepted" or "Refused" is shown with the person and their note.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Check" and "Decide", visible only with the "Allocate payments" permission.'
        }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'Pending',
          description: 'The tenant has not finished yet, or the gateway has not answered yet.'
        },
        { value: 'SUCCESS', label: 'Paid', description: 'The payment succeeded and is collected.' },
        {
          value: 'FAILED',
          label: 'Failed',
          description: 'The payment failed or was rejected. The failure message is written below.'
        },
        { value: 'CANCELED', label: 'Cancelled', description: 'The attempt was cancelled.' },
        { value: 'EXPIRED', label: 'Expired', description: 'The attempt ran out of time without payment.' },
        {
          value: 'REVIEW',
          label: 'To decide',
          description: 'A case to check: nothing is collected until you decide.'
        }
      ],
      notes: [
        'Reasons for a payment "To decide": "Amount paid differs from the amount expected" (amount differs), "Contrary status reported by the gateway" (contrary state), "Provider transaction already recorded" (duplicate transaction), "A targeted instalment is no longer available" (instalment unavailable).',
        '"Check" is offered for the statuses "Pending", "To decide" and "Expired": a payment that succeeded late can thus be read again.',
        '"Decide" is offered only for a payment "To decide" that has no decision yet.'
      ]
    },
    steps: [
      { title: 'Filter by status', detail: 'Choose one or more statuses in the "Status" field.' },
      { title: 'Search', detail: 'Payment code, tenant or lease.' },
      { title: 'Pick a period', detail: '"From" and "to" fields, on the creation date.' },
      {
        title: 'Check a payment',
        detail: 'Click "Check". A message says whether the status was updated or nothing changed at the gateway.'
      },
      { title: 'Decide on a payment', detail: 'Click "Decide" to open the decision window.' }
    ],
    consequences: [
      '"Check" reads the state at the gateway again and updates the attempt status if something has changed.'
    ],
    faq: [
      {
        q: 'What does "Receipt" under an amount mean?',
        a: 'The tenant paid an amount different from the one requested. The payment becomes "To decide" so that you can decide.'
      },
      {
        q: 'Why does "Check" not appear on a "Paid" payment?',
        a: 'There is nothing left to read: only the statuses "Pending", "To decide" and "Expired" offer it.'
      },
      {
        q: 'Where do I find the other rent payments?',
        a: 'In the rent payments list of the rental module.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: '"Check" and "Decide" require "Allocate payments".'
    },
    related: [
      { label: 'Decide on a payment', helpId: 'locatif.enligne.decision' },
      { label: 'Online payments overview', helpId: 'locatif.enligne.liste' }
    ],
    keywords: ['status', 'to check', 'amount received', 'simulator', 'payment link', 'portal']
  },
  {
    id: 'locatif.enligne.decision',
    kind: 'section',
    title: 'Decide on a payment',
    summary:
      'This window lets you decide on a payment "To decide": accept it to collect it, or reject it. The reason and the figures of the payment are shown at the top.',
    purpose:
      'When the gateway reports an unusual case, ImmoTopia collects nothing without your agreement. If needed, check the real state of the transaction at PaySecureHub before deciding.',
    steps: [
      { title: 'Read the reason', detail: 'The yellow box explains why the payment is to be decided.' },
      {
        title: 'Check the figures',
        detail: 'Amount requested, amount received, lease, tenant, payment method, provider transaction, last check.'
      },
      {
        title: 'Choose the decision',
        detail:
          '"Accept: record the collection" or "Reject: record nothing". A greyed-out option is not allowed for this reason.'
      },
      { title: 'Payment date', detail: 'When accepting, choose the "Payment date" (not in the future).' },
      { title: 'Write a note', detail: 'The note is optional to accept and mandatory to reject.' },
      { title: 'Confirm', detail: 'Click "Save the decision".' }
    ],
    consequences: [
      'Accepting collects the amount received (or the amount requested if none is reported) and applies it to the instalments still open among those concerned. An overpayment stays unallocated; a smaller amount leaves a balance due.',
      'Rejecting records nothing. The money stays at PaySecureHub: no refund is made from ImmoTopia.',
      'A decision cannot be undone from this screen. The note is kept in the audit log.',
      'Cases by reason: a transaction already recorded can only be rejected; a contrary state when the money is already collected can only be accepted (this simply closes the tracking); the other reasons allow both decisions.'
    ],
    faq: [
      {
        q: 'Why is one of the two decisions greyed out?',
        a: 'The reason forbids it: a transaction already recorded on another payment cannot be accepted, and a payment already collected cannot be rejected here.'
      },
      {
        q: 'Is the tenant refunded if I reject?',
        a: 'No. The message shown reminds you: the payer has not been refunded. Any refund is settled with PaySecureHub, outside ImmoTopia.'
      },
      {
        q: 'Why is the note mandatory to reject?',
        a: 'The reason for the rejection is kept in the audit log.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires the "Allocate payments" permission.' },
    related: [{ label: 'Online payments table', helpId: 'locatif.enligne.liste.tableau' }],
    keywords: ['decide', 'accept', 'reject', 'decision', 'overpayment', 'different amount', 'duplicate']
  },
  {
    id: 'locatif.enligne.collecte',
    kind: 'section',
    title: 'Collection account',
    summary:
      'The collection account receives the rents paid online before you pay them out to your treasury. This tab shows its balance and the payout history.',
    purpose:
      'Online collections arrive on a dedicated accounting account (account 5525). The payout moves this balance to a bank or a cash desk of your agency.',
    howToRead: {
      notes: [
        '"Accounting balance (5525)": what ImmoTopia has recorded on the collection account.',
        '"PaySecureHub balance": the balance read at the gateway, with its date. If the gateway is not configured, in simulator mode, without credentials or unreachable, a message says so instead.',
        'The two balances may differ: the payout is only an entry in ImmoTopia.'
      ]
    },
    steps: [
      { title: 'Read the balances', detail: 'Compare the accounting balance and the PaySecureHub balance.' },
      {
        title: 'Pay out',
        detail: 'Click "Transfer to treasury". The button is inactive while there is no balance to pay out.'
      },
      {
        title: 'View the history',
        detail: 'The table "Payouts to the treasury" lists the recorded payouts.'
      }
    ],
    consequences: [
      'The payout is an accounting entry in ImmoTopia only: no real transfer is triggered at PaySecureHub.'
    ],
    faq: [
      {
        q: 'Why is "Transfer to treasury" greyed out?',
        a: 'The accounting balance of the collection account is zero: there is nothing to pay out.'
      },
      {
        q: 'Does the payout send the money to the bank?',
        a: 'No. It only records the transfer in your accounting. No real transfer is triggered at PaySecureHub.'
      },
      {
        q: 'Why is the PaySecureHub balance missing?',
        a: 'The gateway is not configured, runs in simulator mode, lacks credentials or does not answer. The message shown gives the cause.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires "View payments". Paying out requires "Allocate payments" and "Create financial documents".'
    },
    related: [
      { label: 'Transfer to treasury', helpId: 'locatif.enligne.reversement' },
      { label: 'Payout history', helpId: 'locatif.enligne.collecte.reversements' }
    ],
    keywords: ['5525', 'balance', 'treasury', 'payout', 'paysecurehub', 'collection']
  },
  {
    id: 'locatif.enligne.collecte.reversements',
    kind: 'table',
    title: 'Payouts to the treasury',
    summary:
      'Each row is a payout from the collection account to a treasury account of your agency. The most recent are at the top.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Number', description: 'The transfer number (for example VIR-2026-0001).' },
        { key: 'date', label: 'Date', description: 'The payout date chosen when entering it.' },
        { key: 'toLabel', label: 'Destination', description: 'The treasury account that receives the amount.' },
        { key: 'amount', label: 'Amount', description: 'The amount paid out in FCFA.' },
        { key: 'note', label: 'Note', description: 'The note entered, or a dash if there is none.' },
        { key: 'createdByName', label: 'Entered by', description: 'The person who recorded the payout.' }
      ]
    },
    faq: [
      {
        q: 'Does a cancelled payout appear here?',
        a: 'No: the list only shows payouts that have not been cancelled.'
      },
      {
        q: 'Why is the list empty?',
        a: '"No payout recorded" means no payout has been made yet from the collection account.'
      },
      {
        q: 'Can this table be exported?',
        a: 'Yes, with the table export options, under the name "Payouts to the treasury".'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "View payments".' },
    related: [{ label: 'The collection account', helpId: 'locatif.enligne.collecte' }],
    keywords: ['transfer', 'history', 'payout']
  },
  {
    id: 'locatif.enligne.reversement',
    kind: 'section',
    title: 'Transfer to treasury',
    summary:
      'This window records the transfer of part or all of the collection account balance to a bank or a cash desk of your agency.',
    purpose:
      'Once the online rents are collected, you link them to your treasury. You cannot pay out more than the collection account balance.',
    steps: [
      { title: 'Destination account', detail: 'Choose an active bank or cash desk of your agency.' },
      { title: 'Amount paid out', detail: 'Enter the amount, or click "Pay out everything" (pay out everything).' },
      { title: 'Payout date', detail: 'Today by default; a future date is refused.' },
      { title: 'Note (optional)', detail: 'At most 500 characters.' },
      {
        title: 'Save',
        detail: 'Click "Save". A message confirms the payout number and the new balance.'
      }
    ],
    consequences: [
      'Accounting entry only: no real transfer is triggered at PaySecureHub.',
      'The amount leaves the collection account and enters the chosen destination account. The payout gets a transfer number and appears in the audit log.',
      'The payout goes to your agency treasury. This screen pays nothing directly to an owner.',
      'This screen offers no button to cancel a payout: check the account and the amount before saving.'
    ],
    faq: [
      {
        q: 'Why is the "Save" button greyed out?',
        a: 'You need a destination account, an amount above zero and not above the balance, and a date.'
      },
      {
        q: 'Which accounts can I choose?',
        a: 'Only your active banks and cash desks. The collection account itself is never offered.'
      },
      {
        q: 'I get the message "The amount exceeds the balance of the collection account". What now?',
        a: 'Lower the amount or click "Pay out everything" to take exactly the balance.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires "Allocate payments" and "Create financial documents". Without the second permission, saving is refused.'
    },
    related: [{ label: 'The collection account', helpId: 'locatif.enligne.collecte' }],
    keywords: ['pay out', 'transfer', 'bank', 'cash desk', 'treasury']
  }
];

export default entries;
