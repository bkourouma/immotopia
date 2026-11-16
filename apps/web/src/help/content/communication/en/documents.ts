import type { HelpEntry } from '../../../types';

/** « documents » zone of the « communication » module (en): the agency's document templates. */
const entries: HelpEntry[] = [
  {
    id: 'communication.documents.modeles',
    kind: 'page',
    title: 'Document templates',
    summary:
      'Manage the Word files (.docx) used to produce your agency’s leases, rent receipts and account statements: adding, default template, deactivation, deletion.',
    purpose:
      'A template is a Word document containing variables between double braces, for example {{AGENCE_NOM}}. When a rental document is generated, ImmoTopia replaces them with the real information (agency, rent, tenant…) and saves the result in Word format.\n\nOnly four types have templates: Residential lease, Commercial lease, Rent receipt and Account statement.',
    howToRead: {
      notes: [
        'ImmoTopia first takes the template chosen in the generation form (if active and of the right type), otherwise the agency’s « Default » template for that type, otherwise the agency’s most recent active template, otherwise ImmoTopia’s standard template.'
      ]
    },
    steps: [
      {
        title: 'Add a template',
        detail: 'Click « Add a template », choose the type, give it a name and select your Word file.'
      },
      {
        title: 'Choose the default template',
        detail: "In the template's row, click « Set as default ». There is only one per type."
      },
      {
        title: 'Set a template aside',
        detail: 'Click « Disable »: it is no longer offered at generation. « Enable » puts it back in service.'
      }
    ],
    consequences: [
      'A template only affects documents generated after it.',
      '« Regenerate » reads the template again: if the original one is disabled or deleted, the default template is used.',
      'Deletion is final; to be able to go back, prefer « Disable ».',
      'The first template added for a type automatically becomes the default for that type.'
    ],
    faq: [
      {
        q: 'Which documents can I customise?',
        a: 'The four types in the list; no other is available here.'
      },
      {
        q: "I haven't added any template: can I still generate documents?",
        a: 'Yes, if the ImmoTopia standard template is installed. The table then shows « No document template has been saved for this agency yet. »'
      },
      {
        q: 'Why is my action refused?',
        a: 'Adding, enabling, disabling, setting as default and deleting require the « Edit rental documents » permission. The buttons stay visible, but the action fails without it.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing the list: « View rental documents » (or « Generate rental documents »). Any change: « Edit rental documents ».'
    },
    related: [
      { label: 'Reading the templates table', helpId: 'communication.documents.modeles.tableau' },
      { label: 'Add a template', helpId: 'communication.documents.modeles.ajout' },
      { label: 'Create a Word template with variables', helpId: 'communication.documents.modeles.guide' },
      { label: 'The four template types', helpId: 'communication.documents.modeles.types' },
      { label: 'Leases list', to: '/tenant/:tenantId/rental/leases' }
    ],
    keywords: [
      'template',
      'model',
      'contract',
      'lease',
      'receipt',
      'rent receipt',
      'account statement',
      'word',
      'docx',
      'customise',
      'rental document'
    ]
  },
  {
    id: 'communication.documents.modeles.tableau',
    kind: 'table',
    title: 'Templates table',
    summary: 'Each row is a Word template of your agency, with its type, status and variables; you act on it.',
    howToRead: {
      columns: [
        {
          key: 'name',
          label: 'Name',
          description:
            'Name given to the template, original file name below. « Default » marks the template used by default for its type.'
        },
        {
          key: 'doc_type',
          label: 'Type',
          description: 'Residential lease, Commercial lease, Rent receipt or Account statement.'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'Active: usable for generation. Inactive: set aside.'
        },
        {
          key: 'placeholders',
          label: 'Placeholders',
          description: 'Variables found in the Word file: the first three, then « +2 », « +5 »…'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Set as default » (absent if already so), « Enable » or « Disable », « Delete ».'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'Offered at generation; can be the default.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'Not offered at generation, cannot be the default; can be re-enabled.'
        }
      ],
      notes: [
        'Only your agency’s templates are listed, not the standard ImmoTopia template.',
        'On a phone, each template becomes a card: « Set as default » stays on it, « Disable » (or « Enable ») and « Delete » are in the « ⋮ » menu.',
        '« Export » saves all the templates matching your search, not only the displayed page.'
      ]
    },
    steps: [
      { title: 'Search', detail: 'Type a name, file, type or variable.' },
      { title: 'Filter', detail: 'Filter by « Document type », « Status » or « Default ».' },
      { title: 'Act on a template', detail: 'Use the buttons in the « Actions » column.' }
    ],
    consequences: [
      '« Set as default » removes the tag from the previous template of the same type. Only an active template can be chosen: enable it first.',
      '« Disable » on the default template removes its tag; the most recent active template of the same type, if any, replaces it.',
      '« Delete » asks for confirmation and is final. A deleted default template is replaced as after a deactivation.',
      'Documents already generated are not changed.'
    ],
    faq: [
      {
        q: 'Why is « Set as default » refused on an inactive template?',
        a: 'Only an active template can be: click « Enable » first.'
      },
      {
        q: 'Why did « Default » move to another template?',
        a: 'You disabled or deleted the default template: the most recent active template of the same type replaced it.'
      },
      {
        q: 'My variables are empty: is that a problem?',
        a: 'No, but the document will be identical every time. Only capitalised variables between double braces are detected.'
      },
      {
        q: 'Can a deleted template be recovered?',
        a: 'Not from this screen: add your Word file again.'
      }
    ],
    permissions: {
      note: 'Reading requires « View rental documents » (or « Generate rental documents »); the « Actions » column requires « Edit rental documents ».'
    },
    related: [
      { label: 'Templates overview', helpId: 'communication.documents.modeles' },
      { label: 'Add a template', helpId: 'communication.documents.modeles.ajout' }
    ],
    keywords: ['templates list', 'default', 'enable', 'disable', 'delete a template', 'variables']
  },
  {
    id: 'communication.documents.modeles.guide',
    kind: 'section',
    title: 'Create a template with variables',
    summary:
      'A template is prepared in Word: you write your document as usual and place variables where information must be filled in automatically.',
    purpose:
      'Variables let a single template serve all your leases, receipts or statements: at each generation, they are replaced by the information of the lease or payment concerned.',
    steps: [
      {
        title: 'Compose the document in Word',
        detail: 'Lay out your texts, your header and your clauses as you wish.'
      },
      {
        title: 'Place the variables',
        detail:
          'Where a piece of information must appear, write its name between double braces, for example {{AGENCE_NOM}} or {{BAIL_LOYER_MENSUEL}}. Use capital letters, digits and the underscore, with no spaces or accents.'
      },
      {
        title: 'Save as .docx',
        detail: 'Only Word .docx files are accepted, up to 10 MB.'
      },
      {
        title: 'Add it to the agency',
        detail: 'Click « Add a template » and follow the form.'
      }
    ],
    consequences: [
      'A variable the system does not know, or whose information is missing, stays written as is between braces in the produced document: read it through before sending it.',
      'If your template uses the agency name, the tenant name, the lease number or the monthly rent and the information is missing, generation stops with a message naming the missing critical fields.',
      'The variables {{LOGO_EMETTEUR}}, {{SIGNATURE_EMETTEUR}} and {{CACHET_EMETTEUR}} insert the agency logo, signature and stamp. Without a saved image, the spot stays empty. The logo is set in « Logo and brand colour », the signature and stamp in « Signature and stamp for documents », on the agency settings page.'
    ],
    faq: [
      {
        q: 'How do I change a template I already added?',
        a: 'This screen lets you neither download nor edit it. Fix your original Word file, add it as a new template, set it as default, then disable or delete the old one.'
      },
      {
        q: 'Where can I find the list of all variables?',
        a: 'This screen does not show the full list. The variables found in your file appear in the « Placeholders » column of the table after you add it.'
      },
      {
        q: 'Is my file checked when I add it?',
        a: 'Only the format, the size and the absence of a duplicate are checked. Variables are detected, but an unknown variable is not refused.'
      },
      {
        q: 'Can I write a variable in lowercase?',
        a: 'No: only variables in capitals, digits and underscore are detected and replaced.'
      }
    ],
    permissions: { feature: 'RENTAL' },
    related: [
      { label: 'Add a template', helpId: 'communication.documents.modeles.ajout' },
      { label: 'Agency settings', to: '/tenant/:tenantId/settings' }
    ],
    keywords: ['variable', 'braces', 'word', 'docx', 'logo', 'signature', 'stamp', 'header', 'placeholder']
  },
  {
    id: 'communication.documents.modeles.ajout',
    kind: 'section',
    title: 'Add a template',
    summary: 'This form saves a new Word template for your agency: you choose its type, its name and its file.',
    steps: [
      {
        title: 'Choose the document type',
        detail: 'Residential lease (offered first), Commercial lease, Rent receipt or Account statement.'
      },
      {
        title: 'Give it a name',
        detail: 'For example « e.g. Standard residential lease ». The name is required, 255 characters at most.'
      },
      {
        title: 'Select the file',
        detail: 'Click « Select a DOCX file » and choose a Word .docx file of 10 MB at most.'
      },
      {
        title: 'Confirm',
        detail: 'Click « Download ». « Cancel » closes the form without saving anything.'
      }
    ],
    consequences: [
      'The template is added as « Active ». It also becomes the default template if it is the first one of your agency for this type; otherwise the current default template does not change.',
      'The type cannot be changed after adding: in case of a mistake, add the file again with the right type and delete the old one.',
      'A file whose content is identical to an existing template of the same type is refused (« A template with identical content already exists for this document type. »).',
      'A file that is not in .docx format, or larger than 10 MB, is refused.'
    ],
    faq: [
      {
        q: 'Why is the addition refused?',
        a: 'The message shown gives the reason: file that is not a .docx, file too large, or identical template already present for this type. The « Edit rental documents » permission is also required.'
      },
      {
        q: 'Is the new template used right away?',
        a: 'It is offered from the next generation of the same type. It is used by default only if it is the default template; otherwise you choose it in the generation form.'
      },
      {
        q: 'Is a template with no variable accepted?',
        a: 'Yes, but it will always produce the same text. Place variables so the lease information is inserted.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires the « Edit rental documents » permission.' },
    related: [
      { label: 'Create a template with variables', helpId: 'communication.documents.modeles.guide' },
      { label: 'The four template types', helpId: 'communication.documents.modeles.types' }
    ],
    keywords: ['add a template', 'import', 'upload', 'new template', 'word file']
  },
  {
    id: 'communication.documents.modeles.types',
    kind: 'section',
    title: 'Template types',
    summary:
      'Four document types have customisable templates. The type chosen when adding decides which document the template can be used for.',
    howToRead: {
      statuses: [
        {
          value: 'LEASE_HABITATION',
          label: 'Residential lease',
          description:
            'The lease contract of a residential property: this is the type used for any lease whose property is not an office, a shop or a warehouse.'
        },
        {
          value: 'LEASE_COMMERCIAL',
          label: 'Commercial lease',
          description: 'The lease contract of a property of type office, commercial shop or industrial warehouse.'
        },
        {
          value: 'RENT_RECEIPT',
          label: 'Rent receipt',
          description: 'The receipt of a payment that has been collected. Each generated receipt gets its own number.'
        },
        {
          value: 'RENT_STATEMENT',
          label: 'Account statement',
          description: 'The rental account statement of a lease, over a period chosen at generation.'
        }
      ]
    },
    consequences: [
      'A template is only offered for documents of its type: a receipt template cannot be used to produce a contract.',
      'Each type has its own default template.'
    ],
    faq: [
      {
        q: 'Where are the payment notice and the invoice?',
        a: 'This screen only offers the four types above: there is no customisable template for other documents.'
      },
      {
        q: 'Where are documents generated?',
        a: 'In the rental documents, from a lease or a payment. The generation form offers the active templates of the matching type, with the default template preselected.'
      },
      {
        q: 'How is the commercial type chosen for a contract?',
        a: 'ImmoTopia infers it from the property type of the lease: office, commercial shop or industrial warehouse give a commercial contract, all others a residential contract.'
      }
    ],
    permissions: { feature: 'RENTAL' },
    related: [
      { label: 'Add a template', helpId: 'communication.documents.modeles.ajout' },
      { label: 'Templates overview', helpId: 'communication.documents.modeles' }
    ],
    keywords: ['document type', 'residential lease', 'commercial lease', 'rent receipt', 'account statement', 'receipt']
  }
];

export default entries;
