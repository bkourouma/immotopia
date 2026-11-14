import type { HelpEntry } from '../../../types';

/** « locataire » zone of the « portails » module (en): the tenant portal. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Home
  {
    id: 'portails.locataire.accueil',
    kind: 'page',
    title: 'Tenant portal home',
    summary:
      'Your tenant dashboard: your lease, your late payments, your next installment, your security deposit, your latest payments and your incident requests. It is the starting screen to see where you stand.',
    purpose:
      'The portal lets you follow your rental without calling the agency: how much you owe, when, what you have already paid and how your repair requests are going. The figures come from the agency that manages your lease.',
    steps: [
      {
        title: 'Check late payments',
        detail: 'The « Instalment arrears » card counts the unpaid installments whose due date has passed.'
      },
      {
        title: 'Spot the next installment',
        detail:
          'The « Next instalment » card shows the oldest unpaid installment, with its remaining amount and its date.'
      },
      {
        title: 'Pay',
        detail:
          'Open « Pay » in the menu. The « Pay online » button on this screen only appears if your agency has enabled online payment and an amount is still due.'
      },
      { title: 'Check your payments', detail: 'Your 5 latest successful payments are listed in « Recent payments ».' }
    ],
    consequences: [
      'This screen is read-only: nothing you do here changes your lease or your payments.',
      'If you have several active leases, the « Your leases » card gives the balance and late payments of each one, and the figures in the other cards are totals across all of them.'
    ],
    faq: [
      {
        q: 'Why is the « Pay online » button missing?',
        a: "It only appears if your agency has enabled online payment and you still have an amount to pay. Otherwise, use the « Pay » screen to see the agency's payment details and declare your payment."
      },
      {
        q: 'What does the amount in « Next instalment » mean?',
        a: 'It is what remains to be paid on the oldest unpaid installment. If you have already paid part of it, the « Balance due » line shows the amount already paid out of the total.'
      },
      {
        q: 'A payment I just made is not showing. Is that normal?',
        a: 'Yes, as long as the agency has not recorded it. A declared payment stays « Awaiting validation » in the « Pay » screen and does not change your balance before it is validated.'
      }
    ],
    related: [
      { label: 'Pay or declare a payment', helpId: 'portails.locataire.paiements' },
      { label: 'My lease', helpId: 'portails.locataire.bail' },
      { label: 'Report an incident', helpId: 'portails.locataire.incidents' }
    ],
    keywords: ['dashboard', 'home', 'balance', 'late', 'rent', 'installment', 'tenant', 'portal'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'locataire-retard',
          title: 'Your late payments',
          description:
            'This number counts your unpaid installments whose due date has passed. It is 0 when you are up to date.'
        },
        {
          target: 'locataire-prochaine-echeance',
          title: 'The next installment to pay',
          description:
            'This is the oldest unpaid installment, with its remaining amount. To pay it, open « Pay » in the menu.'
        },
        {
          target: 'locataire-paiements-recents',
          title: 'Check the result',
          description: 'Once the payment is confirmed, it appears in this list of your 5 latest payments.'
        }
      ]
    }
  },
  {
    id: 'portails.locataire.accueil.indicateurs',
    kind: 'section',
    title: 'Home indicators',
    summary: 'Three cards sum up your situation: late installments, the next installment and your security deposit.',
    howToRead: {
      notes: [
        'Instalment arrears: number of unpaid installments whose date has passed. The number turns red as soon as there is one.',
        'Next instalment: the oldest unpaid installment (upcoming, partly paid or late). The amount shown is the remaining amount, followed by the date and the period. When part has already been paid, a « Balance due » line shows the amount paid out of the total.',
        'Security deposit: the amount already paid, followed by the total amount expected (for example 300 000 FCFA / 450 000 FCFA). « Deposit paid » appears when it is complete; « No deposit configured » if no deposit is planned on your lease.',
        'When no installment is left to pay, the « Next instalment » card shows 0 and « No upcoming instalment ».'
      ]
    },
    faq: [
      {
        q: 'Why would an upcoming installment count as « late »?',
        a: 'It does not: only installments whose date has passed are counted as late. An installment still to come appears only in « Next instalment ».'
      },
      {
        q: 'Where can I see the details of my security deposit?',
        a: 'The « Security deposit » screen of the portal gives the amount paid, held, refunded and the history of movements.'
      },
      {
        q: 'Does this amount include service charges?',
        a: 'The remaining amount covers the whole installment as the agency issued it: rent, charges and any fees. Open « Details » in the « Pay » screen to see the breakdown.'
      }
    ],
    related: [
      { label: 'Security deposit details', helpId: 'portails.locataire.caution' },
      { label: 'Installments and payments', helpId: 'portails.locataire.paiements.echeances' }
    ],
    keywords: ['late', 'next installment', 'security deposit', 'deposit', 'remaining amount']
  },
  {
    id: 'portails.locataire.accueil.bail',
    kind: 'section',
    title: 'Lease information (home)',
    summary:
      'A reminder of your lease: the property address, the monthly rent, the charges, the start and end dates and the status.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Your lease is in progress.' },
        { value: 'DRAFT', label: 'Draft', description: 'The lease is prepared but not yet in force.' },
        { value: 'SUSPENDED', label: 'Suspended', description: 'The agency has put the lease on hold.' },
        { value: 'ENDED', label: 'Completed', description: 'The lease has reached its end.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The lease has been canceled.' }
      ],
      notes: [
        '« Not set » in place of the end date means no end date is recorded on your lease.',
        "If you have several active leases, a « Your leases » card is shown above, with each lease's number, address, balance and number of late installments."
      ]
    },
    faq: [
      {
        q: 'Where can I see all the terms of my lease?',
        a: 'Open « My lease » in the menu: you will find the number, the parties, the deposit, the billing frequency and your documents.'
      },
      {
        q: 'Some information is wrong. What should I do?',
        a: 'You cannot correct it yourself: contact your agency, which manages the data of your lease.'
      },
      {
        q: 'What does « Suspended » mean?',
        a: 'The agency has put your lease on hold. It can reactivate or end it; ask the agency for details.'
      }
    ],
    related: [{ label: 'My lease', helpId: 'portails.locataire.bail' }],
    keywords: ['lease', 'address', 'monthly rent', 'charges', 'lease status']
  },
  {
    id: 'portails.locataire.accueil.paiements',
    kind: 'section',
    title: 'Recent payments',
    summary: 'The list of your 5 latest successful payments, with the amount, the payment method and the date.',
    howToRead: {
      notes: [
        'Only payments recorded as successful appear here; a payment that you declared but the agency has not yet validated is not listed.',
        'The method is shown next to the amount: Cash, Bank transfer, Cheque, Mobile Money, Direct debit, Card or Other.',
        'For the full history, open the « Pay » screen, « Payment history » tab.'
      ]
    },
    faq: [
      {
        q: 'I paid but my payment does not appear.',
        a: 'If you declared it, it is waiting for the agency to validate it. You will find it in « My declarations » of the « Pay » screen.'
      },
      {
        q: 'Why only 5 payments?',
        a: 'This screen only shows the five most recent ones. The full history is in the « Pay » screen.'
      },
      {
        q: 'Where do I find my rent receipt?',
        a: 'The documents the agency has issued for your lease are in the « Documents » card of the « My lease » screen.'
      }
    ],
    related: [{ label: 'Payment history', helpId: 'portails.locataire.paiements.historique' }],
    keywords: ['recent payments', 'latest payments', 'history']
  },
  {
    id: 'portails.locataire.accueil.maintenance',
    kind: 'section',
    title: 'Maintenance summary',
    summary: 'The number of your incident requests, in total and by progress status.',
    howToRead: {
      notes: [
        'Total: all your requests, including canceled ones.',
        'Open: requests with the « Reported » status, not yet taken on.',
        'In progress: requests with the « In progress » or « Assigned » status.',
        'Resolved: requests with the « Resolved » status.'
      ]
    },
    faq: [
      {
        q: 'How do I create a request?',
        a: 'Open « Incidents » in the menu, then « New request ».'
      },
      {
        q: 'Why is Total larger than the sum of the other three?',
        a: '« Cancelled » requests are counted in the total but in none of the other three boxes.'
      },
      {
        q: 'Where do I follow a specific request?',
        a: "In the « Incidents » screen: « Details » opens the file with the agency's comments."
      }
    ],
    related: [{ label: 'Incidents', helpId: 'portails.locataire.incidents' }],
    keywords: ['maintenance', 'incident', 'repair', 'ticket', 'breakdown']
  },

  // ---------------------------------------------------------------- My lease
  {
    id: 'portails.locataire.bail',
    kind: 'page',
    title: 'My lease',
    summary:
      'All the information about your rental contract: the property, the dates, the amounts, the people concerned and your documents.',
    purpose:
      'This screen repeats what the agency has recorded for your lease. You can reread it at any time and download your documents (contract, receipts).',
    steps: [
      {
        title: 'Choose the lease',
        detail: 'If you have several active leases, a selector at the top of the screen lets you switch between them.'
      },
      {
        title: 'Read the information',
        detail:
          'The « Lease details » card gives the number, the address, the dates, the rent, the charges and the security deposit.'
      },
      {
        title: 'See the people',
        detail: 'The « Main tenant », « Owner » and « Co-tenants » cards remind you who is concerned by the lease.'
      },
      {
        title: 'Download a document',
        detail: 'In the « Documents » card, click « Download » to the right of the document you want.'
      }
    ],
    consequences: [
      'This screen is read-only: you cannot change anything. To correct some information, contact your agency.',
      'A document whose « Download » button is greyed out has no file available for now.'
    ],
    faq: [
      {
        q: 'I want to change some information on my lease.',
        a: 'Only the agency can modify a lease. Contact it.'
      },
      {
        q: 'What does « Not set » mean for the end date?',
        a: 'No end date is recorded on your lease.'
      },
      {
        q: 'I do not see the « Owner » or « Co-tenants » card.',
        a: 'These cards only appear if the agency has recorded an owner or co-tenants on your lease.'
      }
    ],
    related: [
      { label: 'Your documents', helpId: 'portails.locataire.bail.documents' },
      { label: 'Security deposit', helpId: 'portails.locataire.caution' }
    ],
    keywords: ['lease', 'contract', 'rental', 'rent', 'address', 'owner', 'co-tenant']
  },
  {
    id: 'portails.locataire.bail.informations',
    kind: 'section',
    title: 'Lease information',
    summary: 'The data of your contract: number, address, status, dates, rent, charges, deposit and billing rhythm.',
    howToRead: {
      notes: [
        'Lease number and Lease name: the name only appears if it is filled in.',
        'Status: Active, Draft, Suspended, Completed or Cancelled.',
        'Move-in date: a dash (-) means no date is recorded.',
        'Monthly rent, Charges and Security deposit: amounts in FCFA as set in the lease.',
        'Billing frequency: Monthly, Quarterly, Half-yearly or Yearly.',
        'Due day: the day of the month your installments are due, for example « The 5th of each month ».'
      ]
    },
    faq: [
      {
        q: 'Does the rent shown include the charges?',
        a: 'No: the monthly rent and the charges are two separate lines. The detail of each installment is visible in the « Pay » screen with « Details ».'
      },
      {
        q: 'Why is the lease selector missing?',
        a: 'It only appears if you have several active leases.'
      },
      {
        q: 'Who can change this information?',
        a: 'Only the agency.'
      }
    ],
    related: [{ label: 'My lease', helpId: 'portails.locataire.bail' }],
    keywords: ['lease number', 'end date', 'due day', 'billing frequency', 'security deposit']
  },
  {
    id: 'portails.locataire.bail.parties',
    kind: 'section',
    title: 'Tenant, owner and co-tenants',
    summary:
      'The people linked to your lease: the main tenant, the owner and any co-tenants, with their e-mail address.',
    howToRead: {
      notes: [
        'Main tenant: the person the lease is made out to. « Not provided » means that the name is missing from the file.',
        'Owner: shown only if the agency has recorded it on the lease.',
        'Co-locataires: shown only if there are any.'
      ]
    },
    faq: [
      {
        q: 'How do I add a co-tenant?',
        a: 'You cannot do it from the portal: contact your agency.'
      },
      {
        q: 'My name is misspelled.',
        a: 'Contact the agency to have your record corrected.'
      },
      {
        q: "Why is the owner's e-mail shown?",
        a: "The e-mail recorded on the owner's account is shown as is on this card, with the name."
      }
    ],
    related: [{ label: 'My lease', helpId: 'portails.locataire.bail' }],
    keywords: ['co-tenant', 'owner', 'main tenant', 'landlord']
  },
  {
    id: 'portails.locataire.bail.documents',
    kind: 'section',
    title: 'Lease documents',
    summary: 'The documents of your lease, sorted by type, with their issue date and a button to download them.',
    howToRead: {
      notes: [
        'Possible types: Lease agreement, Amendment, Rent receipt, Settlement receipt, Deposit receipt, Statement, Other. The number next to the type is the number of documents.',
        'Without a title or a number, a document is named « Document » followed by a short code.',
        '« Date unavailable » means the agency has not filled in an issue date.',
        'Documents canceled by the agency are not shown.'
      ]
    },
    steps: [
      {
        title: 'Download',
        detail: 'Click « Download » to the right of the document; the file is saved on your device.'
      }
    ],
    faq: [
      {
        q: 'The « Download » button is greyed out.',
        a: 'No file is available for this document for now. Contact your agency.'
      },
      {
        q: 'I cannot find my receipt.',
        a: 'It appears here once the agency has issued it for your lease. If it is missing, ask the agency for it.'
      },
      {
        q: 'Can I search for a document?',
        a: 'Yes, in the « Documents » screen of the portal, a search by name, number or type is available.'
      }
    ],
    related: [{ label: 'Documents screen', helpId: 'portails.locataire.documents' }],
    keywords: ['receipt', 'lease contract', 'addendum', 'download']
  },

  // ---------------------------------------------------------------- Pay
  {
    id: 'portails.locataire.paiements',
    kind: 'page',
    title: 'Payments and installments',
    summary:
      'The screen where you follow your rent installments, pay online if your agency offers it, declare a payment already made and view your history and statement.',
    purpose:
      'An installment is a sum to pay on a given date (rent, charges, fees). Here you see what is paid, due or late, and you tell the agency when you have paid.',
    steps: [
      {
        title: 'See how to pay',
        detail: 'If the agency has set it up, the « Pay the agency » card gives its payment details.'
      },
      {
        title: 'Choose how to pay',
        detail:
          'Online: tick the installments then « Pay online » (if available). Offline: pay yourself, then click « Declare a payment ».'
      },
      {
        title: 'Follow your installments',
        detail:
          'The « Instalments » tab lists each period with its status; « Details » opens the breakdown of the installment.'
      },
      {
        title: 'Follow your declarations',
        detail:
          '« My declarations » shows whether the agency has validated, rejected or not yet processed each declaration.'
      },
      {
        title: 'Reread your payments',
        detail: 'The « Payment history » and « My statement » tabs keep the record of everything that has been paid.'
      }
    ],
    consequences: [
      'The « Pay » button on a row charges nothing: it opens the form to declare a payment you have already sent.',
      'A declaration is not a validated payment: your balance only changes after the agency validates it.',
      "Online payment sends you to the operator's secure payment page, then brings you back to this screen where a banner follows the confirmation."
    ],
    faq: [
      {
        q: 'What is the difference between « Pay online » and « Declare a payment »?',
        a: 'With « Pay online », you pay on the secure page offered by the agency. With « Declare a payment », you have already paid by another means (Mobile Money, cash, cheque, transfer) and you report it to the agency.'
      },
      {
        q: 'Why can I not tick an installment?',
        a: 'Only installments that are « Due », « Overdue » or « Partial » with an amount left to pay can be ticked, and they must all belong to the same lease.'
      },
      {
        q: 'My payment went through but my balance is unchanged.',
        a: 'For a declaration, this is normal: the agency must check it first. For an online payment, wait for the confirmation shown in the banner.'
      },
      {
        q: 'I have no « Pay online » button.',
        a: 'Your agency has not enabled it. Pay using the details given by the agency, then declare your payment.'
      }
    ],
    related: [
      { label: 'Installment list', helpId: 'portails.locataire.paiements.echeances' },
      { label: 'Declare a payment', helpId: 'portails.locataire.paiements.declaration' },
      { label: 'My declarations', helpId: 'portails.locataire.paiements.declarations' },
      { label: 'Portal home', to: '/tenant' }
    ],
    keywords: [
      'pay',
      'payment',
      'rent',
      'installment',
      'mobile money',
      'orange money',
      'wave',
      'mtn',
      'moov',
      'declare',
      'statement'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'paiements-declarer',
          title: 'Declare a payment',
          description:
            'After paying by Mobile Money, cash, cheque or transfer, this button opens the form to inform the agency.'
        },
        {
          target: 'paiements-tableau',
          title: 'Your installments',
          description:
            'Each row is an installment. « Pay » opens the declaration for this installment and « Details » shows its breakdown.'
        },
        {
          target: 'paiements-en-ligne',
          title: 'Pay online',
          description:
            'Tick one or more installments of the same lease in the table: the total appears here, then « Pay online » opens the payment page.'
        },
        {
          target: 'paiements-declarations',
          title: 'Follow your declarations',
          description:
            'Unfold this section to see whether the agency has validated your declaration, and cancel it while it is pending.'
        }
      ]
    }
  },
  {
    id: 'portails.locataire.paiements.payer-agence',
    kind: 'section',
    title: 'Pay the agency',
    summary:
      "The agency's payment details (institution, alias, beneficiary name), with the steps to pay from your app.",
    purpose:
      'This card only appears if the agency has recorded at least one active receiving account. ImmoTopia generates no QR code and fills in no amount for you.',
    howToRead: {
      notes: [
        'Institution: the name of the bank or operator; « Scan with » lists the apps that read the QR code, if there is one.',
        'Alias to enter: what you type in your app. « Copy the alias » copies it for you.',
        'Expected beneficiary name: the name that must be displayed before you confirm. If it differs, do not pay.',
        'Suggested payment reference to copy: generally « Rent » followed by the period of your oldest unpaid installment; « Copy the reference » copies it.'
      ]
    },
    steps: [
      { title: 'Open your app', detail: 'Open your payment or banking app.' },
      { title: 'Scan or type', detail: 'Scan the QR code or type the alias.' },
      { title: 'Enter the amount', detail: 'Enter the amount to pay yourself.' },
      { title: 'Check the name', detail: 'The name displayed must match the expected beneficiary name.' },
      {
        title: 'Confirm then declare',
        detail: 'Confirm the payment, then click « I have paid: declare my payment » to inform the agency.'
      }
    ],
    consequences: [
      'An instant payment is irrevocable: it cannot be canceled.',
      'Paying here does not credit your account by itself: the agency must record your payment, which is why you must declare it.'
    ],
    faq: [
      {
        q: 'Why is this card not shown?',
        a: 'The agency has not recorded an active receiving account, or reading it failed. Contact the agency to get its payment details.'
      },
      {
        q: 'Is the amount pre-filled?',
        a: 'No, you enter the amount yourself in your app.'
      },
      {
        q: 'The name displayed is not the expected one.',
        a: 'Do not pay. Check the alias, then ask the agency for confirmation.'
      }
    ],
    related: [{ label: 'Declare a payment', helpId: 'portails.locataire.paiements.declaration' }],
    keywords: ['alias', 'qr', 'payment details', 'beneficiary', 'reason', 'copy']
  },
  {
    id: 'portails.locataire.paiements.indicateurs',
    kind: 'section',
    title: 'Installment indicators',
    summary: 'Four numbers sum up your installments: the total, the paid ones, those pending and those late.',
    howToRead: {
      notes: [
        'Total instalments: all your invoiced installments, including those already paid.',
        'Paid: fully settled installments.',
        'Pending: installments whose date has not yet passed (including partly paid ones).',
        'Overdue: unpaid installments whose date has passed (including partly paid ones).',
        'An installment still in draft (not yet invoiced) or canceled is not counted anywhere; a draft whose date has passed counts as late.',
        'These numbers are shown on the « Instalments » tab.'
      ]
    },
    faq: [
      {
        q: 'Why do the last three not add up to the total?',
        a: 'The numbers count installments, not amounts, and an installment falls in only one of the three boxes Paid, Pending or Overdue.'
      },
      {
        q: 'Do these numbers take my filters into account?',
        a: 'No, they cover all your installments, whatever filter is applied to the table.'
      },
      {
        q: 'Where do I see the amounts?',
        a: 'In the « Instalment list » table: columns Total amount, Paid and Balance.'
      }
    ],
    related: [{ label: 'Installment list', helpId: 'portails.locataire.paiements.echeances' }],
    keywords: ['total installments', 'paid', 'pending', 'late']
  },
  {
    id: 'portails.locataire.paiements.declarations',
    kind: 'section',
    title: 'My declarations',
    summary:
      'The list of payments you have declared to the agency, with their status. While a declaration is pending, you can cancel it.',
    purpose:
      'Declaring a payment tells the agency you have paid offline. The agency checks, then validates or rejects. The section opens by itself if a declaration is pending.',
    howToRead: {
      statuses: [
        {
          value: 'PENDING',
          label: 'Awaiting validation',
          description:
            'The agency has not yet processed the declaration. Your balance does not change before its decision.'
        },
        {
          value: 'APPROVED',
          label: 'Approved',
          description: 'The agency accepted the payment. If it corrected the amount, « Amount withheld » shows it.'
        },
        {
          value: 'REJECTED',
          label: 'Rejected',
          description: 'The agency refused the declaration; the reason and any comment are shown.'
        },
        { value: 'CANCELED', label: 'Cancelled', description: 'You canceled the declaration.' }
      ],
      notes: [
        'Possible rejection reasons: Payment not found, Amount does not match, Reference already used, Wrong receiving number, Other.',
        'Each card gives the amount, the date and time of the payment, the reference, the receiving number used and the installment concerned.',
        'The « Filter by status » filter lets you see only pending, validated, rejected or canceled declarations; the list is paginated by 10.'
      ]
    },
    steps: [
      { title: 'Open the section', detail: 'Click « My declarations » to unfold it.' },
      {
        title: 'Filter',
        detail: 'Choose a status in the drop-down list if you are looking for a specific declaration.'
      },
      { title: 'Cancel if needed', detail: 'On a pending declaration, click « Cancel the declaration » then confirm.' }
    ],
    consequences: [
      'Cancellation is only possible while the declaration is pending; afterwards there is nothing left to do on your side.',
      'Canceling does not delete the line: it stays visible with the « Cancelled » status.',
      'While a declaration is pending on an installment, online payment of that installment is refused, to avoid paying twice.'
    ],
    faq: [
      {
        q: 'How long does the agency take to validate?',
        a: 'It depends on the agency: the application guarantees no deadline.'
      },
      {
        q: 'My declaration is rejected. What should I do?',
        a: 'Read the reason, correct if needed (amount, reference), then declare again, or contact the agency.'
      },
      {
        q: 'Why does the amount retained differ from mine?',
        a: 'The agency may have corrected the amount when validating. The « Amount withheld » line gives the sum taken into account.'
      }
    ],
    related: [{ label: 'Declare a payment', helpId: 'portails.locataire.paiements.declaration' }],
    keywords: ['declaration', 'validation', 'cancel', 'rejected', 'pending']
  },
  {
    id: 'portails.locataire.paiements.paiement-en-ligne',
    kind: 'section',
    title: 'Pay online',
    summary:
      "Tick the installments to pay, check the total, then click « Pay online » to pay on the payment operator's secure page.",
    purpose:
      'This block only appears if your agency has enabled online payment. It sits above the table of the « Instalments » tab.',
    steps: [
      { title: 'Tick the installments', detail: 'Tick one or more rows to pay. They must belong to the same lease.' },
      { title: 'Check the total', detail: '« Total to pay » and the number of selected installments update.' },
      { title: 'Pay', detail: 'Click « Pay online »: you are sent to the payment page.' },
      {
        title: 'Return to the screen',
        detail: 'When you come back, a banner follows the confirmation for 1 minute at most.'
      }
    ],
    howToRead: {
      statuses: [
        { value: 'SUCCESS', label: 'Payment confirmed.', description: 'The payment is recorded.' },
        {
          value: 'PENDING',
          label: 'Confirming…',
          description:
            'The operator has not answered yet; the screen checks every 3 seconds for 1 minute at most, then keeps the payment as awaiting confirmation.'
        },
        {
          value: 'REVIEW',
          label: 'Under review by the agency.',
          description: 'The agency must check this payment.'
        },
        {
          value: 'FAILED',
          label: 'The payment failed.',
          description: 'The reason is shown in the banner when the operator provides it.'
        },
        { value: 'CANCELED', label: 'The payment was canceled.', description: 'You canceled on the payment page.' },
        {
          value: 'EXPIRED',
          label: 'The payment window has expired.',
          description: 'The payment must be started again.'
        }
      ],
      notes: [
        '« Demo mode » indicates a trial: no real money is charged.',
        'If the agency has set fees to be paid by you, a note states that payment provider fees may be added to the amount.',
        'The number of installments per payment is limited; a message tells you when the limit is reached.'
      ]
    },
    consequences: [
      "You leave ImmoTopia for the payment operator's page; you then return to this screen.",
      'If an online payment has already been in progress for less than 15 minutes on one of your installments, you are sent back to that payment rather than a second one.',
      "A pending payment declaration on the same installment blocks online payment: cancel it in « My declarations » or wait for the agency's decision."
    ],
    faq: [
      {
        q: 'The « Pay online » button stays greyed out.',
        a: 'No installment is ticked. Tick at least one payable row.'
      },
      {
        q: 'Can I pay installments from different leases together?',
        a: 'No: once an installment is ticked, those of another lease are greyed out.'
      },
      {
        q: 'My payment shows « Confirming… » for a long time.',
        a: 'It will appear automatically in your history as soon as it is confirmed. You have nothing to redo.'
      }
    ],
    related: [{ label: 'Installment list', helpId: 'portails.locataire.paiements.echeances' }],
    keywords: ['pay online', 'card', 'paysecurehub', 'online payment', 'fees']
  },
  {
    id: 'portails.locataire.paiements.echeances',
    kind: 'table',
    title: 'Installment list',
    summary:
      'Each row is an installment of your lease: its period, its date, its amount, what you have paid, what remains and its status.',
    howToRead: {
      columns: [
        { key: 'period', label: 'Period', description: 'The month or period covered by the installment.' },
        {
          key: 'leaseNumber',
          label: 'Lease',
          description: 'Number of the lease concerned. This column only appears if you have several active leases.'
        },
        { key: 'dueDate', label: 'Due date', description: 'The payment deadline.' },
        {
          key: 'amount',
          label: 'Total amount',
          description: 'The total of the installment in FCFA: rent, charges and any fees.'
        },
        { key: 'paid', label: 'Paid', description: 'The sum already paid on this installment.' },
        {
          key: 'balance',
          label: 'Balance',
          description: 'What remains to be paid. Red while an amount remains, green when everything is paid.'
        },
        {
          key: 'status',
          label: 'Status',
          description:
            'The state of the installment. A « Declaration pending approval » badge is added if you declared a payment on this row.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '« Pay » opens the payment declaration (only if the installment is payable); « Details » opens its breakdown.'
        }
      ],
      statuses: [
        { value: 'PAID', label: 'Paid', description: 'The installment is fully settled.' },
        { value: 'DUE', label: 'Due', description: 'It is to be paid and its date has not passed.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'Its date has passed and it is not settled.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Part has been paid, a balance remains.' },
        { value: 'DRAFT', label: 'Draft', description: 'Not yet invoiced: it cannot be paid.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The installment is canceled.' }
      ],
      notes: [
        'The search covers the period and the label; the filters are Status and Due date. The criteria are recorded in the page address.',
        'The « Export » button produces a file with all the installments matching your filters, not only the displayed page.',
        'When online payment is available, a checkbox appears at the start of the row for payable installments.'
      ]
    },
    steps: [
      { title: 'Find an installment', detail: 'Use the search or the Status and Due date filters.' },
      {
        title: 'See its breakdown',
        detail: 'Click « Details » to see the rent, the charges, the penalties and the payments received.'
      },
      { title: 'Report a payment', detail: 'Click « Pay » on the row to declare a payment already made.' }
    ],
    consequences: [
      '« Pay » charges nothing: it opens a declaration form, which the agency will have to validate.',
      'Viewing or filtering changes nothing in your file.'
    ],
    faq: [
      {
        q: 'Why is there no « Pay » button on some rows?',
        a: 'It only appears for « Due », « Overdue » or « Partial » installments with a balance to pay.'
      },
      {
        q: 'What does « Declaration pending approval » mean?',
        a: 'You declared a payment on this installment and the agency has not yet processed it. The balance does not change before its decision.'
      },
      {
        q: 'Why does a « Draft » installment appear?',
        a: 'The agency prepared it but has not yet invoiced it. It cannot be paid; as long as its date has not passed, it is not counted in the indicators.'
      }
    ],
    related: [
      { label: 'Installment details', helpId: 'portails.locataire.paiements.detail-echeance' },
      { label: 'Declare a payment', helpId: 'portails.locataire.paiements.declaration' }
    ],
    keywords: ['installment', 'rent', 'balance', 'status', 'pay', 'details', 'export']
  },
  {
    id: 'portails.locataire.paiements.historique',
    kind: 'table',
    title: 'Payment history',
    summary:
      'The list of your payments and your unvalidated declarations, from the most recent to the oldest, with what was applied to your installments.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: 'The payment date; « (declaration) » flags a declaration that is not yet a recorded payment.'
        },
        { key: 'amount', label: 'Amount', description: 'The amount in FCFA.' },
        {
          key: 'method',
          label: 'Method',
          description: 'Cash, Bank transfer, Mobile Money, Direct debit, Cheque, Bank card or Other.'
        },
        {
          key: 'reference',
          label: 'Reference',
          description: 'The transaction reference, if any; a dash (-) otherwise.'
        },
        {
          key: 'status',
          label: 'Status',
          description:
            'Successful, Pending, Rejected, Failed or Cancelled. For a rejected declaration, the reason is shown below.'
        },
        {
          key: 'allocated',
          label: 'Allocated',
          description: 'The part of the payment already applied to your installments.'
        },
        {
          key: 'unallocated',
          label: 'Not allocated',
          description: 'The part not yet applied to an installment; an amount is shown in orange.'
        }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Successful', description: 'Payment recorded by the agency.' },
        { value: 'PENDING', label: 'Pending', description: 'Declaration not yet processed.' },
        { value: 'REJECTED', label: 'Rejected', description: 'Declaration refused by the agency.' },
        { value: 'FAILED', label: 'Failed', description: 'Payment that did not go through.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Declaration that you canceled.' }
      ],
      notes: [
        'Unfold a row with the arrow on the left to see which installments the payment was applied to; a row with no allocation cannot be unfolded.',
        'Validated declarations are not repeated: they are replaced by the matching payment.',
        'Below the table, « Total paid (all payments) » adds up all your successful payments, filtered or not.',
        'The search covers the reference and the notes; the filters are Payment method and Date. The « Export » button exports the whole filtered list.'
      ]
    },
    faq: [
      {
        q: 'What does « Not allocated » mean?',
        a: 'The payment is received but has not yet been fully applied to an installment. The agency takes care of it.'
      },
      {
        q: 'Why do I see my declarations here?',
        a: 'So that you keep track of what you have reported, as long as they are not validated.'
      },
      {
        q: 'Where do I find my proof of payment?',
        a: 'The receipts issued by the agency are in « My lease », « Documents » card.'
      }
    ],
    related: [{ label: 'My declarations', helpId: 'portails.locataire.paiements.declarations' }],
    keywords: ['history', 'payments', 'reference', 'allocated', 'total paid']
  },
  {
    id: 'portails.locataire.paiements.releve',
    kind: 'table',
    title: 'My statement',
    summary:
      'Your customer account in read-only mode: everything you have been billed and everything you have paid, with the balance after each line.',
    purpose:
      'It is the same document that the agency uses for your account. It allows no action, no printing, and only shows your own account.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The date of the movement.' },
        {
          key: 'nature',
          label: 'Nature',
          description:
            'The kind of movement: Rent, Payment, Advance received, Advance offset, Penalty, Waiver, Adjustment, Opening balance or Cancellation.'
        },
        { key: 'libelle', label: 'Label', description: 'The text of the movement.' },
        { key: 'facture', label: 'Billed', description: 'The amount charged to you by this line.' },
        { key: 'regle', label: 'Paid', description: 'The amount you paid through this line.' },
        {
          key: 'solde',
          label: 'Balance after',
          description: 'The balance of your account once this line has been applied.'
        }
      ],
      notes: [
        'At the top, a card gives the account, the « Opening balance » and the « Closing balance ».',
        'The search covers the label and the nature; the filters are Nature and Date. « Export » exports the list.',
        'If your profile is not linked to a tenant account, the screen shows « No linked account »; if there is nothing to show, « No movement recorded ».'
      ]
    },
    faq: [
      {
        q: 'What does « Advance offset » mean?',
        a: 'An advance you had paid has been used to settle an installment.'
      },
      {
        q: 'Can I correct a line?',
        a: 'No, the statement is read-only. Contact the agency if you notice an error.'
      },
      {
        q: 'Why does an adjustment appear?',
        a: 'The agency sometimes corrects an account (discount, correction). Each correction is visible on its own line.'
      }
    ],
    related: [{ label: 'Payment history', helpId: 'portails.locataire.paiements.historique' }],
    keywords: ['statement', 'account', 'balance', 'billed', 'settled', 'advance']
  },
  {
    id: 'portails.locataire.paiements.detail-echeance',
    kind: 'section',
    title: 'Installment details',
    summary:
      'The window opened by « Details »: the breakdown of the installment, its information, any penalties and the payments received.',
    howToRead: {
      notes: [
        'Financial information: Rent, Service charges, Other fees, Penalties, Total due, Amount paid and Left to pay.',
        'Information: period (month/year), due date, status, lease number and property address.',
        'Item breakdown: each line of the installment (Rent, Service charges, Utilities, Maintenance, Processing fee, Other fees) with its amount and a total.',
        'Penalties applied: amount, days late and date applied; this table only appears if there are any.',
        'Payment history: the payments received on this installment, with the allocated part; « No payment recorded for this instalment » otherwise.'
      ]
    },
    faq: [
      {
        q: 'Why is the total higher than my rent?',
        a: 'The total includes service charges, any fees and late penalties where applicable.'
      },
      {
        q: 'Where do penalties come from?',
        a: 'They are applied by the agency in case of lateness, according to the rules of your lease. The days late and the date applied are shown.'
      },
      {
        q: 'My payment is not in the window.',
        a: 'Only payments recorded by the agency and applied to this installment appear there.'
      }
    ],
    related: [{ label: 'Installment list', helpId: 'portails.locataire.paiements.echeances' }],
    keywords: ['details', 'penalty', 'breakdown', 'rent', 'charges']
  },
  {
    id: 'portails.locataire.paiements.declaration',
    kind: 'section',
    title: 'Declare a payment',
    summary:
      'The form to report to the agency a payment you have already made (Mobile Money, cash, cheque, transfer, card...). It makes no payment.',
    purpose:
      'You open this form from « Declare a payment », from « Pay » on an installment row (the installment and the remaining amount are then pre-filled), or from « I have paid: declare my payment ».',
    steps: [
      {
        title: 'Choose the lease',
        detail: 'Only if you have several leases and you are not starting from an installment.'
      },
      {
        title: 'Choose the payment method',
        detail: 'The list only offers the methods accepted by your agency. Mobile Money is offered first when allowed.'
      },
      {
        title: 'Mobile Money: fill in the transfer',
        detail:
          'Choose the agency receiving number you used, the operator, your number (optional) and the transaction reference received by SMS.'
      },
      {
        title: 'Enter the amount and the date',
        detail:
          'Whole amount in FCFA, date and time of the payment. The date cannot be in the future, nor older than 90 days.'
      },
      {
        title: 'Attach the screenshot',
        detail:
          'JPEG, PNG, WebP or PDF, 5 MB at most. It is required if your agency demands it. If automatic reading is available, the form is pre-filled and you keep control of every field.'
      },
      { title: 'Add a note', detail: 'Optional, 500 characters at most.' },
      { title: 'Send', detail: 'Click « Declare the payment ».' }
    ],
    consequences: [
      'The declaration is created « Awaiting validation »: your balance does not change before the agency decides.',
      'The agency is notified by e-mail if this notification is enabled on its side.',
      'The reference of a Mobile Money transaction can only be declared once; a reference already used is refused.',
      'If a very close payment already exists, a message warns you that the agency will check.',
      'You can cancel the declaration while it is pending, from « My declarations ».'
    ],
    faq: [
      {
        q: 'The form says the declaration is not enabled.',
        a: 'Your agency has not enabled payment declaration, or has not recorded any receiving number: contact it.'
      },
      {
        q: 'What amount can I declare?',
        a: "A whole, positive amount in FCFA that does not exceed your agency's ceiling (5 000 000 FCFA by default). For a partial payment, edit the proposed amount."
      },
      {
        q: 'The reference is refused.',
        a: 'It must have 4 to 40 characters (letters, digits, dot, dash). If it has already been declared, check it or look at « My declarations ».'
      },
      {
        q: 'Automatic reading failed.',
        a: 'This is not blocking: fill in the fields yourself.'
      }
    ],
    permissions: {
      note: 'Declaration is only available if your agency has enabled it and, for Mobile Money, has recorded at least one receiving number.'
    },
    related: [
      { label: 'Numbers to pay by mobile money', helpId: 'portails.locataire.paiements.numeros-reception' },
      { label: 'My declarations', helpId: 'portails.locataire.paiements.declarations' }
    ],
    keywords: [
      'declare',
      'declaration',
      'mobile money',
      'reference',
      'screenshot',
      'proof',
      'orange money',
      'wave',
      'mtn',
      'moov'
    ]
  },
  {
    id: 'portails.locataire.paiements.numeros-reception',
    kind: 'section',
    title: 'Numbers to pay by mobile money',
    summary: "The agency's Mobile Money numbers to send your transfer to, with any instruction from the agency.",
    howToRead: {
      notes: [
        'Each number shows the operator (Orange Money, MTN MoMo, Moov Money, Wave or Other operator) and, if the agency filled it in, a label.',
        '« Copy the number » copies the number in its 10-digit form.',
        '« Agency instruction » is a free text from the agency, shown as is.'
      ]
    },
    steps: [
      { title: 'Make the transfer', detail: 'From your phone, send the amount to one of these numbers.' },
      { title: 'Note the reference', detail: 'Keep the transaction reference received by SMS.' },
      { title: 'Declare', detail: 'Then fill in the form below with the number you used.' }
    ],
    consequences: [
      'This block triggers no payment: it only gives you the numbers.',
      'A Mobile Money transfer sent to the wrong number cannot be recovered by ImmoTopia.'
    ],
    faq: [
      {
        q: 'I see no number.',
        a: 'The agency has not recorded an active receiving number: contact it, or pay by another method.'
      },
      {
        q: 'Which number should I choose?',
        a: 'Any one, as long as you then indicate in the form the one you actually used.'
      },
      {
        q: 'I sent the money to the wrong number.',
        a: 'Contact your operator and your agency immediately.'
      }
    ],
    related: [{ label: 'Declare a payment', helpId: 'portails.locataire.paiements.declaration' }],
    keywords: ['number', 'mobile money', 'orange money', 'wave', 'mtn', 'moov', 'receiving']
  },

  // ---------------------------------------------------------------- Security deposit
  {
    id: 'portails.locataire.caution',
    kind: 'page',
    title: 'Security deposit',
    summary:
      'The follow-up of your security deposit: the amount expected, what has been paid, held, refunded or forfeited, and the history of each movement.',
    purpose:
      'The security deposit is a sum paid at the start of the lease to cover possible unpaid rent or damage. This screen lets you check what the agency holds and what has happened.',
    steps: [
      {
        title: 'Choose the lease',
        detail:
          'If you have several active leases, a selector at the top of the screen chooses the one whose deposit you want to see.'
      },
      { title: 'Read the figures', detail: 'The four cards give the target, collected, held and available amounts.' },
      {
        title: 'See the details',
        detail: 'The « Deposit details » card also repeats the refunded and forfeited amounts.'
      },
      {
        title: 'Reread the movements',
        detail: 'The « Movement history » table lists each payment, hold, refund or adjustment.'
      }
    ],
    consequences: [
      'This screen is read-only: the movements are recorded by the agency.',
      'If your lease has no recorded deposit, the screen shows « No security deposit found ».'
    ],
    faq: [
      {
        q: 'What does « Amount available » mean?',
        a: 'It is what the agency still holds: the amount collected minus what has been refunded and what has been forfeited.'
      },
      {
        q: 'What is the difference between « Withheld » (held) and « Forfeited » (forfeited)?',
        a: 'A held sum is set aside pending a decision; a forfeited sum is definitively taken from the deposit.'
      },
      {
        q: 'When will my deposit be refunded?',
        a: 'Refunds are decided and recorded by the agency; the application gives no date.'
      }
    ],
    related: [
      { label: 'Movement history', helpId: 'portails.locataire.caution.mouvements' },
      { label: 'My lease', helpId: 'portails.locataire.bail' }
    ],
    keywords: ['deposit', 'security deposit', 'refund', 'hold', 'guarantee']
  },
  {
    id: 'portails.locataire.caution.indicateurs',
    kind: 'section',
    title: 'Deposit amounts',
    summary: 'Four cards: the target amount, the collected amount, the held amount and the available amount.',
    howToRead: {
      notes: [
        'Target amount: the deposit expected under your lease.',
        'Amount collected: what has already been paid and recorded.',
        'Amount withheld: the part set aside by the agency (holds not yet released).',
        'Amount available: the collected amount, minus what has been refunded, minus what has been forfeited. It turns red at zero.'
      ]
    },
    faq: [
      {
        q: 'The collected amount is lower than the target amount.',
        a: 'Part of the deposit remains to be paid. Contact the agency to find out how to settle it.'
      },
      {
        q: 'Is the held amount deducted from the available amount?',
        a: 'No: the available amount only subtracts what has been refunded or forfeited. A hold is a setting aside, not yet a deduction.'
      },
      {
        q: 'Where do I see the refunded and forfeited amounts?',
        a: 'In the « Deposit details » card.'
      }
    ],
    related: [{ label: 'Deposit details', helpId: 'portails.locataire.caution.details' }],
    keywords: ['target amount', 'collected', 'held', 'available']
  },
  {
    id: 'portails.locataire.caution.details',
    kind: 'section',
    title: 'Deposit details',
    summary: 'The full summary of your deposit: lease, currency and all the amounts, including refunded and forfeited.',
    howToRead: {
      notes: [
        'Lease number and Lease name (shown only if it exists), Currency.',
        'Target, collected, withheld, refunded, forfeited and available amounts, in FCFA (or the lease currency).',
        'Refunded: what has been returned to you. Forfeited: what the agency has definitively taken.'
      ]
    },
    faq: [
      {
        q: 'Why was a sum forfeited?',
        a: 'The note of the movement, in the history, generally gives the reason. Otherwise, ask the agency for details.'
      },
      {
        q: 'Can I dispute an amount?',
        a: 'The application does not allow disputes: contact the agency with the information from this screen.'
      },
      {
        q: 'What does « Currency » contain?',
        a: 'The currency in which the deposit is held, normally FCFA.'
      }
    ],
    related: [{ label: 'Movement history', helpId: 'portails.locataire.caution.mouvements' }],
    keywords: ['refunded', 'forfeited', 'currency', 'details']
  },
  {
    id: 'portails.locataire.caution.mouvements',
    kind: 'table',
    title: 'Deposit movement history',
    summary:
      'Each row is a movement on your security deposit: payment, hold, release, refund, forfeiture or adjustment.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'Date and time of the movement; click the header to sort.' },
        { key: 'type', label: 'Type', description: 'The kind of movement (see the types below).' },
        {
          key: 'amount',
          label: 'Amount',
          description:
            'The amount preceded by + (green) for a payment or an adjustment, or by - (red) for the other movements. Sorting is possible.'
        },
        {
          key: 'payment',
          label: 'Linked payment',
          description: 'The method and amount of the payment linked to the movement, or a dash (-).'
        },
        {
          key: 'installment',
          label: 'Linked instalment',
          description: 'The period of the linked installment, or a dash (-).'
        },
        { key: 'note', label: 'Note', description: "The agency's comment, or a dash (-)." }
      ],
      statuses: [
        { value: 'COLLECT', label: 'Collection', description: 'A payment into the deposit.' },
        { value: 'HOLD', label: 'Withholding', description: 'A sum set aside by the agency.' },
        { value: 'RELEASE', label: 'Release', description: 'A hold lifted.' },
        { value: 'REFUND', label: 'Refund', description: 'A sum returned to the tenant.' },
        { value: 'FORFEIT', label: 'Forfeiture', description: 'A sum definitively taken by the agency.' },
        { value: 'ADJUSTMENT', label: 'Adjustment', description: 'A correction of the collected amount.' }
      ],
      notes: [
        'The search covers the note, the payment and the installment; the filters are Type and Date.',
        'The « Export » button exports all the movements, with signed amounts.'
      ]
    },
    faq: [
      {
        q: 'Why is an adjustment displayed with a + sign?',
        a: 'The display treats adjustments as additions to the deposit. The note of the line explains the correction.'
      },
      {
        q: 'I see no movement.',
        a: 'The screen shows « No movement recorded » as long as the agency has entered none.'
      },
      {
        q: 'What does the « Linked payment » column mean?',
        a: 'It shows the payment that fed the deposit, when there is one.'
      }
    ],
    related: [{ label: 'Deposit amounts', helpId: 'portails.locataire.caution.indicateurs' }],
    keywords: ['movement', 'collect', 'hold', 'refund', 'forfeit', 'adjustment']
  },

  // ---------------------------------------------------------------- Incidents
  {
    id: 'portails.locataire.incidents',
    kind: 'page',
    title: 'Incidents and maintenance',
    summary:
      'The screen to report a problem in your home (leak, breakdown, air conditioning...) and follow how the agency handles it.',
    purpose:
      'Each request becomes a « ticket » followed by the agency. You follow it through its status and exchange with the agency through comments.',
    steps: [
      {
        title: 'Choose the lease',
        detail: 'If you have several active leases, choose the one of the home concerned before creating the request.'
      },
      { title: 'Create a request', detail: 'Click « New request » and fill in the form.' },
      {
        title: 'Follow the list',
        detail: 'The « Ticket list » table gives the status of each request; filter by status, priority or category.'
      },
      {
        title: 'Open a request',
        detail: '« Details » shows the file, the photos and the comments; you can add a comment there.'
      }
    ],
    consequences: [
      'Creating a request records it immediately; the agency is notified by e-mail if this notification is enabled on its side.',
      'You may receive an e-mail when the status of your request changes.',
      'A request can be neither edited nor deleted from the portal: to correct it, add a comment.'
    ],
    faq: [
      {
        q: 'Which priority should I choose?',
        a: 'Basse, Moyenne, Haute or Urgente. The default priority is Moyenne; keep Urgente for serious cases (major leak, total power failure).'
      },
      {
        q: 'How do I correct my request?',
        a: 'Open « Details » and add a comment. Requests cannot be edited from the portal.'
      },
      {
        q: 'Who sees my requests?',
        a: 'You and the agency. You only see the requests of your own lease.'
      },
      {
        q: 'What does « Assigned » mean?',
        a: 'The agency has assigned the request to a service provider; it counts as « In progress » in the figures.'
      }
    ],
    related: [
      { label: 'New request', helpId: 'portails.locataire.incidents.nouvelle-demande' },
      { label: 'Ticket list', helpId: 'portails.locataire.incidents.liste' }
    ],
    keywords: [
      'incident',
      'breakdown',
      'leak',
      'repair',
      'maintenance',
      'ticket',
      'plumbing',
      'electricity',
      'air conditioning'
    ]
  },
  {
    id: 'portails.locataire.incidents.indicateurs',
    kind: 'section',
    title: 'Maintenance indicators',
    summary: 'Four cards count your requests: the total, the open ones, those in progress and the resolved ones.',
    howToRead: {
      notes: [
        'Total tickets: all your requests, canceled ones included.',
        'Open: « Reported » status.',
        'In progress: « In progress » or « Assigned » status.',
        'Resolved: « Resolved » status.',
        'These numbers ignore the table filters: they cover all your requests (for the chosen lease if you have several).'
      ]
    },
    faq: [
      {
        q: 'Why does the total not match the sum of the other three?',
        a: '« Cancelled » requests are counted in the total only.'
      },
      {
        q: 'Do the numbers follow my filter?',
        a: 'No, they stay the same whatever the filter.'
      },
      {
        q: 'How do I bring « Open » down?',
        a: 'This counter goes down when the agency takes the request on: it is the agency that changes the status.'
      }
    ],
    related: [{ label: 'Ticket list', helpId: 'portails.locataire.incidents.liste' }],
    keywords: ['total tickets', 'open', 'in progress', 'resolved']
  },
  {
    id: 'portails.locataire.incidents.liste',
    kind: 'table',
    title: 'Ticket list',
    summary: 'Each row is one of your maintenance requests, with its category, priority, status and creation date.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Title', description: 'The title you gave the request.' },
        { key: 'category', label: 'Category', description: 'Plumbing, Electrical, Air conditioning or Other.' },
        { key: 'priority', label: 'Priority', description: 'Low, Medium, High or Urgent.' },
        { key: 'status', label: 'Status', description: 'The processing state of the request.' },
        { key: 'created_at', label: 'Creation date', description: 'Date and time of creation.' },
        { key: 'actions', label: 'Actions', description: '« Details » opens the file of the request.' }
      ],
      statuses: [
        {
          value: 'DECLARED',
          label: 'Reported',
          description: 'Your request is recorded, the agency has not yet taken it on.'
        },
        { value: 'ASSIGNED', label: 'Assigned', description: 'The agency has assigned it to a service provider.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'Processing is under way.' },
        { value: 'RESOLVED', label: 'Resolved', description: 'The problem has been dealt with.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The request is canceled.' }
      ],
      notes: [
        'The search covers the title and the description; the filters are Status, Priority and Category.',
        'The most recent requests are at the top.',
        '« Export » exports all the requests matching your filters.'
      ]
    },
    faq: [
      {
        q: 'Why is my request still « Reported »?',
        a: 'The agency has not processed it yet. Add a comment in « Details » to remind it.'
      },
      {
        q: 'Where do I see the photos I attached?',
        a: 'In « Details », « Attachments » section.'
      },
      {
        q: 'Can I cancel a request?',
        a: 'Not from the portal: ask the agency in a comment.'
      }
    ],
    related: [{ label: 'Ticket details', helpId: 'portails.locataire.incidents.detail' }],
    keywords: ['tickets', 'requests', 'status', 'priority', 'category']
  },
  {
    id: 'portails.locataire.incidents.nouvelle-demande',
    kind: 'section',
    title: 'New maintenance request',
    summary: 'The form to report a problem in your home, with a description and photos.',
    steps: [
      { title: 'Give a title', detail: 'Required, for example « Water leak in the bathroom ».' },
      { title: 'Choose the category', detail: 'Required: Plumbing, Electrical, Air conditioning or Other.' },
      { title: 'Choose the priority', detail: 'Basse, Moyenne (default), Haute or Urgente.' },
      { title: 'Describe the problem', detail: 'Required: describe it in detail.' },
      {
        title: 'Specify the place',
        detail: 'Optional, 500 characters at most (for example « Master bedroom, window side »).'
      },
      { title: 'Add photos', detail: 'Images only, 10 files at most and 5 MB each.' },
      { title: 'Create the ticket', detail: 'Click « Create the ticket ».' }
    ],
    consequences: [
      'The request is created right away; it appears in the list with the « Reported » status.',
      'The agency is notified by e-mail if this notification is enabled on its side.',
      'If you have several leases, the request is attached to the lease chosen at the top of the screen.'
    ],
    faq: [
      {
        q: 'Why is my photo refused?',
        a: 'Only images are accepted, and each one must be under 5 MB.'
      },
      {
        q: 'Can I send a PDF document?',
        a: 'No, only images.'
      },
      {
        q: 'Can I edit the request after sending it?',
        a: 'No: add a comment in « Details ».'
      }
    ],
    related: [{ label: 'Ticket list', helpId: 'portails.locataire.incidents.liste' }],
    keywords: ['new request', 'create a ticket', 'photos', 'priority', 'category']
  },
  {
    id: 'portails.locataire.incidents.detail',
    kind: 'section',
    title: 'Ticket details',
    summary:
      'The file of a request: its state, its description, its photos and the comments exchanged with the agency.',
    howToRead: {
      notes: [
        'At the top: Status, Priority, Category, Creation date, Property, Description and, if present, Location details.',
        'Attachments: your photos, downloadable; the section only appears if there are any.',
        "Comments: the heading shows how many there are. A comment from the agency carries the manager's name or « Manager »; yours carries your name or « Tenant »."
      ]
    },
    steps: [
      { title: 'Read the comments', detail: 'The exchanges are listed from oldest to newest.' },
      { title: 'Write', detail: 'Type your message in « Add a comment… ».' },
      {
        title: 'Send',
        detail: 'Click « Add a comment »; the button stays greyed out while the field is empty.'
      }
    ],
    consequences: [
      'A comment that has been sent can no longer be edited or deleted from the portal.',
      'The list and the counters are updated after sending.'
    ],
    faq: [
      {
        q: 'Will the agency see my comment?',
        a: 'Yes, it is added to the ticket that the agency follows.'
      },
      {
        q: 'Can I add a photo afterwards?',
        a: 'Not from this window: photos are attached when the request is created.'
      },
      {
        q: 'My comment contains a mistake.',
        a: 'Send a new comment to correct it.'
      }
    ],
    related: [{ label: 'Ticket list', helpId: 'portails.locataire.incidents.liste' }],
    keywords: ['comment', 'ticket', 'attachments', 'photos']
  },

  // ---------------------------------------------------------------- Documents
  {
    id: 'portails.locataire.documents',
    kind: 'page',
    title: 'Rental documents',
    summary:
      'All the documents issued for your lease (contract, addenda, receipts, deposit receipts, statements), sorted by type and downloadable.',
    purpose:
      'You find here the documents the agency has produced for your leases. This is useful to prove your address or your payments.',
    steps: [
      {
        title: 'Search',
        detail: 'Type a name, a number or a type in the search field (shown only if there are documents).'
      },
      { title: 'Spot the type', detail: 'Each card groups one type of document and shows how many there are.' },
      { title: 'Download', detail: 'Click « Download » to the right of the document you want.' }
    ],
    consequences: [
      'The screen is read-only: you can neither add nor delete a document.',
      'Documents canceled by the agency are not shown.'
    ],
    faq: [
      {
        q: 'I cannot find my receipt.',
        a: 'It appears here once the agency has issued it. Otherwise, ask the agency for it.'
      },
      {
        q: 'The « Download » button is greyed out.',
        a: 'The document has no file available for now.'
      },
      {
        q: 'What do « Final » or « Draft » mean?',
        a: '« Final » is a definitive document; « Draft » is not yet finalised by the agency.'
      }
    ],
    related: [{ label: 'My lease', helpId: 'portails.locataire.bail' }],
    keywords: ['documents', 'receipt', 'contract', 'addendum', 'download']
  },
  {
    id: 'portails.locataire.documents.liste',
    kind: 'section',
    title: 'Documents by type',
    summary: 'One card per document type, with the list of its documents, their status and their issue date.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'The document is not yet definitive.' },
        { value: 'FINAL', label: 'Final', description: 'The document is definitive.' },
        { value: 'VOID', label: 'Cancelled', description: 'Canceled document: it is not shown in the portal.' }
      ],
      notes: [
        'Types: Lease agreement, Amendment, Rent receipt, Settlement receipt, Deposit receipt, Statement, Other. The number next to the title is the number of documents of the type.',
        'A document with no title or number is named « Document » followed by a short code.',
        'The search covers the name, the number and the type. « No result » is shown if nothing matches, with a way to clear the search.'
      ]
    },
    faq: [
      {
        q: 'Why has the search disappeared?',
        a: 'It is only shown when there is at least one document.'
      },
      {
        q: 'Does the file always have the same format?',
        a: 'No: the file is saved in its original format (for example PDF or Word).'
      },
      {
        q: 'My document appears twice.',
        a: 'They may be two distinct documents (for example a receipt and its duplicate). Check their number and date.'
      }
    ],
    related: [{ label: 'Documents from the My lease page', helpId: 'portails.locataire.bail.documents' }],
    keywords: ['documents', 'type', 'status', 'search']
  }
];

export default entries;
