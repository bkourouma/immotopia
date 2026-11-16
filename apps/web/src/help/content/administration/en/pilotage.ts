import type { HelpEntry } from '../../../types';

/** « pilotage » zone of the « administration » module (en): platform super-administrator tools. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Global statistics
  {
    id: 'administration.pilotage.statistiques',
    kind: 'page',
    title: 'Global statistics',
    summary:
      'This screen shows the current state of the platform: number of agencies, collaborators, subscriptions and enabled modules. The figures are recounted every time you open the page.',
    purpose:
      'The platform super-administrator uses it to see at a glance how many agencies there are and what state they are in. It is a read-only screen: nothing can be changed here.',
    howToRead: {
      notes: [
        'The figures cover no particular period: they count everything that exists when you open the page, across all agencies.',
        'There is no « Refresh » button: reopen the page to recount.',
        'If loading fails, an error message replaces the figures.'
      ]
    },
    steps: [
      { title: 'Open the page', detail: '« Administration » menu, « Statistics » entry.' },
      {
        title: 'Read the four cards at the top',
        detail: 'Agencies, collaborators, subscriptions, modules: see the « The four indicators » sheet.'
      },
      {
        title: 'Read the « Activations by module » card',
        detail: 'It shows, for each module, in how many agencies it is enabled.'
      }
    ],
    consequences: ['Read-only screen: opening it changes nothing, for agencies or for their users.'],
    faq: [
      {
        q: 'What period do the figures cover?',
        a: 'None: they are totals at the time of display, not monthly or yearly figures.'
      },
      {
        q: 'Why can the number of collaborators exceed the number of real people?',
        a: 'The screen counts attachments to an agency. A person attached to two agencies is counted twice.'
      },
      {
        q: 'Where can I see the details of an agency?',
        a: "In the platform's list of agencies: open the agency you want to see its subscription, modules and collaborators."
      }
    ],
    permissions: {
      roles: ['Platform super-administrator'],
      note: 'Screen reserved for the platform super-administrator.'
    },
    related: [
      { label: 'The four indicators', helpId: 'administration.pilotage.statistiques.indicateurs' },
      { label: 'Activations per module', helpId: 'administration.pilotage.statistiques.modules' },
      { label: 'List of agencies', to: '/admin/tenants' }
    ],
    keywords: ['statistics', 'figures', 'indicators', 'dashboard', 'platform', 'number of agencies', 'portfolio']
  },
  {
    id: 'administration.pilotage.statistiques.indicateurs',
    kind: 'section',
    title: 'The four indicators',
    summary:
      'The four cards at the top count agencies, collaborators, subscriptions and modules. Under each big figure, a line details part of the total.',
    purpose: 'They give the size of the platform and the share that is actually in service.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'active', description: 'Subscriptions currently valid.' },
        {
          value: 'TRIALING',
          label: 'on trial',
          description: 'Subscriptions in their trial period. The mention only appears if there are any.'
        },
        {
          value: 'CANCELED',
          label: 'cancelled',
          description: 'Cancelled subscriptions. The mention only appears if there are any.'
        }
      ],
      notes: [
        'Total agencies: all agencies, whatever their state (including those pending). Below: « active » and, if any, « suspended ».',
        'Team members: all attachments of people to an agency, active or not. Below: « active ». A person in two agencies counts twice.',
        'Subscriptions: all subscriptions. A subscription that is overdue or suspended is included in the total but has no mention of its own.',
        'Enabled modules: the screen shows the number of modules known to the list (four: Agency, Co-ownership, Developer and Patrimoine), even if no agency uses them. It is not a number of activations. The detail per module is in the card below; under the figure, only the first two modules are recalled. The Patrimoine module is displayed under its code « MODULE_PATRIMOINE ».'
      ]
    },
    consequences: ['Read-only: no action is possible from these cards.'],
    faq: [
      {
        q: 'Why does « Enabled modules » always show the same number?',
        a: 'Because it counts the modules in the list, not those that are switched on. To know how many agencies use each module, look at « Activations by module ».'
      },
      {
        q: 'Is a pending agency counted?',
        a: 'Yes, in « Total agencies »: the total does not distinguish states. Only « active » and « suspended » are detailed below.'
      },
      {
        q: 'Where can I see overdue subscriptions?',
        a: 'Not here: this card does not detail them. Open the agency concerned in the list of agencies.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [{ label: 'Global statistics', helpId: 'administration.pilotage.statistiques' }],
    keywords: ['agencies', 'collaborators', 'subscriptions', 'modules', 'active', 'suspended', 'trial', 'cancelled']
  },
  {
    id: 'administration.pilotage.statistiques.modules',
    kind: 'section',
    title: 'Activations per module',
    summary:
      'This card lists each module of the platform with the number of agencies where it is enabled. It only appears if at least one module is listed.',
    purpose: 'It shows which modules are actually used by agencies.',
    howToRead: {
      notes: [
        'Each line gives the module name on the left and the number of agencies where it is enabled on the right.',
        'A module that no agency has enabled is shown with 0.',
        'The listed modules are Agency, Co-ownership, Developer and Patrimoine. The Patrimoine module is displayed under its code « MODULE_PATRIMOINE ».'
      ]
    },
    consequences: ["Read-only: enabling or switching off a module is done in the agency's page."],
    faq: [
      {
        q: 'Does the figure count users?',
        a: 'No, it counts agencies: an agency where the module is enabled counts as 1, whatever its number of users.'
      },
      {
        q: 'How do I enable a module for an agency?',
        a: "From the agency's page in the platform's list of agencies, not from this screen."
      },
      {
        q: 'Why does the « Enabled modules » indicator show 4 even if no agency has enabled a module?',
        a: 'This indicator counts the listed modules, four to begin with, whether an agency has enabled them or not. To know the real usage, read the number of agencies on each line of this card.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [{ label: 'The four indicators', helpId: 'administration.pilotage.statistiques.indicateurs' }],
    keywords: ['modules', 'activation', 'syndic', 'promoter', 'patrimoine', 'agency']
  },

  // ------------------------------------------------------------------ Platform audit log
  {
    id: 'administration.pilotage.audit',
    kind: 'page',
    title: 'Platform audit log',
    summary:
      'This log keeps a trace of every action carried out on the platform, in all agencies. You can filter it, open the detail of a line, export it and check its integrity.',
    purpose:
      "It answers « who did what, where and when? » for the whole platform. It goes further than each agency's activity log: it also contains lines reserved for the platform, which agencies do not see.",
    howToRead: {
      notes: [
        'The table is sorted from most recent to oldest and loads in batches: « Load more » shows the rest.',
        'The « Export as CSV » button (top right) is reserved for the super-administrator and limited to 50,000 lines. Beyond that, a warning asks you to narrow the filters.',
        "The table's « Export » menu also offers an export of the table with the current filters, capped at 10,000 lines."
      ]
    },
    steps: [
      {
        title: 'Filter',
        detail: 'Use free search, agency, category, result, actor type, visibility or period.'
      },
      { title: 'Open a line', detail: 'Click the line or « View » to display its detail.' },
      {
        title: 'Follow a whole request',
        detail: 'In the detail, « See the whole request » searches for all lines of the same request.'
      },
      { title: 'Export', detail: '« Export as CSV » reuses the current filters.' },
      {
        title: 'Check integrity',
        detail: '« Audit log integrity » card: choose a period if needed, then « Verify integrity ».'
      }
    ],
    consequences: [
      'Viewing the log is itself recorded: opening the first page of results leaves a trace (« Load more » adds none).',
      'A CSV export is also traced, before the download starts.',
      'Lines cannot be edited or deleted from this screen. Very old lines may be purged after their retention period, if purging is enabled on the server; their seal remains.'
    ],
    faq: [
      {
        q: "What is the difference with an agency's activity log?",
        a: "An agency's activity log only shows what the agency can see. Here you see everything, including lines marked « Platform only »."
      },
      {
        q: 'How long are lines kept?',
        a: 'The duration is set on the server. By default: 24 months for lines visible to the agency and 60 months for those reserved for the platform.'
      },
      {
        q: 'Why is the « Export as CSV » button missing?',
        a: 'It is reserved for the super-administrator. It also disappears if the server refuses the export.'
      },
      {
        q: 'Who is « ImmoTopia support » in the Actor column?',
        a: 'It is the label for an action carried out by platform staff (actor type « ImmoTopia support »).'
      }
    ],
    permissions: {
      roles: ['Platform super-administrator'],
      note: 'Viewing requires the right « View the platform audit log »; the CSV export additionally requires being a super-administrator.'
    },
    related: [
      { label: 'Log table', helpId: 'administration.pilotage.audit.tableau' },
      { label: 'Log integrity', helpId: 'administration.pilotage.audit.integrite' },
      { label: 'Activity detail', helpId: 'administration.pilotage.audit.detail' },
      { label: "An agency's activity log", helpId: 'administration.agence.activite' }
    ],
    keywords: ['audit', 'log', 'traceability', 'history', 'who did what', 'security', 'export']
  },
  {
    id: 'administration.pilotage.audit.tableau',
    kind: 'table',
    title: 'Audit log table',
    summary:
      'Each line is an action recorded on the platform. Filter to find an action, then click the line to see its detail.',
    purpose: 'Find a specific action: a refused login, a settings change, an export, etc.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date and time of the action.' },
        {
          key: 'tenant',
          label: 'Agency',
          description: 'Agency concerned. A dash means an action with no agency (platform level).'
        },
        {
          key: 'actor',
          label: 'Actor',
          description:
            'Name or e-mail of the person. Failing that, the label kept at the time of the action or the actor type.'
        },
        { key: 'action', label: 'Action', description: 'What was done, in plain language.' },
        {
          key: 'resource',
          label: 'Resource',
          description: 'The item affected (property, contract, setting…), with its reference when known.'
        },
        { key: 'outcome', label: 'Result', description: 'Succeeded, Failed or Declined.' },
        {
          key: 'category',
          label: 'Category',
          description:
            'Family of the action: Authentication, Data, Administration, Security, Billing, Export, AI assistant or System.'
        },
        {
          key: 'visibility',
          label: 'Visibility',
          description:
            '« Platform » flags a line reserved for the platform. The cell stays empty for a line the agency also sees.'
        }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Succeeded', description: 'The action succeeded.' },
        { value: 'FAILURE', label: 'Failed', description: 'The action was attempted but did not succeed.' },
        { value: 'DENIED', label: 'Declined', description: 'The action was refused, for example for lack of rights.' }
      ],
      notes: [
        'Actor types you can filter on: User, ImmoTopia support, Portal, System and AI assistant.',
        'Filters: free search (action, resource, actor, request identifier), Agency, Category, Result, Actor type, Visibility and Period.'
      ]
    },
    steps: [
      {
        title: 'Choose criteria',
        detail: 'Agency and Category are shown first; the other filters open from the search bar.'
      },
      { title: 'Read the lines', detail: 'From most recent to oldest.' },
      { title: 'Open the detail', detail: 'Click a line, or « View » on the right.' },
      { title: 'See more', detail: '« Load more », under the table, adds the following lines.' }
    ],
    consequences: ['Read-only: no line is edited or deleted here.'],
    faq: [
      {
        q: 'How do I find all the lines of the same operation?',
        a: 'Open a line and click « See the whole request »: the free search is filled with the request identifier.'
      },
      {
        q: 'What does a « Declined » line mean?',
        a: 'The action was blocked, for example because the person did not have the right. It did not take place.'
      },
      {
        q: 'Can I filter on a period?',
        a: 'Yes, with the « Period » criterion in the search bar.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [
      { label: 'Activity detail', helpId: 'administration.pilotage.audit.detail' },
      { label: 'Platform audit log', helpId: 'administration.pilotage.audit' }
    ],
    keywords: ['log', 'filter', 'search', 'actor', 'result', 'category', 'visibility', 'export']
  },
  {
    id: 'administration.pilotage.audit.detail',
    kind: 'section',
    title: 'Activity detail',
    summary: 'This window shows all the information about a log line: who, what, when, from where, and what changed.',
    purpose: 'Understand an action precisely: who did it, from which device, and which values changed.',
    howToRead: {
      notes: [
        'Date, Agency, Actor (name or e-mail, then actor type), Action, Resource, Result, Category and Visibility repeat the table columns.',
        'IP address and Browser show where the request came from. A dash means the information is not available.',
        'Request ID: a marker shared by all lines of the same operation. « See the whole request » closes the window and searches for this marker in the table.',
        'Source: where the line was written from, when known.',
        'The « Changes » block shows old and new values (before → after). The « Details » block shows the full content of the record. They only appear if they exist.'
      ]
    },
    steps: [
      { title: 'Open the line', detail: 'In the table, click the line or « View ».' },
      { title: 'Read the information', detail: 'Fields are in order: date, agency, actor, action…' },
      { title: 'Follow the request', detail: '« See the whole request » shows the related lines.' },
      { title: 'Close', detail: '« Closed » button: nothing changes.' }
    ],
    consequences: ['Read-only: opening or closing the window changes nothing.'],
    faq: [
      {
        q: 'Why is the IP address empty?',
        a: 'It is not always known: an action carried out by the system, for example, has no address. The screen then shows a dash.'
      },
      {
        q: 'What is the request identifier for?',
        a: 'To group all the lines created by the same operation, for example an action that touches several items.'
      },
      {
        q: 'Where is the « Changes » block?',
        a: 'It only appears when the action changed values. For a simple view, there is none.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [{ label: 'Log table', helpId: 'administration.pilotage.audit.tableau' }],
    keywords: ['detail', 'ip address', 'browser', 'request', 'changes', 'before after']
  },
  {
    id: 'administration.pilotage.audit.integrite',
    kind: 'section',
    title: 'Log integrity',
    summary:
      'This card checks that the log has been neither modified nor cut since it was sealed. The check runs on demand, with the « Verify integrity » button.',
    purpose:
      'Each finished day is summarised in a seal, chained to the previous seal. The check recomputes these summaries from the current lines and compares them to the seals. A difference shows that a line has changed or disappeared.',
    howToRead: {
      notes: [
        'With no period, the 500 most recent seals are checked. With a period, only the seals of those days are.',
        'Green « Log intact »: no alteration detected. The fingerprint of the chain head is shown; you can copy it.',
        'Red « Audit log integrity compromised »: either the chain of seals is broken at a given seal number, or some days no longer match their seal. The anomalies table lists them.',
        'Orange « Rows added after sealing »: lines arrived late (for example after an outage). It is not necessarily an alteration, but worth a look.',
        'Grey « partition(s) purged »: old days whose lines were deleted after the retention period. This is normal, their seal remains.',
        'Blue « truncated result »: too many anomalies to show. Narrow the period.'
      ]
    },
    steps: [
      { title: 'Choose the period (optional)', detail: '« Period » date picker. You can leave it empty.' },
      { title: 'Start the check', detail: 'Click « Verify integrity » and wait.' },
      { title: 'Read the result', detail: 'A green or red frame is shown, possibly followed by warnings.' },
      {
        title: 'In case of anomaly',
        detail: 'Run it again on a shorter period to pin down the days concerned, then inform the technical team.'
      }
    ],
    consequences: [
      'The check changes nothing: it reads and recomputes.',
      'It is traced in the log (log viewing).',
      'It is limited to 10 checks per 10-minute window; beyond that, a message asks you to wait.'
    ],
    faq: [
      {
        q: 'Does this check prove that nothing was touched?',
        a: 'It detects lines being modified or removed. But the seals live in the same database: for a full guarantee, the chain head must also be kept elsewhere.'
      },
      {
        q: 'Is a line « arrived after sealing » serious?',
        a: 'Not necessarily: a service may write a line late, dated on a day that is already sealed. Worth checking, but it is not classed as an alteration.'
      },
      {
        q: 'What should I do if the chain is broken?',
        a: 'Note the seal number shown, the chain head and the period, then inform the technical team.'
      },
      {
        q: 'When are days sealed?',
        a: 'A finished day is sealed after a grace period, 2 days by default. The most recent days therefore have no seal yet.'
      }
    ],
    permissions: {
      roles: ['Platform super-administrator'],
      note: 'Requires the right « View the platform audit log ».'
    },
    related: [
      { label: 'Detected anomalies', helpId: 'administration.pilotage.audit.integrite.anomalies' },
      { label: 'Platform audit log', helpId: 'administration.pilotage.audit' }
    ],
    keywords: ['integrity', 'seal', 'chain', 'fingerprint', 'tampering', 'forgery', 'verify', 'security']
  },
  {
    id: 'administration.pilotage.audit.integrite.anomalies',
    kind: 'table',
    title: 'Detected anomalies',
    summary:
      'This table lists the days whose content no longer matches their seal, or whose lines arrived late. It appears under the red or orange frame of the check.',
    purpose: 'Pin down which days, which agencies and which visibility are concerned.',
    howToRead: {
      columns: [
        { key: 'sealDate', label: 'Date', description: 'Sealed day (UTC day).' },
        {
          key: 'tenantKey',
          label: 'Agency',
          description: 'Agency identifier; « PLATFORM » stands for lines with no agency.'
        },
        { key: 'visibility', label: 'Visibility', description: 'Visible to the agency, or reserved for the platform.' },
        { key: 'status', label: 'Status', description: 'Nature of the anomaly (see the statuses).' },
        { key: 'sealedRows', label: 'Sealed rows', description: 'Number of lines at the time of sealing.' },
        { key: 'foundRows', label: 'Lines found', description: 'Number of lines found today.' }
      ],
      statuses: [
        {
          value: 'ALTERED',
          label: 'Altered content',
          description: 'Same number of lines, but their content has changed.'
        },
        {
          value: 'ROWS_MISSING',
          label: 'Missing rows',
          description: 'There are fewer lines than at sealing.'
        },
        {
          value: 'LATE_ROWS',
          label: 'Rows added after sealing',
          description: 'There are more lines than at sealing: late write, not necessarily an alteration.'
        },
        {
          value: 'EXPIRED',
          label: 'Purged after retention',
          description: 'Old day whose lines were deleted normally. Counted separately, outside this table.'
        },
        {
          value: 'OK',
          label: 'Compliant',
          description: 'The day matches its seal. It does not appear in this table.'
        }
      ],
      notes: ['A red table lists serious anomalies; an orange table lists lines that arrived late.']
    },
    consequences: ['Read-only: nothing is corrected from this table.'],
    faq: [
      {
        q: 'What is the difference between « Missing rows » and « Altered content »?',
        a: 'With « Missing rows », lines have disappeared. With « Altered content », the number is the same but the content of at least one line has changed.'
      },
      {
        q: 'Can this table be exported?',
        a: "Yes, with the table's « Export » button, if it contains lines."
      },
      {
        q: 'Why does the Agency column show a code?',
        a: 'It shows the agency identifier as the seal keeps it, not its name.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [{ label: 'Log integrity', helpId: 'administration.pilotage.audit.integrite' }],
    keywords: ['anomaly', 'seal', 'missing lines', 'altered', 'purged', 'partition']
  },

  // ------------------------------------------------------------------ AI assistant
  {
    id: 'administration.pilotage.ia',
    kind: 'page',
    title: 'AI assistant (ImmoCopilot)',
    summary:
      'Choose here the provider and the artificial-intelligence model that run ImmoCopilot for the whole platform. The change applies to all agencies as soon as you save.',
    purpose:
      "This setting affects the whole platform and is never delegated: only the super-administrator can see and change it. Providers' access keys are not entered here: the technical team places them in the server configuration.",
    howToRead: {
      notes: [
        'A banner reminds you that keys are set in the server configuration, never in this screen. The screen shows no key: it only says « Key configured » or « Key missing ».',
        'At the bottom: where the setting comes from (« Database » once saved here, otherwise « Environment variables ») and the last change (name of the person, date).',
        'This screen sets no credits, no price and no usage quota.'
      ]
    },
    steps: [
      {
        title: 'Choose the provider',
        detail: '« Supplier » card: a greyed-out option is unavailable, the reason is written below it.'
      },
      { title: 'Choose the model', detail: '« Model » card, for OpenRouter and Anthropic.' },
      {
        title: 'Set the options',
        detail: '« Anthropic options » card: reasoning effort and fallback on refusal.'
      },
      { title: 'Save', detail: 'The « Save » button only becomes active after a change.' }
    ],
    consequences: [
      'Saving applies to the whole platform and is traced in the audit log, with the old and new setting (without any key).',
      'With « Disabled », ImmoCopilot is no longer available to anyone.',
      'If the chosen provider cannot serve (missing key, for example), the assistant is unavailable.'
    ],
    faq: [
      {
        q: "Where do I enter a provider's access key?",
        a: 'Not in this screen: it is placed in the server configuration by the technical team. The screen only tells you whether it is present.'
      },
      {
        q: 'Why is an option greyed out?',
        a: 'Because the provider cannot be used (missing key, or forbidden in production). The reason is shown under the option.'
      },
      {
        q: 'How do I switch the assistant off for everyone?',
        a: 'Choose « Disabled » then « Save ».'
      },
      {
        q: "Where can I see the assistant's consumption or credits?",
        a: 'Not in this screen: it handles neither credits nor billing of the assistant.'
      }
    ],
    permissions: {
      roles: ['Platform super-administrator'],
      note: 'Setting reserved for the platform super-administrator, never delegated.'
    },
    related: [
      { label: 'Provider', helpId: 'administration.pilotage.ia.fournisseur' },
      { label: 'Model', helpId: 'administration.pilotage.ia.modele' },
      { label: 'Anthropic options', helpId: 'administration.pilotage.ia.options-anthropic' }
    ],
    keywords: [
      'ai',
      'artificial intelligence',
      'immocopilot',
      'assistant',
      'openrouter',
      'anthropic',
      'provider',
      'model',
      'key'
    ]
  },
  {
    id: 'administration.pilotage.ia.fournisseur',
    kind: 'section',
    title: 'Provider',
    summary:
      'This card chooses who supplies the artificial intelligence of ImmoCopilot. Each provider that needs a key carries a « Key configured » or « Key missing » badge.',
    purpose: 'Designate the service that answers questions put to ImmoCopilot, or switch the assistant off.',
    howToRead: {
      statuses: [
        {
          value: 'disabled',
          label: 'Disabled',
          description: 'ImmoCopilot is unavailable for the whole platform.'
        },
        {
          value: 'openrouter',
          label: 'OpenRouter',
          description: 'Goes through OpenRouter; needs its key on the server and a model of the form provider/model.'
        },
        {
          value: 'anthropic',
          label: 'Anthropic',
          description: 'Goes directly through Anthropic; needs its key on the server.'
        },
        {
          value: 'fake',
          label: 'Fake (acceptance testing)',
          description:
            'Test provider, with no real intelligence. Forbidden in production: the option is then greyed out.'
        }
      ],
      notes: [
        '« Key configured » (green): the key is present on the server. « Key missing » (red): the option is greyed out, the reason is written below it.',
        'Switching to OpenRouter empties the model if it is not of the form provider/model.'
      ]
    },
    steps: [
      { title: 'Read the key badges', detail: 'Check that the key of the provider you want is configured.' },
      { title: 'Select a provider', detail: 'Click its line.' },
      { title: 'Choose the model', detail: 'The « Model » card appears for OpenRouter and Anthropic.' },
      { title: 'Save', detail: 'The choice only takes effect after « Save ».' }
    ],
    consequences: [
      'The choice is only applied when you save, and then to all agencies.',
      'The server refuses to save if the key of the chosen provider is missing or if « Fake (acceptance testing) » is chosen in production.'
    ],
    faq: [
      {
        q: 'What happens if I choose « Disabled »?',
        a: 'ImmoCopilot is no longer available, for all agencies, until a new choice is made.'
      },
      {
        q: 'What does « Key missing » mean?',
        a: "The provider's key has not been placed on the server. Ask the technical team to add it."
      },
      {
        q: 'What is « Fake (acceptance testing) » for?',
        a: 'To test the assistant without calling a real service. Not to be used in production, where it is refused.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [
      { label: 'Model', helpId: 'administration.pilotage.ia.modele' },
      { label: 'AI assistant', helpId: 'administration.pilotage.ia' }
    ],
    keywords: ['provider', 'openrouter', 'anthropic', 'disable', 'key', 'fake']
  },
  {
    id: 'administration.pilotage.ia.modele',
    kind: 'section',
    title: 'Model',
    summary:
      'This card chooses the artificial-intelligence model used with the selected provider. It only appears for OpenRouter and Anthropic.',
    purpose: 'A more powerful model often answers better; a lighter model is often faster or cheaper.',
    howToRead: {
      notes: [
        'OpenRouter: a drop-down list with search offers the catalogue models, in the form provider/model.',
        'If the catalogue is unavailable, a free-entry field appears with the message « List unavailable, enter the identifier manually ».',
        'Anthropic: two suggestions (claude-opus-5-5 and claude-sonnet-5-5); you can also type a more recent identifier.',
        'The model already saved stays selectable even if it has left the catalogue.'
      ]
    },
    steps: [
      { title: 'Open the card', detail: 'It is shown after choosing OpenRouter or Anthropic.' },
      { title: 'Choose or type the model', detail: 'Search the list or type its identifier.' },
      { title: 'Save', detail: '« Save » button at the bottom of the screen.' }
    ],
    consequences: [
      'The chosen model serves all agencies as soon as you save.',
      'With OpenRouter, the server refuses a model that is not of the form provider/model.'
    ],
    faq: [
      {
        q: 'Why is my Anthropic model emptied when I switch to OpenRouter?',
        a: 'OpenRouter identifiers contain a slash (provider/model). An Anthropic identifier is not valid with OpenRouter, so the field is emptied.'
      },
      {
        q: 'What if the list of models does not load?',
        a: 'Type the model identifier by hand, in the form provider/model.'
      },
      {
        q: 'Which model should I choose?',
        a: 'The screen does not recommend one. Ask the technical team before changing a setting that affects the whole platform.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [{ label: 'Provider', helpId: 'administration.pilotage.ia.fournisseur' }],
    keywords: ['model', 'openrouter', 'anthropic', 'claude', 'catalogue']
  },
  {
    id: 'administration.pilotage.ia.options-anthropic',
    kind: 'section',
    title: 'Anthropic options',
    summary:
      "This card sets the model's reasoning effort and the fallback on refusal. It only appears when the Anthropic provider is chosen.",
    purpose: "Adjust the model's level of thinking and what to do when it refuses to answer.",
    howToRead: {
      statuses: [
        { value: 'low', label: 'Low', description: 'Lowest reasoning effort.' },
        { value: 'medium', label: 'Medium', description: 'Intermediate reasoning effort.' },
        { value: 'high', label: 'High', description: 'Highest reasoning effort.' }
      ],
      notes: [
        '« Fallback on refusal »: when the model refuses to answer, the server applies a fallback. The screen does not detail how it works.',
        'With no saved setting, the starting value of the effort and the fallback comes from the server configuration.'
      ]
    },
    steps: [
      { title: 'Choose the effort', detail: 'Low, Medium or High.' },
      { title: 'Turn the fallback on or off', detail: '« Fallback on refusal » switch.' },
      { title: 'Save', detail: '« Save » button at the bottom of the screen.' }
    ],
    consequences: ['These options apply to the whole platform after saving.'],
    faq: [
      {
        q: 'What is the reasoning effort?',
        a: 'It is the degree of thinking asked of the model before it answers. The screen gives no other detail on its effect.'
      },
      {
        q: 'Do these options apply to OpenRouter?',
        a: 'No: the card only exists for Anthropic.'
      },
      {
        q: 'What exactly does the fallback do?',
        a: 'It is applied by the server when the model refuses to answer. Ask the technical team for details.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [{ label: 'AI assistant', helpId: 'administration.pilotage.ia' }],
    keywords: ['effort', 'reasoning', 'fallback', 'refusal', 'anthropic']
  },

  // ------------------------------------------------------------------ Roles, menus and permissions
  {
    id: 'administration.pilotage.roles',
    kind: 'page',
    title: 'Roles, menus and permissions',
    summary:
      'Choose a role on the left, then set on the right the menus it sees and the permissions it holds. Agency roles and the owner and renter spaces are set per agency or for all.',
    purpose:
      'A permission says what a person is allowed to do; a menu says what the interface offers them. Hiding a menu does not replace a permission: the two are set in two tabs.',
    howToRead: {
      notes: [
        'Roles are labelled « Platform », « Agency » or « Client portal ».',
        '« Accessible menus » tab: the exact tree of the side menu for this role, by category.',
        '« Detailed permissions » tab: the grid of rights, arranged by group.',
        'Portal roles (owner, renter) have no permissions: only their menus can be set.'
      ]
    },
    steps: [
      { title: 'Choose a role', detail: '« Roles » card, on the left.' },
      {
        title: 'Choose the scope',
        detail: 'For an agency or portal role: all agencies (default) or a specific agency.'
      },
      { title: 'Set the menus', detail: '« Accessible menus » tab, then « Save ».' },
      { title: 'Set the permissions', detail: '« Detailed permissions » tab, then « Save ».' }
    ],
    consequences: [
      'A changed permission changes the rights of everyone who has this role, in all agencies.',
      'A switched-off menu removes the entry from the side menu, the phone tab bar and the navigation drawer, but does not block access through permissions.',
      'Nothing is saved until you click « Save » in the tab.'
    ],
    faq: [
      {
        q: 'What is the difference between a menu and a permission?',
        a: 'The permission allows an action. The menu shows or hides an entry. Hiding a menu protects nothing: to remove a right, untick the permission.'
      },
      {
        q: 'Does my menu change apply to all agencies?',
        a: 'Only if you chose « All agencies (default) ». If you choose an agency, the setting only applies to it.'
      },
      {
        q: 'Why are some menus « Locked »?',
        a: "The super-administrator's « Administration » menu and its « Roles and permissions » entry cannot be switched off: otherwise there would be no way back to set access."
      }
    ],
    permissions: {
      roles: ['Platform super-administrator'],
      note: 'Screen reserved for the super-administrator; changing requires the right to edit the platform agencies.'
    },
    related: [
      { label: 'List of roles', helpId: 'administration.pilotage.roles.liste' },
      { label: 'Accessible menus', helpId: 'administration.pilotage.roles.menus' },
      { label: 'Detailed permissions', helpId: 'administration.pilotage.roles.permissions' }
    ],
    keywords: ['roles', 'permissions', 'rights', 'menus', 'access', 'authorisations', 'security'],
    tour: {
      steps: [
        {
          target: 'roles-liste',
          title: 'The roles',
          description: 'Click a role to set its menus and permissions. Platform, agency and portal roles are labelled.'
        },
        {
          target: 'roles-onglets',
          title: 'Menus and permissions',
          description:
            '« Accessible menus » sets what the role sees; « Detailed permissions » sets what it is allowed to do.'
        },
        {
          target: 'roles-onglets',
          title: 'Save',
          description: 'Each tab has its own « Save » button. Until you click, nothing is changed.'
        }
      ]
    }
  },
  {
    id: 'administration.pilotage.roles.liste',
    kind: 'section',
    title: 'Roles',
    summary:
      'This card lists the roles to set: platform roles, agency roles and two portal spaces (owner and renter). Click a role to set it.',
    purpose: 'Choose the typical person whose access you are setting.',
    howToRead: {
      notes: [
        'Labels: « Platform », « Agency », « Client portal ». The order runs from widest to narrowest, then alphabetical.',
        'The orange « Custom menus » label shows that a menu setting exists for this role in the scope displayed.',
        'Agency roles offered in the application labels: Administrator tenant, Manager tenant, Agent tenant, Accountant tenant (the word tenant means the agency), Storekeeper and Site manager. Platform: Platform super administrator. Portals: Owner (portal) and Tenant (portal).',
        'The reload button reloads the whole page.'
      ]
    },
    steps: [
      { title: 'Spot the role', detail: 'Read its name and label.' },
      { title: 'Click the role', detail: 'It is highlighted.' },
      { title: 'Set on the right', detail: 'The tabs on the right relate to this role.' }
    ],
    consequences: ['Choosing a role changes nothing: only « Save » saves.'],
    faq: [
      {
        q: 'Why are the owner and the renter in the list?',
        a: 'They have a portal space with its own menu, even though they have no permissions like a collaborator.'
      },
      {
        q: 'A role is missing, why?',
        a: 'The list reflects the roles registered by the platform. Some roles reserved for the system are only visible to the super-administrator.'
      },
      {
        q: 'What happens if I change role with unsaved changes?',
        a: 'Unsaved menu changes are lost when you choose another role; a message only warns you if you change agency.'
      }
    ],
    permissions: { roles: ['Platform super-administrator'] },
    related: [{ label: 'Roles, menus and permissions', helpId: 'administration.pilotage.roles' }],
    keywords: [
      'role',
      'administrator',
      'manager',
      'agent',
      'accountant',
      'storekeeper',
      'site manager',
      'owner',
      'renter'
    ]
  },
  {
    id: 'administration.pilotage.roles.menus',
    kind: 'section',
    title: 'Accessible menus',
    summary:
      'This tab sets what the chosen role sees in its menu, with the exact tree of the side menu. Each entry can be turned on or off, and a setting can apply to all agencies or to just one.',
    purpose:
      "Answer « what will this person see in their menu? ». By default, an entry is active when the role's permissions allow it.",
    howToRead: {
      notes: [
        '« All agencies (default) » sets all agencies that have no setting of their own. Choosing an agency creates a setting specific to it.',
        '« Inherits the default » label: the agency follows the common setting. « Agency-specific setting »: it has its own.',
        '« n/m active » badge: number of active entries out of the total.',
        "« Custom » label: the entry differs from the state deduced from the role's permissions. « Locked »: an entry that cannot be switched off.",
        'A platform role is set without choosing an agency.',
        'Switching off an entry also switches off its sub-entries; sub-entries cannot be ticked while their parent is off.'
      ]
    },
    steps: [
      {
        title: 'Choose the scope',
        detail:
          'For an agency or portal role: « All agencies (default) » or an agency. With no choice, nothing is shown.'
      },
      {
        title: 'Search for an entry',
        detail: '« Search menus » field, « Menu status » filter: Active or Inactive.'
      },
      { title: 'Turn on or off', detail: "The entry's switch, the boxes of its sub-entries." },
      { title: 'Save', detail: '« Save » only becomes active after a change.' },
      {
        title: 'Go back',
        detail:
          "« Default values » restores the state deduced from permissions, without saving. « Revert to default » deletes an agency's own setting."
      }
    ],
    consequences: [
      'A switched-off entry disappears from the side menu, the phone tab bar and the navigation drawer for this role.',
      'A switched-off menu does not block access: permissions remain the real protection.',
      "« Revert to default » deletes the agency's own setting, which falls back to the default.",
      'Changing agency with unsaved changes asks for confirmation, and loses them if you confirm.'
    ],
    faq: [
      {
        q: 'Does my setting apply to all agencies?',
        a: 'Yes if the scope is « All agencies (default) »: a warning message reminds you. It only applies to one agency if you chose it.'
      },
      {
        q: 'Why are the sub-entries greyed out?',
        a: 'Because their parent entry is switched off. Turn the parent back on first.'
      },
      {
        q: 'How do I restore the default menus?',
        a: '« Default values » fills the page with the state deduced from permissions; then click « Save » to keep it.'
      },
      {
        q: 'Why does « Accessible menus » say the role has no navigation?',
        a: 'Some roles are not attached to any navigation: they therefore have no menus to set.'
      }
    ],
    permissions: {
      roles: ['Platform super-administrator'],
      note: 'Saving requires the right to edit the platform agencies.'
    },
    related: [
      { label: 'Detailed permissions', helpId: 'administration.pilotage.roles.permissions' },
      { label: 'Roles', helpId: 'administration.pilotage.roles.liste' }
    ],
    keywords: ['menu', 'navigation', 'hide', 'sidebar', 'entry', 'scope', 'default', 'customise']
  },
  {
    id: 'administration.pilotage.roles.permissions',
    kind: 'section',
    title: 'Detailed permissions',
    summary:
      "This tab lists the permissions, arranged by group, with one box per permission granted to the chosen role. « Save » replaces the role's list of permissions.",
    purpose: 'State precisely what the role is allowed to do. Each permission has a label and a description in French.',
    howToRead: {
      notes: [
        'Groups shown: Platform (central administration), Agency settings, Team members, Billing, CRM (contacts, deals, activities), Properties, Lettings (leases, rent, documents), Maintenance, Finance and Site stock.',
        'Syndic and Patrimoine permissions are shown under their code (SYNDIC, PATRIMOINE) because they have no group name.',
        'Communication permissions are not shown in this screen.',
        'Search: « Permission, description, group… », « Granted to role » filter: Granted or Not granted.',
        'A portal role (owner, renter) has no permissions: the screen explains this.'
      ]
    },
    steps: [
      { title: 'Choose a role', detail: '« Roles » card. A portal role has no permissions.' },
      { title: 'Look for a permission', detail: 'Search field and « Granted to role » filter.' },
      { title: 'Tick or untick', detail: 'One box per permission; a green tick confirms granted permissions.' },
      { title: 'Save', detail: "« Save » replaces the role's whole list in one go." }
    ],
    consequences: [
      'The change applies to everyone who has this role, in all agencies: roles are not set agency by agency.',
      'Their rights are recomputed right after saving.',
      'To go back, tick the removed permissions again and save again.',
      'Nothing in the screen prevents removing important permissions (including from the Platform super administrator role): be careful.'
    ],
    faq: [
      {
        q: 'Can I remove a permission for a single agency?',
        a: 'No: the permission belongs to the role, so to all agencies. For a single agency, you can however hide menus in the neighbouring tab.'
      },
      {
        q: 'How do I know what a permission does?',
        a: 'Read the description under its label. If no translation exists, the screen shows the permission code.'
      },
      {
        q: 'Why are there no permissions for the owner or the renter?',
        a: 'Their scope comes from their attachment to the agency (lease or property), not from permissions.'
      },
      {
        q: 'Does a collaborator see the change immediately?',
        a: 'Their rights are recomputed after saving. The menu they see depends on the settings of the « Accessible menus » tab.'
      }
    ],
    permissions: {
      roles: ['Platform super-administrator'],
      note: 'Saving requires the right to edit the platform agencies.'
    },
    related: [
      { label: 'Accessible menus', helpId: 'administration.pilotage.roles.menus' },
      { label: 'Roles', helpId: 'administration.pilotage.roles.liste' }
    ],
    keywords: ['permissions', 'rights', 'authorisations', 'boxes', 'role']
  },

  // ------------------------------------------------------------------ Help feedback
  {
    id: 'administration.avis-aide',
    kind: 'page',
    title: 'Help feedback',
    summary:
      "This screen gathers users' feedback on help sheets: « Useful » or « Not useful » votes and questions asked from a sheet. It helps spot the sheets to improve.",
    purpose:
      "All users can give feedback from a help sheet. The platform super-administrator sees feedback from all agencies; an agency's administrator sees that of their own agency.",
    howToRead: {
      notes: [
        'The period is chosen at the top right: 7, 30 or 90 days. By default, 30 days.',
        'The most problematic sheets come first: those with the most « Not useful » votes and questions combined.',
        'On the platform, the list of questions also shows the agency that asked. On an agency view, it does not.',
        "An agency view only shows that agency's feedback; feedback with no agency never appears there.",
        'Up to 200 sheets are listed, with the 20 latest questions for each.'
      ]
    },
    steps: [
      { title: 'Choose the period', detail: '7, 30 or 90 days.' },
      { title: 'Spot the sheets', detail: 'Look at « Not useful » and « Questions ».' },
      { title: 'Read the questions', detail: 'Click a line that has questions to expand it.' }
    ],
    consequences: [
      'Read-only screen: questions cannot be answered from here.',
      'This feedback is used to fix the help sheets; the application does not notify anyone automatically.'
    ],
    faq: [
      {
        q: 'Who sees what?',
        a: "The super-administrator sees all feedback. An agency's administrator sees that of their own agency, thanks to the right « View the activity log »."
      },
      {
        q: 'What does the « Overview » column mean?',
        a: 'It shows the identifier of the help sheet (for example locatif.baux.liste), not its title.'
      },
      {
        q: 'Why is no feedback shown?',
        a: 'There is none in the chosen period. Try 90 days.'
      },
      {
        q: 'Can I answer a question?',
        a: 'Not from this screen: it only offers reading.'
      }
    ],
    permissions: {
      roles: ['Platform super-administrator', 'Agency administrator'],
      note: 'Platform view: reserved for the super-administrator. Agency view: requires the right « View the activity log », which only the agency administrator holds by default.'
    },
    related: [{ label: 'Feedback table', helpId: 'administration.avis-aide.tableau' }],
    keywords: ['feedback', 'reviews', 'help', 'useful', 'questions', 'improvement', 'help sheets']
  },
  {
    id: 'administration.avis-aide.tableau',
    kind: 'table',
    title: 'Feedback table',
    summary:
      'Each line is a help sheet with the number of votes received. Click a line that has questions to read them.',
    purpose: 'See which sheets disappoint and which questions users ask.',
    howToRead: {
      columns: [
        { key: 'helpId', label: 'Overview', description: 'Identifier of the help sheet concerned.' },
        { key: 'useful', label: 'Useful', description: 'Number of « Useful » votes in the period.' },
        { key: 'notUseful', label: 'Not useful', description: 'Number of « Not useful » votes in the period.' },
        {
          key: 'questionsCount',
          label: 'Questions',
          description: 'Number of questions asked from the sheet (the total is exact).'
        },
        {
          key: 'lastAt',
          label: 'Last feedback',
          description: 'Date of the last feedback received for this sheet (vote or question).'
        }
      ],
      notes: [
        'An expanded line shows the text of each question, its date and its language (French, English, Arabic). On the platform, the agency name is added.',
        'Only the 1,000 most recent questions of the period are read, and 20 are shown per sheet: a very talkative sheet can hide others, but the « Questions » counter stays exact.',
        'This table has no export button.'
      ]
    },
    steps: [
      {
        title: 'Read the counters',
        detail: 'A sheet with many « Not useful » or « Questions » needs review.'
      },
      { title: 'Expand a line', detail: 'Click it: only lines with questions expand.' },
      { title: 'Read the questions', detail: 'Date, language and, on the platform, agency.' }
    ],
    consequences: ['Read-only: no action is possible from this table.'],
    faq: [
      {
        q: 'Why is the number of questions shown lower than the counter?',
        a: 'The screen shows at most 20 questions per sheet. The counter counts all questions in the period.'
      },
      {
        q: 'Why does a line not expand?',
        a: 'It has no question: only « Useful » or « Not useful » votes were received.'
      },
      {
        q: 'Can questions mention people?',
        a: "Yes, the text is free. That is why an agency's view is reserved for its administrator."
      }
    ],
    permissions: {
      roles: ['Platform super-administrator', 'Agency administrator']
    },
    related: [{ label: 'Help feedback', helpId: 'administration.avis-aide' }],
    keywords: ['table', 'feedback', 'questions', 'sheets', 'useful', 'not useful']
  }
];

export default entries;
