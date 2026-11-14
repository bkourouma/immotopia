import type { HelpEntry } from '../../../types';

/** « suppliers » zone of the finance module (en). */
const entries: HelpEntry[] = [
  // Suppliers
  {
    id: 'finance.fournisseurs.page',
    kind: 'page',
    title: 'Suppliers',
    summary:
      "Here you will find your agency's suppliers: materials companies, service providers, or both. This is where you register a supplier, then enter their invoices and payments.",
    purpose:
      'Each supplier has its own account, which tracks what the agency owes them. Its nature ("Materials", "Services" or "Materials and services") decides whether its invoices must be linked to a site, in an agency that manages construction sites.',
    steps: [
      {
        title: 'Create a supplier',
        detail: 'Click "New supplier", fill in the company name and the nature, then click "Create".'
      },
      {
        title: 'Search',
        detail: 'Type a company name, a contact name, a phone number or an email address.'
      },
      {
        title: 'Filter',
        detail: 'Narrow the list with the "Nature" and "Status" filters (Active or Inactive).'
      },
      {
        title: 'Open their invoices',
        detail: 'Click "View their invoices": you reach the screen with this supplier\'s invoices and payments.'
      },
      {
        title: 'Export',
        detail: 'The export button includes all suppliers that match your filters, not only the page shown.'
      }
    ],
    consequences: [
      'Creating a supplier also creates its supplier account, with a starting balance of zero. No message is sent to the supplier.',
      'This screen does not let you edit a supplier after creation: check the company name and the nature before clicking "Create".',
      'In the choice lists for invoices and purchase orders, only active suppliers are offered.'
    ],
    faq: [
      {
        q: "What is the supplier's nature for?",
        a: 'For a "Materials" or "Materials and services" supplier, each invoice must be linked to at least one site (if your agency manages sites). For "Services", this link is optional.'
      },
      {
        q: 'How do I know how much I owe a supplier?',
        a: 'Open the "Supplier balance": for each supplier it shows what has been invoiced, what has been paid and the balance.'
      },
      {
        q: 'Why can I not create a supplier?',
        a: 'Creating requires the "Create financial documents" permission. Without it, saving is refused: ask your agency administrator.'
      },
      {
        q: "Where are the supplier's invoices?",
        a: 'On the supplier\'s row, click "View their invoices". This is also where you enter a payment.'
      }
    ],
    permissions: {
      note: 'Viewing the list requires "View third-party accounts". Creating a supplier requires "Create financial documents".'
    },
    related: [
      { label: 'How to read the supplier list', helpId: 'finance.fournisseurs.tableau' },
      { label: 'Create a supplier', helpId: 'finance.fournisseurs.nouveau' },
      { label: 'Invoices and payments', helpId: 'finance.factures-fournisseurs.page' },
      { label: 'Supplier balance', helpId: 'finance.balance-fournisseurs.page' }
    ],
    keywords: [
      'supplier',
      'suppliers',
      'vendor',
      'service provider',
      'materials',
      'company',
      'company name',
      'create a supplier',
      'purchases'
    ]
  },
  {
    id: 'finance.fournisseurs.tableau',
    kind: 'table',
    title: 'Supplier list',
    summary: 'Each row is a supplier of your agency, with its nature, contact details and status.',
    howToRead: {
      columns: [
        {
          key: 'nom',
          label: 'Company name',
          description: 'The name of the company or provider, as you entered it.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description:
            '"Materials", "Services" or "Materials and services". It decides whether its invoices must be linked to a site.'
        },
        {
          key: 'contact',
          label: 'Contact',
          description:
            "The contact's name, phone and email, separated by a dot. A dash (—) means no contact details are recorded."
        },
        {
          key: 'statut',
          label: 'Status',
          description:
            '"Active" or "Inactive". Only active suppliers are offered for a new invoice or a new purchase order.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View their invoices" opens the supplier\'s invoices and payments.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The supplier is offered in the choice lists.' },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'The supplier is no longer offered for a new invoice or a new purchase order.'
        }
      ],
      notes: ['On a phone, each supplier is shown as a card: tap the card to open its invoices.']
    },
    steps: [
      { title: 'Search', detail: 'The search field covers the company name, contact, phone and email.' },
      { title: 'Filter', detail: 'Use "Nature" and "Status" to narrow the list.' },
      { title: 'Open their invoices', detail: 'Click "View their invoices" on the row you want.' }
    ],
    faq: [
      {
        q: 'A supplier is "Inactive": what happens?',
        a: 'It stays in the list and keeps its history, but it is no longer offered in the choice lists for new invoices and new purchase orders.'
      },
      {
        q: 'I cannot find a supplier.',
        a: 'Check the filters set above the table (nature, status) and try part of the company name, phone or email.'
      },
      {
        q: 'Does the export contain all suppliers?',
        a: 'It contains all suppliers that match your filters, not only those on the page shown.'
      }
    ],
    related: [{ label: 'Create a supplier', helpId: 'finance.fournisseurs.nouveau' }],
    keywords: ['supplier list', 'active', 'inactive', 'nature', 'contact']
  },
  {
    id: 'finance.fournisseurs.nouveau',
    kind: 'section',
    title: 'New supplier',
    summary: 'This form registers a supplier and opens its account. Only the company name and the nature are required.',
    purpose: "Choose the nature carefully: it decides whether the supplier's invoices must be linked to a site.",
    steps: [
      {
        title: 'Company name',
        detail: 'The name of the company, for example "Matériaux du Bandama SARL". Required.'
      },
      {
        title: 'Nature',
        detail: '"Materials", "Services" or "Materials and services". Required.'
      },
      { title: 'Contact', detail: 'Optional: the contact name, phone (+225 …) and email.' },
      { title: 'Create', detail: 'Click "Create". A message confirms the creation and the list updates.' }
    ],
    consequences: [
      'The supplier is created active, with an account whose balance is zero.',
      'No editing is offered afterwards on this screen: review before creating.'
    ],
    faq: [
      {
        q: 'Which nature should I choose for a hardware dealer?',
        a: '"Materials": its invoices will have to be linked to a site if your agency manages sites. Choose "Services" for a craftsman or a design office.'
      },
      {
        q: 'Are the phone and email required?',
        a: 'No. Only the company name and the nature are.'
      },
      {
        q: 'Creation failed, why?',
        a: 'The message shown at the top of the screen gives the reason. Also check that you have the "Create financial documents" permission.'
      }
    ],
    permissions: { note: 'Requires the "Create financial documents" permission.' },
    related: [{ label: 'Supplier list', helpId: 'finance.fournisseurs.tableau' }],
    keywords: ['create supplier', 'new supplier', 'company name', 'nature']
  },

  // Supplier invoices and payments
  {
    id: 'finance.factures-fournisseurs.page',
    kind: 'page',
    title: 'Supplier invoices',
    summary:
      'Choose a supplier to enter their invoices, approve them, then record your payments. Everything happens on this screen: the invoice, its approval and the payment.',
    purpose:
      'An invoice you enter stays a draft and changes nothing until it is approved. On approval, the debt to the supplier and, where applicable, the cost of the sites are recorded. A payment follows the same path: entered as a draft, then approved by an authorised person.',
    steps: [
      {
        title: 'Choose the supplier',
        detail: 'In the "Supplier" list. You can also arrive here from "View their invoices".'
      },
      {
        title: 'Enter the invoice',
        detail:
          'Date, reference, lines and, depending on the supplier\'s nature, allocations to the site. Then "Save as draft".'
      },
      {
        title: 'Approve the invoice',
        detail: 'In the invoice table, click "Approve" then confirm. This is when the debt is recorded.'
      },
      {
        title: 'Enter the payment',
        detail: 'In the "Payment" card: date, amount, method, account and invoices to pay. Then "Save the payment".'
      },
      {
        title: 'Approve the payment',
        detail: 'In the payment table, "Approve" then confirm. The money then leaves the treasury account.'
      }
    ],
    consequences: [
      "A draft (invoice or payment) produces no accounting entry and does not change the supplier's balance.",
      'Approving an invoice or a payment is irreversible: the document can no longer be edited. To correct it, you cancel it with a reason; a cancellation document is created and the original is kept.',
      'The invoice table and the payment table each have their own help sheet.'
    ],
    faq: [
      {
        q: 'Why do I not see "Approve" or "Cancel"?',
        a: 'These actions require the "Validate financial documents" permission. Entering requires "Create financial documents".'
      },
      {
        q: 'I made a mistake on an approved invoice.',
        a: 'Cancel it with a reason, then use "Duplicate" to re-enter a corrected invoice. Its cancelled reference stays reserved: pick another one.'
      },
      {
        q: 'Can I pay an advance?',
        a: 'Yes: record a payment without ticking any invoice. It is recorded as an advance.'
      }
    ],
    permissions: {
      note: 'Viewing requires "View third-party accounts". Entering an invoice or a payment requires "Create financial documents". Approving or cancelling requires "Validate financial documents".'
    },
    related: [
      { label: 'Enter an invoice', helpId: 'finance.factures-fournisseurs.saisie' },
      { label: 'Invoice table', helpId: 'finance.factures-fournisseurs.factures' },
      { label: 'Enter a payment', helpId: 'finance.factures-fournisseurs.reglement' },
      { label: 'Retentions', helpId: 'finance.retenues.page' }
    ],
    keywords: [
      'supplier invoice',
      'payment',
      'pay a supplier',
      'supplier payment',
      'advance',
      'approve an invoice',
      'cancel an invoice',
      'debt'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'facture-fournisseur-choix',
          title: 'Choose the supplier',
          description: 'Select the supplier: its nature determines whether linking to a site is required.'
        },
        {
          target: 'facture-saisie',
          title: 'Enter the invoice',
          description: 'The invoice is saved as a draft. It counts in no balance until it is approved.'
        },
        {
          target: 'facture-liste',
          title: 'Approve or cancel',
          description: 'Approving is irreversible: afterwards only a cancellation with a reason lets you correct it.'
        },
        {
          target: 'facture-reglement',
          title: 'Pay the supplier',
          description: 'Tick the invoices to pay. With no invoice ticked, the payment is an advance.'
        }
      ]
    }
  },
  {
    id: 'finance.factures-fournisseurs.saisie',
    kind: 'section',
    title: 'New invoice',
    summary:
      'This form saves an invoice of the chosen supplier as a draft. The invoice amount is the sum of its lines.',
    purpose:
      'The invoice reproduces what the supplier billed you, line by line. It only has an accounting effect once approved.',
    steps: [
      { title: 'Date', detail: 'The invoice date. It defaults to today.' },
      {
        title: 'Reference',
        detail: 'The supplier\'s invoice number, for example "FRS-2026-0142". It must be unique for this supplier.'
      },
      {
        title: 'Lines',
        detail: 'For each line: a label, then either an amount, or a quantity and a unit price. "Add a line" adds one.'
      },
      {
        title: 'Allocations to the site',
        detail: 'Indicate the site, the cost line and the allocated amount (see the "Allocations to the site" sheet).'
      },
      {
        title: 'Save',
        detail:
          'Click "Save as draft". The button stays greyed out while the form is incomplete or the entry variance is not zero.'
      }
    ],
    howToRead: {
      notes: [
        'Quantity and unit price: when both are filled in, the line amount becomes their product and its field can no longer be edited. Otherwise, enter the amount directly (a flat fee has no quantity).',
        '"Invoice amount" shows the sum of the lines live.'
      ]
    },
    consequences: [
      "The draft changes neither the supplier's balance nor the cost of a site.",
      'The reference stays reserved for this supplier, even if the invoice is cancelled later: you will have to choose another one.',
      'Once the invoice is saved, the form is cleared; the invoice appears in the invoice table.'
    ],
    faq: [
      {
        q: 'Why is the "Save as draft" button greyed out?',
        a: 'You need a reference and at least one line with a label and an amount above zero. If allocations are required, they must be complete and their total must equal the invoice amount.'
      },
      {
        q: 'How do I copy a similar invoice?',
        a: 'In the invoice table, click "Duplicate": the form is pre-filled (lines and allocations), with an empty reference and today\'s date. Nothing is created before "Save as draft".'
      },
      {
        q: 'Can a draft be edited?',
        a: 'This screen does not offer to edit or cancel a draft invoice: review it before saving.'
      }
    ],
    permissions: { note: 'Requires the "Create financial documents" permission.' },
    related: [
      { label: 'Allocations to the site', helpId: 'finance.factures-fournisseurs.imputations' },
      { label: 'Invoice table', helpId: 'finance.factures-fournisseurs.factures' }
    ],
    keywords: ['enter an invoice', 'new invoice', 'reference', 'draft', 'quantity', 'unit price', 'duplicate']
  },
  {
    id: 'finance.factures-fournisseurs.imputations',
    kind: 'section',
    title: 'Allocations to the site',
    summary:
      'An allocation tells which site and which cost line the invoice is assigned to. This part only appears if your agency manages construction sites.',
    purpose:
      'Allocations feed the actual cost of each site, once the invoice is approved. A materials supplier always buys for a site: linking is therefore required for them.',
    steps: [
      { title: 'Add a cost allocation', detail: 'Click "Add a cost allocation".' },
      { title: 'Site and cost line', detail: 'Choose the site, then the cost line.' },
      {
        title: 'Allocated amount',
        detail: 'Enter the share of the invoice that belongs to this site. Repeat for several sites.'
      },
      {
        title: 'Check the variance',
        detail: 'The "Entry variance" card must show zero: the total of the allocations must equal the invoice amount.'
      }
    ],
    howToRead: {
      notes: [
        'Entry variance = invoice amount minus total of the allocations. It is green when zero, red otherwise.',
        'The "Linking to a site is required" banner appears for a "Materials" or "Materials and services" supplier as long as no allocation is added. For "Services", allocations are optional.'
      ]
    },
    consequences: [
      'When the invoice is approved, each allocation enters the actual cost of the site concerned.',
      'A closed site no longer accepts allocations: approving the invoice is then refused.',
      'If stock tracking is enabled on the site at the invoice date, the allocated value enters stock instead of being counted straight away as an expense: it becomes an expense when goods leave the store.',
      "A budget overrun alert may be raised on approval if the site's commitment exceeds its budget; it informs without blocking the approval."
    ],
    faq: [
      {
        q: 'Why is an allocation required?',
        a: 'The supplier is of nature "Materials" or "Materials and services": a purchase of materials is always meant for a site.'
      },
      {
        q: 'Can I split an invoice across several sites?',
        a: 'Yes: add one allocation per site. The total must exactly equal the invoice amount.'
      },
      {
        q: 'I do not see this part.',
        a: "It is only shown if your agency's plan includes construction sites."
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'New invoice', helpId: 'finance.factures-fournisseurs.saisie' }],
    keywords: ['allocation', 'site', 'cost line', 'entry variance', 'link']
  },
  {
    id: 'finance.factures-fournisseurs.factures',
    kind: 'table',
    title: "Supplier's invoices",
    summary:
      'Each row is an invoice of the chosen supplier. From this table you approve, cancel or duplicate an invoice.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Reference', description: "The supplier's invoice number." },
        { key: 'date', label: 'Date', description: 'The invoice date.' },
        {
          key: 'chantier',
          label: 'Construction site',
          description: 'The site the invoice is linked to. A dash (—) means no site is indicated.'
        },
        { key: 'montant', label: 'Amount', description: 'The invoice amount in FCFA.' },
        { key: 'statut', label: 'Status', description: 'The state of the invoice (see the statuses below).' },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Approve" (draft), "Cancel" (approved invoice) and "Duplicate" (all statuses).'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: "Entered but not yet approved: no effect on the balance or on a site's cost."
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'Permanently recorded: the debt to the supplier exists and can no longer be edited.'
        },
        {
          value: 'VOIDED',
          label: 'Cancelled',
          description: "Cancelled with a reason: it no longer counts in the supplier's balance or in the site's cost."
        }
      ]
    },
    steps: [
      {
        title: 'Search and filter',
        detail: 'Search by reference or site; filter by status, site, date or amount.'
      },
      { title: 'Approve', detail: 'On a draft, click "Approve" then "Confirm the approval".' },
      {
        title: 'Cancel',
        detail: 'On an approved invoice, click "Cancel", enter the reason (required), then "Confirm the cancellation".'
      },
      {
        title: 'Duplicate',
        detail: 'Pre-fills the entry form with the lines and allocations. Nothing is created until you save.'
      }
    ],
    consequences: [
      "Approving is irreversible: the invoice can no longer be edited. An accounting entry is recorded in the journal (the purchase expense on one side, the debt to the supplier on the other) and the supplier's balance increases by the invoice amount.",
      "Cancelling creates a linked cancellation document with a reversing entry: the original invoice is kept, but its amount no longer counts in the supplier's balance or in the site's cost. The cancellation is itself final.",
      'A cancelled invoice can no longer be paid, but its reference stays reserved for this supplier.'
    ],
    faq: [
      {
        q: 'Why is the approval refused?',
        a: 'The most frequent causes: the sum of the allocations does not match the invoice amount, or an allocated site is closed. The message shown gives the reason.'
      },
      {
        q: 'What happens to the payment if I cancel the invoice?',
        a: "Cancelling an invoice does not delete its payments. Check the supplier's payments and cancel them if needed."
      },
      {
        q: 'Why can I not approve?',
        a: 'Approving and cancelling require the "Validate financial documents" permission.'
      }
    ],
    permissions: { note: '"Approve" and "Cancel" require the "Validate financial documents" permission.' },
    related: [
      { label: 'New invoice', helpId: 'finance.factures-fournisseurs.saisie' },
      { label: 'Cancel an invoice or a payment', helpId: 'finance.factures-fournisseurs.annulation' }
    ],
    keywords: ['approve', 'cancel', 'duplicate', 'status', 'approved invoice', 'draft', 'accounting entry']
  },
  {
    id: 'finance.factures-fournisseurs.reglement',
    kind: 'section',
    title: 'Payment',
    summary:
      'This card records a payment to the supplier, as a draft. You choose which invoices it settles; whatever is allocated to no invoice becomes an advance.',
    purpose:
      'A payment reduces what you owe the supplier and, once approved, takes the money out of a treasury account (cash, bank, Mobile Money wallet).',
    steps: [
      { title: 'Date', detail: 'The payment date, defaulting to today.' },
      { title: 'Payment amount', detail: 'The sum actually paid, in FCFA.' },
      {
        title: 'Payment method',
        detail: 'Cash, Bank transfer, Cheque, Mobile Money, Bank card or Other. Required, no default value.'
      },
      {
        title: 'Treasury account',
        detail:
          "Optional. If left empty, the method's default account is used: bank for a transfer or a cheque, cash register for cash, wallet for Mobile Money."
      },
      {
        title: 'Invoices to pay',
        detail:
          'Tick the approved invoices to pay. The allocated amount is proposed at the amount still due; you can reduce it.'
      },
      { title: 'Save', detail: 'Click "Save the payment": it is created as a draft.' }
    ],
    howToRead: {
      notes: [
        'Only approved invoices that still have an amount to pay are offered. The "remaining due" is the invoice amount minus approved payments and retentions still held.',
        'The total allocated to invoices cannot exceed the payment amount: otherwise an error message is shown and saving is blocked.',
        'If the payment amount exceeds the total allocated, the difference is shown as "Part not allocated to an invoice (advance)".'
      ]
    },
    consequences: [
      "The draft has no effect: no accounting entry, no movement on the supplier's account, no money out.",
      "With no invoice ticked, the payment will be recorded as an advance: the supplier's account turns in your favour by the amount paid. This is not an error."
    ],
    faq: [
      {
        q: 'Why does an invoice not appear in the list?',
        a: 'It is not approved, or it is already fully paid. A partly paid invoice stays offered with its amount still due.'
      },
      {
        q: 'What happens if I choose no treasury account?',
        a: 'The default account matching the payment method is used when the payment is approved.'
      },
      {
        q: 'The "Save the payment" button is greyed out.',
        a: 'You need an amount above zero, a payment method, and a total allocated that does not exceed the payment amount.'
      }
    ],
    permissions: { note: 'Requires the "Create financial documents" permission.' },
    related: [
      { label: 'Payment table', helpId: 'finance.factures-fournisseurs.reglements' },
      { label: 'Retentions', helpId: 'finance.retenues.page' }
    ],
    keywords: ['payment', 'pay', 'advance', 'payment method', 'treasury account', 'amount due']
  },
  {
    id: 'finance.factures-fournisseurs.reglements',
    kind: 'table',
    title: "Supplier's payments",
    summary:
      'Each row is a payment entered for this supplier, whoever entered it. From this table you approve or cancel a payment.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The payment date.' },
        { key: 'montant', label: 'Amount paid', description: 'The sum paid, in FCFA.' },
        {
          key: 'mode',
          label: 'Method',
          description: 'The payment method, with below it the treasury account used, if one was chosen.'
        },
        {
          key: 'affectation',
          label: 'Allocation',
          description:
            'The references of the invoices paid, or "Payment on account, no invoice". A warning appears on a draft when an invoice concerned is already settled or exceeded.'
        },
        {
          key: 'acteurs',
          label: 'Entered / approved by',
          description: 'The person who entered the payment and, once approved, the one who approved it.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'The state of the payment. For a cancelled payment, the reason is shown under the status.'
        },
        { key: 'actions', label: 'Actions', description: '"Approve" (draft) or "Cancel" (approved payment).' }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Entered but not approved: the money has not left yet.' },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'The payment is recorded: the money has left the treasury account and the debt has decreased.'
        },
        {
          value: 'VOIDED',
          label: 'Cancelled',
          description: "Cancelled with a reason: its amount no longer counts in the supplier's balance."
        }
      ]
    },
    steps: [
      {
        title: 'Approve',
        detail:
          'On a draft, click "Approve" then "Confirm the approval". A warning is shown if an invoice concerned is already paid.'
      },
      {
        title: 'Cancel',
        detail: 'On an approved payment, click "Cancel", enter the reason, then confirm.'
      }
    ],
    consequences: [
      "Approving is irreversible. An accounting entry is recorded (the debt to the supplier decreases, the treasury account goes down by the same amount), the supplier's balance decreases, and the amount still due on each allocated invoice goes down. An unallocated amount is recorded as an advance.",
      'Approval is refused if the treasury account does not have enough balance: you cannot pay into overdraft.',
      'Cancelling creates a cancellation document and a reversing entry: the original payment is kept, but what you owe the supplier goes back up by the same amount.',
      'Approving a payment for an invoice that is already settled remains possible but risks paying twice: read the warning before confirming.'
    ],
    faq: [
      {
        q: 'The approval is refused for insufficient balance.',
        a: 'The treasury account used does not hold enough: top it up or choose another account before approving.'
      },
      {
        q: 'What is the difference between "Entered by" and "Approved by"?',
        a: 'A payment can be entered by one person and approved by another, who holds the approval permission.'
      },
      {
        q: 'How do I correct an approved payment?',
        a: 'Cancel it with a reason, then enter a new payment.'
      }
    ],
    permissions: { note: '"Approve" and "Cancel" require the "Validate financial documents" permission.' },
    related: [
      { label: 'Enter a payment', helpId: 'finance.factures-fournisseurs.reglement' },
      { label: 'Cancel an invoice or a payment', helpId: 'finance.factures-fournisseurs.annulation' }
    ],
    keywords: ['payments', 'approve a payment', 'cancel a payment', 'advance', 'entry', 'treasury']
  },
  {
    id: 'finance.factures-fournisseurs.annulation',
    kind: 'section',
    title: 'Cancel an invoice or a payment',
    summary:
      'Cancelling an approved document always requires a reason. It deletes nothing: it creates a cancellation document that corrects the accounts.',
    steps: [
      {
        title: 'Open the cancellation',
        detail: 'Click "Cancel" on the row of the approved invoice or payment.'
      },
      {
        title: 'Enter the reason',
        detail:
          'For example "Entry error on the amount". The confirm button stays greyed out while the reason is empty.'
      },
      {
        title: 'Confirm',
        detail: 'Click "Confirm the cancellation", or "Give up" to leave the document as it is.'
      }
    ],
    consequences: [
      'Cancelling is irreversible: a cancellation cannot be cancelled.',
      "For an invoice: its amount no longer counts in the supplier's balance or in the site's cost, and its reference stays reserved.",
      'For a payment: what you owe the supplier goes back up by the cancelled amount.',
      'The original document remains visible with the status "Cancelled" and its accounting entry is kept, together with a reversing entry.'
    ],
    faq: [
      {
        q: 'Can a cancelled document be restored?',
        a: 'No. Use "Duplicate" (invoice) or enter a new payment.'
      },
      {
        q: 'Where is the reason kept?',
        a: 'It is saved with the cancellation document; for a payment, it is also shown under the status.'
      },
      {
        q: 'Why is the "Cancel" button missing?',
        a: 'It requires the "Validate financial documents" permission.'
      }
    ],
    permissions: { note: 'Requires the "Validate financial documents" permission.' },
    related: [
      { label: 'Invoice table', helpId: 'finance.factures-fournisseurs.factures' },
      { label: 'Payment table', helpId: 'finance.factures-fournisseurs.reglements' }
    ],
    keywords: ['cancellation', 'reason', 'cancel', 'cancellation document', 'correct']
  },

  // Purchase orders
  {
    id: 'finance.bons-de-commande.page',
    kind: 'page',
    title: 'Purchase orders',
    summary:
      'Here you will find all the purchase orders placed with your suppliers, with their status, billing state and what remains to be invoiced. This is where you create, open or duplicate an order.',
    purpose:
      "A purchase order commits an expense for a site before the invoice. While it is a draft, it commits nothing; once issued, its remaining amount to invoice counts in the site's commitment, which lets you follow the budget.",
    steps: [
      {
        title: 'Create an order',
        detail: 'Click "New order": site, supplier, reference, date and lines.'
      },
      { title: 'Search', detail: 'Type a reference, a site or a supplier.' },
      {
        title: 'Filter',
        detail: 'Status, site, supplier, date, billing and total amount narrow the list.'
      },
      {
        title: 'Open an order',
        detail: 'Click "View details" to issue it, cancel it or look at its lines.'
      },
      {
        title: 'Duplicate',
        detail:
          'Click "Duplicate": the entry of a new order opens, pre-filled with the site, the supplier and the lines.'
      }
    ],
    consequences: [
      'Duplicating writes nothing: the new order only exists after "Save as draft". It is offered for every status, cancelled orders included.',
      'The order status (Draft, Issued, Cancelled) and its billing state (Not billed, Partly billed, Settled) are two separate pieces of information.'
    ],
    faq: [
      {
        q: 'Does the order record the reception of goods?',
        a: 'No: its only statuses are "Draft", "Issued" and "Cancelled". If your site tracks its stock, goods receipt into the store is done from an approved supplier invoice, in the stock screen.'
      },
      {
        q: 'How does an invoice link to an order?',
        a: 'The billing state is calculated from the approved invoices matched to the order. No invoice entry screen offers this matching for now: the "Billing" and "Left to invoice" columns only move for an invoice already matched.'
      },
      {
        q: 'I do not see this screen.',
        a: 'Purchase orders are reserved for agencies whose plan includes construction sites.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Viewing the list requires "View third-party accounts". Creating an order requires "Create financial documents". Issuing and cancelling require "Validate financial documents".'
    },
    related: [
      { label: 'How to read the order list', helpId: 'finance.bons-de-commande.tableau' },
      { label: 'Purchase order sheet', helpId: 'finance.bon-de-commande.page' },
      { label: 'Supplier invoices', helpId: 'finance.factures-fournisseurs.page' }
    ],
    keywords: ['purchase order', 'order', 'purchase', 'commitment', 'committed', 'issue an order', 'po']
  },
  {
    id: 'finance.bons-de-commande.tableau',
    kind: 'table',
    title: 'Purchase order list',
    summary:
      'Each row is a purchase order. The table shows its site, supplier, status, billing state and the amount left to invoice.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Reference', description: 'The order number, for example BC-2026-0042.' },
        { key: 'chantier', label: 'Construction site', description: 'The site for which the order is placed.' },
        { key: 'fournisseur', label: 'Supplier', description: 'The supplier the order is placed with.' },
        { key: 'date', label: 'Date', description: 'The order date.' },
        { key: 'statut', label: 'Status', description: 'The stage of the order: draft, issued or cancelled.' },
        {
          key: 'facturation',
          label: 'Billing',
          description:
            'Calculated from the approved invoices matched to the order: not billed, partly billed or settled.'
        },
        { key: 'montant', label: 'Total amount', description: 'The sum of the order lines, in FCFA.' },
        {
          key: 'reste',
          label: 'Left to invoice',
          description: 'The total amount minus what is already invoiced. It never goes below zero.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View details" opens the order sheet; "Duplicate" opens a pre-filled entry.'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'The order is entered but commits nothing.' },
        {
          value: 'ISSUED',
          label: 'Issued',
          description: "The order is issued: its amount left to invoice counts in the site's commitment."
        },
        { value: 'CANCELLED', label: 'Cancelled', description: 'The order is cancelled: it commits nothing any more.' },
        { value: 'NOT_INVOICED', label: 'Not billed', description: 'No approved invoice matched to this order.' },
        {
          value: 'PARTIALLY_INVOICED',
          label: 'Partly billed',
          description: 'Approved invoices cover part of the order.'
        },
        { value: 'SETTLED', label: 'Settled', description: 'Approved invoices cover the whole order.' }
      ],
      notes: ['On a phone, each order is shown as a card; tap it to open the order.']
    },
    steps: [
      { title: 'Filter', detail: 'The "Billing" filter isolates, for example, orders not yet billed.' },
      { title: 'Open', detail: 'Click "View details" to issue or cancel the order.' },
      { title: 'Export', detail: 'The export button includes all orders that match your filters.' }
    ],
    faq: [
      {
        q: 'What does "Left to invoice" mean?',
        a: "It is the part of the order that no approved invoice covers yet. For an issued order, this amount counts in the site's commitment."
      },
      {
        q: 'Why does a settled order still have the status "Issued"?',
        a: 'The status (draft, issued, cancelled) and the billing state are independent: an order can be "Issued" and "Settled".'
      },
      {
        q: 'Where is the reception date?',
        a: 'An order does not track reception.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Purchase order sheet', helpId: 'finance.bon-de-commande.page' }],
    keywords: ['order list', 'left to invoice', 'issued', 'draft', 'settled', 'billing']
  },

  // Purchase order sheet
  {
    id: 'finance.bon-de-commande.page',
    kind: 'page',
    title: 'Purchase order',
    summary:
      'This screen is used to create a purchase order, then to follow its sheet: issue it, cancel it, duplicate it and consult its lines. An order is first saved as a draft.',
    purpose:
      "An order's cycle is: draft, then issued, then possibly cancelled. Only issuing brings its amount left to invoice into the site's commitment.",
    steps: [
      {
        title: 'Create',
        detail: 'Choose the site and the supplier, enter the reference and the date, then the lines.'
      },
      {
        title: 'Save as draft',
        detail: 'The order is created and its sheet opens. It does not commit anything yet.'
      },
      {
        title: 'Issue',
        detail: 'On the sheet, click "Issue the order" then "Confirm the issue". The status becomes "Issued".'
      },
      {
        title: 'Cancel',
        detail: 'On an issued order, click "Cancel the order", enter the reason, then confirm.'
      },
      { title: 'Duplicate', detail: 'Starts a pre-filled entry with the site, the supplier and the lines.' }
    ],
    consequences: [
      "Issuing is irreversible: an issued order does not go back to draft. Its amount left to invoice then enters the site's commitment (the actual cost plus the amount left to invoice on issued orders).",
      "On issue, a budget overrun alert may be raised if the site's commitment exceeds its budget; it informs without preventing the issue.",
      'Cancelling is irreversible, requires a reason, and is refused while an invoice is matched to the order: correct the invoice first.',
      'An order records no accounting entry: only invoices and payments produce them.'
    ],
    faq: [
      {
        q: 'Why is the "Save as draft" button greyed out?',
        a: 'You need a site, a supplier, a reference and at least one complete line (cost line, label, amount above zero).'
      },
      {
        q: 'The reference is refused.',
        a: 'Each order reference is unique in your agency: choose another one.'
      },
      {
        q: 'I do not see "Issue the order" or "Cancel the order".',
        a: 'They require the "Validate financial documents" permission. Issuing is only offered on a draft; cancelling, only on an issued order.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Creating requires "Create financial documents". Issuing and cancelling require "Validate financial documents".'
    },
    related: [
      { label: 'Enter the order lines', helpId: 'finance.bon-de-commande.lignes-saisie' },
      { label: 'Order indicators', helpId: 'finance.bon-de-commande.indicateurs' },
      { label: 'Order lines', helpId: 'finance.bon-de-commande.lignes' },
      { label: 'Order list', to: '/tenant/:tenantId/finance/bons-de-commande' }
    ],
    keywords: ['new order', 'create a purchase order', 'issue', 'cancel an order', 'commitment', 'draft'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'bon-entete',
          title: 'Site and supplier',
          description: 'Choose the site and the supplier concerned. The order reference must be unique in your agency.'
        },
        {
          target: 'bon-lignes',
          title: 'The order lines',
          description:
            'Each line carries a cost line, a label and an amount. With a quantity and a unit price, the amount is calculated for you.'
        },
        {
          target: 'bon-enregistrer',
          title: 'Save as draft',
          description: 'The order commits nothing until it is issued from its sheet.'
        },
        {
          target: 'bon-actions',
          title: 'Issue or cancel',
          description: 'Issuing and cancelling are irreversible. Cancelling requires a reason.'
        }
      ]
    }
  },
  {
    id: 'finance.bon-de-commande.lignes-saisie',
    kind: 'section',
    title: 'Order lines (entry)',
    summary:
      'Each line describes part of the order: cost line, label, quantity, unit price and amount. The order total is the sum of the lines.',
    steps: [
      { title: 'Cost line', detail: "Choose the line's cost line (required)." },
      { title: 'Label', detail: 'Describe the line, for example "Cement CPJ 42.5" (required).' },
      {
        title: 'Quantity and unit price',
        detail: 'Optional. When both are filled in, the amount becomes their product and can no longer be edited.'
      },
      { title: 'Amount', detail: 'Enter it directly for a flat fee, for example installation, with no quantity.' },
      {
        title: 'Add or remove',
        detail: '"Add a line" creates one; the bin icon removes one (at least one always remains).'
      }
    ],
    howToRead: {
      notes: [
        '"Total amount" at the bottom shows the sum of the lines live.',
        'The text under "Construction site" reminds you that a closed site no longer accepts allocations.'
      ]
    },
    consequences: [
      'Nothing is saved before "Save as draft". The server rounds amounts to the franc and keeps the quantity and unit price as entered.'
    ],
    faq: [
      {
        q: 'Why is the "Amount" field locked?',
        a: 'Because the quantity and the unit price are filled in: the amount is then their product. Clear one of them to enter an amount.'
      },
      {
        q: 'How many lines can I add?',
        a: 'As many as needed; each line must have a cost line, a label and an amount above zero.'
      },
      {
        q: 'The cost line I am looking for does not exist.',
        a: "Only your agency's active cost lines are offered. They are managed in the financial module settings."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires the "Create financial documents" permission.' },
    related: [{ label: 'Purchase order sheet', helpId: 'finance.bon-de-commande.page' }],
    keywords: ['lines', 'cost line', 'quantity', 'unit price', 'total amount']
  },
  {
    id: 'finance.bon-de-commande.indicateurs',
    kind: 'section',
    title: 'Order indicators',
    summary:
      'Four figures summarise the order: its date, its total amount, what is already invoiced and what is left to invoice.',
    howToRead: {
      notes: [
        'Total amount: the sum of the order lines.',
        'Billed: the sum of the approved invoices matched to this order.',
        'Left to invoice: the total amount minus the invoiced amount, never negative.',
        "Next to the sheet title, two badges show the order's status and its billing state."
      ]
    },
    consequences: [
      'For an issued order, the "Left to invoice" is the part that counts in the site\'s commitment. An approved invoice matched to the order lowers this remainder: it then enters the actual cost, without being counted twice.'
    ],
    faq: [
      {
        q: 'The "Billed" amount stays at zero although I have an invoice.',
        a: 'Only approved invoices matched to this order are counted. No invoice entry screen offers this matching yet.'
      },
      {
        q: 'What does "Settled" mean?',
        a: 'Approved invoices cover the whole order.'
      },
      {
        q: 'Does a draft order count in the commitment?',
        a: 'No. Only an issued, non-cancelled order counts, through its amount left to invoice.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Purchase order sheet', helpId: 'finance.bon-de-commande.page' }],
    keywords: ['invoiced', 'left to invoice', 'commitment', 'settled']
  },
  {
    id: 'finance.bon-de-commande.lignes',
    kind: 'table',
    title: 'Purchase order lines',
    summary: 'Each line is part of the order, with its cost line, its label and its amount.',
    howToRead: {
      columns: [
        { key: 'poste', label: 'Cost line', description: "The line's cost line." },
        { key: 'libelle', label: 'Label', description: 'The description of the line.' },
        {
          key: 'quantite',
          label: 'Quantity',
          description: 'The quantity ordered. It stays empty for a line entered with a direct amount.'
        },
        {
          key: 'prix-unitaire',
          label: 'Unit price',
          description: 'The price of one unit, in FCFA. It stays empty if no quantity was entered.'
        },
        { key: 'montant', label: 'Amount', description: 'The line amount, in FCFA.' }
      ],
      notes: ['The order total is the sum of the line amounts, not a recalculated product.']
    },
    steps: [
      { title: 'Browse', detail: 'If the order has many lines, use the pagination under the table.' },
      { title: 'Export', detail: 'The export button includes all the lines of the order.' }
    ],
    faq: [
      {
        q: 'Can a line be edited?',
        a: 'Not from the sheet. Cancel the order (if it is issued and has no matched invoice) then duplicate it to re-enter.'
      },
      {
        q: 'Why is the quantity empty?',
        a: 'The line was entered with an amount only, for example a flat fee.'
      },
      {
        q: 'Are all lines displayed?',
        a: 'They are paginated. The export contains all the lines.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Order indicators', helpId: 'finance.bon-de-commande.indicateurs' }],
    keywords: ['order lines', 'cost line', 'quantity', 'unit price']
  },
  {
    id: 'finance.bon-de-commande.annulation',
    kind: 'section',
    title: 'Cancel the order',
    summary:
      "Cancelling an issued order requires a reason. It is irreversible and removes the order from the site's commitment.",
    steps: [
      { title: 'Open', detail: 'On an issued order, click "Cancel the order".' },
      {
        title: 'Enter the reason',
        detail: 'For example "Order placed twice". The button stays greyed out while the reason is empty.'
      },
      { title: 'Confirm', detail: 'Click "Confirm the cancellation", or "Give up".' }
    ],
    consequences: [
      'Cancelling is irreversible: the cancelled order no longer commits anything on the site.',
      'It is refused if an invoice is matched to the order, even a draft: first undo the matching or cancel the invoice from the supplier invoices screen.',
      'The reason is kept with the order.'
    ],
    faq: [
      {
        q: 'I only wanted to correct a line.',
        a: 'Cancel the order then use "Duplicate": the entry is pre-filled, with an empty reference and today\'s date.'
      },
      {
        q: 'Can a draft be cancelled?',
        a: 'This screen only offers "Cancel the order" on an issued order.'
      },
      {
        q: 'Does the cancelled order disappear from the list?',
        a: 'No: it stays with the status "Cancelled".'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires the "Validate financial documents" permission.' },
    related: [{ label: 'Purchase order sheet', helpId: 'finance.bon-de-commande.page' }],
    keywords: ['cancel the order', 'reason', 'commitment']
  },

  // Supplier balance
  {
    id: 'finance.balance-fournisseurs.page',
    kind: 'page',
    title: 'Supplier balance',
    summary:
      'This balance shows, for each supplier, what has been invoiced, what has been paid and what you owe them. It can be filtered by period and by site.',
    purpose:
      'It is the overview of your debts to suppliers. The control total at the bottom of the page is the sum of the balances shown.',
    steps: [
      {
        title: 'Choose a period',
        detail: 'The "Period" filter limits the "Billed" and "Paid" columns to the movements of those dates.'
      },
      {
        title: 'Choose a site',
        detail: 'The "Construction site" filter keeps only the movements linked to that site.'
      },
      {
        title: 'Search',
        detail: 'Type a supplier name, or filter by "Balance" range.'
      },
      {
        title: 'View the statement',
        detail: 'Click "View the statement" to open the supplier\'s detailed account.'
      }
    ],
    consequences: [
      'This screen is read-only: it changes nothing.',
      "The balance is always the supplier account's current balance; it is not recalculated over the period."
    ],
    faq: [
      {
        q: 'What does a negative balance mean?',
        a: 'You have paid more than you have received in invoices, for example with an advance. The amount is shown with its sign.'
      },
      {
        q: 'Why did the control total disappear?',
        a: 'It is hidden as soon as a search or a balance range narrows the list, because it would no longer be that of the visible rows.'
      },
      {
        q: 'Where can I see the invoice details?',
        a: 'In "View the statement" for the account movements, or in the supplier invoices screen.'
      }
    ],
    permissions: { note: 'Requires the "View financial reports" permission.' },
    related: [
      { label: 'How to read the balance', helpId: 'finance.balance-fournisseurs.tableau' },
      { label: 'Control total', helpId: 'finance.balance-fournisseurs.total' },
      { label: 'Supplier invoices', helpId: 'finance.factures-fournisseurs.page' }
    ],
    keywords: ['balance', 'supplier debt', 'supplier balance', 'what I owe', 'statement']
  },
  {
    id: 'finance.balance-fournisseurs.tableau',
    kind: 'table',
    title: 'Supplier balance table',
    summary: 'One row per supplier: invoiced, paid and balance. A positive balance is what you owe them.',
    howToRead: {
      columns: [
        { key: 'fournisseur', label: 'Supplier', description: "The supplier's name." },
        {
          key: 'facture',
          label: 'Billed',
          description:
            'The total of the invoicing movements over the chosen period, in FCFA. A cancelled invoice is removed from it.'
        },
        {
          key: 'regle',
          label: 'Paid',
          description:
            'The total of the payment movements over the chosen period, in FCFA. A cancelled payment is removed from it.'
        },
        {
          key: 'solde',
          label: 'Balance',
          description:
            "The current balance of the supplier's account. Positive: you owe them this sum. Negative: you have paid more (advance)."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View the statement" opens the supplier\'s detailed account.'
        }
      ],
      notes: [
        'With a chosen period, "Billed" and "Paid" show the activity of the period, but "Balance" stays the current balance: a debt does not disappear because no movement took place during those dates.',
        "A retention placed on an invoice lowers the supplier's balance; releasing it brings the balance back up."
      ]
    },
    steps: [
      {
        title: 'Filter',
        detail:
          'Period and site change the calculated amounts; the search and the "Balance" range only filter the list.'
      },
      { title: 'Export', detail: 'The export button includes the rows displayed according to your filters.' }
    ],
    faq: [
      {
        q: 'Why does "Billed" minus "Paid" not give the balance?',
        a: 'With a period, these two columns only show the activity of the period, whereas the balance is the current balance.'
      },
      {
        q: 'Does the "Construction site" filter change the balance?',
        a: 'It restricts the "Billed" and "Paid" amounts to the movements linked to that site; the balance stays that of the supplier\'s account.'
      },
      {
        q: 'Where does an advance appear?',
        a: 'In "Paid"; it makes the balance lower, even negative.'
      }
    ],
    permissions: { note: 'Requires the "View financial reports" permission.' },
    related: [{ label: 'Control total', helpId: 'finance.balance-fournisseurs.total' }],
    keywords: ['invoiced', 'paid', 'balance', 'period', 'account statement']
  },
  {
    id: 'finance.balance-fournisseurs.total',
    kind: 'section',
    title: 'Control total',
    summary:
      'The control total is the sum of the balances of all the suppliers in the balance: the overall amount you owe.',
    howToRead: {
      notes: [
        'It is the sum of the current balances, not of the activity of the period.',
        'It is hidden as soon as the search or the balance range narrows the list: it would no longer match the visible rows.'
      ]
    },
    faq: [
      {
        q: 'What is this total for?',
        a: 'To check at a glance the overall amount of your supplier debts, and to compare it with your accounting.'
      },
      {
        q: 'Why is it not displayed?',
        a: 'There is no row in the balance, or a search or a balance range narrows the list.'
      },
      {
        q: 'Does the period filter change it?',
        a: 'No: it covers the current balances.'
      }
    ],
    permissions: { note: 'Requires the "View financial reports" permission.' },
    related: [{ label: 'Supplier balance', helpId: 'finance.balance-fournisseurs.page' }],
    keywords: ['total', 'control', 'overall debt']
  },

  // Retentions
  {
    id: 'finance.retenues.page',
    kind: 'page',
    title: 'Retentions',
    summary:
      'A retention sets aside part of what you owe a supplier or a subcontractor until the end of the guarantee. This screen places it, follows it and releases it.',
    purpose:
      'A percentage of an approved supplier invoice or subcontractor progress claim is withheld. The money remains owed, but it only becomes payable once the retention is released. Releasing pays nothing: payment is made afterwards the usual way.',
    steps: [
      { title: 'Set a retention', detail: 'Click "Set a retention" and fill in the form.' },
      {
        title: 'Follow',
        detail: 'The three cards at the top give what is held, what is already released and what is overdue.'
      },
      {
        title: 'Filter',
        detail: 'Status, site, planned release and document amount narrow the list.'
      },
      {
        title: 'Release',
        detail: 'On a held retention, click "Release" then "Confirm the release".'
      }
    ],
    consequences: [
      "A retention does not reduce the site's cost: the document stays allocated for its full amount. It only changes what you owe now.",
      'Releasing is not paying: the amount becomes payable again and the party becomes a creditor again; you then pay them from the supplier invoices screen.',
      'The planned release date is a forecast: nothing is released by itself.'
    ],
    faq: [
      {
        q: 'Why do I not see this screen?',
        a: 'Retentions are reserved for agencies whose plan includes construction sites.'
      },
      {
        q: 'Can I edit or delete a retention?',
        a: 'This screen does not offer it: you set a retention, then you release it.'
      },
      {
        q: 'Is the withheld amount entered?',
        a: 'No. You only enter the rate; the amount is calculated.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts". Setting a retention requires "Create financial documents". Releasing requires "Validate financial documents".'
    },
    related: [
      { label: 'Retention indicators', helpId: 'finance.retenues.indicateurs' },
      { label: 'Retention table', helpId: 'finance.retenues.tableau' },
      { label: 'Set a retention', helpId: 'finance.retenues.pose' },
      { label: 'Supplier invoices', helpId: 'finance.factures-fournisseurs.page' }
    ],
    keywords: ['retention', 'retention money', 'guarantee', 'release', 'progress claim', 'subcontractor', '5 %', '10 %']
  },
  {
    id: 'finance.retenues.indicateurs',
    kind: 'section',
    title: 'Retention indicators',
    summary: 'Three cards summarise your retentions: what is held today, what is already released and what is overdue.',
    howToRead: {
      notes: [
        '"Held today": the total of the retentions held, awaiting release.',
        '"Already released": the total of the released retentions. This amount has become payable again; payment is made elsewhere.',
        '"Overdue": the total of the retentions still held whose planned release date has passed, with their number.',
        'The three figures cover all the retentions of the agency; only the "Construction site" filter restricts them. They do not move with the status or date filters.'
      ]
    },
    steps: [
      {
        title: 'See the overdue retentions',
        detail:
          'If there are any, click the "Overdue" card: the table is filtered on the held retentions whose planned date has passed.'
      }
    ],
    faq: [
      {
        q: 'What does "Overdue" mean?',
        a: 'A retention still held whose planned release date has passed. Nothing releases it automatically: it is up to you to do it.'
      },
      {
        q: 'Why do the figures not change when I filter?',
        a: 'They cover all the retentions, except the "Construction site" filter which restricts them.'
      },
      {
        q: 'The "Overdue" card cannot be clicked.',
        a: 'It can only be clicked when at least one retention is overdue.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Retention table', helpId: 'finance.retenues.tableau' }],
    keywords: ['held', 'released', 'overdue', 'indicators']
  },
  {
    id: 'finance.retenues.tableau',
    kind: 'table',
    title: 'Retention table',
    summary:
      'Each row is a retention placed on a supplier invoice or a subcontractor progress claim. You release held retentions here.',
    howToRead: {
      columns: [
        {
          key: 'piece',
          label: 'Document withheld',
          description: 'The invoice or progress claim on which the retention is placed, with its nature below.'
        },
        { key: 'tiers', label: 'Party', description: 'The supplier or subcontractor concerned.' },
        {
          key: 'chantier',
          label: 'Construction site',
          description: 'The site of the document, or "Not site-related" if it has none.'
        },
        {
          key: 'assiette',
          label: 'Document amount',
          description: 'The amount of the document: the base to which the rate applies. It is not a reduced site cost.'
        },
        { key: 'taux', label: 'Rate', description: 'The percentage withheld.' },
        {
          key: 'retenu',
          label: 'Withheld',
          description:
            'The amount withheld: the document amount multiplied by the rate, rounded to the franc, then fixed.'
        },
        {
          key: 'prevue',
          label: 'Release planned',
          description: 'The planned release date. It is a forecast, not an automatic due date.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: '"Held" or "Released", with "Overdue" if the planned date has passed.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Release" on a held retention; "Released on" with the date on a released retention.'
        }
      ],
      statuses: [
        { value: 'HELD', label: 'Held', description: 'The amount is set aside, awaiting release.' },
        {
          value: 'RELEASED',
          label: 'Released',
          description: 'The amount has become payable again. Nothing has been paid yet.'
        },
        {
          value: 'OVERDUE',
          label: 'Overdue',
          description: 'Held retention whose planned release date is strictly before today.'
        }
      ]
    },
    steps: [
      {
        title: 'Filter',
        detail: 'By status, site, planned release date or document amount.'
      },
      {
        title: 'Release',
        detail:
          'Click "Release": the window reminds you that releasing pays nothing. Confirm with "Confirm the release".'
      },
      {
        title: 'Pay afterwards',
        detail: "Pay the party from the supplier invoices screen (or the subcontractor's sheet) the usual way."
      }
    ],
    consequences: [
      "Releasing is irreversible and pays nothing. An accounting entry is recorded (the retention decreases, the debt to the party goes back up by the same amount) and the party's balance goes back up.",
      'For a supplier invoice, its "remaining due" goes back up by the released amount: the invoice is offered again for payment.',
      "The release is made on today's date."
    ],
    faq: [
      {
        q: 'I released a retention: where is my payment?',
        a: 'Releasing does not pay. The amount has become payable again: record a payment on the supplier invoice.'
      },
      {
        q: 'Can a release be undone?',
        a: 'This screen does not offer it: it is final.'
      },
      {
        q: "Does the retention reduce the site's cost?",
        a: 'No. The work cost its full price; the document stays allocated for its full amount.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: '"Release" requires the "Validate financial documents" permission.'
    },
    related: [
      { label: 'Set a retention', helpId: 'finance.retenues.pose' },
      { label: 'Supplier invoices', helpId: 'finance.factures-fournisseurs.page' }
    ],
    keywords: ['release', 'held retention', 'overdue', 'rate', 'base', 'planned release']
  },
  {
    id: 'finance.retenues.pose',
    kind: 'section',
    title: 'Set a retention',
    summary:
      'This form places a retention on an approved document: a supplier invoice or a subcontractor progress claim. You choose the document, the rate and the planned release date.',
    purpose:
      'The amount withheld is never entered: it is calculated from the rate. The preview shown under the rate is indicative only.',
    steps: [
      { title: 'Nature of the document', detail: '"Supplier invoice" or "Subcontractor position".' },
      {
        title: 'Choose the document',
        detail:
          'For an invoice: the supplier, then the approved invoice. For a progress claim: the contract, then the approved progress claim.'
      },
      {
        title: 'Retention rate',
        detail: 'A percentage strictly between 0 and 100. The field accepts 0.01 to 99.99.'
      },
      { title: 'Planned release date', detail: 'The date on which you intend to release the retention.' },
      {
        title: 'Set the retention',
        detail: 'Click "Set the retention". In case of refusal, the reason is shown at the top of the window.'
      }
    ],
    howToRead: {
      notes: [
        'Amount withheld = document amount × rate ÷ 100, rounded to the franc. The "about … would be withheld" preview is calculated on screen; the final amount is decided by the server.',
        'Only approved documents are offered.'
      ]
    },
    consequences: [
      'A document can only carry one retention.',
      'On a supplier invoice, the retention is refused if it exceeds what is left to pay on the invoice.',
      "An accounting entry is recorded: the debt to the party decreases by the amount withheld, which is carried to the retention account. The party's balance goes down by the same amount.",
      "The site's cost does not change.",
      'Nothing is released on the planned date: the release remains an action to take from the list.'
    ],
    faq: [
      {
        q: 'Why is my invoice not offered?',
        a: 'Only approved invoices are offered. Approve it first from the supplier invoices screen.'
      },
      {
        q: 'Why is the retention refused?',
        a: 'Possible causes: document not approved, retention already placed on this document, rate outside 0 to 100, amount zero after rounding, or retention above the amount left to pay. The message shown gives the reason.'
      },
      {
        q: 'Can I enter the amount to withhold?',
        a: 'No, only the rate; the amount is calculated.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires the "Create financial documents" permission.' },
    related: [{ label: 'Retention table', helpId: 'finance.retenues.tableau' }],
    keywords: ['set a retention', 'retention rate', 'progress claim', 'subcontractor', 'contract', 'approved invoice']
  }
];

export default entries;
