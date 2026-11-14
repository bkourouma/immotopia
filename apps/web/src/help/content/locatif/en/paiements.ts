import type { HelpEntry } from '../../../types';

/** Zone « paiements » du module « locatif » (en). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.paiements.liste',
    kind: 'page',
    title: 'Payment list',
    summary:
      'Find here the rent payments received by your agency, and the payments your tenants have declared. This is where you record a payment, then allocate it to instalments.',
    purpose:
      'A payment is the money received from a tenant for a lease. It is first recorded, then allocated to one or more instalments, which then become "Partial" or "Paid". The same screen also appears in the payments tab of a lease, limited to that lease.',
    steps: [
      {
        title: 'Record a payment',
        detail: 'Click "New payment", then choose the lease, the payment method, the amount and the payment date.'
      },
      {
        title: 'Allocate the payment',
        detail: 'On the payment row, click "Allocate" and choose the instalments to settle.'
      },
      {
        title: 'Search and filter',
        detail: 'Use the search, then the Status, Period, Tenant, Method and Amount filters.'
      },
      {
        title: 'Open a payment',
        detail: 'Click "View" to see the details, change its status or cancel it.'
      },
      {
        title: 'Process declarations',
        detail: 'Open the "Pending declarations" tab to approve or reject the payments declared by your tenants.'
      },
      {
        title: 'Export',
        detail: 'Button "Export": all payments matching your filters are exported, not only the displayed page.'
      }
    ],
    consequences: [
      '"New payment" records the payment directly with the status "Successful" but does not settle any instalment: allocation does that. No message is sent to the tenant when you record it.',
      'Allocation updates the instalments ("Partial" or "Paid") and notifies the tenant by e-mail and the owner by e-mail, if these notifications are enabled for your agency. The tenant also receives a WhatsApp message if your agency has set it up.',
      'No receipt is created automatically by a payment: it is generated separately, from the lease documents.'
    ],
    faq: [
      {
        q: 'Why does my payment show a "Left to allocate" amount?',
        a: 'It is recorded but not yet linked to instalments. Click "Allocate" to do it.'
      },
      {
        q: 'I do not see "New payment" or "Allocate". Why?',
        a: 'These actions depend on your rights: "Create payments" to record, "Allocate payments" to allocate. A read-only role, such as the Accountant, does not see them.'
      },
      {
        q: 'Why does a canceled payment show no amount left to allocate?',
        a: 'A payment that is "Failed" or "Cancelled" has collected no money: there is nothing to allocate.'
      },
      {
        q: 'How do I correct a payment entered by mistake?',
        a: 'Open it with "View" and change its status to "Cancelled": its allocations are undone and the instalments are recalculated.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Manager', 'Accountant (read-only)'],
      note: 'Viewing the list requires "View payments", recording requires "Create payments", allocating and processing declarations require "Allocate payments".'
    },
    related: [
      { label: 'How to read the payment table', helpId: 'locatif.paiements.liste.tableau' },
      { label: 'Record a new payment', helpId: 'locatif.paiements.nouveau' },
      { label: 'Allocate a payment to instalments', helpId: 'locatif.paiements.affectation' },
      { label: 'Payment declarations from tenants', helpId: 'locatif.paiements.declarations' },
      { label: 'Instalment list', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['payment', 'collection', 'collect', 'settlement', 'rent received', 'allocate', 'tenant paid'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'paiements-nouveau',
          title: 'Record a payment',
          description:
            'Click here as soon as you receive a rent payment: choose the lease, the payment method, the amount and the payment date.'
        },
        {
          target: 'paiements-onglets',
          title: 'Payments and declarations',
          description:
            'In "Payments" you see the payments received. In "Pending declarations" you approve or reject the payments your tenants declare.'
        },
        {
          target: 'paiements-tableau',
          title: 'Allocate to instalments',
          description:
            'On each row, "Allocate" links the payment to the instalments to settle. Until this is done, the "Left to allocate" column shows the amount.'
        }
      ]
    }
  },
  {
    id: 'locatif.paiements.liste.tableau',
    kind: 'table',
    title: 'Payment table',
    summary:
      'Each row is a payment received, with its amount, what is left to allocate and its status. Click "View" to open the payment.',
    purpose:
      'The table tells you which payments are still waiting to be linked to instalments and which are settled. In the tab of a lease, the "Lease" and "Tenant" columns are hidden.',
    howToRead: {
      columns: [
        { key: 'bail', label: 'Lease', description: 'Lease number and property name.' },
        { key: 'locataire', label: 'Tenant', description: 'Tenant who paid.' },
        {
          key: 'date',
          label: 'Date',
          description: 'Payment date: the day the tenant paid, not the day it was entered.'
        },
        { key: 'montant', label: 'Amount', description: 'Amount received.' },
        {
          key: 'reste',
          label: 'Left to allocate',
          description:
            'Part of the payment not yet linked to an instalment (or to the security deposit). Shows "Allocated" when everything is allocated.'
        },
        { key: 'methode', label: 'Method', description: 'Payment method: cash, transfer, cheque, Mobile money, etc.' },
        { key: 'statut', label: 'Status', description: 'Payment state, see the statuses below.' },
        {
          key: 'en-ligne',
          label: 'Online',
          description: 'Filled in only if the payment went through online payment; otherwise the cell stays empty.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '"View" opens the payment; "Allocate" appears if there is an amount left to allocate and you have the right to allocate.'
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'Payment expected, not yet received.' },
        { value: 'SUCCESS', label: 'Successful', description: 'Payment received: it can be allocated.' },
        { value: 'FAILED', label: 'Failed', description: 'The payment did not go through: no money received.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Payment canceled: its allocations have been undone.' },
        { value: 'REFUNDED', label: 'Refunded', description: 'Payment refunded. This status is final.' },
        {
          value: 'PARTIALLY_REFUNDED',
          label: 'Partially refunded',
          description: 'Part of the payment has been refunded.'
        }
      ],
      notes: ['On a phone, each payment is shown as a card with "Already allocated" and "Left to allocate".']
    },
    steps: [
      { title: 'Search', detail: 'Type a reference, a lease number, a property or a tenant name.' },
      { title: 'Filter', detail: 'Status, Period, Tenant, Method and Amount (in FCFA) narrow the list.' },
      { title: 'Allocate a payment', detail: 'Click "Allocate" on the row.' },
      { title: 'Open a payment', detail: 'Click "View".' }
    ],
    faq: [
      {
        q: 'Which date is shown?',
        a: 'The payment date, that is the day the tenant paid. For a payment still pending, it is the entry date.'
      },
      {
        q: 'Does the export contain all payments?',
        a: 'Yes: all payments matching your filters, not only the displayed page.'
      },
      {
        q: 'What does "Allocated" mean in "Left to allocate"?',
        a: 'The payment is fully split between instalments or the security deposit: nothing more to do.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires "View payments". The "Allocate" button requires "Allocate payments".'
    },
    related: [
      { label: 'Allocate a payment to instalments', helpId: 'locatif.paiements.affectation' },
      { label: 'Payment page', helpId: 'locatif.paiements.fiche' }
    ],
    keywords: ['payment list', 'amount left to allocate', 'collections', 'export payments']
  },
  {
    id: 'locatif.paiements.nouveau',
    kind: 'section',
    title: 'Record a payment',
    summary:
      'This window records a rent payment received from a tenant. It does not settle any instalment: you allocate them afterwards.',
    purpose:
      'Use it when the tenant pays the agency in cash, by transfer, by cheque, by Mobile money or by card. The payment is created directly with the status "Successful".',
    steps: [
      {
        title: 'Choose the lease',
        detail:
          'The "Lease" field is asked when you start from the global list; it is already set in the tab of a lease.'
      },
      { title: 'Choose the payment method', detail: 'Cash, Bank transfer, Cheque, Mobile money, Bank card or Other.' },
      {
        title: 'If Mobile money',
        detail: 'Fill in the "Operator" and the "Phone number": both are required.'
      },
      {
        title: 'Choose the treasury account',
        detail: 'Optional: without a choice, the default account of the payment method is used.'
      },
      { title: 'Enter the amount', detail: 'A number greater than 0, in the lease currency.' },
      {
        title: 'Enter the payment date',
        detail: 'The day the tenant paid. It cannot be in the future.'
      },
      {
        title: 'Complete if needed',
        detail: 'The "PSP", "PSP transaction ID" and "PSP reference" fields are optional.'
      },
      { title: 'Submit', detail: 'Click "Save payment".' }
    ],
    consequences: [
      'The payment is created "Successful" and dated with the payment day you entered; it counts on that date in statements.',
      'It is not linked to any instalment: the amount appears in "Left to allocate" and is counted as received in advance on the tenant account until it is allocated.',
      'The currency must be the lease currency: a payment in another currency is refused.',
      'No e-mail or message is sent when it is recorded. The tenant is notified at the time of allocation.',
      'To undo a mistake, change the payment to "Cancelled" from its page.'
    ],
    faq: [
      {
        q: 'Why is my instalment still unpaid after recording?',
        a: 'Recording settles nothing. Click "Allocate" on the payment row to link it to the instalment.'
      },
      {
        q: 'Which date should I enter?',
        a: 'The day the tenant really paid, even if you enter it later: it is used for statements and the tenant account.'
      },
      {
        q: 'Why is the currency refused?',
        a: 'No conversion exists: the payment must be in the lease currency, most often FCFA.'
      },
      {
        q: 'What is the treasury account for?',
        a: 'It shows which account (cash, bank, Mobile Money) receives the money. Without a choice, the default account of the payment method is credited.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Create payments".' },
    related: [
      { label: 'Allocate a payment to instalments', helpId: 'locatif.paiements.affectation' },
      { label: 'Payment list', helpId: 'locatif.paiements.liste' }
    ],
    keywords: ['new payment', 'collect rent', 'enter a payment', 'cash', 'mobile money', 'transfer', 'cheque']
  },
  {
    id: 'locatif.paiements.affectation',
    kind: 'section',
    title: 'Allocate a payment to instalments',
    summary:
      'Allocating means splitting a payment between the unpaid instalments of a lease. The instalments concerned become "Partial" or "Paid".',
    purpose:
      'A recorded payment settles nothing until it is allocated. The window lists the instalments of the lease that still have an amount to pay.',
    steps: [
      {
        title: 'Read the amounts',
        detail: '"Total amount", "Already allocated" and "Available amount" remind you what is left to split.'
      },
      { title: 'Tick the instalments', detail: 'Tick each instalment to pay; its "Amount outstanding" is shown.' },
      {
        title: 'Enter an amount (optional)',
        detail:
          'For a ticked instalment, enter the amount to allocate to it. If left empty, the amount is calculated automatically.'
      },
      { title: 'Submit', detail: 'Click "Allocate payment".' }
    ],
    consequences: [
      'Without an entered amount, instalments are served from the oldest to the most recent, up to their amount due and the available amount.',
      'A fully covered instalment becomes "Paid", otherwise "Partial". The amount paid of the instalment is updated.',
      'The tenant is notified by e-mail and so is the owner, if these notifications are enabled for your agency; the tenant also receives a WhatsApp message if your agency has set it up.',
      'A payment can be allocated only once to the same instalment: the remainder goes to another instalment.',
      'Only a "Successful" payment linked to a lease can be allocated.'
    ],
    faq: [
      {
        q: 'Why is no instalment displayed?',
        a: 'All the instalments of the lease are already paid, or the lease has no generated instalments yet.'
      },
      {
        q: 'What happens if the payment exceeds the amount due?',
        a: 'An instalment is never overpaid: the surplus stays available for another instalment.'
      },
      {
        q: 'Why is the amount I enter refused?',
        a: 'It must be greater than 0 and not exceed the amount due of the instalment nor the available amount of the payment.'
      },
      {
        q: 'Can I undo an allocation?',
        a: 'Not line by line. Changing the payment to "Cancelled" undoes all its allocations.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Allocate payments".' },
    related: [
      { label: 'Payment page', helpId: 'locatif.paiements.fiche' },
      { label: 'Instalment list', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['allocate', 'assign', 'apply payment', 'settle an instalment', 'split a payment']
  },
  {
    id: 'locatif.paiements.declarations',
    kind: 'section',
    title: 'Pending declarations',
    summary:
      'Your tenants can declare a mobile money payment they have already made. You check it, then approve or reject it from this tab.',
    purpose:
      'A declaration credits nothing until you have approved it. A badge on the tab shows the number of pending declarations (red if some are late).',
    steps: [
      { title: 'Open the tab', detail: 'Click "Pending declarations".' },
      { title: 'Review', detail: 'Click "Detail" to see the declaration and the attached screenshot.' },
      { title: 'Approve or reject', detail: 'Use "Approve" or "Reject" on the row.' },
      {
        title: 'Declare for a tenant',
        detail: 'Button "Declare for a third party", if you have the right to create payments.'
      }
    ],
    consequences: [
      'Approving creates a real "Successful" payment; rejecting creates nothing. See the "Approve" and "Reject" topics.',
      'The declaration option appears in the tenant portal only if your agency has enabled declarations and added an active receiving number.'
    ],
    faq: [
      {
        q: 'Where do I enable payment declarations?',
        a: 'In the agency financial settings: cards "Payment by mobile money transfer" and "Declared payment settings".'
      },
      {
        q: 'What does "Overdue" mean?',
        a: 'The declaration has been waiting for more business days than the alert delay set in the settings.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires "View payments"; approving and rejecting require "Allocate payments"; declaring for a third party requires "Create payments".'
    },
    related: [
      { label: 'Declaration table', helpId: 'locatif.paiements.declarations.tableau' },
      { label: 'Declared payment settings', helpId: 'locatif.paiements.declarations.reglages' },
      { label: 'Receiving numbers', helpId: 'locatif.paiements.declarations.numeros' }
    ],
    keywords: ['payment declaration', 'declared payment', 'tenant declares', 'screenshot', 'approve a payment']
  },
  {
    id: 'locatif.paiements.declarations.tableau',
    kind: 'table',
    title: 'Declaration table',
    summary: 'Each row is a payment declared by a tenant (or entered on their behalf), with its processing state.',
    purpose:
      'The "Approve" and "Reject" actions appear only on "Pending" declarations and only for people who have the right to allocate payments.',
    howToRead: {
      columns: [
        { key: 'created_at', label: 'Declaration date', description: 'Day the declaration was submitted.' },
        {
          key: 'payment_date',
          label: 'Payment date',
          description: 'Day the payment was made according to the declarant.'
        },
        { key: 'lease', label: 'Lease', description: 'Lease number and property name.' },
        { key: 'declarer', label: 'Tenant', description: 'Person who declared the payment.' },
        {
          key: 'installment',
          label: 'Due date',
          description: 'Instalment concerned, or "-" if the declarant did not give one.'
        },
        { key: 'amount', label: 'Amount', description: 'Declared amount.' },
        { key: 'payment_method', label: 'Method', description: 'Declared payment method.' },
        { key: 'operator', label: 'Operator', description: 'Mobile Money operator, if filled in.' },
        {
          key: 'receiving_number',
          label: 'Receiving no.',
          description: 'Number of your agency that received the transfer.'
        },
        { key: 'reference', label: 'Reference', description: 'Transaction reference.' },
        {
          key: 'status',
          label: 'Status',
          description:
            'State of the declaration, with possible alerts: "Possible duplicate", "Edited after AI reading", "Overdue".'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Detail", see the proof of payment, "Approve" and "Reject".'
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'To check: nothing is credited yet.' },
        { value: 'APPROVED', label: 'Approved', description: 'Approved: a payment has been created.' },
        { value: 'REJECTED', label: 'Rejected', description: 'Refused: no payment created.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Canceled before processing.' }
      ],
      notes: [
        '"Possible duplicate": another declaration has the same amount, the same day and the same instalment.',
        '"Edited after AI reading": the declarant changed values proposed by the automatic reading of the screenshot.'
      ]
    },
    steps: [
      { title: 'Search', detail: 'Reference, lease number, property or declarant.' },
      {
        title: 'Filter',
        detail: 'Status, Period and Method. "All statuses" also shows declarations already processed.'
      },
      { title: 'Examine', detail: 'Click "Detail", or the proof icon to see the screenshot.' },
      { title: 'Export', detail: 'All declarations matching your filters are exported.' }
    ],
    faq: [
      {
        q: 'Where is the payment screenshot?',
        a: 'Click the "View the proof of payment" icon on the row: an image opens, a PDF is downloaded.'
      },
      {
        q: 'Why do I not have the "Approve" and "Reject" buttons?',
        a: 'They require the "Allocate payments" right and only appear for an "Pending" declaration.'
      },
      {
        q: 'What should I do with a "Possible duplicate"?',
        a: 'Compare it with the other declaration and the transaction reference: reject it with the reason "Reference already used" if it is a duplicate.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "View payments".' },
    related: [
      { label: 'Approve a declaration', helpId: 'locatif.paiements.declarations.approuver' },
      { label: 'Reject a declaration', helpId: 'locatif.paiements.declarations.rejeter' }
    ],
    keywords: ['duplicate', 'proof of payment', 'screenshot', 'declarations']
  },
  {
    id: 'locatif.paiements.declarations.approuver',
    kind: 'section',
    title: 'Approve a payment declaration',
    summary:
      'Approving turns the declaration into a real "Successful" payment. You can accept an amount different from the declared one.',
    purpose: 'Check the transfer on your Mobile Money account before approving.',
    steps: [
      {
        title: 'Review the declaration',
        detail: 'Tenant, lease, instalment, reference, declared amount and date. Any alerts are at the top.'
      },
      {
        title: 'Check the "Amount withheld"',
        detail:
          'It defaults to the declared amount. To correct it, enter a whole number from 1 up to the maximum allowed.'
      },
      {
        title: 'Add a note',
        detail: '"Note (optional)"; it becomes mandatory (10 to 500 characters) if the accepted amount differs.'
      },
      {
        title: 'Check the treasury account',
        detail: 'By default, that of the receiving number (Mobile Money) or that of the payment method.'
      },
      { title: 'Approve', detail: '"Validate as declared" or "Validate with correction".' }
    ],
    consequences: [
      'A "Successful" payment is created, dated with the declared payment day, in the tenant name.',
      'If the declaration targets an instalment, the payment is allocated to it up to its amount due: the instalment becomes "Partial" or "Paid". Any excess is counted as received in advance on the tenant account.',
      'The tenant and the owner are notified by e-mail if these notifications are enabled for your agency; the tenant also receives a WhatsApp message if your agency has set it up.',
      'The decision is final: an approved declaration cannot be reopened. To undo the payment created, cancel it from its page.',
      'If the declaration has just been processed by someone else, the screen tells you so and reloads.'
    ],
    faq: [
      {
        q: 'Can I approve a smaller amount than the declared one?',
        a: 'Yes, enter the "Amount withheld" and explain the correction in the mandatory note.'
      },
      {
        q: 'What happens if no instalment is given?',
        a: 'The payment is created but allocated to no instalment: allocate it afterwards from the payment list.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Allocate payments".' },
    related: [
      { label: 'Reject a declaration', helpId: 'locatif.paiements.declarations.rejeter' },
      { label: 'Allocate a payment to instalments', helpId: 'locatif.paiements.affectation' }
    ],
    keywords: ['approve', 'validate', 'accepted amount', 'correction']
  },
  {
    id: 'locatif.paiements.declarations.rejeter',
    kind: 'section',
    title: 'Reject a payment declaration',
    summary:
      'Rejecting refuses the declaration: no payment is created and no instalment changes. A reason is required.',
    purpose: 'Use it when you cannot find the transfer, the amount does not match or the reference is already used.',
    steps: [
      {
        title: 'Choose the reason',
        detail:
          '"Payment not found", "Amount does not match", "Reference already used", "Wrong receiving number" or "Other".'
      },
      {
        title: 'Write a text',
        detail: 'Optional, except for "Other" where it is required. Between 10 and 500 characters.'
      },
      { title: 'Confirm', detail: 'Click "Reject the declaration".' }
    ],
    consequences: [
      'No payment is created and no instalment is modified.',
      'The tenant and the owner are notified by e-mail if these notifications are enabled for your agency; the tenant also receives a WhatsApp message if your agency has set it up. The text you entered (or, failing that, the label of the reason) is sent to them.',
      'The decision is final: a rejected declaration cannot be reopened.'
    ],
    faq: [
      {
        q: 'Can the tenant declare again?',
        a: 'Yes, from their portal. A rejected declaration does not block a new one, even with the same transaction reference: only declarations that are pending or approved block it. You can also enter the payment yourself with "New payment" or "Declare for a third party".'
      },
      {
        q: 'Is the text mandatory?',
        a: 'Only with the reason "Other". Without text, the label of the reason is sent.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Allocate payments".' },
    related: [{ label: 'Approve a declaration', helpId: 'locatif.paiements.declarations.approuver' }],
    keywords: ['reject', 'refuse', 'rejection reason']
  },
  {
    id: 'locatif.paiements.declarations.tiers',
    kind: 'section',
    title: 'Declare a payment for a tenant',
    summary:
      'You enter yourself the declaration of a tenant who paid by mobile money transfer. It remains to be approved.',
    purpose: 'Useful when the tenant sends you their proof of payment through a channel other than the portal.',
    steps: [
      { title: 'Choose the lease', detail: 'The tenant is the one of the lease.' },
      { title: 'Choose the instalment', detail: '"Due date (optional)": only unpaid instalments are offered.' },
      {
        title: 'Receiving number and operator',
        detail: 'The number of your agency that received the transfer, and the operator.'
      },
      { title: 'Transaction reference', detail: '4 to 40 characters: letters, digits, dot or hyphen.' },
      {
        title: 'Amount and date',
        detail: 'Whole amount in FCFA; date and time of the transfer, not in the future nor older than 90 days.'
      },
      { title: 'Attach the screenshot', detail: 'Optional: JPEG, PNG, WebP or PDF, 5 MB at most.' },
      { title: 'Submit', detail: 'Click "Create the declaration".' }
    ],
    consequences: [
      'The declaration is created "Pending": it credits nothing until you have approved it.',
      'An e-mail is sent to the agency (administrators and lease owner) to report the declaration.'
    ],
    faq: [
      {
        q: 'Why is the reference refused?',
        a: 'It must have 4 to 40 characters (letters, digits, dot or hyphen) and not be already used by another pending or approved declaration.'
      },
      {
        q: 'Do I still have to approve it?',
        a: 'Yes. Like any declaration, it appears "Pending" in the table.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Create payments".' },
    related: [{ label: 'Approve a declaration', helpId: 'locatif.paiements.declarations.approuver' }],
    keywords: ['declare for a third party', 'enter a declaration', 'proof of payment']
  },
  {
    id: 'locatif.paiements.declarations.reglages',
    kind: 'section',
    title: 'Declared payment settings',
    summary:
      'This card enables payment declarations in the tenant portal and sets their options. It is found in the agency financial settings.',
    purpose: 'It is displayed in the agency financial settings when rental management is active.',
    howToRead: {
      notes: [
        '"Payment declaration enabled": without it, tenants cannot declare anything.',
        '"Screenshot required": the tenant must attach a screenshot of their payment.',
        '"AI reading of the screenshot": the AI proposes values that the tenant reviews; it never approves nor credits anything. It is available only if the server offers it, within a monthly quota shown on screen.',
        '"Alert delay (business days)": beyond it, a pending declaration is flagged "Overdue".'
      ]
    },
    steps: [
      { title: 'Enable', detail: 'Set "Payment declaration enabled" to on.' },
      { title: 'Add a receiving number', detail: 'Without an active number, the portal shows nothing.' },
      { title: 'Set the options', detail: 'Screenshot required, AI reading, alert delay.' },
      { title: 'Save', detail: 'The "Save" button is active as soon as a setting changes.' }
    ],
    consequences: [
      'Settings apply immediately to new declarations.',
      'Without the "Allocate payments" right, the card is read-only.'
    ],
    faq: [
      {
        q: 'Why does the portal not show payment declaration?',
        a: 'Check that the option is enabled and that at least one receiving number is active.'
      },
      {
        q: 'What happens when the AI reading quota is reached?',
        a: 'Automatic reading is suspended until next month; tenants then enter the values themselves.'
      },
      {
        q: 'Why can I not change these settings?',
        a: 'You need the "Allocate payments" right.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Reading with "View payments", editing with "Allocate payments".' },
    related: [{ label: 'Receiving numbers', helpId: 'locatif.paiements.declarations.numeros' }],
    keywords: ['settings', 'enable declarations', 'AI reading', 'required screenshot', 'alert delay']
  },
  {
    id: 'locatif.paiements.declarations.numeros',
    kind: 'section',
    title: 'Receiving numbers',
    summary:
      'These are the numbers of your agency where tenants send their mobile money payment before declaring it. Each number is tracked on its own treasury account.',
    purpose: 'The "Payment by mobile money transfer" card is in the agency financial settings.',
    howToRead: {
      columns: [
        { key: 'operator', label: 'Operator', description: 'Orange Money, MTN MoMo, Moov Money, Wave or Other.' },
        { key: 'phone', label: 'Number', description: 'Phone number that receives the transfer.' },
        { key: 'label', label: 'Label', description: 'Optional name to recognise the number.' },
        { key: 'treasury', label: 'Treasury account', description: 'Account that tracks the payments of this number.' },
        {
          key: 'pendingDeclarations',
          label: 'Pending',
          description: 'Number of pending declarations linked to this number.'
        },
        { key: 'active', label: 'Status', description: 'Active or inactive switch.' },
        { key: 'actions', label: 'Actions', description: '"Edit" and "Delete".' }
      ]
    },
    steps: [
      { title: 'Add a number', detail: 'Click "Add a number", choose the operator and enter the number.' },
      { title: 'Give a label', detail: 'Optional, 60 characters at most.' },
      { title: 'Enable or disable', detail: 'Use the switch in the "Status" column.' },
      { title: 'Edit or delete', detail: '"Edit" and "Delete" buttons on the row.' }
    ],
    consequences: [
      'Deleting a number that has linked declarations only deactivates it: it is not erased.',
      'Without an active number, the tenant portal does not offer payment declaration.'
    ],
    faq: [
      {
        q: 'Why is my number only deactivated after deletion?',
        a: 'Declarations are linked to it: it is kept to preserve their history.'
      },
      {
        q: 'Why is the number refused?',
        a: 'The number must be valid and not already exist among your receiving numbers.'
      },
      {
        q: 'Who can add or edit a number?',
        a: 'People who have the "Allocate payments" right. Others can only view.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Reading with "View payments", writing with "Allocate payments".' },
    related: [{ label: 'Declared payment settings', helpId: 'locatif.paiements.declarations.reglages' }],
    keywords: ['receiving number', 'orange money', 'mtn', 'moov', 'wave', 'mobile money']
  },
  {
    id: 'locatif.paiements.fiche',
    kind: 'page',
    title: 'Payment page',
    summary:
      'This page details one payment: amount, method, dates, and how it was used. You can allocate it to instalments or change its status.',
    purpose:
      'It is used to check a payment, finish allocating it, or cancel it if it was entered by mistake. The "Back" button leads back to the lease if the payment is linked to one, otherwise to the payment list.',
    steps: [
      {
        title: 'Read the information',
        detail: '"Financial information" card: tenant, amount, allocated amount, available amount, method and status.'
      },
      {
        title: 'Check the dates',
        detail: '"Dates" card: payment date, initiation date, and cancellation or failure date as the case may be.'
      },
      {
        title: 'See the use',
        detail: '"Use of the payment" card: instalments and security deposit that received money.'
      },
      { title: 'Allocate the remainder', detail: 'Click "Allocate to instalments" if an amount is still available.' },
      { title: 'Change the status', detail: 'Use the "Status" list at the top of the page.' }
    ],
    consequences: [
      '"Cancelled" or "Failed" undoes all allocations of the payment, cancels the security deposit collection linked to it and recalculates the instalments. A confirmation is asked.',
      'Reactivating a canceled or failed payment ("Successful") does not restore its former allocations: it must be allocated again.',
      'Each status change is recorded in the audit history.',
      'No e-mail is sent when the status changes. No receipt is generated from this page.'
    ],
    faq: [
      {
        q: 'Why is the "Allocate to instalments" button missing?',
        a: 'It requires the "Allocate payments" right, a "Successful" payment linked to a lease and an amount still available.'
      },
      {
        q: 'Why is the "Status" list greyed out?',
        a: 'You do not have the "Allocate payments" right, or the payment is "Refunded", a final status.'
      },
      {
        q: 'Which status changes are possible?',
        a: '"Pending" becomes "Successful", "Failed" or "Cancelled"; "Successful" becomes "Cancelled" or "Failed"; "Cancelled" and "Failed" can become "Successful" again.'
      },
      {
        q: 'Where is the receipt?',
        a: 'It is not created automatically by a payment: generate it from the lease documents.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires "View payments"; allocating and changing the status require "Allocate payments".'
    },
    related: [
      { label: 'Financial information', helpId: 'locatif.paiements.fiche.informations' },
      { label: 'Use of the payment', helpId: 'locatif.paiements.fiche.utilisation' },
      { label: 'Change the status of a payment', helpId: 'locatif.paiements.fiche.statut' },
      { label: 'Payment list', helpId: 'locatif.paiements.liste' }
    ],
    keywords: ['payment details', 'cancel a payment', 'payment status', 'available amount']
  },
  {
    id: 'locatif.paiements.fiche.informations',
    kind: 'section',
    title: 'Financial information',
    summary: 'This card summarises the payment: who paid, how much, how, and what is left to use.',
    howToRead: {
      notes: [
        '"Amount allocated": sum already split between instalments and the security deposit.',
        '"Available amount": amount minus allocated amount. It is 0 for a failed or canceled payment.',
        '"Payment method": cash, transfer, cheque, Mobile money, direct debit, card or other.',
        '"Mobile Money operator" and "Phone number" appear only for a Mobile Money payment.',
        'Dates are in the neighbouring "Dates" card: "Payment date" is the day the tenant paid.'
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'Not yet received.' },
        { value: 'SUCCESS', label: 'Successful', description: 'Received.' },
        { value: 'FAILED', label: 'Failed', description: 'Did not go through.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Canceled, allocations undone.' },
        { value: 'REFUNDED', label: 'Refunded', description: 'Refunded, final.' },
        { value: 'PARTIALLY_REFUNDED', label: 'Partially refunded', description: 'Partly refunded.' }
      ]
    },
    faq: [
      {
        q: 'Why is "Available amount" at 0?',
        a: 'The payment is fully allocated, or it is "Failed" or "Cancelled" and therefore received nothing.'
      },
      {
        q: 'What is the difference between "Payment date" and "Initiation date"?',
        a: 'The first is the day the tenant paid, the second the day the payment was created in the application.'
      },
      {
        q: 'Can the amount be edited?',
        a: 'Not from this page. Cancel the payment and enter a new one if the amount is wrong.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "View payments".' },
    related: [{ label: 'Use of the payment', helpId: 'locatif.paiements.fiche.utilisation' }],
    keywords: ['allocated amount', 'available amount', 'payment date']
  },
  {
    id: 'locatif.paiements.fiche.utilisation',
    kind: 'section',
    title: 'Use of the payment',
    summary:
      'This card shows where the money of the payment went: which instalments it settled and which security deposit movements it fed.',
    steps: [
      {
        title: 'Read "Allocations to instalments"',
        detail: 'Each line gives the instalment period, its due date, the allocated amount and the date.'
      },
      {
        title: 'Read "Allocation to the security deposit"',
        detail: 'Each line gives the movement type (for example "Collection (security deposit)") and the amount.'
      },
      { title: 'Allocate the remainder', detail: '"Allocate to instalments" appears if an amount is still available.' }
    ],
    consequences: [
      'Canceling or declaring the payment failed erases these lines: instalments are recalculated and the security deposit collection is undone.',
      'When "Allocate to instalments" is used, the tenant and the owner are notified by e-mail if these notifications are enabled for your agency.'
    ],
    faq: [
      {
        q: 'Why does the card say "No use recorded for this payment"?',
        a: 'The payment has not yet been allocated to any instalment. Use "Allocate to instalments".'
      },
      {
        q: 'Can a payment be used for the security deposit?',
        a: 'Yes: the security deposit movements linked to the payment are listed here, with their amount.'
      }
    ],
    permissions: { feature: 'RENTAL', note: '"Allocate to instalments" requires "Allocate payments".' },
    related: [{ label: 'Allocate a payment to instalments', helpId: 'locatif.paiements.affectation' }],
    keywords: ['use of the payment', 'allocations', 'security deposit', 'settled instalments']
  },
  {
    id: 'locatif.paiements.fiche.statut',
    kind: 'section',
    title: 'Change the status of a payment',
    summary:
      'The "Status" list lets you correct a payment: cancel it, declare it failed or reactivate it. Only the allowed changes are offered.',
    purpose: 'This is the way to undo a payment entered by mistake.',
    steps: [
      { title: 'Open the "Status" list', detail: 'It is at the top of the page.' },
      {
        title: 'Choose the new status',
        detail: 'For "Cancelled" or "Failed", a confirmation "Cancel this payment?" is shown.'
      },
      { title: 'Confirm', detail: 'Click "Confirm".' }
    ],
    consequences: [
      'Canceling or declaring failed undoes the allocations to instalments and the security deposit collection linked to it; instalments are recalculated.',
      'The change is recorded in the audit history.',
      'A "Refunded" payment can no longer change status.'
    ],
    faq: [
      {
        q: 'Can I change a "Successful" payment back to "Pending"?',
        a: 'No: a payment received never goes back to "Pending". You can cancel it or declare it failed.'
      },
      {
        q: 'How do I reactivate a payment canceled by mistake?',
        a: 'Choose "Successful": the payment becomes available again, but it must be allocated to instalments again.'
      },
      {
        q: 'Why is no message sent to the tenant?',
        a: 'A status change sends no e-mail or message.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires "Allocate payments".' },
    related: [{ label: 'Payment page', helpId: 'locatif.paiements.fiche' }],
    keywords: ['cancel a payment', 'reactivate', 'failed', 'correct a payment']
  }
];

export default entries;
