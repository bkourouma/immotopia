import type { HelpEntry } from '../../../types';

/** « prestataires » zone of the « syndic » module (en): service providers, contracts, provider invoices, unit profiles and incidents. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Providers
  {
    id: 'syndic.prestataires.liste',
    kind: 'page',
    title: 'Service providers and contracts',
    summary:
      'This screen gathers the companies working for the co-ownership, their maintenance contracts and their invoices. It has two tabs: "Contractors" (providers) and "Invoices" (invoices).',
    purpose:
      'Providers belong to the agency: a provider created here is available in all its co-ownerships. Contracts and invoices only concern the co-ownership you have open.',
    steps: [
      {
        title: 'Create the provider',
        detail: 'In the "Contractors" tab, "New contractor" button: name (required), specialty, e-mail and phone.'
      },
      {
        title: 'Create the contract',
        detail: '"New contract" button: provider, nature of the contract, start date, optional end date, annual amount.'
      },
      {
        title: 'Record an invoice',
        detail: 'In the "Invoices" tab, "Record an invoice" button: the expense is posted in the accounts.'
      },
      {
        title: 'Pay the invoice',
        detail: 'Click "Open" on the right of the invoice, then "Record a payment", choosing the fund to debit.'
      },
      {
        title: 'Follow the balances',
        detail: 'The "Balances by contractor" table shows what the co-ownership still owes each provider.'
      }
    ],
    consequences: [
      'Recording an invoice creates an accounting entry in the co-ownership; a payment debits a fund. See the help sheet of the "Invoices" tab.',
      'Deleting a provider is permanent, and impossible if it has a linked contract or incident.'
    ],
    faq: [
      {
        q: 'Why can I not delete a provider?',
        a: 'It has at least one linked contract or incident, in this co-ownership or another one of the agency. These links must be removed first.'
      },
      {
        q: 'Why does "New contract" refuse my contract?',
        a: 'A contract of the same nature is already active with this provider over the same period. Change the dates or the nature.'
      },
      {
        q: 'The provider is not in the contract list, what can I do?',
        a: 'In the form, click "No service provider? Create one": it is selected as soon as it is created.'
      },
      {
        q: 'What is the "Common assets" card for?',
        a: 'It simply lists, by name, the equipment of the common areas of the co-ownership. It has no action.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager', 'Accountant'],
      note: 'Viewing requires the co-ownership view right. Creating, editing, deleting, recording an invoice or a payment require the co-ownership edit right.'
    },
    related: [
      { label: 'Service providers', helpId: 'syndic.prestataires.tableau' },
      { label: 'Maintenance contracts', helpId: 'syndic.prestataires.contrats' },
      { label: 'Provider invoices', helpId: 'syndic.prestataires.factures' },
      { label: 'Incidents and cost allocations', helpId: 'syndic.profils.incidents' }
    ],
    keywords: ['provider', 'supplier', 'company', 'maintenance contract', 'supplier invoice', 'elevator', 'cleaning']
  },
  {
    id: 'syndic.prestataires.fiche',
    kind: 'section',
    title: 'A provider record',
    summary:
      'The "Contractors" card lists the agency\'s companies and their contractual situation with this co-ownership. You create, edit or delete a provider there.',
    purpose:
      'A provider is a simple record: name, specialty, e-mail, phone. It is then used for contracts, incidents and invoices.',
    steps: [
      {
        title: 'Create',
        detail: '"New contractor", then "Create". The name is required, and the e-mail must be valid if you enter one.'
      },
      { title: 'Edit', detail: '"Edit" button on the row, then "Save".' },
      { title: 'Delete', detail: '"Delete" button on the row, then confirm.' }
    ],
    consequences: [
      'The name is unique within the agency, ignoring capitals and surrounding spaces: a duplicate is refused under the "Name" field.',
      'Deletion is permanent. It is refused if the provider has a linked contract or incident.',
      'No e-mail or SMS is sent to the provider.'
    ],
    faq: [
      {
        q: 'Does a provider created here appear in the other co-ownerships?',
        a: 'Yes, the record belongs to the agency. Only its contracts, filtered in the table, depend on the open co-ownership.'
      },
      {
        q: 'Can I rename a provider that is already used?',
        a: 'Yes, with "Edit". The contracts and invoices already linked follow the new name.'
      },
      {
        q: 'The "Edit" and "Delete" buttons are missing.',
        a: 'They require the co-ownership edit right.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Creating, editing and deleting require the co-ownership edit right.' },
    related: [{ label: 'Service providers', helpId: 'syndic.prestataires.tableau' }],
    keywords: ['new provider', 'edit provider', 'delete provider', 'duplicate', 'specialty']
  },
  {
    id: 'syndic.prestataires.tableau',
    kind: 'table',
    title: 'Service providers',
    summary:
      'This table lists the agency\'s providers, those with an active contract with this co-ownership first. The "Contracts" column only counts the contracts of this co-ownership.',
    howToRead: {
      columns: [
        {
          key: 'name',
          label: 'Contractor',
          description: 'Name and specialty from the record, with initials in a badge.'
        },
        { key: 'contact', label: 'Contact', description: 'Clickable phone and e-mail. A dash if none is entered.' },
        {
          key: 'contracts',
          label: 'Contracts',
          description: 'Number of active ("1 active", "2 active") and ended contracts, or "No contract".'
        },
        { key: 'actions', label: 'Actions', description: '"Edit" and "Delete" (depending on your rights).' }
      ],
      notes: [
        'Filters: "Contract" (Active contract, Completed contracts only, No contract) and "Specialty". Search covers name, specialty, phone and e-mail.'
      ]
    },
    consequences: ['Deleting a row is permanent and refused if the provider has linked contracts or incidents.'],
    faq: [
      { q: 'Where can I see the detail of a contract?', a: 'In the "Maintenance contracts" card, just below.' },
      {
        q: 'What does "No contract" mean?',
        a: 'The provider has no contract with this co-ownership. It may have some elsewhere in the agency.'
      },
      { q: 'Can the list be exported?', a: 'Yes, with the table export: it includes every row matching your search.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'The action buttons require the co-ownership edit right.' },
    related: [{ label: 'A provider record', helpId: 'syndic.prestataires.fiche' }],
    keywords: ['provider list', 'contact', 'phone', 'specialty']
  },
  {
    id: 'syndic.prestataires.contrats',
    kind: 'table',
    title: 'Maintenance contracts',
    summary:
      'This table lists the maintenance contracts of the co-ownership. Expand a row to see the invoices attached to the contract.',
    purpose:
      'A contract links a provider to the co-ownership for a specific service (cleaning, elevator, security...), with its dates and an annual amount.',
    howToRead: {
      columns: [
        { key: 'provider', label: 'Contractor', description: 'The company linked to the contract.' },
        { key: 'nature', label: 'Nature', description: 'Purpose of the contract, for example "Common-area cleaning".' },
        { key: 'startDate', label: 'Start', description: 'Start date of the contract.' },
        {
          key: 'endDate',
          label: 'End',
          description: 'End date, or "No end date". It is shown in orange when it falls within 45 days or has passed.'
        },
        { key: 'annualAmount', label: 'Annual amount', description: 'Yearly amount in FCFA, or "Not provided".' },
        { key: 'status', label: 'Status', description: 'State of the contract (see below).' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Contract in progress.' },
        { value: 'EXPIRED', label: 'Expired', description: 'The contract term has passed.' },
        { value: 'TERMINATED', label: 'Terminated', description: 'Contract stopped before its term.' }
      ],
      notes: [
        'Filters: status, provider, start and end dates, annual amount. Search covers the provider and the nature.'
      ]
    },
    steps: [
      { title: 'Open the form', detail: '"New contract" button at the top of the screen.' },
      { title: 'Choose the provider', detail: 'Or "No service provider? Create one".' },
      {
        title: 'Describe the contract',
        detail: '"Contract nature" and "Start date" are required; "End date" and "Annual amount" are optional.'
      },
      { title: 'Set the alert', detail: '"Renewal alert (days)" is 30 by default. The currency is "XOF", i.e. FCFA.' },
      { title: 'Create', detail: '"Create" button.' }
    ],
    consequences: [
      'A contract of the same nature, active with the same provider over an overlapping period, is refused.',
      'This table does not allow editing or terminating a contract.'
    ],
    faq: [
      {
        q: 'How do I see the invoices of a contract?',
        a: 'Click the arrow at the start of the row: the "Linked invoices" list appears.'
      },
      {
        q: 'Is the contract linked to a budget?',
        a: 'Not from this form. When an invoice is recorded, the budget line can be deduced from the contract if only one exists.'
      },
      {
        q: 'What does "Renewal alert (days)" do?',
        a: 'It keeps the delay entered on the contract. This screen sends no reminder.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Creating a contract requires the co-ownership edit right.' },
    related: [
      { label: 'Linked invoices', helpId: 'syndic.prestataires.factures-liees' },
      { label: 'A provider record', helpId: 'syndic.prestataires.fiche' }
    ],
    keywords: ['contract', 'maintenance', 'renewal', 'termination', 'subscription', 'nature of the contract']
  },
  {
    id: 'syndic.prestataires.factures-liees',
    kind: 'table',
    title: 'Linked invoices',
    summary:
      'This sub-table shows the provider invoices attached to a contract or an incident, in the expanded row. "Open" shows the same detail as the "Invoices" tab.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Number', description: 'Invoice number, as entered.' },
        { key: 'label', label: 'Label', description: 'Purpose of the invoice.' },
        { key: 'invoiceDate', label: 'Date', description: 'Invoice date.' },
        { key: 'amountTTC', label: 'Total amount', description: 'Amount including tax.' },
        { key: 'amountDue', label: 'Remaining due', description: 'What is still to pay.' },
        { key: 'status', label: 'Status', description: 'Recorded, Partially paid, Paid or Cancelled.' },
        { key: 'actions', label: 'Actions', description: '"Open" shows the invoice detail.' }
      ],
      notes: ['The list is limited to the 50 most recent invoices, five per page. With none: "No linked invoice".']
    },
    consequences: ['An invoice is attached to a contract or an incident when it is recorded, from the "Invoices" tab.'],
    faq: [
      {
        q: 'Why does my invoice not appear?',
        a: 'It was recorded without choosing this contract or incident. This table cannot attach it afterwards.'
      },
      { q: 'Can I pay from here?', a: 'Yes: "Open", then "Record a payment" in the invoice detail.' },
      {
        q: 'What happens when I pay or cancel an invoice from "Open"?',
        a: 'The list reloads by itself: the "Balance due" and "Status" of the row are updated.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Opening requires the view right; paying or cancelling requires the co-ownership edit right.'
    },
    related: [{ label: 'Invoice detail', helpId: 'syndic.prestataires.facture-detail' }],
    keywords: ['contract invoices', 'incident invoices', 'attached']
  },
  // ------------------------------------------------------------------ Invoices
  {
    id: 'syndic.prestataires.factures',
    kind: 'section',
    title: 'Provider invoices',
    summary:
      'This tab records the invoices received from providers and their payments, and shows what the co-ownership owes each one. It has two tables: balances, then invoices.',
    purpose:
      'Each invoice is posted in the co-ownership accounts. The payment is taken from a co-ownership fund (working capital, reserve, works...).',
    steps: [
      { title: 'Record', detail: '"Record an invoice" button: see the help sheet of the form.' },
      {
        title: 'Search',
        detail: 'Search by number, label or provider, then filter by status, date, contract or incident.'
      },
      { title: 'Open', detail: '"Open" shows the detail: information, attachment, payments.' },
      { title: 'Pay', detail: 'In the detail, "Record a payment": a partial payment is possible.' },
      { title: 'Cancel', detail: '"Cancel the invoice" with a reason, after cancelling its payments.' }
    ],
    consequences: [
      'Recording debits an expense account and credits the provider account, in the co-ownership. VAT is counted in the expense: a co-ownership cannot recover it.',
      'If the invoice is attached to a budget line, the actual amount of that line increases by the amount including tax.',
      'A payment debits the chosen fund and reduces the debt to the provider by the same amount.',
      'No e-mail or SMS is sent to the provider.'
    ],
    faq: [
      {
        q: 'How do I correct an amount?',
        a: 'From this screen an invoice cannot be edited. Cancel it (with no active payment), then record it again: a cancelled number can be reused.'
      },
      {
        q: 'Why is recording refused?',
        a: 'Common cases: number already used by this provider, accounting year closed at that date, or a zero total. The message gives the cause.'
      },
      { q: 'Are amounts in FCFA?', a: 'Yes, by default. The currency "XOF" is the FCFA.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager', 'Accountant'],
      note: 'Viewing requires the co-ownership view right. Recording, paying, cancelling and managing the attachment require the co-ownership edit right.'
    },
    related: [
      { label: 'Record an invoice', helpId: 'syndic.prestataires.facture-nouvelle' },
      { label: 'Balances by provider', helpId: 'syndic.prestataires.soldes' },
      { label: 'Provider invoices', helpId: 'syndic.prestataires.factures-liste' },
      { label: 'Invoice detail', helpId: 'syndic.prestataires.facture-detail' }
    ],
    keywords: ['invoice', 'supplier', 'supplier payment', 'debt', 'expenses', 'works', 'accounting']
  },
  {
    id: 'syndic.prestataires.soldes',
    kind: 'table',
    title: 'Balances by provider',
    summary:
      'This table totals, for each invoiced provider, what has been invoiced, paid and what remains due. Cancelled invoices are not counted.',
    howToRead: {
      columns: [
        { key: 'providerName', label: 'Contractor', description: 'The invoiced provider.' },
        { key: 'invoicesCount', label: 'Invoices', description: 'Number of non-cancelled invoices.' },
        { key: 'totalInvoiced', label: 'Total invoiced', description: 'Sum of the amounts including tax.' },
        { key: 'totalPaid', label: 'Total paid', description: 'Sum of the non-cancelled payments.' },
        { key: 'totalDue', label: 'Remaining due', description: 'Total invoiced minus total paid.' },
        {
          key: 'overdueDue',
          label: 'Of which overdue',
          description:
            'Part of the amount due whose due date has passed, in red when not zero. An invoice with no due date is never late.'
        }
      ],
      notes: [
        'Sorted with the largest amount due first. Filters: "Remaining due" (amount) and "With arrears". With none: "No invoice recorded".'
      ]
    },
    faq: [
      {
        q: 'Why does a provider not appear?',
        a: 'A provider only has a row if it has at least one non-cancelled invoice in this co-ownership.'
      },
      { q: 'Does the table update after a payment?', a: 'Yes, after each invoice or payment recorded or cancelled.' },
      {
        q: 'How do I find a provider in this table?',
        a: 'Type the name in the "Search" field, or filter by "Balance due" and "With arrears".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Viewing requires the co-ownership view right.' },
    related: [{ label: 'Provider invoices', helpId: 'syndic.prestataires.factures-liste' }],
    keywords: ['balance', 'debt', 'amount due', 'late', 'overdue']
  },
  {
    id: 'syndic.prestataires.factures-liste',
    kind: 'table',
    title: 'Provider invoices',
    summary:
      'This table lists the provider invoices of the co-ownership, with what has been paid and what remains due. "Open" shows the detail to pay or cancel.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Number', description: "The provider's invoice number." },
        { key: 'provider', label: 'Contractor', description: 'The company that invoiced.' },
        { key: 'label', label: 'Label', description: 'Purpose of the invoice.' },
        { key: 'invoiceDate', label: 'Invoice date', description: 'Date shown on the invoice.' },
        { key: 'amountTTC', label: 'Total amount', description: 'Amount before tax plus VAT.' },
        { key: 'amountPaid', label: 'Paid', description: 'Total of the non-cancelled payments.' },
        { key: 'amountDue', label: 'Remaining due', description: 'Amount including tax minus paid.' },
        {
          key: 'hasFile',
          label: 'Attachment',
          description: '"Attached" if a scan or photo is attached, otherwise "None".'
        },
        { key: 'status', label: 'Status', description: 'State of the invoice (see below).' },
        { key: 'actions', label: 'Actions', description: '"Open" shows the detail.' }
      ],
      statuses: [
        { value: 'RECORDED', label: 'Recorded', description: 'Posted in the accounts, no active payment.' },
        {
          value: 'PARTIALLY_PAID',
          label: 'Partially paid',
          description: 'Part of the total is paid, a balance remains.'
        },
        { value: 'PAID', label: 'Paid', description: 'The total is fully paid.' },
        {
          value: 'CANCELLED',
          label: 'Cancelled',
          description: 'Cancelled with a reason; the accounting entry is reversed. Final.'
        }
      ],
      notes: [
        'Filters: provider, status, invoice date, contract, incident. Search covers the number, the label and the provider.'
      ]
    },
    faq: [
      {
        q: 'Can I filter the invoices of an incident?',
        a: 'Yes, with the "Incident" filter. You also see them by expanding the incident in "Profiles and incidents".'
      },
      {
        q: 'Does the export contain everything?',
        a: 'Yes: all invoices matching your filters, not only the displayed page.'
      },
      {
        q: 'How do I find the invoices for a given period?',
        a: 'Use the "Invoice date" filter to choose a date range. You can combine it with "Contractor" and "Status".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Viewing requires the co-ownership view right.' },
    related: [
      { label: 'Invoice detail', helpId: 'syndic.prestataires.facture-detail' },
      { label: 'Record an invoice', helpId: 'syndic.prestataires.facture-nouvelle' }
    ],
    keywords: ['invoice list', 'paid invoice', 'cancelled invoice', 'attachment']
  },
  {
    id: 'syndic.prestataires.facture-nouvelle',
    kind: 'section',
    title: 'Record an invoice',
    summary:
      'This form posts a provider invoice in the accounts. The total including tax is calculated: amount before tax plus VAT.',
    purpose:
      'It attaches the expense to a provider and, if you wish, to a contract, an incident, a budget line and a fund.',
    steps: [
      { title: 'Provider', detail: "Choose it. If you link a contract, it must be this provider's contract." },
      {
        title: 'Links',
        detail:
          '"Contract", "Incident", "Budget line" and "Default fund to debit" are optional. With no choice, the budget line is deduced from the contract if only one line is linked to it.'
      },
      {
        title: 'Nature of the expense',
        detail: '"Current expenses" (default) or "Works": the expense account used is not the same.'
      },
      {
        title: 'Invoice',
        detail:
          '"Invoice number", "Label" and "Invoice date" are required; "Due date" is optional and cannot precede the invoice date.'
      },
      {
        title: 'Amounts',
        detail:
          'Enter "Pre-tax amount" and "VAT": "Total amount (calculated)" updates. The amount before tax must be above zero.'
      },
      { title: 'Attachment', detail: '"Choose a file": PDF, PNG or JPEG of 10 MB at most. Optional.' },
      { title: 'Confirm', detail: '"Save" button.' }
    ],
    consequences: [
      'An entry is posted at the invoice date: expense on the debit side, provider account on the credit side.',
      'Refused if the date falls in a closed accounting year, if the number already exists for this provider (cancelled invoices excepted) or if the date is more than a year after today.',
      'With an incident chosen: if that incident has a single "Co-ownership budget" allocation with no entry, it is linked to the invoice. Otherwise a message tells you; the invoice is still recorded.'
    ],
    faq: [
      { q: 'Must I choose a fund now?', a: 'No, "Default fund to debit" is optional: you will choose it when paying.' },
      {
        q: 'Is VAT recovered?',
        a: 'No. The co-ownership cannot recover it: the recorded expense is the amount including tax.'
      },
      {
        q: 'What does the currency mean?',
        a: '"XOF" is the code of the FCFA. If you choose a fund, it must have the same currency as the invoice.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Recording an invoice requires the co-ownership edit right.' },
    related: [{ label: 'Provider invoices', helpId: 'syndic.prestataires.factures' }],
    keywords: [
      'new invoice',
      'enter an invoice',
      'amount before tax',
      'VAT',
      'total with tax',
      'current expenses',
      'works'
    ]
  },
  {
    id: 'syndic.prestataires.facture-detail',
    kind: 'section',
    title: 'Invoice detail',
    summary:
      "An invoice's drawer shows its information, its attachment and its payments. You pay the invoice, attach the document or cancel the invoice there.",
    steps: [
      {
        title: 'Read the invoice',
        detail:
          'Provider, label, contract, incident, budget line, default fund, dates, amounts before tax, VAT, total, paid and amount due.'
      },
      { title: 'Attach the document', detail: '"Add an attachment", then "Download", "Replace" or "Delete".' },
      { title: 'Pay', detail: '"Record a payment": see the payments help sheet.' },
      {
        title: 'Cancel the invoice',
        detail: '"Cancel the invoice", enter the reason (required), then "Confirm the cancellation".'
      }
    ],
    consequences: [
      'Cancelling an invoice is permanent: it can no longer be paid. Active payments must be cancelled first.',
      "Cancellation posts a reversing entry dated today, removes the amount from the budget line's actual and frees the linked incident allocation.",
      'The attachment can no longer be deleted once a payment has been recorded (invoice "Partially paid" or "Paid").'
    ],
    faq: [
      {
        q: 'Why is "Cancel the invoice" refused?',
        a: "The invoice still has non-cancelled payments. Cancel them first, or the accounting year is closed at today's date."
      },
      { q: 'Which files can I attach?', a: 'PDF, PNG or JPEG, 10 MB at most. The real file type is checked.' },
      { q: 'The payment button has disappeared.', a: 'The invoice is cancelled or has no amount due left.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Downloading the attachment requires the view right; the rest requires the co-ownership edit right.'
    },
    related: [{ label: 'Invoice payments', helpId: 'syndic.prestataires.facture-paiements' }],
    keywords: ['cancel invoice', 'attachment', 'download', 'reason', 'reversing entry']
  },
  {
    id: 'syndic.prestataires.facture-paiements',
    kind: 'table',
    title: 'Invoice payments',
    summary:
      'This table lists the payments made on an invoice. "Record a payment" adds one; "Cancel" undoes one with a reason.',
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date', description: 'Payment date.' },
        { key: 'amount', label: 'Amount', description: 'Amount paid.' },
        { key: 'method', label: 'Method', description: 'Mobile money, Bank transfer, Cash, Cheque, Card or Other.' },
        { key: 'reference', label: 'Reference', description: 'Transaction or cheque number, if entered.' },
        { key: 'fund', label: 'Fund', description: 'The fund that was debited.' },
        { key: 'status', label: 'Status', description: '"Active" or "Cancelled".' },
        { key: 'actions', label: 'Actions', description: '"Cancel" on an active payment.' }
      ]
    },
    steps: [
      {
        title: 'Open the form',
        detail: '"Record a payment": it suggests the amount due, today\'s date and "Bank transfer".'
      },
      { title: 'Fill in', detail: '"Amount", "Payment date" and "Method" are required; "Reference" is optional.' },
      {
        title: 'Choose the fund',
        detail:
          '"Fund to debit": with no choice, the invoice\'s default fund is used. With no fund at all, the payment is refused.'
      },
      { title: 'Confirm', detail: '"Save" button.' }
    ],
    consequences: [
      'The fund is debited and a fund movement records it; the accounting entry debits the provider account and credits the bank.',
      'If the fund balance becomes negative, a warning is shown but the payment is recorded.',
      "Refused if the amount exceeds the amount due, if the date precedes the invoice date, or if the fund does not have the invoice's currency.",
      'Cancelling a payment (reason required) credits the fund back, posts a reversing entry and recalculates the invoice status.'
    ],
    faq: [
      {
        q: 'Can I pay in several instalments?',
        a: 'Yes. The invoice becomes "Partially paid", then "Paid" once the total is reached.'
      },
      {
        q: 'Does the provider receive a confirmation?',
        a: 'No, no message is sent: the screen only records the payment.'
      },
      {
        q: 'How do I cancel a payment entered by mistake?',
        a: 'On the row of the active payment, click "Cancel", enter the reason (required), then confirm. The row changes to "Cancelled" and stays visible in the table.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Recording or cancelling a payment requires the co-ownership edit right.' },
    related: [{ label: 'Invoice detail', helpId: 'syndic.prestataires.facture-detail' }],
    keywords: ['partial payment', 'pay an invoice', 'cancel a payment', 'debited fund', 'mobile money', 'transfer']
  },
  // ------------------------------------------------------------------ Profiles and incidents
  {
    id: 'syndic.profils.liste',
    kind: 'page',
    title: 'Unit profiles and incidents',
    summary:
      'This screen links each unit to its owner and its tenant, and tracks the incidents of the co-ownership. It has three tabs: "Owner profiles", "Tenant profiles" and "Incidents and allocations".',
    purpose:
      'A profile says who owns or occupies a unit, since when and for what share. An incident keeps the record of a breakdown or damage, from reporting to closing.',
    steps: [
      {
        title: 'Create an owner profile',
        detail: '"Owner profile" button: unit, contact, share as a percentage, start date.'
      },
      { title: 'Create a tenant profile', detail: '"Tenant profile" button: unit, contact, entry date.' },
      { title: 'Report an incident', detail: '"New incident" button: reporting contact, type, urgency, description.' },
      {
        title: 'Move the incident forward',
        detail: '"Incidents and allocations" tab, "Edit incident": status, provider, description.'
      }
    ],
    consequences: [
      'No e-mail, SMS or WhatsApp message is sent when creating a profile or an incident.',
      'Only "Invite to portal" sends an e-mail, to the co-owner concerned.'
    ],
    faq: [
      {
        q: 'The contact is not in the list, what can I do?',
        a: 'In the form, you can create the contact on the spot: it is selected right away.'
      },
      {
        q: 'Do the three buttons at the top change tab?',
        a: 'No, they open a form. The displayed tab does not change.'
      },
      { q: 'Where is the tab remembered?', a: 'In the page address: you can share the link of a specific tab.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager'],
      note: 'Viewing requires the co-ownership view right. Creating, editing, inviting to the portal and reporting require the co-ownership edit right.'
    },
    related: [
      { label: 'Owner profiles', helpId: 'syndic.profils.proprietaires' },
      { label: 'Tenant profiles', helpId: 'syndic.profils.locataires' },
      { label: 'Incidents and cost allocations', helpId: 'syndic.profils.incidents' },
      { label: 'Service providers and contracts', helpId: 'syndic.prestataires.liste' }
    ],
    keywords: ['owner', 'tenant', 'co-owner', 'profile', 'incident', 'breakdown', 'damage', 'share']
  },
  {
    id: 'syndic.profils.proprietaires',
    kind: 'table',
    title: 'Owner profiles',
    summary:
      'This table lists, unit by unit, current and former owners with their share. You create a profile there and open or close access to the co-owner portal.',
    purpose:
      "The shares of the owners of a same unit never exceed 100%. The unit's owner follows its current profiles.",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'The unit, with its number.' },
        { key: 'contact', label: 'Contact', description: "The owner (the agency's contact record)." },
        {
          key: 'ownershipPercentage',
          label: 'Share (%)',
          description: 'Ownership share of the unit, as a percentage.'
        },
        { key: 'ownedSince', label: 'Since', description: 'Acquisition date.' },
        { key: 'situation', label: 'Status', description: '"Current" or "Former".' },
        {
          key: 'portalAccessEnabled',
          label: 'Portal',
          description: '"Active" if portal access is open for this profile, otherwise "Inactive".'
        },
        {
          key: 'portal-actions',
          label: 'Portal access',
          description: '"Invite to portal" and, if access is active, "Revoke access".'
        }
      ],
      statuses: [
        { value: 'current', label: 'Current', description: 'Active profile whose end is empty or in the future.' },
        { value: 'former', label: 'Former', description: 'Closed or deactivated profile.' }
      ],
      notes: [
        'The "Incomplete shares" banner lists the units whose current shares total less than 100%, for example "Unit A12: 50% allocated". A unit with no profile at all is not listed.',
        'Filters: unit, status, portal access, incomplete share.'
      ]
    },
    steps: [
      { title: 'Open the form', detail: '"Owner profile" button at the top of the screen.' },
      { title: 'Unit and contact', detail: 'Choose the unit and the owner contact, or create the contact.' },
      { title: 'Share and date', detail: '"Ownership share (%)" is 100 by default; "Start date" is required.' },
      {
        title: 'Portal',
        detail:
          '"Enable portal access": Oui or Non (Non by default). This flags the profile without sending any e-mail.'
      },
      {
        title: 'Resale or co-ownership',
        detail:
          'If the unit already has an owner, choose "Resale: end the previous owner on the acquisition date" or "Joint ownership: they own it together".'
      },
      {
        title: 'Invite to the portal',
        detail:
          '"Invite to portal" on the row: the invitation is sent by e-mail and the link is shown so you can copy it.'
      }
    ],
    consequences: [
      "Resale: the former owners' profiles get an end date equal to the acquisition date. Joint ownership: they stay, and the total of the shares cannot exceed 100%.",
      'Refused if this contact already owns the unit (edit their profile) or if the shares exceed 100%.',
      '"Invite to portal" needs a valid e-mail address on the contact record. The account is created if needed; the e-mail is sent if e-mail delivery is configured. Access is personal: it opens all the contact\'s units in the agency. The activation link of a new account lasts 7 days.',
      '"Revoke access" closes access for all the contact\'s units in the agency, immediately, without deleting their account.'
    ],
    faq: [
      {
        q: 'Why is "Invite to portal" greyed out?',
        a: 'The profile is no longer active: only the owner of an active profile can be invited.'
      },
      {
        q: 'Why is the invitation refused?',
        a: 'The contact has no valid e-mail address. Complete their record, then try again.'
      },
      {
        q: 'The e-mail was not sent, what can I do?',
        a: 'Copy the link shown in the window and send it to the co-owner yourself.'
      },
      {
        q: 'Can a profile be edited from this screen?',
        a: 'Not from this table: it lets you create a profile, invite and revoke access.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Creating a profile, inviting and revoking require the co-ownership edit right.'
    },
    related: [
      { label: 'Tenant profiles', helpId: 'syndic.profils.locataires' },
      { label: 'A unit account', to: '/tenant/:tenantId/syndics' }
    ],
    keywords: ['owner', 'co-owner', 'share', 'joint ownership', 'resale', 'portal', 'invitation', 'ownership share']
  },
  {
    id: 'syndic.profils.locataires',
    kind: 'table',
    title: 'Tenant profiles',
    summary:
      'This table lists the tenants of the co-ownership units, current and ended. You create a profile there and end a current profile.',
    purpose:
      'The tenant profile is a tracking record: who occupies the unit, since when, and whether charges are billed to them.',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'The occupied lot.' },
        { key: 'contact', label: 'Contact', description: "The tenant (the agency's contact record)." },
        { key: 'tenantSince', label: 'Since', description: 'Entry date.' },
        {
          key: 'chargesBilledToTenant',
          label: 'Billed to the tenant',
          description: '"Yes" or "No": are charges billed to the tenant.'
        },
        { key: 'status', label: 'Status', description: '"Current" or "Completed".' },
        { key: 'tenant-actions', label: 'Actions', description: '"Finish" on a current profile.' }
      ],
      statuses: [
        { value: 'current', label: 'Current', description: 'Profile whose exit date is empty or in the future.' },
        { value: 'former', label: 'Completed', description: 'The tenant has left; the row stays in the history.' }
      ],
      notes: ['Filters: unit, status, "Billed to the tenant".']
    },
    steps: [
      { title: 'Open the form', detail: '"Tenant profile" button at the top of the screen.' },
      { title: 'Fill in', detail: 'Unit, "Tenant contact" and "Move-in date" are required.' },
      { title: 'Charges', detail: '"Charges billed to the tenant": Oui or Non (Non by default).' },
      { title: 'End a profile', detail: '"Finish" then confirm: the exit date is today.' }
    ],
    consequences: [
      '"Finish" sets the exit to today\'s date and switches the profile to "Completed"; the history is kept.',
      'This profile is a tracking record: it sends no message.'
    ],
    faq: [
      { q: 'Can I correct an entry date?', a: 'Not from this screen: only creation and "Finish" are offered.' },
      {
        q: 'Is the profile linked to a lease?',
        a: 'This form does not ask for a lease. Leases are managed in the rental management module.'
      },
      {
        q: 'How do I find a tenant?',
        a: 'Type the name, email, phone or unit in "Search", or filter by "Unit", "Status" and "Billed to the tenant".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Creating and ending require the co-ownership edit right.' },
    related: [{ label: 'Owner profiles', helpId: 'syndic.profils.proprietaires' }],
    keywords: ['tenant', 'occupant', 'entry date', 'exit date', 'end', 'rental charges']
  },
  {
    id: 'syndic.profils.incidents',
    kind: 'table',
    title: 'Incidents and cost allocations',
    summary:
      'This table tracks the incidents of the co-ownership, from reporting to closing. Expand a row to see its cost allocations and linked invoices.',
    purpose:
      'An incident (breakdown, leak, vandalism...) can have an assigned provider, cost allocations and provider invoices attached.',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'Number of the unit concerned, or a dash for common areas.' },
        { key: 'incidentType', label: 'Type', description: 'Breakdown, Leak, Vandalism, Security or Other.' },
        { key: 'urgency', label: 'Urgency', description: 'Basse, Moyenne, Haute or Critique.' },
        { key: 'description', label: 'Description', description: 'What happened.' },
        { key: 'reportedAt', label: 'Reported on', description: 'Reporting date.' },
        { key: 'status', label: 'Status', description: 'State of the incident (see below).' },
        { key: 'imputations', label: 'Cost allocations', description: 'Number of cost allocations recorded.' },
        {
          key: 'providerId',
          label: 'Contractor',
          description: 'List to assign or remove the provider: it is saved immediately.'
        },
        { key: 'actions', label: 'Actions', description: '"Edit incident" and "Add allocation".' }
      ],
      statuses: [
        { value: 'REPORTED', label: 'Reported', description: 'Incident reported, not yet handled.' },
        { value: 'ASSIGNED', label: 'Assigned', description: 'Entrusted to someone.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'Being handled.' },
        { value: 'RESOLVED', label: 'Resolved', description: 'Problem solved.' },
        { value: 'CLOSED', label: 'Closed', description: 'File closed.' }
      ],
      notes: [
        'Filters: status, urgency, provider, type, unit, reporting date, with or without allocation. Search also covers the description and the lot.'
      ]
    },
    steps: [
      {
        title: 'Report',
        detail:
          '"New incident" button: "Reporting contact", "Incident type", "Urgency" and "Description" are required; leave "Unit (optional)" empty for common areas.'
      },
      { title: 'Assign a provider', detail: 'Choose it in the "Contractor" column.' },
      {
        title: 'Move forward',
        detail: '"Edit incident": change the status, the provider or the description, then "Save".'
      },
      { title: 'Allocate a cost', detail: '"Add allocation": see the allocations help sheet.' }
    ],
    consequences: [
      'The status never changes by itself: assigning a provider leaves the incident "Reported" until you edit it.',
      'Switching to "Resolved" or "Closed" shows "Resolution date"; if empty, it is today\'s date.',
      'No e-mail, SMS or WhatsApp message is sent to the reporter, the provider or the co-owners.'
    ],
    faq: [
      {
        q: 'How do I link an invoice to an incident?',
        a: 'When recording the invoice, in the "Invoices" tab of "Contractors", choose the incident. It then appears in "Linked invoices".'
      },
      { q: 'Can I delete an incident?', a: 'No, no button allows it. Close it.' },
      { q: 'Is the reporter told about the closing?', a: 'No, no message is sent.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Reporting, editing, assigning and allocating require the co-ownership edit right.'
    },
    related: [
      { label: 'Incident cost allocations', helpId: 'syndic.profils.imputations' },
      { label: 'Linked invoices', helpId: 'syndic.prestataires.factures-liees' },
      { label: 'Service providers', helpId: 'syndic.prestataires.tableau' }
    ],
    keywords: ['incident', 'breakdown', 'leak', 'damage', 'urgency', 'report', 'repair', 'ticket']
  },
  {
    id: 'syndic.profils.imputations',
    kind: 'table',
    title: 'Incident cost allocations',
    summary:
      'This sub-table, in the expanded row of an incident, lists the costs allocated to that incident. "Add allocation" (on the incident row) creates one.',
    purpose:
      'An allocation notes who bears part of the cost of an incident: the co-ownership budget, insurance, an owner or a third party.',
    howToRead: {
      columns: [
        { key: 'imputationType', label: 'Type', description: 'Co-ownership budget, Insurance, Owner’s unit or Party.' },
        { key: 'amount', label: 'Amount', description: 'Allocated amount, in FCFA.' },
        { key: 'lot', label: 'Unit', description: 'Unit concerned, if any.' },
        { key: 'notes', label: 'Notes', description: 'Free comment.' },
        { key: 'createdAt', label: 'Created on', description: 'Date and time of recording.' }
      ],
      notes: ['With none: "No cost allocation for this incident".']
    },
    steps: [
      { title: 'Open the form', detail: '"Add allocation" on the incident row.' },
      {
        title: 'Choose',
        detail: '"Allocation type" and "Amount" are required. The incident\'s unit is suggested, and you can change it.'
      },
      { title: 'Complete', detail: '"Budget line (optional)", "Contract (optional)" and "Notes".' }
    ],
    consequences: [
      'An allocation is a figure on record: it posts nothing in the accounts and debits no co-owner account.',
      'It can be neither edited nor deleted from this screen.',
      'A "Co-ownership budget" allocation is later used to link the provider invoice to the incident, when only one is pending.'
    ],
    faq: [
      {
        q: 'Does the allocation bill the co-owner?',
        a: 'No. With the type "Owner’s unit", nothing is debited from their account: it is information.'
      },
      { q: 'Can I correct an amount?', a: 'Not here. Add a replacement allocation and say so in "Notes".' },
      {
        q: 'How do I know which incidents have an allocation?',
        a: 'In the list of incidents, the "Cost allocations" column shows the number. The "Cost allocations" filter offers "With allocation" and "Without allocation".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Adding an allocation requires the co-ownership edit right.' },
    related: [
      { label: 'Incidents and cost allocations', helpId: 'syndic.profils.incidents' },
      { label: 'Linked invoices', helpId: 'syndic.prestataires.factures-liees' }
    ],
    keywords: ['allocation', 'cost', 'insurance', 'budget', 'third party', 'coverage']
  }
];

export default entries;
