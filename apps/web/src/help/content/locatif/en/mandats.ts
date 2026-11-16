import type { HelpEntry } from '../../../types';

/** Help entries of the mandats zone, locatif module (en). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.prelevements.mandats',
    kind: 'page',
    title: 'Direct debits: mandates',
    summary:
      'This screen lists every direct debit mandate of your agency: the authorization a tenant gives to collect the rent from their bank account. You can search, filter and export them.',
    purpose:
      'Direct debit works in two steps: first the tenant\'s mandate (this screen), then the batches sent to the bank (the "Batches" tab). A mandate is created and managed from the "Direct debits" tab of the lease; here you follow them all.',
    steps: [
      {
        title: 'Search',
        detail: 'Type a reference, a debtor, an account holder or a lease number in the search field.'
      },
      {
        title: 'Filter',
        detail: 'Narrow the list with the Status, Creditor and "Signed on" filters.'
      },
      {
        title: 'Open the lease',
        detail: 'Click the number in the "Lease" column: the lease opens, where you create the mandate and act on it.'
      },
      {
        title: 'Go to the batches',
        detail: 'The "Batches" tab groups the debits sent to the bank.'
      },
      {
        title: 'Export',
        detail: 'The export button includes all mandates matching your criteria, not only the page shown.'
      }
    ],
    consequences: [
      'This screen changes nothing: it is for consulting. Creating, activating, suspending or revoking a mandate is done in the lease.',
      'The IBAN is always shown masked.'
    ],
    faq: [
      {
        q: 'Where do I create a mandate?',
        a: 'Open the lease, "Direct debits" tab, then "New direct debit mandate".'
      },
      {
        q: 'Why is the list empty?',
        a: 'No mandate has been created yet, or your criteria are too strict: clear them.'
      },
      {
        q: 'What does "Consecutive rejects" mean?',
        a: 'The number of debits rejected by the bank in a row. At the threshold set on the creditor, the mandate is suspended automatically.'
      },
      {
        q: 'I cannot see this screen. Why?',
        a: 'It requires the "View direct debits" right and a pack that includes rental management. Ask your agency administrator.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires "View direct debits". Creating, editing, activating, suspending or revoking requires "Manage direct debits".'
    },
    related: [
      {
        label: 'Reading the mandates table',
        helpId: 'locatif.prelevements.mandats.tableau'
      },
      {
        label: "The lease's Direct debits panel",
        helpId: 'locatif.prelevements.bail'
      },
      {
        label: 'Creditors',
        helpId: 'locatif.prelevements.mandats.creanciers'
      },
      {
        label: 'Direct debit batches',
        helpId: 'locatif.prelevements.remises'
      }
    ],
    keywords: ['direct debit', 'mandate', 'debit authorization', 'iban', 'rib', 'bank', 'rent', 'debtor']
  },
  {
    id: 'locatif.prelevements.mandats.tableau',
    kind: 'table',
    title: 'Direct debit mandates table',
    summary:
      'Each row is a mandate of your agency. The table shows who pays, from which account, to which creditor, and where the mandate stands.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Reference',
          description: 'The mandate number, in the form MDT-year-number.'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'The state of the mandate (see the statuses below).'
        },
        {
          key: 'debtor',
          label: 'Debtor',
          description: 'The tenant (or co-tenant) whose account is debited.'
        },
        {
          key: 'lease',
          label: 'Lease',
          description: 'The number of the lease concerned; click it to open the lease.'
        },
        {
          key: 'iban',
          label: 'IBAN',
          description: 'The account IBAN, masked: only the last characters appear.'
        },
        {
          key: 'bankCode',
          label: 'Bank code',
          description: 'The bank code, taken from the IBAN.'
        },
        {
          key: 'holder',
          label: 'Holder',
          description: 'The name of the bank account holder.'
        },
        {
          key: 'creditor',
          label: 'Creditor',
          description: 'The account of your agency that receives the money.'
        },
        {
          key: 'maxAmount',
          label: 'Ceiling',
          description: 'The maximum amount debited each time, in FCFA. A dash (—) means there is no ceiling.'
        },
        {
          key: 'day',
          label: 'Collection day',
          description:
            "The day of the month the debit is planned: the mandate's own day if it has one, otherwise the creditor's."
        },
        {
          key: 'signedAt',
          label: 'Signed on',
          description: 'The date the authorization was signed. A dash (—) means it is not known yet.'
        },
        {
          key: 'rejects',
          label: 'Consecutive rejects',
          description:
            'The number of bank rejections in a row. It goes back to zero when a suspended mandate is reactivated.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description:
            'The mandate is created but not yet activated: it is waiting for the signed scan of the authorization.'
        },
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'The mandate can be used to collect the rent.'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'The mandate is paused, by the agency or automatically after too many consecutive rejections.'
        },
        {
          value: 'REVOKED',
          label: 'Revoked',
          description: 'The mandate is permanently stopped.'
        }
      ],
      notes: ['When a filter is active, the screen shows "No results" and a button to clear the criteria.']
    },
    faq: [
      {
        q: 'Why is the IBAN masked?',
        a: "To protect the tenant's bank details: the full IBAN is never shown in the list."
      },
      {
        q: 'How do I find the mandates waiting to be signed?',
        a: 'Filter on the "Draft" status.'
      },
      {
        q: 'Is the table sorted?',
        a: 'No, there is no column sorting; use search and filters.'
      }
    ],
    related: [
      {
        label: 'Mandates overview',
        helpId: 'locatif.prelevements.mandats'
      },
      {
        label: 'Actions on a mandate',
        helpId: 'locatif.prelevements.bail.actions'
      }
    ],
    keywords: ['mandate', 'status', 'rejection', 'ceiling', 'masked iban', 'collection day']
  },
  {
    id: 'locatif.prelevements.bail',
    kind: 'section',
    title: 'Direct debits of the lease',
    summary:
      'This tab of the lease groups the direct debit mandates of the lease. This is where you create a mandate and take it through to activation.',
    purpose:
      'The tenant authorizes the agency to collect the rent from their bank account. A lease can have only one open mandate (draft, active or suspended) with a given creditor.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Created, waiting for the signed scan and activation.'
        },
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'Can be used to collect the rent.'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'Paused; the suspension reason is shown.'
        },
        {
          value: 'REVOKED',
          label: 'Revoked',
          description: 'Permanently stopped; the revocation reason is shown.'
        }
      ],
      notes: [
        'Each mandate appears in a card: reference, status, debtor, masked IBAN, bank code, holder, creditor, ceiling, collection day, signature date and consecutive rejections.',
        'While a mandate is open, the "New direct debit mandate" button is greyed out.'
      ]
    },
    steps: [
      {
        title: 'Create the mandate',
        detail: 'Click "New direct debit mandate" and fill in the form.'
      },
      {
        title: 'Have the authorization signed',
        detail: 'Download the authorization (PDF), then upload the signed scan or send it for electronic signature.'
      },
      {
        title: 'Enable',
        detail: 'Click "Enable" and confirm the signature date.'
      },
      {
        title: 'Follow up',
        detail: "Suspend, reactivate or revoke the mandate depending on the tenant's situation."
      }
    ],
    consequences: [
      'An activated mandate can be included in a direct debit batch; nothing is collected until a batch is created and validated.',
      'To change bank account, revoke the mandate and create a new one: the IBAN cannot be edited.'
    ],
    faq: [
      {
        q: 'Why is "New direct debit mandate" greyed out?',
        a: 'An open mandate already exists for this lease. Revoke it before creating a new one.'
      },
      {
        q: 'Can I create a mandate on an ended lease?',
        a: 'No: an ended or terminated lease does not accept a new mandate.'
      },
      {
        q: 'I cannot see the "Direct debits" tab.',
        a: 'It requires the "View direct debits" right.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires "View direct debits"; creating and acting requires "Manage direct debits".'
    },
    related: [
      {
        label: 'New mandate form',
        helpId: 'locatif.prelevements.bail.nouveau'
      },
      {
        label: 'Actions on a mandate',
        helpId: 'locatif.prelevements.bail.actions'
      },
      {
        label: 'Electronic signature of the mandate',
        helpId: 'locatif.prelevements.bail.signature'
      }
    ],
    keywords: ['direct debit', 'mandate', 'lease', 'authorization', 'iban']
  },
  {
    id: 'locatif.prelevements.bail.nouveau',
    kind: 'section',
    title: 'New direct debit mandate',
    summary:
      'This form creates a mandate for the open lease. The mandate starts as "Draft": it must then be signed and activated.',
    steps: [
      {
        title: 'Creditor',
        detail: 'Choose the agency account that receives the debits. If there is only one, it is already selected.'
      },
      {
        title: 'Debtor',
        detail: 'Choose the main tenant or a co-tenant of the lease.'
      },
      {
        title: 'IBAN or RIB',
        detail:
          'Enter the IBAN or RIB. It is checked as you type; if valid, only the masked IBAN and the bank code are shown.'
      },
      {
        title: 'Account holder',
        detail: 'Enter the holder name, as on the account.'
      },
      {
        title: 'Ceiling, collection day, notes',
        detail: 'Optional. The collection day ranges from 1 to 28.'
      },
      {
        title: 'Create',
        detail: 'Click "Create the direct debit mandate".'
      }
    ],
    consequences: [
      'An invalid IBAN or RIB blocks creation and the error is shown under the field. A RIB is converted into an IBAN.',
      'The ceiling limits the amount collected each time: if the rent due is higher, the batch collects only the ceiling.',
      "Without a collection day, the creditor's day applies.",
      'If the bank returns warnings about the IBAN, they are shown after creation, and the mandate is created anyway.',
      'The IBAN is stored encrypted only and is never shown in full again.'
    ],
    faq: [
      {
        q: 'What if the creditor list is empty?',
        a: 'Create a creditor in the financial settings, "Direct debit" card.'
      },
      {
        q: 'Can I fix an IBAN after creation?',
        a: 'No. Revoke the mandate and create a new one with the right account.'
      },
      {
        q: 'Who can be the debtor?',
        a: 'Only the main tenant or a co-tenant of the lease.'
      }
    ],
    permissions: {
      note: 'Requires "Manage direct debits".'
    },
    related: [
      {
        label: 'Lease direct debits',
        helpId: 'locatif.prelevements.bail'
      },
      {
        label: 'Creditors',
        helpId: 'locatif.prelevements.mandats.creanciers'
      }
    ],
    keywords: ['new mandate', 'iban', 'rib', 'holder', 'ceiling', 'creditor', 'debtor']
  },
  {
    id: 'locatif.prelevements.bail.actions',
    kind: 'section',
    title: 'Actions on a mandate',
    summary:
      'The buttons under each mandate depend on its status. They let you download the authorization, upload the signed scan, activate, suspend, reactivate, edit or revoke.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description:
            'Offers the PDF, upload or replacement of the scan, "Enable" (greyed out until a scan is uploaded), "Edit" and "Revoke".'
        },
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'Offers "Suspend", "Edit", "Revoke", the PDF and "View the scan".'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'Offers "Re-enable", "Edit", "Revoke", the PDF and "View the scan".'
        },
        {
          value: 'REVOKED',
          label: 'Revoked',
          description: 'No more actions, except "View the scan" if a scan exists.'
        }
      ]
    },
    steps: [
      {
        title: 'Download the authorization (PDF)',
        detail: 'The document the tenant must sign. It contains the full IBAN.'
      },
      {
        title: 'Upload the signed scan',
        detail: 'Choose a PDF, JPEG or PNG of at most 10 MB.'
      },
      {
        title: 'Enable',
        detail: 'Choose the signature date (not in the future) then confirm.'
      },
      {
        title: 'Suspend or revoke',
        detail: 'Enter a mandatory reason (500 characters at most) then confirm.'
      },
      {
        title: 'Re-enable',
        detail: 'Puts a suspended mandate back in service, without a confirmation step.'
      },
      {
        title: 'Edit',
        detail: 'Changes the ceiling, the collection day (1 to 28) and the notes. The IBAN cannot be edited.'
      }
    ],
    consequences: [
      'Revocation is final: to collect again, a new mandate must be created. Any electronic signature request still open is then cancelled.',
      'Reactivation resets the consecutive rejections counter to zero.',
      "A mandate is suspended automatically when the number of consecutive rejections reaches the creditor's threshold.",
      'The scan can only be uploaded or replaced on a draft. Uploading a paper scan cancels the electronic signature request in progress.'
    ],
    faq: [
      {
        q: 'Why is "Enable" greyed out?',
        a: 'You must first upload the signed scan of the authorization, or obtain the electronic signature.'
      },
      {
        q: 'How do I change bank account?',
        a: 'Revoke the mandate, then create a new one with the new IBAN.'
      },
      {
        q: 'A "You are not allowed to perform this action" message appears.',
        a: 'Your role does not have the "Manage direct debits" right: ask the administrator.'
      }
    ],
    permissions: {
      note: 'All these actions require "Manage direct debits".'
    },
    related: [
      {
        label: 'Electronic signature of the mandate',
        helpId: 'locatif.prelevements.bail.signature'
      },
      {
        label: 'Lease direct debits',
        helpId: 'locatif.prelevements.bail'
      }
    ],
    keywords: ['activate', 'suspend', 'reactivate', 'revoke', 'signed scan', 'reason', 'authorization pdf']
  },
  {
    id: 'locatif.prelevements.bail.signature',
    kind: 'section',
    title: 'Electronic signature of the mandate',
    summary:
      'This optional card sends the direct debit authorization to the tenant to sign online. It only appears on a draft mandate without a scan.',
    purpose:
      'The debtor receives a link and a one-time code to sign the authorization. You can also upload a signed paper scan: it replaces the electronic signature.',
    steps: [
      {
        title: 'Check the signer',
        detail: 'The proposed signer is the mandate debtor; check their contact details.'
      },
      {
        title: 'Choose the channel',
        detail: 'E-mail, SMS or WhatsApp. "In person" is not offered: the code is mandatory.'
      },
      {
        title: 'Send',
        detail: 'Click "Send for electronic signature".'
      },
      {
        title: 'Follow up',
        detail: 'The tracking refreshes by itself; you can remind or cancel the request.'
      },
      {
        title: 'Enable',
        detail: 'Once signed, a message confirms it: click "Enable" in the mandate actions.'
      }
    ],
    consequences: [
      'The tenant receives a message with the link and the code on the chosen channel.',
      'Once signed, the signed document stands in for the scan and the signature date is taken over automatically; you can correct it at activation.',
      'The mandate is not activated by itself: activation remains an action of the agency.',
      'Uploading a paper scan or revoking the mandate cancels any request in progress.'
    ],
    faq: [
      {
        q: 'Is this signature mandatory?',
        a: 'No. You can have the PDF signed on paper and upload the scan.'
      },
      {
        q: 'Why can I not send?',
        a: "The screen shows the reason (for example a missing contact). Complete the tenant's record and try again."
      },
      {
        q: 'Where can I see the signed document?',
        a: 'With "View the scan" in the mandate actions.'
      }
    ],
    permissions: {
      note: 'Requires "Manage direct debits".'
    },
    related: [
      {
        label: 'Actions on a mandate',
        helpId: 'locatif.prelevements.bail.actions'
      },
      {
        label: 'Signature tracking',
        helpId: 'locatif.signatures.liste'
      }
    ],
    keywords: ['electronic signature', 'sign', 'code', 'sms', 'whatsapp', 'e-mail', 'signing link']
  },
  {
    id: 'locatif.prelevements.mandats.creanciers',
    kind: 'section',
    title: 'Direct debit creditors',
    summary:
      'A creditor is the agency bank account that receives the debits. This card, in the financial settings, creates and configures them.',
    howToRead: {
      columns: [
        {
          key: 'label',
          label: 'Label',
          description: 'The name given to the creditor.'
        },
        {
          key: 'account',
          label: 'Treasury account',
          description: 'The linked treasury bank account.'
        },
        {
          key: 'bank',
          label: 'Bank',
          description: 'The bank name, if known.'
        },
        {
          key: 'identifier',
          label: 'Creditor identifier',
          description: 'The number assigned by the bank. "Agreement not signed" is shown while it is empty.'
        },
        {
          key: 'collectionDay',
          label: 'Collection day',
          description: 'The default day of the month for debits (1 to 28).'
        },
        {
          key: 'prenotification',
          label: 'Pre-notification (business days)',
          description: 'The notice period in business days before the debit.'
        },
        {
          key: 'fee',
          label: 'Reject fee',
          description: 'The amount in FCFA charged on a rejection.'
        },
        {
          key: 'threshold',
          label: 'Suspension threshold',
          description: 'The number of consecutive rejections that suspends the mandate.'
        },
        {
          key: 'open',
          label: 'Open mandates',
          description: 'The number of draft, active or suspended mandates.'
        },
        {
          key: 'active',
          label: 'Active',
          description: 'The switch activates or deactivates the creditor; it takes effect immediately.'
        }
      ]
    },
    steps: [
      {
        title: 'New creditor',
        detail: 'Click "New creditor".'
      },
      {
        title: 'Treasury account',
        detail: 'Choose a bank-type account that is active and not yet used.'
      },
      {
        title: 'Label and creditor identifier',
        detail: 'Give a label. Leave the "Creditor identifier" empty until the agreement is signed.'
      },
      {
        title: 'Settings',
        detail: 'Collection day, pre-notification, reject fee and suspension threshold (1 to 10).'
      },
      {
        title: 'Save',
        detail: 'To change a setting later, use "Edit" on the row.'
      }
    ],
    consequences: [
      'A deactivated creditor can no longer receive a new mandate.',
      'Only one creditor per treasury account, even deactivated. The account cannot be changed after creation.',
      "At the consecutive rejections threshold, this creditor's mandates are suspended automatically."
    ],
    faq: [
      {
        q: 'Where do I get the creditor identifier?',
        a: 'The bank assigns it once the direct debit agreement is signed.'
      },
      {
        q: 'No account is offered.',
        a: 'Only active bank-type treasury accounts without a creditor are offered.'
      },
      {
        q: 'What does the suspension threshold do?',
        a: 'After this number of bank rejections in a row, the mandate becomes "Suspended".'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires "View direct debits"; creating and editing require "Manage direct debits".'
    },
    related: [
      {
        label: 'Mandates overview',
        helpId: 'locatif.prelevements.mandats'
      }
    ],
    keywords: ['creditor', 'issuer number', 'agreement', 'bank', 'rejection fee', 'prenotification']
  }
];

export default entries;
