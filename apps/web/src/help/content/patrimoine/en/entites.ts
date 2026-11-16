import type { HelpEntry } from '../../../types';

/** « entites » area of the « patrimoine » module (en): holding entities, consolidation, taxation. */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.entites',
    kind: 'page',
    title: 'Holding entities',
    summary:
      'A holding entity is the company or person that owns properties: SCI, holding, company, individual. This screen lists your entities and lets you create, edit or delete them.',
    purpose:
      'Declaring who owns each property lets you split figures by ownership share, consolidate assets entity by entity and estimate the tax of each one.',
    steps: [
      { title: 'Create an entity', detail: 'Click « New entity » and fill in the form.' },
      {
        title: 'Search or filter',
        detail: 'Type a name, an RCCM, a tax identifier or a contact, or filter by legal form and country.'
      },
      {
        title: 'See inactive ones',
        detail: 'Turn on « Include inactive entities »: by default, deactivated entities are hidden.'
      },
      { title: 'Open an entity', detail: 'Click « View » for its sheet: properties, consolidation, tax estimate.' },
      {
        title: 'Edit or delete',
        detail: '« Edit » and « Delete » links on the card; deletion asks for confirmation.'
      }
    ],
    consequences: [
      'Two entities of the same agency cannot have the same name.',
      'An entity cannot be deleted while properties or assets are attached to it: detach them first.',
      'A deletion is final.',
      'Each card shows the number of attached properties and, for a subsidiary, its parent entity.'
    ],
    faq: [
      {
        q: 'Why is deletion refused?',
        a: 'Properties or assets are still attached to the entity. Open its sheet and remove the attachments, then try again.'
      },
      {
        q: 'What is a parent entity?',
        a: 'It is the entity that controls this one (holding and subsidiary, for example). An entity cannot become its own parent, nor create a loop.'
      },
      {
        q: 'Where do I attach a property to an entity?',
        a: 'On the entity sheet (« Attach a property »), or from the property sheet, in the « Holders and taxation » section.'
      },
      {
        q: 'I do not see this screen.',
        a: 'It requires personal assets permissions, which by default only the agency administrator and the owner of a personal space have.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      roles: ['Agency administrator'],
      note: 'Viewing requires « View personal patrimony »; creating, editing and deleting require « Edit personal patrimony ».'
    },
    related: [
      { label: 'Entity form', helpId: 'patrimoine.entites.formulaire' },
      { label: 'Entity sheet', helpId: 'patrimoine.entite' },
      { label: 'Tax parameters', helpId: 'patrimoine.fiscalite' }
    ],
    keywords: ['SCI', 'holding', 'company', 'entity', 'holder', 'owner', 'rccm', 'subsidiary']
  },
  {
    id: 'patrimoine.entites.formulaire',
    kind: 'section',
    title: 'Holding entity form',
    summary:
      'This form is used to create an entity or edit its information: name, legal form, country, identifiers, contact, parent entity and tax status.',
    howToRead: {
      notes: [
        'Name: required, unique within the agency.',
        'Legal form: SCI (real-estate partnership), Holding company, Company, Individual or Other.',
        "Country: Côte d'Ivoire or Mali; it is used for the tax calculation.",
        'RCCM and NCC / NIF: official numbers, optional.',
        'Associated contact: a contact from your address book; Parent entity: another active entity.',
        'Tax status (override): « Individual » or « Legal entity ». Left empty, it is deduced from the legal form: Individual for an individual, Legal entity for all the others.'
      ]
    },
    steps: [
      { title: 'Fill in the name and legal form' },
      { title: 'Choose the country' },
      { title: 'If needed, add the numbers, contact, parent entity and notes' },
      { title: 'Submit', detail: '« Create » for a new entity, « Save » for an edit.' }
    ],
    consequences: [
      'The tax status and the country change the tax estimate calculation.',
      'A name already in use or a parent entity that would create a loop is refused with a message.'
    ],
    faq: [
      {
        q: 'When should I fill in the tax status?',
        a: 'Only if the rule deduced from the legal form does not fit, for example a company treated as an individual.'
      }
    ],
    related: [{ label: 'Holding entities', helpId: 'patrimoine.entites' }],
    keywords: ['new entity', 'edit', 'legal form', 'tax status', 'rccm', 'ncc', 'nif']
  },
  {
    id: 'patrimoine.entite',
    kind: 'page',
    title: 'Holding entity sheet',
    summary:
      'The sheet gathers the identity of the entity, its hierarchy, the properties it owns with their share, the consolidation of these properties and the estimate of its tax for a year.',
    purpose:
      'This is where you attach properties to the entity and read what it owns, owes and earns, property by property and in total.',
    steps: [
      { title: 'Edit', detail: 'The « Edit » button reopens the entity form.' },
      { title: 'Attach a property', detail: 'In « Attached properties », click « Attach a property ».' },
      {
        title: 'Read the consolidation',
        detail: 'The « Consolidation » section gives the totals weighted by ownership shares.'
      },
      { title: 'Estimate the tax', detail: 'In « Tax estimate », choose the year at the top right.' }
    ],
    consequences: [
      'Attaching, editing or removing a property updates the consolidation and the tax estimate.',
      'Removing a property does not delete the property: only the link with the entity disappears.'
    ],
    faq: [
      {
        q: 'How do I go to the parent or a subsidiary?',
        a: 'In « Hierarchy », click the name of the parent entity or of a subsidiary.'
      },
      {
        q: 'Why does the tax estimate show « Parameters to validate »?',
        a: 'Some tax parameters used still have to be validated by a tax adviser: the estimate remains indicative.'
      },
      {
        q: 'Does removing a property from the page delete it?',
        a: 'No: only the link between the property and the entity disappears, the property stays in your agency.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires « View personal patrimony »; editing requires « Edit personal patrimony ».'
    },
    related: [
      { label: 'Holding entities', helpId: 'patrimoine.entites' },
      { label: 'Attached properties', helpId: 'patrimoine.entite.biens' },
      { label: 'Consolidation', helpId: 'patrimoine.entite.consolidation' },
      { label: 'Tax estimate', helpId: 'patrimoine.entite.fiscalite' }
    ],
    keywords: ['entity sheet', 'SCI', 'consolidation', 'ownership share', 'tax estimate']
  },
  {
    id: 'patrimoine.entite.identite',
    kind: 'section',
    title: 'Entity identity',
    summary:
      'This card recalls the effective tax status, the RCCM, the NCC / NIF, the contact and the notes of the entity.',
    howToRead: {
      notes: [
        'Effective tax status: « Individual » or « Legal entity ». It comes from the status chosen in the form, otherwise from the legal form.',
        'Empty lines (RCCM, NCC / NIF, contact, notes) are not shown.',
        'An « Inactive » tag is shown if the entity is deactivated.'
      ]
    },
    related: [{ label: 'Entity form', helpId: 'patrimoine.entites.formulaire' }],
    keywords: ['identity', 'tax status', 'rccm']
  },
  {
    id: 'patrimoine.entite.hierarchie',
    kind: 'section',
    title: 'Hierarchy',
    summary: 'This card shows the parent entity and the subsidiaries of the entity. Click a name to open its sheet.',
    faq: [
      {
        q: 'How do I change the parent entity?',
        a: 'With « Edit », « Parent entity » field: choose another one or empty the field.'
      },
      {
        q: 'How do I add a subsidiary?',
        a: 'Open or create the subsidiary and choose this entity as its « Parent entity ».'
      }
    ],
    related: [{ label: 'Entity form', helpId: 'patrimoine.entites.formulaire' }],
    keywords: ['hierarchy', 'subsidiary', 'parent entity', 'holding']
  },
  {
    id: 'patrimoine.entite.biens',
    kind: 'section',
    title: 'Attached properties',
    summary:
      'This section lists the properties the entity owns, with the share of each. You attach a property, edit a share or remove it here.',
    steps: [
      {
        title: 'Attach a property',
        detail: '« Attach a property » button: choose the property and enter the ownership share.'
      },
      { title: 'Edit a share', detail: 'Click the pencil on the row.' },
      { title: 'Remove a property', detail: 'Click the bin then confirm.' }
    ],
    consequences: [
      'The sum of the shares of all entities on the same property cannot exceed 100%.',
      'An entity can only be attached once to the same property.',
      'If the property has no associated asset record, it automatically gets one.',
      'Removing an attachment does not delete the property.'
    ],
    faq: [
      {
        q: 'The attachment is refused.',
        a: 'The sum of shares would exceed 100%, or this entity already owns this property. The error message says which.'
      },
      {
        q: 'What is the « Effective date » for?',
        a: 'It marks the start of ownership. A future date marks the property « Upcoming »: it does not yet enter the consolidation.'
      }
    ],
    permissions: { note: 'Attaching, editing and removing require « Edit personal patrimony ».' },
    related: [{ label: 'Attached properties table', helpId: 'patrimoine.entite.biens.tableau' }],
    keywords: ['attach', 'ownership share', 'ownership', 'property', 'share']
  },
  {
    id: 'patrimoine.entite.biens.tableau',
    kind: 'table',
    title: 'Attached properties table',
    summary:
      'Each row is a property owned by the entity, with its share, the total owned on this property and the start date.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Property', description: 'The property title.' },
        { key: 'reference', label: 'Reference', description: 'The internal reference of the property.' },
        {
          key: 'sharePercent',
          label: 'Share',
          description: 'The share of this entity in the property, as a percentage.'
        },
        {
          key: 'propertyTotalSharePercent',
          label: 'Total on the property',
          description: 'The sum of the shares of all entities on this property. It never exceeds 100%.'
        },
        {
          key: 'effectiveFrom',
          label: 'Since',
          description: 'The effective date of the attachment. A dash (—) means no date.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'The pencil edits the share; the bin removes the attachment.'
        }
      ],
      notes: ['The search field filters on the property, the reference and the notes.']
    },
    faq: [
      {
        q: 'What does a total below 100% mean?',
        a: 'Part of the property is not assigned to any entity.'
      }
    ],
    related: [{ label: 'Attached properties', helpId: 'patrimoine.entite.biens' }],
    keywords: ['ownership share', 'total', 'since', 'reference']
  },
  {
    id: 'patrimoine.entite.rattachement',
    kind: 'section',
    title: 'Attach a property or edit a share',
    summary:
      'This window is used to attach a property to the entity, or to correct the share of an already attached property.',
    howToRead: {
      notes: [
        'Property: to be chosen at creation; it cannot be changed afterwards.',
        'Share (%): from 0.0001 to 100.',
        'Effective date: optional; in year-month-day format.',
        'Notes: free text, optional.'
      ]
    },
    consequences: [
      'The share is refused if, with the other entities, the total exceeds 100%.',
      'The consolidation and the tax estimate of the entity are recalculated.'
    ],
    faq: [
      {
        q: 'Can I change the property?',
        a: 'No: remove the attachment then create a new one.'
      }
    ],
    related: [{ label: 'Attached properties', helpId: 'patrimoine.entite.biens' }],
    keywords: ['attachment', 'ownership share', 'effective date']
  },
  {
    id: 'patrimoine.entite.consolidation',
    kind: 'section',
    title: 'Consolidation',
    summary:
      'The consolidation adds up, according to the entity share, the value, debt, rent and expenses of its properties, and derives yields from them.',
    howToRead: {
      notes: [
        'Properties: number of properties counted (excluding « Upcoming » properties).',
        'Estimated value and Outstanding debt: value and remaining capital, in proportion to the shares. Net equity = value minus debt.',
        'Annual rent, Annual expenses and Annual loan payments: yearly figures in proportion to the shares.',
        'Annual cash flow: rent minus expenses minus instalments (green if positive, red otherwise).',
        'Gross yield, Net yield and Net-net yield, Unrealised gain: same definitions as on the Performance screen, applied to the total.',
        '« Position as of … » gives the calculation date.'
      ]
    },
    consequences: [
      'A property whose effective date is in the future is tagged « Upcoming » and excluded from the totals.',
      'The « Incomplete cost basis » banner means at least one property has no cost basis: net-net yield and latent capital gain are then not calculated.'
    ],
    faq: [
      {
        q: 'Why does latent capital gain show « — »?',
        a: 'At least one property has no purchase price recorded in its valuations.'
      },
      {
        q: 'Does the consolidation include subsidiaries?',
        a: 'No: it only covers the properties attached to this entity.'
      }
    ],
    related: [
      { label: 'Consolidation table', helpId: 'patrimoine.entite.consolidation.tableau' },
      { label: 'Asset performance', helpId: 'patrimoine.performance' }
    ],
    keywords: ['consolidation', 'net equity', 'cash flow', 'yield', 'value', 'debt']
  },
  {
    id: 'patrimoine.entite.consolidation.tableau',
    kind: 'table',
    title: 'Consolidation table',
    summary: 'Each row is a property of the entity, with its share, value, debt, annual flow and yields.',
    howToRead: {
      columns: [
        {
          key: 'title',
          label: 'Property',
          description: 'The property title. The « Upcoming » tag flags a future effective date.'
        },
        { key: 'internalReference', label: 'Reference', description: 'The internal reference.' },
        { key: 'sharePercent', label: 'Share', description: 'The share of the entity in the property.' },
        {
          key: 'estimatedValue',
          label: 'Estimated value',
          description: 'The value of the property in proportion to the share.'
        },
        { key: 'outstandingDebt', label: 'Outstanding debt', description: 'The remaining capital, in proportion.' },
        {
          key: 'annualCashFlow',
          label: 'Annual cash flow',
          description: 'Rent minus expenses minus instalments, in proportion.'
        },
        { key: 'grossYield', label: 'Gross yield', description: 'Rent divided by the value of the property.' },
        {
          key: 'netYield',
          label: 'Net yield',
          description: 'Rent minus expenses, divided by the value of the property.'
        }
      ],
      notes: ['Yields do not depend on the share: it is a ratio between two amounts that undergo the same share.']
    },
    related: [{ label: 'Consolidation', helpId: 'patrimoine.entite.consolidation' }],
    keywords: ['properties', 'yield', 'flow', 'value']
  },
  {
    id: 'patrimoine.entite.fiscalite',
    kind: 'section',
    title: 'Entity tax estimate',
    summary:
      'For the chosen year, this section estimates the property tax and the tax on property income of the entity properties, according to its share.',
    howToRead: {
      notes: [
        'The title gives the total property tax and the total tax on property income, in FCFA.',
        'Each property has its card with its share; « Partial year » flags an attachment that started during the year.',
        '« Parameters to validate » flags that some tax parameters still have to be validated.',
        'If the chosen year has no parameters, those of the nearest available year are used, and a message says so.'
      ]
    },
    steps: [{ title: 'Choose the year', detail: '« Fiscal year » list at the top right of the card.' }],
    consequences: [
      'It is an indicative estimate, to be validated by a tax adviser: it does not replace any tax return.',
      'A property whose attachment starts after the end of the chosen year is not counted.'
    ],
    faq: [
      {
        q: 'Can I rely on it to file a return?',
        a: 'No: the calculation is indicative and relies on parameters that still have to be validated.'
      }
    ],
    related: [
      { label: 'Calculation detail', helpId: 'patrimoine.entites.calcul-fiscal' },
      { label: 'Tax parameters', helpId: 'patrimoine.fiscalite' }
    ],
    keywords: ['tax', 'property tax', 'property income', 'taxation', 'estimate']
  },
  {
    id: 'patrimoine.entites.calcul-fiscal',
    kind: 'table',
    title: 'Detail of a tax calculation',
    summary: 'This table shows, line by line, how a tax is obtained: base, allowances, rate, amount and source.',
    howToRead: {
      columns: [
        {
          key: 'code',
          label: 'Line',
          description:
            'The line type: Base, Allowance, Taxable base, Principal, Bracket, Minimum, Surcharge or Exemption.'
        },
        { key: 'label', label: 'Label', description: 'The explanation of the line.' },
        { key: 'base', label: 'Base', description: 'The amount on which the calculation is made.' },
        { key: 'rate', label: 'Rate', description: 'The rate applied, as a percentage.' },
        { key: 'amount', label: 'Amount', description: 'The amount of the line.' },
        {
          key: 'source',
          label: 'Source',
          description: 'The text the parameter comes from; « To validate » flags an unvalidated parameter.'
        }
      ],
      notes: [
        'A tax that is « not applicable » is flagged by a tag (for example Exempt, Temporary exemption, Tax parameters unavailable or Country not supported by the tax engine).',
        'Remarks may appear above the table, for example a rental value estimated from the market value.'
      ]
    },
    related: [{ label: 'Tax parameters', helpId: 'patrimoine.fiscalite' }],
    keywords: ['calculation', 'base', 'rate', 'allowance', 'exemption', 'bracket']
  },
  {
    id: 'patrimoine.fiscalite',
    kind: 'page',
    title: 'Tax parameters',
    summary:
      'This screen shows, read-only, the rates, bases and exemptions the tax engine uses to estimate property tax and tax on property income, by country and by year.',
    purpose:
      'It lets you check where the figures of tax estimates come from: each line shows its source and whether it is validated.',
    steps: [
      { title: 'Choose the country', detail: "Côte d'Ivoire or Mali, at the top of the page." },
      { title: 'Choose the year', detail: 'Optional: without a year, the engine shows the most recent ones.' },
      {
        title: 'Search or filter',
        detail: 'Look for a tax, a key, a property or a source; filter by Tax and Status.'
      }
    ],
    consequences: [
      'This screen modifies nothing: parameters cannot be changed here.',
      'If the requested year has no parameters, a sentence says which year is shown instead.'
    ],
    faq: [
      {
        q: 'What does « To validate » mean?',
        a: 'The parameter comes from the texts in force but has not yet been confirmed by a tax adviser. The estimate that uses it remains indicative.'
      },
      {
        q: 'How do I correct a rate?',
        a: 'Not from this screen: the parameters are maintained by the platform.'
      },
      {
        q: 'What are these parameters used for?',
        a: 'They are used to estimate the property tax and the tax on property income: each line shows its source and whether it is validated.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Viewing requires the « View properties » permission.' },
    related: [{ label: 'Parameters table', helpId: 'patrimoine.fiscalite.tableau' }],
    keywords: ['taxation', 'tax', 'property tax', 'rate', 'parameters', "côte d'ivoire", 'mali']
  },
  {
    id: 'patrimoine.fiscalite.tableau',
    kind: 'table',
    title: 'Tax parameters table',
    summary:
      'Each row is a tax engine parameter: which tax and which type of property it applies to, its value, its source and its status.',
    howToRead: {
      columns: [
        { key: 'taxKind', label: 'Tax', description: '« Property tax » or « Rental income tax ».' },
        {
          key: 'key',
          label: 'Key',
          description: 'The name of the parameter: calculation base, rate, allowance, minimum, exemption…'
        },
        { key: 'propertyKind', label: 'Property', description: 'Built, Unbuilt or All.' },
        {
          key: 'occupancy',
          label: 'Occupancy',
          description: 'Main residence, Owner-occupied, Rented, Vacant or All.'
        },
        { key: 'ownerKind', label: 'Owner', description: 'Individual, Legal entity or All.' },
        {
          key: 'value',
          label: 'Value',
          description: 'The value, with « % » or « year(s) » when it is a rate or a duration.'
        },
        { key: 'label', label: 'Label', description: 'Explanation of the parameter.' },
        {
          key: 'source',
          label: 'Source',
          description: 'The reference text; « View source » opens the official link when there is one.'
        },
        { key: 'status', label: 'Status', description: '« Validated » or « To validate ».' },
        { key: 'notes', label: 'Notes', description: 'Additional remarks.' }
      ],
      statuses: [
        { value: 'VALIDE', label: 'Validated', description: 'Confirmed parameter.' },
        {
          value: 'A_VALIDER',
          label: 'To validate',
          description: 'Parameter taken from the texts but not yet confirmed by a tax adviser.'
        }
      ],
      notes: ['« All » means the line applies whatever the value of this column.']
    },
    faq: [
      {
        q: 'Why are there several lines for the same rate?',
        a: 'The rate depends on the type of property, the occupancy and the owner: one line per case.'
      }
    ],
    related: [{ label: 'Tax parameters', helpId: 'patrimoine.fiscalite' }],
    keywords: ['columns', 'statuses', 'rate', 'key', 'source', 'validated']
  },
  {
    id: 'patrimoine.entites.fiscalite-bien',
    kind: 'section',
    title: 'Holders and taxation of a property',
    summary:
      'This part of the « Portfolio » tab of a property says who owns it and for what share, sets its tax profile and estimates its tax.',
    steps: [
      { title: 'Enter the holders', detail: '« Holders and shares » card.' },
      { title: 'Complete the tax profile', detail: '« Tax profile » card, if the deduced values do not fit.' },
      { title: 'Read the estimate', detail: '« Tax estimate » card, by year.' }
    ],
    consequences: ['Each save recalculates the tax estimate of the property.'],
    related: [
      { label: 'Holders and shares', helpId: 'patrimoine.entites.detenteurs-bien' },
      { label: 'Tax profile', helpId: 'patrimoine.entites.profil-fiscal' },
      { label: 'Property tax estimate', helpId: 'patrimoine.entites.estimation-bien' }
    ],
    keywords: ['holders', 'tax profile', 'tax', 'property']
  },
  {
    id: 'patrimoine.entites.detenteurs-bien',
    kind: 'section',
    title: 'Holders and ownership shares',
    summary:
      'This card lists the entities that own the property and the share of each. It is set in one go, with a single save button.',
    steps: [
      {
        title: 'Add a holder',
        detail: '« Add a holder » button, then choose the entity and its share.'
      },
      { title: 'Remove a row', detail: '« Remove » button on the row.' },
      { title: 'Save', detail: 'Click « Save holders ».' }
    ],
    consequences: [
      'Saving fully replaces the list of holders of the property.',
      'The total cannot exceed 100%; the same entity can appear only once.',
      'The unassigned share (below 100%) appears in the estimate as « Unassigned share ».'
    ],
    faq: [
      {
        q: 'The sum exceeds 100%.',
        a: 'The message « the total exceeds 100% » is shown: reduce a share before saving.'
      },
      {
        q: 'The list of entities is empty.',
        a: 'First create the entities in the « Holding entities » screen.'
      }
    ],
    permissions: { note: 'Editing requires the « Edit properties » permission.' },
    related: [{ label: 'Holding entities', helpId: 'patrimoine.entites' }],
    keywords: ['holder', 'ownership share', 'owner', 'share']
  },
  {
    id: 'patrimoine.entites.profil-fiscal',
    kind: 'section',
    title: 'Tax profile of a property',
    summary:
      'The tax profile specifies the country, whether the property is built or unbuilt and its occupancy, to refine the tax estimate. Fields left empty are deduced.',
    howToRead: {
      notes: [
        'Country, Built / unbuilt, Occupancy: leave empty to use the deduced value.',
        'Entered rental value: rental value you declare, if it differs from the rent.',
        'Exempt until year and Reason: for a temporarily exempt property.',
        'Under the form, « Inferred values » recalls what is used when the profile says nothing: built or not, occupancy, annual rent and market value.'
      ]
    },
    steps: [{ title: 'Fill in the useful fields' }, { title: 'Save', detail: 'Click « Save tax profile ».' }],
    consequences: ['The tax estimate of the property is recalculated after saving.'],
    permissions: { note: 'Editing requires the « Edit properties » permission.' },
    related: [{ label: 'Property tax estimate', helpId: 'patrimoine.entites.estimation-bien' }],
    keywords: ['tax profile', 'built', 'occupancy', 'exemption', 'rental value']
  },
  {
    id: 'patrimoine.entites.estimation-bien',
    kind: 'section',
    title: 'Tax estimate of a property',
    summary:
      'For the chosen year, this card estimates the taxes of the property, holder by holder, according to the share of each.',
    steps: [{ title: 'Choose the year', detail: '« Fiscal year » list at the top right.' }],
    consequences: [
      'It is an indicative estimate, to be validated by a tax adviser: it does not replace any tax return.'
    ],
    faq: [
      {
        q: 'What does « Unassigned share » mean?',
        a: 'The share of the property that is not assigned to any entity.'
      }
    ],
    related: [{ label: 'Calculation detail', helpId: 'patrimoine.entites.calcul-fiscal' }],
    keywords: ['estimate', 'tax', 'tax year']
  }
];

export default entries;
