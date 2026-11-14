import type { HelpEntry } from '../../../types';

/** « acces-tiers » zone of the « patrimoine » module (en). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.acces-tiers',
    kind: 'page',
    title: 'Shared access',
    summary:
      'Give your notary, accountant or banker read-only access to part of your assets through a secret link. You choose what they see, for how long, and you can cut it at any time.',
    purpose:
      'The recipient has no account and cannot change anything. Every opening of the link and every download is logged.',
    steps: [
      { title: 'Create an access', detail: 'Click « New access » and follow the four steps.' },
      { title: 'Pass on the link', detail: 'The link is shown only once: copy it, or let the e-mail send it.' },
      { title: 'Follow', detail: 'The list shows status, scope, expiry and views; « Journal » gives the details.' },
      { title: 'Cut an access', detail: '« Revoke » stops the access and all its links immediately.' }
    ],
    consequences: [
      'The recipient only sees the sections ticked, without contact details or tenant identity.',
      'Revocation is final and sends no message to the recipient.'
    ],
    faq: [
      { q: 'Can the recipient change my data?', a: 'No, the access is read-only.' },
      { q: 'I lost the link.', a: 'Use « Send a new link » to generate a new one.' },
      {
        q: 'Which rights are needed?',
        a: '« View properties » to view; « Edit properties » to create, edit, resend a link or revoke.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Reading: « View properties ». Actions: « Edit properties ».' },
    related: [
      { label: 'Access table', helpId: 'patrimoine.acces-tiers.liste' },
      { label: 'Creation wizard', helpId: 'patrimoine.acces-tiers.assistant' }
    ],
    keywords: ['shared access', 'notary', 'accountant', 'banker', 'link', 'trusted third party']
  },
  {
    id: 'patrimoine.acces-tiers.liste',
    kind: 'table',
    title: 'Shared access table',
    summary:
      'Each row is a read-only access given to a notary, an accountant or a banker. You see its state, what it opens, its due date and its views.',
    purpose:
      'A shared access lets a trusted third party view part of your assets (values, loans, documents…) without an account and without being able to change anything. It works through a secret link that you pass on.',
    howToRead: {
      columns: [
        { key: 'status', label: 'Status', description: 'The state of the access (see the statuses below).' },
        {
          key: 'beneficiaire',
          label: 'Payee',
          description: 'The recipient name and type: Notary, Chartered accountant or Banker.'
        },
        {
          key: 'perimetre',
          label: 'Scope',
          description:
            'The number of properties, holding entities and documents shared, and the owner concerned if one was chosen.'
        },
        { key: 'rubriques', label: 'Sections', description: 'The sections the recipient can see.' },
        {
          key: 'expiration',
          label: 'Expiry',
          description: 'The end date of the access, or « Permanent » (until revoked).'
        },
        {
          key: 'consultation',
          label: 'Last viewed',
          description: 'The date the recipient last opened the link and the total number of views.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The access works.' },
        {
          value: 'EXPIRING',
          label: 'Expires soon',
          description: 'The end date falls within 7 days. A permanent access is never in this case.'
        },
        {
          value: 'EXPIRED',
          label: 'Expired',
          description: 'The end date has passed: the link no longer gives anything.'
        },
        { value: 'REVOKED', label: 'Revoked', description: 'You removed the access: it can no longer be changed.' }
      ],
      notes: ['« Edit » remains possible for an expired access, for example to push back its end date.']
    },
    steps: [
      { title: 'Create an access', detail: 'Click « New access » and follow the four-step wizard.' },
      { title: 'Edit', detail: '« Edit » reopens the wizard. The recipient type and the owner no longer change.' },
      {
        title: 'Resend a link',
        detail: '« Send a new link » issues a new link. Available for an active access or one that expires soon.'
      },
      { title: 'View the log', detail: '« Journal » shows who opened what, and when.' },
      { title: 'Revoke', detail: '« Revoke » cuts the access after confirmation.' }
    ],
    consequences: [
      'The recipient only sees the sections ticked, read-only, for the properties in scope. They see no contact details and no identity of tenants or co-owners.',
      'Every view and every document download is logged (date, IP address, device) and counted.',
      'Revocation is immediate and final: all links stop working. No message is sent to the recipient, and the log is kept.'
    ],
    faq: [
      {
        q: 'Does the recipient need an account?',
        a: 'No. The secret link is enough: so keep it for the person concerned.'
      },
      {
        q: 'I do not see the buttons that create or edit.',
        a: 'Creating, editing, resending a link and revoking require the « Edit properties » right. Reading the list and the log requires « View properties ».'
      },
      {
        q: 'Why is « Send a new link » missing?',
        a: 'The access is expired or revoked. For an expired access, first extend its end date with « Edit ».'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Reading: « View properties ». Creating, editing, link, revocation: « Edit properties ».'
    },
    related: [
      { label: 'Create an access (wizard)', helpId: 'patrimoine.acces-tiers.assistant' },
      { label: 'Access log', helpId: 'patrimoine.acces-tiers.journal' }
    ],
    keywords: ['shared access', 'notary', 'accountant', 'banker', 'trusted third party', 'link', 'sharing', 'read-only']
  },
  {
    id: 'patrimoine.acces-tiers.assistant',
    kind: 'section',
    title: 'Access creation wizard',
    summary:
      'Four steps to create or edit an access: recipient, scope, sections, duration. A message under the buttons says what is missing before you can continue.',
    steps: [
      { title: 'Payee', detail: 'Type, name and e-mail address.' },
      { title: 'Scope', detail: 'The properties and entities shared.' },
      { title: 'Sections', detail: 'What the recipient will be able to see, and the documents.' },
      { title: 'Duration', detail: 'End date, link validity and sending by e-mail.' },
      { title: 'Submit', detail: 'Click « Create access » (or « Save » when editing).' }
    ],
    consequences: [
      'On creation, a link is issued and shown only once. If you kept sending by e-mail, the recipient receives this link, provided this message is enabled for your agency.',
      'Creation and every edit are recorded in the access log.',
      'When editing, changes apply from the next view: the scope and sections are re-read each time the link is opened.'
    ],
    faq: [
      { q: 'Can the recipient type be changed?', a: 'No, it is fixed after creation, as is the owner concerned.' },
      { q: 'How many properties at most?', a: 'An access cannot cover more than 100 properties, entities included.' }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Requires « Edit properties ».' },
    related: [
      { label: 'Recipient step', helpId: 'patrimoine.acces-tiers.beneficiaire' },
      { label: 'Access table', helpId: 'patrimoine.acces-tiers.liste' }
    ],
    keywords: ['new access', 'wizard', 'create', 'share']
  },
  {
    id: 'patrimoine.acces-tiers.beneficiaire',
    kind: 'section',
    title: 'Step 1: the recipient',
    summary:
      'Say who receives the access: their type, name and e-mail address. The type sets the sections offered in step 3.',
    steps: [
      { title: 'Type', detail: 'Notary, Chartered accountant or Banker.' },
      { title: 'Name', detail: 'Required, 120 characters at most.' },
      { title: 'E-mail address', detail: 'Required and valid: this is where the link will be sent if you ask for it.' }
    ],
    consequences: [
      'When editing, changing the e-mail address revokes all active links: you will have to resend a link. A new recipient never receives the old links.'
    ],
    faq: [
      {
        q: 'Does the recipient receive a message on creation?',
        a: 'Yes, if you leave « Send the link by e-mail » ticked in step 4 and this message is enabled for your agency.'
      }
    ],
    related: [{ label: 'Next step: scope', helpId: 'patrimoine.acces-tiers.perimetre' }],
    keywords: ['recipient', 'e-mail', 'notary', 'banker']
  },
  {
    id: 'patrimoine.acces-tiers.perimetre',
    kind: 'section',
    title: 'Step 2: the scope',
    summary:
      'Choose the properties and holding entities the recipient will be able to see. At least one property or entity is required.',
    steps: [
      {
        title: 'Owner (optional)',
        detail: 'Filters the property list on one owner. It also determines the ownership share applied to the totals.'
      },
      { title: 'Properties', detail: 'Tick the properties, or « Check all » for the displayed list.' },
      { title: 'Holding entities', detail: 'Tick an entity to also share all the properties it holds.' }
    ],
    consequences: [
      "An entity's properties are added at every view: if the entity acquires a property, it becomes visible.",
      'The recipient only sees properties of your agency; a property that leaves the scope stops being visible.'
    ],
    faq: [
      {
        q: 'Is an entity with no property accepted?',
        a: 'No: the access is refused if the chosen entity holds no property.'
      }
    ],
    related: [{ label: 'Next step: sections', helpId: 'patrimoine.acces-tiers.rubriques' }],
    keywords: ['properties', 'entity', 'scope', 'owner']
  },
  {
    id: 'patrimoine.acces-tiers.rubriques',
    kind: 'section',
    title: 'Step 3: the sections',
    summary: 'Tick what the recipient will see. The sections offered follow their type, and you can change them.',
    howToRead: {
      notes: [
        'Valuations: estimated value, history of estimates and latent capital gain.',
        'Yield and ratios: gross, net and net-net yield of the property.',
        'Loans: current loans, remaining capital, rate and monthly payments.',
        'Expenses: expenses of the last 12 months by category, without free-text detail.',
        'Leases and rents: leases, rents and charges, without tenant identity.',
        'Shareable documents: only the documents ticked next.',
        'Titles and ownership: nature of ownership, holding entities and shares.',
        'By default: Notary, Titles and ownership, Documents and Valuations; Chartered accountant, Expenses, Leases and rents and Loans; Banker, Valuations, Yield and ratios and Loans.'
      ]
    },
    steps: [
      { title: 'Tick the sections', detail: 'At least one section is required.' },
      {
        title: 'Choose the documents',
        detail: 'With « Shareable documents », tick the files of the properties selected in step 2.'
      }
    ],
    consequences: [
      'The documents offered are those of the properties ticked directly, not those of properties obtained through an entity.',
      'A document can only be shared if the « Shareable documents » section is ticked. Unticking it also closes the document shares.',
      'The recipient can download the ticked documents; every download is logged.'
    ],
    faq: [
      {
        q: "Does the recipient see my tenants' names?",
        a: 'No. They see no tenant identity, no contact details and no co-owner identity.'
      }
    ],
    related: [{ label: 'Next step: duration', helpId: 'patrimoine.acces-tiers.duree' }],
    keywords: ['sections', 'documents', 'valuations', 'loans', 'expenses']
  },
  {
    id: 'patrimoine.acces-tiers.duree',
    kind: 'section',
    title: 'Step 4: the duration',
    summary:
      'Set the end of the access, then, on creation, the link validity and sending by e-mail. A permanent access does not make the link eternal.',
    steps: [
      {
        title: 'Access duration',
        detail: '« Until a date » (90 days suggested, a future date is required) or « Permanent (until revoked) ».'
      },
      {
        title: 'Link validity',
        detail: 'In days: 7 suggested, and a maximum set by the platform (30 days by default). Creation only.'
      },
      { title: 'Sending', detail: 'Tick « Send the link by e-mail to the recipient » to notify them right away.' }
    ],
    consequences: [
      'A link never lives beyond the access end date. You can resend a new link at any time.',
      'If sending is not requested, is disabled for the agency or fails, nothing is sent: pass the link on yourself.'
    ],
    faq: [
      {
        q: 'What happens at the end date?',
        a: 'The access becomes « Expired » and gives nothing any more. You can extend it with « Edit ».'
      }
    ],
    keywords: ['duration', 'expiry', 'permanent', 'link', 'e-mail']
  },
  {
    id: 'patrimoine.acces-tiers.lien',
    kind: 'section',
    title: 'Access link',
    summary: 'This window shows the secret link only once. Copy it before closing: it will not be shown again.',
    steps: [
      { title: 'Read the sending result', detail: 'The message says whether an e-mail went out, or why it did not.' },
      { title: 'Copy', detail: 'Click « Copy link », then pass it on yourself if needed.' },
      { title: 'Close', detail: '« I copied the link, close ».' }
    ],
    consequences: [
      'Once closed, the window keeps no trace of the link. If lost, it is replaced with « Send a new link ».',
      'The link validity date is shown at the bottom.'
    ],
    faq: [
      {
        q: 'I closed without copying the link.',
        a: 'Use « Send a new link »: it generates a new link. You can also revoke the previous ones.'
      }
    ],
    keywords: ['link', 'copy', 'url']
  },
  {
    id: 'patrimoine.acces-tiers.renvoi',
    kind: 'section',
    title: 'Resend a link',
    summary: 'Issues a new link for an active access, with its duration, and optionally sends it by e-mail.',
    steps: [
      { title: 'Duration', detail: 'Link validity in days (7 suggested).' },
      { title: 'E-mail', detail: 'Tick or untick « Send the link by e-mail to the recipient ».' },
      { title: 'Old links', detail: 'Tick « Revoke previous links » so they stop working.' },
      { title: 'Generate', detail: 'Click « Generate link »: the link is shown only once.' }
    ],
    consequences: [
      'Without the « Revoke previous links » box, the old links keep working.',
      'The sending is recorded in the access log (without the link or the e-mail address).',
      'Not possible for a revoked or expired access: first extend an expired access.'
    ],
    faq: [{ q: 'Is the recipient told about revoked old links?', a: 'No, no message is sent for that.' }],
    keywords: ['resend', 'new link', 'revoke']
  },
  {
    id: 'patrimoine.acces-tiers.journal',
    kind: 'table',
    title: 'Access log',
    summary:
      'The log lists everything that happened on an access: creation, edits, link sendings, views and downloads.',
    howToRead: {
      columns: [
        { key: 'at', label: 'Date', description: 'The date and time of the event.' },
        {
          key: 'action',
          label: 'Event',
          description: 'Viewed, Document downloaded, Link sent, Access created, Access updated or Access revoked.'
        },
        {
          key: 'detail',
          label: 'Detail',
          description: 'The name of the downloaded document, or the sections opened during the view.'
        },
        {
          key: 'ipAddress',
          label: 'IP address',
          description: 'The address the recipient connected from; a dash if no address is recorded.'
        }
      ]
    },
    steps: [
      { title: 'Search', detail: 'By document name or IP address.' },
      { title: 'Filter', detail: 'By event type and by period.' }
    ],
    consequences: ['The log cannot be edited and remains viewable after a revocation.'],
    faq: [{ q: 'What does a missing IP address mean?', a: 'A dash is shown when no address is recorded.' }],
    permissions: { feature: 'PATRIMOINE', note: 'Requires « View properties ».' },
    keywords: ['log', 'view', 'history', 'IP address', 'download']
  },
  {
    id: 'patrimoine.acces-tiers.revocation',
    kind: 'section',
    title: 'Revoke an access',
    summary:
      'Revocation cuts the access immediately: the recipient loses access and all their links stop working. It is final.',
    steps: [
      { title: 'Check the name', detail: 'The title reminds you of the recipient concerned.' },
      { title: 'Confirm', detail: 'Click « Revoke », or « Cancel » to keep the access.' }
    ],
    consequences: [
      'A revoked access can no longer be edited or receive a link: create a new one if needed.',
      'No message is sent to the recipient. The revocation is recorded in the log.'
    ],
    faq: [{ q: 'Can I undo a revocation?', a: 'No. Create a new access.' }],
    keywords: ['revoke', 'delete', 'remove access']
  }
];

export default entries;
