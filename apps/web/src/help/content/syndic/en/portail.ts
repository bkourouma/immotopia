import type { HelpEntry } from '../../../types';

/** « portail » zone of the « syndic » module (en): co-owner portal (/copropriete). */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ My units
  {
    id: 'syndic.portail.lots',
    kind: 'page',
    title: 'My units',
    summary:
      'This screen is the home of your co-owner space: your units in the condominium, with the account balance of each one. Click a unit to see its account.',
    purpose:
      'At a glance, you see what you owe, or the advance you hold, on each lot. Units are grouped by condominium.',
    howToRead: {
      statuses: [
        { value: 'DEBITEUR', label: 'Debtor', description: 'You owe this amount to the condominium.' },
        { value: 'CREDITEUR', label: 'In credit', description: 'You have an advance on this lot.' },
        { value: 'A_JOUR', label: 'Settled', description: 'The account is up to date.' }
      ],
      notes: [
        'The amount is always shown without a sign: the direction is read from the “Debtor” or “In credit” tag.',
        '“No account opened” means the account of this unit has not yet been opened by the management.',
        'The search bar only appears if you have more than 6 lots.'
      ]
    },
    steps: [
      { title: 'Find your unit', detail: 'Look for the “Unit” card of the right condominium.' },
      {
        title: 'Open the account',
        detail: 'Click the card to see the balance, the movements and the charge calls of the lot.'
      },
      { title: 'Refresh', detail: '“Refresh” button to reload your lots.' }
    ],
    faq: [
      {
        q: 'I do not see one of my units, why?',
        a: 'Only the units opened to your account appear. Contact your agency if a unit is missing.'
      },
      {
        q: 'What are ownership shares?',
        a: 'They are the shares of your unit in the condominium. “Share held” is your ownership share of the unit, as a percentage.'
      },
      {
        q: 'Why does the balance have no minus sign?',
        a: 'The amount is shown as a positive value, with the mention “Debtor” or “In credit”.'
      }
    ],
    permissions: {
      roles: ['Co-owner'],
      note: 'Your access is opened by the “Invite to portal” invitation sent from the unit owner record. You only see your own lots.'
    },
    related: [
      { label: 'Account of a unit', helpId: 'syndic.portail.compte' },
      { label: 'My charge calls', helpId: 'syndic.portail.appels' },
      { label: 'My condominium', helpId: 'syndic.portail.copropriete' }
    ],
    keywords: ['home', 'my units', 'balance', 'ownership shares', 'co-owner', 'portal']
  },
  {
    id: 'syndic.portail.lots.cartes',
    kind: 'section',
    title: 'Cards of your units',
    summary:
      'Each condominium has its card, and each unit has its row: unit type, account balance, ownership shares and share held. Click a unit to open its account.',
    howToRead: {
      notes: [
        'The title gives the name and address of the condominium.',
        '“General shares”: your share in the common charges. “Special shares” only appears if your unit has some.',
        'The unit type is shown under the number: Appartement, Parking, Cave, Bureau, Commerce or Autre.'
      ]
    },
    faq: [
      { q: 'How do I open the account of a unit?', a: 'Click its card.' },
      {
        q: 'What does “No account opened” mean?',
        a: 'No account has been opened for this unit yet, so there is no balance to show.'
      },
      {
        q: 'Why several condominiums?',
        a: 'Your units are grouped by condominium if you own units in several buildings of the same agency.'
      }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Account of a unit', helpId: 'syndic.portail.compte' }],
    keywords: ['lot', 'card', 'ownership shares', 'share held']
  },

  // ------------------------------------------------------------------ Account of a unit
  {
    id: 'syndic.portail.compte',
    kind: 'page',
    title: 'Account of a unit',
    summary:
      'This screen details one of your units: its balance, a statement to download, the account movements and the charge calls. It is read-only.',
    purpose: 'Here you check what has been called, what you have paid and what remains due on the lot.',
    howToRead: {
      notes: [
        'The header gives the condominium, the unit type, its general ownership shares and your share held.',
        'Four blocks follow: “Account balance”, “Account statement”, “Account movements” and “Service charge calls for this unit”.',
        'If the unit is not yours, the screen says “This unit cannot be found in your area”.'
      ]
    },
    steps: [
      {
        title: 'Read the balance',
        detail: 'The amount is followed by “Debtor”, “In credit” or “Settled”, with an explanatory sentence.'
      },
      { title: 'Download a statement', detail: 'Choose a period if you wish, then “Download my statement (PDF)”.' },
      { title: 'Browse the movements', detail: 'Search a label or filter by “Type” and “Date”.' },
      {
        title: 'See the charge calls',
        detail: 'At the bottom, the table of the unit calls with their status and the “Call notice (PDF)” button.'
      }
    ],
    faq: [
      {
        q: 'How do I pay from this screen?',
        a: 'Payment is made in “My service charge calls” (online payment or declaring a mobile money payment).'
      },
      {
        q: 'I disagree with an amount, what should I do?',
        a: 'Contact your agency: you can view your information but not change it.'
      },
      { q: 'What is the statement for?', a: 'To keep a record of your account, over the period you choose.' }
    ],
    permissions: { roles: ['Co-owner'], note: 'Read-only: you can only view the units opened to you.' },
    related: [
      { label: 'Account balance', helpId: 'syndic.portail.compte.solde' },
      { label: 'Account statement', helpId: 'syndic.portail.compte.releve' },
      { label: 'Account movements', helpId: 'syndic.portail.compte.mouvements' },
      { label: 'My charge calls', helpId: 'syndic.portail.appels' }
    ],
    keywords: ['account', 'unit', 'balance', 'statement', 'movements', 'unit details']
  },
  {
    id: 'syndic.portail.compte.solde',
    kind: 'section',
    title: 'Account balance',
    summary:
      'This card gives the current balance of the unit, without a sign, with the mention “Debtor”, “In credit” or “Settled”.',
    howToRead: {
      statuses: [
        { value: 'DEBITEUR', label: 'Debtor', description: 'You owe this amount to the condominium.' },
        { value: 'CREDITEUR', label: 'In credit', description: 'You have an advance on this lot.' },
        { value: 'A_JOUR', label: 'Settled', description: 'Account up to date.' }
      ]
    },
    faq: [
      {
        q: 'What does “No account has been opened for this unit yet” mean?',
        a: 'The management has not yet opened the account of the unit: there is no balance to read.'
      },
      {
        q: 'What happens to an advance?',
        a: 'An advance (“In credit” balance) remains available on the unit; it also appears in “My payments”.'
      },
      {
        q: 'Why is the balance shown without a sign?',
        a: 'The card shows the amount without a sign, and the label gives its direction. "Debtor": you owe this amount to the co-ownership; "In credit": you have an advance; "Settled": the account is up to date.'
      }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Account movements', helpId: 'syndic.portail.compte.mouvements' }],
    keywords: ['balance', 'debtor', 'creditor', 'advance']
  },
  {
    id: 'syndic.portail.compte.releve',
    kind: 'section',
    title: 'Account statement',
    summary:
      'This card lets you download your account statement for the unit as a PDF, over the period of your choice.',
    steps: [
      { title: 'Choose the period', detail: 'Fields “From” and “To”, optional.' },
      { title: 'Download', detail: '“Download my statement (PDF)” button.' }
    ],
    consequences: ['Under the button, a note says: “Last 30 transactions since your acquisition”.'],
    faq: [
      { q: 'Do I have to choose a period?', a: 'No, it is optional.' },
      {
        q: 'The download fails, what should I do?',
        a: 'An error message appears. Try again, then contact your agency if the problem persists.'
      },
      {
        q: 'In what format is the statement?',
        a: 'It is a PDF: click "Download my statement (PDF)", after optionally choosing a period with "From" and "To".'
      }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Account movements', helpId: 'syndic.portail.compte.mouvements' }],
    keywords: ['statement', 'pdf', 'download', 'period']
  },
  {
    id: 'syndic.portail.compte.mouvements',
    kind: 'table',
    title: 'Account movements',
    summary:
      'This table lists everything posted on the unit account: calls, payments, penalties, waivers, adjustments.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'Date of the movement.' },
        {
          key: 'type',
          label: 'Type',
          description: 'Charge call, Payment, Penalty, Discount, Adjustment or Fund transfer.'
        },
        { key: 'label', label: 'Label', description: 'Description of the movement.' },
        { key: 'debit', label: 'Debit', description: 'Debit amount, if any.' },
        { key: 'credit', label: 'Credit', description: 'Credit amount, if any.' },
        {
          key: 'balanceAfter',
          label: 'Balance after',
          description: 'Account balance after this movement, with “Debtor” or “In credit”.'
        }
      ],
      notes: ['Filters: search on the label, “Type” and “Date”. The table can be exported.']
    },
    faq: [
      {
        q: 'Why does a line have only a debit or only a credit?',
        a: 'Each movement is either a debit or a credit: the other column shows “—”.'
      },
      { q: 'Where can I see a late penalty?', a: 'When it is applied, it appears here with the type “Penalty”.' },
      {
        q: 'The table is empty, is that normal?',
        a: 'If no movement is recorded, the screen says “No movement recorded on this account”.'
      }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Account balance', helpId: 'syndic.portail.compte.solde' }],
    keywords: ['movements', 'debit', 'credit', 'penalty', 'history']
  },

  // ------------------------------------------------------------------ My charge calls
  {
    id: 'syndic.portail.appels',
    kind: 'page',
    title: 'My charge calls',
    summary:
      'This screen lists the charge calls of all your units: amount called, already paid and remaining to pay. It is also where you pay.',
    purpose:
      'You follow your due dates and pay online or by mobile money, depending on what your condominium has opened. Nothing is offered until your agency has activated a payment method.',
    howToRead: {
      notes: [
        'Two amounts at the top: “Amount outstanding” (all your calls) and “Of which overdue” with the number of calls concerned.',
        'Below the amounts, depending on your condominium: online payment, “Pay the agency” (payment details, reason to copy, warnings), the mobile money numbers and the “I have paid: declare my payment” button that leads to the declaration.',
        'If nothing is open, a message asks you to contact your agency.'
      ]
    },
    steps: [
      { title: 'Spot your due dates', detail: 'Look at the table and the “Status” column.' },
      { title: 'Pay online', detail: 'If the “Pay” box is offered: tick the calls of one unit, then “Pay online”.' },
      {
        title: 'Or pay by mobile money',
        detail: 'Make the transfer to one of the numbers shown, then “I paid by mobile money”.'
      },
      {
        title: 'Follow the validation',
        detail: 'Your declaration appears in “My payments”; it is checked by the syndic.'
      }
    ],
    consequences: [
      'A call whose online payment is in progress, or whose declaration is under verification, can no longer be ticked.',
      'The remaining amount only goes down once the payment is confirmed or the declaration is validated.'
    ],
    faq: [
      {
        q: 'Why do I see no payment button?',
        a: 'Your condominium has not yet opened a payment method: contact your agency.'
      },
      {
        q: 'Where can I see penalties?',
        a: 'They are not in this table: when applied, they appear in the account movements of the lot.'
      },
      {
        q: 'What does “Overdue” mean?',
        a: 'The due date has passed and the call is not settled. The status is calculated automatically.'
      }
    ],
    permissions: {
      roles: ['Co-owner'],
      note: 'Read-only, except for online payment and declaring a mobile money payment.'
    },
    related: [
      { label: 'Charge calls', helpId: 'syndic.portail.appels.tableau' },
      { label: 'Pay online', helpId: 'syndic.portail.appels.paiement-en-ligne' },
      { label: 'Numbers to pay by mobile money', helpId: 'syndic.portail.appels.mobile-money' },
      { label: 'I paid by mobile money', helpId: 'syndic.portail.appels.declaration' },
      { label: 'My payments', helpId: 'syndic.portail.paiements' }
    ],
    keywords: ['charge calls', 'pay', 'charges', 'due date', 'late', 'remaining to pay'],
    tour: {
      steps: [
        {
          target: 'portail-appels-tableau',
          title: 'Your charge calls',
          description: 'Each line is a call: period, due date, amount, already paid and remaining to pay.'
        },
        {
          target: 'portail-payer-en-ligne',
          title: 'Pay online',
          description: 'Tick one or more calls of the same unit in the table, then click here.'
        },
        {
          target: 'portail-mobile-money',
          title: 'Pay by mobile money',
          description: 'Note the receiving number of your condominium and make the transfer from your phone.'
        },
        {
          target: 'portail-declarer',
          title: 'Declare your payment',
          description: 'Once the transfer is done, declare it: the syndic checks it before posting it to your account.'
        }
      ]
    }
  },
  {
    id: 'syndic.portail.appels.tableau',
    kind: 'table',
    title: 'Charge calls',
    summary:
      'This table lists your charge calls with their due date, amounts and status. The button on each line downloads the call notice.',
    howToRead: {
      columns: [
        {
          key: 'select',
          label: 'Pay',
          description: 'Tick box for calls payable online. A payment covers a single unit and at most 24 calls.'
        },
        { key: 'period', label: 'Period', description: 'Period covered by the call.' },
        { key: 'lot', label: 'Unit', description: 'Unit number and condominium (absent in the detail of a unit).' },
        { key: 'dueDate', label: 'Due date', description: 'Payment deadline.' },
        { key: 'amount', label: 'Amount', description: 'Amount called.' },
        { key: 'paid', label: 'Paid', description: 'Amount already paid.' },
        { key: 'outstanding', label: 'Amount outstanding', description: 'What remains to be paid on this call.' },
        {
          key: 'status',
          label: 'Status',
          description: 'State of the call, and a mention of a payment in progress or declared.'
        },
        { key: 'notice', label: 'Notices', description: '“Call notice (PDF)” button.' }
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'The due date has not passed and nothing is paid.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Part of the call is paid.' },
        { value: 'PAID', label: 'Paid', description: 'Call settled.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'The due date has passed and the call is not settled.' }
      ],
      notes: [
        'Mentions next to the status: “Payment in progress” (with “Resume the payment”), “Payment being verified” and “Payment declared, being checked”.',
        'Filters: search, “Status”, “Unit” (on the “My service charge calls” screen) and “Due date”.'
      ]
    },
    steps: [
      { title: 'Filter', detail: 'Search a period or filter by status, unit or due date.' },
      {
        title: 'Download a notice',
        detail:
          '“Call notice (PDF)” button on the line; “Notice unavailable” appears if the document does not exist yet.'
      },
      { title: 'Tick to pay', detail: 'If the “Pay” column exists, tick the calls to pay online.' }
    ],
    faq: [
      {
        q: 'Why is the box of a call greyed out?',
        a: 'An online payment is in progress, a declaration is under verification, or you have already ticked a call of another lot.'
      },
      { q: 'Why is there no “Pay” column?', a: 'Online payment is not open for your condominium.' },
      { q: 'Can the table be exported?', a: 'Yes, the table offers export of the calls matching your filters.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Pay online', helpId: 'syndic.portail.appels.paiement-en-ligne' }],
    keywords: ['calls', 'call notice', 'due date', 'status', 'remaining to pay']
  },
  {
    id: 'syndic.portail.appels.paiement-en-ligne',
    kind: 'section',
    title: 'Pay online',
    summary:
      'This card only appears if your condominium has opened online payment. You tick your calls, then you are sent to the payment service page.',
    howToRead: {
      notes: [
        '“Payment methods” lists those offered: Wave, Orange Money, MTN Money, Moov Money or Carte bancaire.',
        'Depending on the condominium, payment service fees may be added to the amount, or are covered by your agency: the card says which.',
        'The “Demo mode” tag indicates a trial without a real payment.'
      ]
    },
    steps: [
      { title: 'Tick the calls', detail: 'In the table, tick one or more calls of the same unit (24 at most).' },
      { title: 'Check the total', detail: 'The card shows “Total to pay” and the number of calls.' },
      { title: 'Pay', detail: 'Click “Pay online”: you leave ImmoTopia for the payment service page.' },
      {
        title: 'Come back',
        detail: 'On return, a banner says whether the payment is confirmed, under verification, failed or cancelled.'
      }
    ],
    consequences: [
      'A confirmed payment settles the ticked calls and a receipt is made available in “My receipts”.',
      'A failed or cancelled payment records no amount: you can try again.',
      'If a payment is already in progress on these calls, “Resume the payment” takes you back to its page.'
    ],
    faq: [
      { q: 'Can I pay two units at once?', a: 'No, a payment covers the calls of a single lot.' },
      {
        q: 'I closed the payment page before the end, what should I do?',
        a: 'Use “Resume the payment” next to the call, or wait: the payment appears as soon as it is confirmed.'
      },
      {
        q: 'Why is the payment “Being checked”?',
        a: 'It is waiting for a decision from the syndic. The remaining amount only changes after validation.'
      }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Charge calls', helpId: 'syndic.portail.appels.tableau' }],
    keywords: ['pay online', 'bank card', 'wave', 'orange money', 'mtn', 'moov', 'fees']
  },
  {
    id: 'syndic.portail.appels.mobile-money',
    kind: 'section',
    title: 'Numbers to pay by mobile money',
    summary:
      'This card gives the mobile money receiving numbers of your condominium and, if there is one, the syndic instruction. It only appears if payment declaration is open.',
    howToRead: {
      notes: [
        'Each number shows the operator, the holder and a “Copy the number” button.',
        '“Instructions from the managing agent” is a free text from the syndic, with “Copy the instructions”.',
        'With several condominiums, the condominium name is added to the title: check that you are paying the right one.'
      ]
    },
    steps: [
      { title: 'Copy the number', detail: 'Choose one of the numbers and copy it.' },
      { title: 'Make the transfer', detail: 'From your phone, send the amount to the copied number.' },
      { title: 'Declare', detail: 'Click “I paid by mobile money” to fill in your payment.' }
    ],
    consequences: ['The transfer alone does not update your account: you must declare it, then the syndic checks it.'],
    faq: [
      { q: 'I do not see this card, why?', a: 'Mobile money payment declaration is not open for your condominium.' },
      {
        q: 'Must I follow the syndic instruction?',
        a: 'Yes, it is the text written by the syndic for payers, for example the reason to enter.'
      },
      {
        q: 'Is the transfer enough to update my account?',
        a: 'No: you must declare it with "I paid by mobile money", then the syndic checks it.'
      }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'I paid by mobile money', helpId: 'syndic.portail.appels.declaration' }],
    keywords: ['mobile money', 'receiving number', 'instruction', 'wave', 'orange', 'mtn', 'moov']
  },
  {
    id: 'syndic.portail.appels.declaration',
    kind: 'section',
    title: 'I paid by mobile money',
    summary:
      'This form declares to the syndic a mobile money transfer you have made. The syndic checks your declaration before posting it to your account.',
    steps: [
      {
        title: 'Attach the screenshot',
        detail:
          'Screenshot of the SMS or confirmation screen, as an image (JPEG, PNG, WebP) or PDF, 5 MB at most. Depending on the condominium, it is mandatory or optional.'
      },
      { title: 'Receiving number', detail: '“Receiving number used” field: the number you sent the money to.' },
      { title: 'Number that paid', detail: '“Number that paid” field: your mobile money number.' },
      { title: 'Amount', detail: '“Amount sent (FCFA)”: the amount in the operator SMS, as a whole number.' },
      {
        title: 'Date and time',
        detail: '“Date and time of the transfer”: within the last 90 days, never in the future.'
      },
      {
        title: 'Reference',
        detail:
          '“Transaction reference”: 4 to 40 characters (letters, digits, hyphen, dot). It is converted to capitals.'
      },
      {
        title: 'Units and calls',
        detail:
          '“Units concerned”: tick the unit(s) (10 at most) and, if you wish, the calls to settle. For several units, enter the share of each.'
      },
      { title: 'Send', detail: 'Add a comment if needed (500 characters), then “Send the declaration”.' }
    ],
    consequences: [
      'Nothing is posted to your account before validation by the syndic.',
      'With no call ticked, the payment is applied to the oldest calls, then as an advance.',
      'The sum of the unit shares must equal the amount sent.',
      'After validation, the receipt or settlement receipt is in “My receipts”; in case of rejection, the reason is shown in “My declarations”.'
    ],
    faq: [
      {
        q: 'What is the automatic reading of the screenshot for?',
        a: 'When available, it suggests values (amount, date, reference, numbers) that you must check: “Read automatically, please check”.'
      },
      {
        q: 'Can I cancel my declaration?',
        a: 'Yes, as long as it is “Being checked”, with “Cancel the declaration” in “My declarations”.'
      },
      {
        q: 'Why can a call not be ticked?',
        a: 'An online payment is in progress or under verification on this call, or it is already declared.'
      },
      {
        q: 'The amount retained differs from mine, why?',
        a: 'The syndic may retain another amount after verification: “Amount withheld” is then shown in “My declarations”.'
      }
    ],
    permissions: { roles: ['Co-owner'], note: 'Only your own units can be declared.' },
    related: [
      { label: 'My declarations', helpId: 'syndic.portail.paiements.declarations' },
      { label: 'Numbers to pay by mobile money', helpId: 'syndic.portail.appels.mobile-money' }
    ],
    keywords: ['declare a payment', 'proof', 'screenshot', 'transaction reference', 'mobile money', 'proof of payment']
  },

  // ------------------------------------------------------------------ Documents
  {
    id: 'syndic.portail.documents',
    kind: 'page',
    title: 'Condominium documents',
    summary:
      'This screen gathers the documents the management shares with you: the condominium rules and the minutes of general meetings.',
    purpose:
      'You find and download these documents for the condominiums where you own a lot. The other management documents (diagnostics, insurance, budgets...) are not shared here.',
    steps: [
      { title: 'Search', detail: 'Type a title or a condominium name, or filter by “Type”.' },
      { title: 'Open the document', detail: '“Download” or “Open” button on the line.' }
    ],
    faq: [
      { q: 'Why is a document “Unavailable”?', a: 'The file is not accessible at the moment: contact your agency.' },
      {
        q: 'Where are the minutes of the last meeting?',
        a: 'They appear here with the type “General meeting minutes” once published by the management.'
      },
      {
        q: 'Why do I not see my invoices or the budget?',
        a: 'These documents remain reserved for the management; only the rules and the minutes are shared.'
      }
    ],
    permissions: {
      roles: ['Co-owner'],
      note: 'Read-only: you see the documents of the condominiums where you own a lot.'
    },
    related: [{ label: 'Documents', helpId: 'syndic.portail.documents.tableau' }],
    keywords: ['documents', 'rules', 'minutes', 'download']
  },
  {
    id: 'syndic.portail.documents.tableau',
    kind: 'table',
    title: 'Documents',
    summary: 'This table lists the documents shared with you. Each line offers a button to download or open it.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Document', description: 'Title of the document.' },
        { key: 'type', label: 'Type', description: 'Co-ownership regulations or General meeting minutes.' },
        { key: 'syndicate', label: 'Co-ownership', description: 'Condominium concerned.' },
        { key: 'createdAt', label: 'Added on', description: 'Date the document was added.' },
        { key: 'action', label: 'Action', description: '“Download”, “Open” (external link) or “Unavailable”.' }
      ],
      notes: ['Filters: search and “Type”. The table can be exported.']
    },
    faq: [
      {
        q: 'What is the difference between “Download” and “Open”?',
        a: '“Download” saves the file on your device; “Open” opens an external link.'
      },
      { q: 'The table is empty.', a: 'No document is available yet for your condominiums.' },
      { q: 'Can I export the list?', a: 'Yes, with the table export.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'General meetings', helpId: 'syndic.portail.assemblees' }],
    keywords: ['documents', 'condominium rules', 'minutes']
  },

  // ------------------------------------------------------------------ General meetings
  {
    id: 'syndic.portail.assemblees',
    kind: 'page',
    title: 'General meetings',
    summary:
      'This screen lists the general meetings of your condominiums: date, place, agenda and, once the meeting is closed, the result of each resolution.',
    purpose:
      'You read the agenda before the meeting, then the results after the vote. When the meeting is held live, you can join it from here.',
    howToRead: {
      statuses: [
        { value: 'PLANNED', label: 'Scheduled', description: 'The date is set, the meeting has not started.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'The meeting is open.' },
        { value: 'COMPLETED', label: 'Closed', description: 'The results of the resolutions are shown.' },
        { value: 'CANCELLED', label: 'Cancelled', description: 'The meeting will not take place.' }
      ],
      notes: [
        'Filters: search, “Status” and “Date”. Each meeting has its card, with the meeting type (ordinary or extraordinary) and the date.'
      ]
    },
    steps: [
      { title: 'Spot the meeting', detail: 'Look for the card of the right date, or filter by status or date.' },
      {
        title: 'Read the agenda',
        detail: 'It is listed in the card; before publication, the screen says “The agenda has not been published yet”.'
      },
      {
        title: 'Join live',
        detail: 'If the “Join the live meeting” button appears, click it when the meeting starts.'
      },
      { title: 'See the results', detail: 'After closing, the card details each resolution.' }
    ],
    faq: [
      {
        q: 'Why does the “Join the live meeting” button not appear?',
        a: 'It only appears from the day before the meeting until it is closed, and only if your agency has the live option.'
      },
      { q: 'Can I see how the others voted?', a: 'No, you see the totals and your own vote, not those of other lots.' },
      { q: 'Where are the minutes?', a: 'In “Documents”, once published by the management.' }
    ],
    permissions: {
      roles: ['Co-owner'],
      note: 'Read-only. The “Join the live meeting” button only appears if the agency has the “Live AG and video” option.'
    },
    related: [
      { label: 'Card of a meeting', helpId: 'syndic.portail.assemblees.carte' },
      { label: 'Join the live meeting', helpId: 'syndic.portail.assemblees.direct' },
      { label: 'Resolution results', helpId: 'syndic.portail.assemblees.resultats' },
      { label: 'Condominium documents', helpId: 'syndic.portail.documents' }
    ],
    keywords: ['general meeting', 'agm', 'notice', 'agenda', 'vote', 'resolutions']
  },
  {
    id: 'syndic.portail.assemblees.carte',
    kind: 'section',
    title: 'Card of a meeting',
    summary:
      'Each card presents a meeting: its type and date as the title, its status, the condominium, the place and the agenda.',
    howToRead: {
      notes: [
        'The title says “Ordinary general meeting” or “Extraordinary general meeting”, with the date and time.',
        '“Venue” shows “Not specified” if no place has been entered.',
        'The results only appear when the meeting is “Closed”.'
      ]
    },
    faq: [
      { q: 'Why is the agenda empty?', a: 'The management has not published it yet.' },
      { q: 'What is an extraordinary meeting?', a: 'A meeting called outside the ordinary annual meeting.' },
      { q: 'Why is a meeting “Cancelled”?', a: 'The management cancelled it; the screen does not give the reason.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Resolution results', helpId: 'syndic.portail.assemblees.resultats' }],
    keywords: ['card', 'meeting', 'place', 'agenda']
  },
  {
    id: 'syndic.portail.assemblees.direct',
    kind: 'section',
    title: 'Join the live meeting',
    summary:
      'This button gives you your personal link to follow the meeting live. It only appears if the agency has the “Live AG and video” option.',
    steps: [
      {
        title: 'Wait for the right moment',
        detail: 'The button is offered from the day before the meeting, while it is “Scheduled” or “In progress”.'
      },
      { title: 'Click', detail: '“Join the live meeting”: your personal link is prepared, then you are sent to it.' }
    ],
    consequences: [
      'You leave the co-owner space for the live meeting page.',
      'In case of a problem, an error message appears under the button.'
    ],
    faq: [
      {
        q: 'I do not see the button.',
        a: 'Check that the meeting is planned or in progress, that it is within one day of its date, and that your agency has the live option.'
      },
      { q: 'Is the link personal?', a: 'Yes, it is issued for you at the moment of the click.' },
      { q: 'The button shows an error.', a: 'Try again a little later, then contact your agency.' }
    ],
    permissions: {
      roles: ['Co-owner'],
      note: 'Reserved for agencies with the “Live AG and video” option; without it, the button does not appear.'
    },
    related: [{ label: 'General meetings', helpId: 'syndic.portail.assemblees' }],
    keywords: ['live meeting', 'video', 'join', 'personal link']
  },
  {
    id: 'syndic.portail.assemblees.resultats',
    kind: 'section',
    title: 'Resolution results',
    summary:
      'After closing, each resolution is detailed: result, majority rule, total shares for, against and abstaining, and your vote.',
    howToRead: {
      statuses: [
        { value: 'APPROVED', label: 'Adopted', description: 'The resolution is approved.' },
        { value: 'REJECTED', label: 'Rejected', description: 'The resolution is refused.' },
        { value: 'DEFERRED', label: 'Postponed', description: 'The resolution is postponed.' },
        { value: 'NONE', label: 'No vote', description: 'No vote was recorded.' }
      ],
      notes: [
        '“Rule”: Article 24 (simple majority of the shares cast), Article 25 (absolute majority of the shares), Article 26 (double majority) or Unanimity.',
        '“Shares”: “For”, “Against” and “Abstention”, out of the total shares.',
        '“Your vote”: the vote of each of your units, for example “Unit 12: For”.'
      ]
    },
    faq: [
      { q: 'Why do I not see the results?', a: 'They only appear once the meeting is “Closed”.' },
      { q: 'Why is “Your vote” missing?', a: 'No vote is recorded for your units on this resolution.' },
      {
        q: 'What does “No resolution was put to the vote” mean?',
        a: 'The meeting is closed but has no resolution to show.'
      }
    ],
    permissions: { roles: ['Co-owner'], note: 'You see the totals and only your own vote.' },
    related: [{ label: 'General meetings', helpId: 'syndic.portail.assemblees' }],
    keywords: ['results', 'vote', 'majority', 'shares', 'approved']
  },

  // ------------------------------------------------------------------ My payments
  {
    id: 'syndic.portail.paiements',
    kind: 'page',
    title: 'My payments',
    summary:
      'This screen lists your charge payments, how they were applied to the calls and the receipts that result. Below, “My declarations” tracks your declared mobile money payments.',
    purpose:
      'You check that a payment has been taken into account, on which calls, and whether you have an advance left.',
    howToRead: {
      notes: [
        'At the top, an “Available advance — unit …” card appears for each unit that has an advance.',
        'Filters: search, “Unit” and “Financial year” (current year and the previous five).',
        '“My declarations” only appears if you have already declared a payment.'
      ]
    },
    steps: [
      { title: 'Find a payment', detail: 'Search a reference or filter by unit and year.' },
      { title: 'See the detail', detail: '“Detail” button: allocations to calls and documents issued.' },
      { title: 'Follow a declaration', detail: 'In “My declarations”, read the status of each declared payment.' }
    ],
    faq: [
      {
        q: 'My payment does not appear.',
        a: 'A declared payment is only posted to your account after validation by the syndic; meanwhile, it is in “My declarations”.'
      },
      {
        q: 'What does “Remaining advance” mean?',
        a: 'The part of the payment that settled no call and remains available on the lot.'
      },
      { q: 'Where is my receipt?', a: 'In the payment detail, and in “My receipts”.' }
    ],
    permissions: {
      roles: ['Co-owner'],
      note: 'Read-only; only cancelling a declaration still “Being checked” is possible.'
    },
    related: [
      { label: 'Payments', helpId: 'syndic.portail.paiements.tableau' },
      { label: 'Payment detail', helpId: 'syndic.portail.paiements.detail' },
      { label: 'My declarations', helpId: 'syndic.portail.paiements.declarations' },
      { label: 'My receipts', helpId: 'syndic.portail.quittances' }
    ],
    keywords: ['payments', 'settlements', 'advance', 'receipt', 'payment history']
  },
  {
    id: 'syndic.portail.paiements.tableau',
    kind: 'table',
    title: 'Payments',
    summary: 'This table lists each payment recorded on your lots. The “Detail” button shows what it was used for.',
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date', description: 'Date of the payment.' },
        { key: 'lot', label: 'Unit', description: 'Unit concerned.' },
        { key: 'amount', label: 'Amount', description: 'Amount of the payment.' },
        { key: 'method', label: 'Method', description: 'Payment method.' },
        { key: 'reference', label: 'Reference', description: 'Payment reference.' },
        {
          key: 'remainingAdvance',
          label: 'Remaining advance',
          description: 'Part of the payment left as an advance after allocation.'
        },
        { key: 'detail', label: 'Detail', description: 'Opens the payment detail.' }
      ],
      notes: ['The table can be exported with your filters.']
    },
    faq: [
      { q: 'Why is “Remaining advance” at 0?', a: 'The whole payment was used to settle calls.' },
      { q: 'How do I filter by year?', a: 'Use the “Financial year” criterion.' },
      { q: 'The table is empty.', a: 'No payment has been recorded yet for your lots.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Payment detail', helpId: 'syndic.portail.paiements.detail' }],
    keywords: ['payments', 'settlements', 'reference', 'payment method']
  },
  {
    id: 'syndic.portail.paiements.detail',
    kind: 'section',
    title: 'Payment detail',
    summary:
      'This window shows how a payment was applied to your charge calls, the advance if any and the documents issued.',
    howToRead: {
      columns: [
        { key: 'period', label: 'Period', description: 'Period of the settled call.' },
        { key: 'dueDate', label: 'Due date', description: 'Due date of the call.' },
        { key: 'amount', label: 'Amount', description: 'Amount applied to this call.' },
        {
          key: 'source',
          label: 'Source',
          description: '“This payment” or “Existing advance” (advance from a previous payment).'
        }
      ],
      notes: [
        'With no allocation, the whole payment remains as an advance on the lot.',
        '“Documents” lists the receipts and settlement receipts to download, with “Arabic translation”.'
      ]
    },
    faq: [
      { q: 'What is “Existing advance”?', a: 'An advance from an earlier payment, used to complete this payment.' },
      { q: 'Why is no document shown?', a: 'No receipt or settlement receipt has been issued yet for this payment.' },
      { q: 'What is “Arabic translation” for?', a: 'It downloads the document translated into Arabic.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'My receipts', helpId: 'syndic.portail.quittances' }],
    keywords: ['allocation', 'advance', 'receipt', 'payment detail']
  },
  {
    id: 'syndic.portail.paiements.declarations',
    kind: 'section',
    title: 'My declarations',
    summary:
      'This section tracks the mobile money payments you declared to the syndic. Nothing is posted to your account before validation.',
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Payment date', description: 'Date and time of the transfer.' },
        { key: 'lots', label: 'Unit(s)', description: 'The units concerned.' },
        { key: 'syndicate', label: 'Co-ownership', description: 'Condominium concerned.' },
        { key: 'receiving', label: 'Receiving number', description: 'Operator and number that received the money.' },
        { key: 'reference', label: 'Reference', description: 'Transaction reference.' },
        {
          key: 'amount',
          label: 'Declared amount',
          description: 'Amount you declared, and “Amount withheld” if it differs.'
        },
        { key: 'status', label: 'Status', description: 'Progress of the declaration.' }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'Being checked',
          description: 'The syndic is checking; the amount due on your calls does not change.'
        },
        {
          value: 'APPROVED',
          label: 'Approved',
          description: 'The payment is posted to your account; receipt or settlement receipt in “My receipts”.'
        },
        {
          value: 'REJECTED',
          label: 'Rejected',
          description:
            'A reason is shown: Payment not found, Amount does not match, Reference already used, Wrong receiving number or Other.'
        },
        { value: 'CANCELED', label: 'Cancelled', description: 'Declaration cancelled.' }
      ],
      notes: [
        'Filters: search (reference, unit) and “Status”. The section only appears if you have declared at least one payment.'
      ]
    },
    steps: [
      { title: 'Read the status', detail: 'A payment “Being checked” is waiting for the syndic.' },
      {
        title: 'Cancel if needed',
        detail: '“Cancel the declaration” then confirm: possible only while it is under verification.'
      }
    ],
    consequences: [
      'Cancelling a declaration is final: if you did pay, declare it again.',
      'A rejected declaration has no effect on your account; read the reason and the syndic note.'
    ],
    faq: [
      {
        q: 'How long does the verification take?',
        a: 'The screen gives no delay: the syndic processes declarations at its own pace.'
      },
      {
        q: 'My declaration is rejected, what should I do?',
        a: 'Read the reason, fix the error and declare again, or contact your agency.'
      },
      { q: 'Why is this section missing?', a: 'You have not declared any payment yet.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'I paid by mobile money', helpId: 'syndic.portail.appels.declaration' }],
    keywords: ['declarations', 'mobile money', 'validation', 'rejection', 'proof']
  },

  // ------------------------------------------------------------------ My receipts
  {
    id: 'syndic.portail.quittances',
    kind: 'page',
    title: 'My receipts',
    summary:
      'This screen gathers the payment receipts and charge settlement receipts issued for your lots. You download them as PDF.',
    purpose:
      'You keep proof of your payments. A “Receipt” corresponds to a payment; a “Settlement receipt” corresponds to a settled period.',
    steps: [
      {
        title: 'Filter',
        detail: 'Search a number, a unit or a period, or filter by “Unit”, “Document type” and “Period”.'
      },
      { title: 'Download', detail: '“Download” button on the line, or “Arabic translation” for the Arabic version.' }
    ],
    faq: [
      {
        q: 'What is the difference between a receipt and a settlement receipt?',
        a: 'The receipt certifies a payment; the settlement receipt certifies that a charge period is settled.'
      },
      {
        q: 'My receipt does not appear after a payment.',
        a: 'It may arrive a few moments after confirmation, or after a declaration is validated.'
      },
      { q: 'Can I get the document in Arabic?', a: 'Yes, with the “Arabic translation” button.' }
    ],
    permissions: { roles: ['Co-owner'], note: 'Read-only: download of your own documents.' },
    related: [{ label: 'Receipts and settlement receipts', helpId: 'syndic.portail.quittances.tableau' }],
    keywords: ['settlement receipts', 'receipts', 'proof of payment', 'pdf']
  },
  {
    id: 'syndic.portail.quittances.tableau',
    kind: 'table',
    title: 'Receipts and settlement receipts',
    summary: 'This table lists the documents issued for your units, with their number, amount and issue date.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Number', description: 'Document number.' },
        { key: 'kind', label: 'Type', description: 'Receipt or Settlement receipt.' },
        { key: 'lot', label: 'Unit', description: 'Unit concerned.' },
        { key: 'period', label: 'Period', description: 'Period covered, if any.' },
        { key: 'amount', label: 'Amount', description: 'Amount of the document.' },
        { key: 'issuedAt', label: 'Issued on', description: 'Issue date.' },
        { key: 'action', label: 'Action', description: '“Download” and “Arabic translation”.' }
      ],
      notes: ['The table can be exported with your filters.']
    },
    faq: [
      {
        q: 'Why does the “Period” column show “—”?',
        a: 'The document is not tied to a period, for example a payment receipt.'
      },
      { q: 'The download fails.', a: 'A message appears: try again, then contact your agency.' },
      { q: 'The table is empty.', a: 'No document has been issued yet for your lots.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'My payments', helpId: 'syndic.portail.paiements' }],
    keywords: ['settlement receipts', 'receipts', 'number', 'period']
  },

  // ------------------------------------------------------------------ Monthly tracking
  {
    id: 'syndic.portail.suivi',
    kind: 'page',
    title: 'Monthly tracking',
    summary:
      'This screen shows, month by month and for one unit, whether your charges are settled, partial, due or late. Choose the unit and the fiscal year.',
    purpose:
      'At a glance you see the state of your twelve months, the total due for the year, what you have settled and the advance available.',
    howToRead: {
      statuses: [
        { value: 'PAID', label: 'Paid', description: 'The month is settled.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Only part is settled.' },
        { value: 'DUE', label: 'Due', description: 'The month is to be settled.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'The due date has passed and the month is not settled.' },
        { value: 'NONE', label: '—', description: 'No call that month.' }
      ],
      notes: [
        'Three amounts at the top: “Due for the year”, “Paid” and “Available advance”.',
        'A month before your acquisition is marked “·” with the tooltip “Before your acquisition”.'
      ]
    },
    steps: [
      { title: 'Choose the unit', detail: '“Unit” list (the first unit is chosen by default).' },
      {
        title: 'Choose the year',
        detail: '“Financial year” list: the first year offered is not earlier than your acquisition.'
      },
      { title: 'Read the grid', detail: 'Hover a month to see the amount due and settled.' }
    ],
    faq: [
      {
        q: 'What does a month marked “·” mean?',
        a: 'This month is before your acquisition of the unit: it is not shown.'
      },
      { q: 'Can I see several units together?', a: 'No, the grid shows one unit at a time.' },
      { q: 'Where do I pay a late month?', a: 'In “My service charge calls”.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [
      { label: 'Twelve-month grid', helpId: 'syndic.portail.suivi.grille' },
      { label: 'My charge calls', helpId: 'syndic.portail.appels' }
    ],
    keywords: ['monthly tracking', 'month', 'fiscal year', 'settled', 'late']
  },
  {
    id: 'syndic.portail.suivi.grille',
    kind: 'section',
    title: 'Twelve-month grid',
    summary:
      'The grid shows one month per column, from “Jan.” to “Dec.”, with a colour and a label according to the state of the month. A legend at the bottom recalls the colours.',
    howToRead: {
      statuses: [
        { value: 'PAID', label: 'Paid', description: 'Month settled.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Partial payment.' },
        { value: 'DUE', label: 'Due', description: 'Month to be settled.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'Due date passed.' }
      ],
      notes: ['The tooltip of each month gives the amount due and the amount settled.']
    },
    faq: [
      { q: 'Why is a month empty?', a: 'No call was issued that month.' },
      { q: 'How do I read the amounts?', a: 'Hover the month: the tooltip shows “due” and “paid”.' },
      {
        q: 'What does the advance available represent?',
        a: 'The sums paid in addition to the calls, remaining available on the lot.'
      }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'Monthly tracking', helpId: 'syndic.portail.suivi' }],
    keywords: ['grid', 'month', 'legend', 'colours']
  },

  // ------------------------------------------------------------------ My condominium
  {
    id: 'syndic.portail.copropriete',
    kind: 'page',
    title: 'My condominium',
    summary:
      'This screen presents your condominium: its identity, your units, and the contact details of who issues your documents and who manages the condominium.',
    purpose:
      'You know whom to contact and you find the references of your building. If you have units in several condominiums, choose the one to display.',
    steps: [
      { title: 'Choose the condominium', detail: '“Co-ownership” list, shown only if you have several.' },
      { title: 'Read the identity', detail: 'Address, registration number, cadastral reference and number of lots.' },
      { title: 'Find your contact', detail: '“Document issuer” and “Co-ownership manager” cards.' }
    ],
    faq: [
      {
        q: 'Who is the document issuer?',
        a: 'The principal of the condominium if it has one, otherwise the agency; its details are on its documents.'
      },
      { q: 'Why is no manager shown?', a: 'No manager is assigned: your contact is then the document issuer.' },
      { q: 'Why are some lines missing?', a: 'Lines with no value (address, phone, e-mail) are hidden.' }
    ],
    permissions: { roles: ['Co-owner'], note: 'Read-only.' },
    related: [{ label: 'Contact details', helpId: 'syndic.portail.copropriete.contacts' }],
    keywords: ['condominium', 'identity', 'syndic', 'manager', 'contact']
  },
  {
    id: 'syndic.portail.copropriete.contacts',
    kind: 'section',
    title: 'Contact details',
    summary:
      'These two cards give the name, address, phone and e-mail of the issuer of your documents and of the condominium manager.',
    howToRead: {
      notes: [
        '“Document issuer”: the one whose name appears on your call notices, receipts and settlement receipts (the principal, otherwise the agency).',
        '“Co-ownership manager”: the assigned manager; otherwise the screen refers you to the issuer.'
      ]
    },
    faq: [
      {
        q: 'Whom should I contact about my account?',
        a: 'The document issuer or the condominium manager, depending on what is shown.'
      },
      { q: 'Are logos mandatory?', a: 'No, a logo only appears if it has been added.' },
      { q: 'Can I change this information?', a: 'No, it is read-only.' }
    ],
    permissions: { roles: ['Co-owner'] },
    related: [{ label: 'My condominium', helpId: 'syndic.portail.copropriete' }],
    keywords: ['contact details', 'issuer', 'manager', 'phone', 'e-mail']
  }
];

export default entries;
