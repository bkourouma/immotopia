import type { HelpEntry } from '../../../types';

/** Zone « plateforme-agences » du module « administration » (en). */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ list
  {
    id: 'administration.plateforme-agences.liste',
    kind: 'page',
    title: 'Platform agencies list',
    summary:
      'Here you will find every client agency on the platform, with its plan, its usage and its last activity. This is the starting point to create an agency or open its record.',
    purpose:
      'This area is reserved for the platform super administrator. It is used to follow client agencies, spot those approaching their subscription limit and open their record to take action.',
    steps: [
      { title: 'Create an agency', detail: 'Click "New agency": a side panel opens.' },
      {
        title: 'Search',
        detail: 'Type a name, an identifier, an e-mail address or a city in the search field.'
      },
      {
        title: 'Filter',
        detail: 'Use the "Status" and "Close to the limit" filters to narrow the list.'
      },
      { title: 'Open a record', detail: 'Click the eye icon on the row.' },
      { title: 'Edit the details', detail: 'Click the pencil icon on the row.' },
      {
        title: 'Export',
        detail: 'The table export button exports every agency matching your filters, not only the page shown.'
      }
    ],
    consequences: [
      'Viewing the list changes nothing. Suspension, activation and the subscription are managed from the agency record.',
      'No agency can be deleted from this screen.'
    ],
    faq: [
      {
        q: 'What does "Close to the limit" mean?',
        a: 'This filter keeps the agencies where at least one capacity (units, co-ownerships, building sites...) has reached 80% or more of its limit.'
      },
      {
        q: 'Why do some columns show a dash?',
        a: 'The agency subscription summary could not be read, or the agency has no usage to show yet.'
      },
      {
        q: 'What happened to the "new agency" page?',
        a: 'The old link now opens the list with the creation panel already open: it is the same form.'
      },
      {
        q: 'I cannot see this area. Why?',
        a: 'It is reserved for platform super administrators. An agency administrator does not see it.'
      }
    ],
    permissions: {
      roles: ['Platform super administrator'],
      note: 'Screen reserved for the platform super administrator.'
    },
    related: [
      { label: 'How to read the agencies table', helpId: 'administration.plateforme-agences.liste.tableau' },
      { label: 'Create an agency', helpId: 'administration.plateforme-agences.creation.assistant' }
    ],
    keywords: ['agencies', 'clients', 'platform', 'super administrator', 'subscription', 'new agency']
  },
  {
    id: 'administration.plateforme-agences.liste.tableau',
    kind: 'table',
    title: 'Agencies table',
    summary:
      'One row per agency: its name, status, packs, unit usage and next due date. The icons in the last column open the record or the edit form.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Name', description: 'Agency name, with its short identifier below.' },
        { key: 'status', label: 'Status', description: 'The agency situation: Active, Suspended or Inactive.' },
        { key: 'packs', label: 'Packs', description: 'Subscription packs in force. "None" if the agency has none.' },
        {
          key: 'lotsUsage',
          label: '% of lots used',
          description: 'Share of units used against the limit. The bar turns orange from 80% and red at 100%.'
        },
        {
          key: 'nextDue',
          label: 'Next instalment',
          description: 'Date of the agency next subscription due date.'
        },
        { key: 'contactEmail', label: 'Email', description: 'Agency contact e-mail.' },
        {
          key: 'lastActivityAt',
          label: 'Last activity',
          description: 'Date of the last activity recorded for the agency.'
        },
        { key: 'actions', label: 'Actions', description: 'View details (eye) or Edit (pencil).' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The agency works normally.' },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'The agency is suspended: its collaborators can no longer use the application.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'The agency is not active. Reactivate it from its record.'
        }
      ],
      notes: [
        'The "Status" filter offers Active and Suspended. An inactive agency stays visible without a filter.',
        'A dash means the information is not available.'
      ]
    },
    faq: [
      {
        q: 'What does the export contain?',
        a: 'All the agencies matching your filters, with their packs, the percentage of units and the next due date.'
      },
      {
        q: 'How do I find a specific agency?',
        a: 'Type its name, identifier, e-mail address or city in the search.'
      },
      {
        q: 'What happens when I click a row?',
        a: 'Nothing: use the eye icon to open the agency record.'
      }
    ],
    related: [{ label: 'Open an agency record', helpId: 'administration.plateforme-agences.detail' }],
    keywords: ['agency status', 'limit', 'units', 'packs', 'due date']
  },

  // --------------------------------------------------------------- creation
  {
    id: 'administration.plateforme-agences.creation',
    kind: 'page',
    title: 'Agency creation (old link)',
    summary:
      'This link opens the agencies list with the "New agency" panel already open. There is no separate form: it is the same panel.',
    purpose: 'It avoids breaking old links to the agency creation page.',
    steps: [
      { title: 'Fill in the panel', detail: 'Enter the agency, its administrator and its packs.' },
      { title: 'Create', detail: 'Click "Create the agency" and pass on the invitation link shown.' }
    ],
    faq: [
      {
        q: 'Why am I sent to the list?',
        a: 'The creation form lives in a panel of the list: the old link leads straight to it.'
      },
      { q: 'Do I need to update my bookmarks?', a: 'No, the old link keeps working.' },
      { q: 'Where can I find the form details?', a: 'In the help of the "New agency" panel, opened from its "?".' }
    ],
    related: [{ label: 'The "New agency" panel', helpId: 'administration.plateforme-agences.creation.assistant' }],
    keywords: ['new agency', 'create an agency']
  },
  {
    id: 'administration.plateforme-agences.creation.assistant',
    kind: 'section',
    title: 'New agency',
    summary:
      'This panel creates an agency with its administrator and its subscription in one go. You need an agency name, the administrator name and e-mail, and at least one pack.',
    purpose:
      'In one click the agency is ready: the administrator receives an invitation and the agency starts with a one-month free trial.',
    steps: [
      {
        title: 'Identify the agency and its administrator',
        detail: 'Fill in "Agency name", "Administrator name" and "Administrator email".'
      },
      {
        title: 'Choose the packs',
        detail:
          'Click one or more packs. "Integrated operator" excludes the other packs, and Patrimoine Essentiel and Patrimoine Pro cannot be combined.'
      },
      {
        title: 'Add extensions if needed',
        detail: 'Extra units, co-ownerships, building sites or owned properties, depending on the chosen packs.'
      },
      {
        title: 'Choose the billing cycle',
        detail: '"Monthly" or "Annual (11 months billed)": the 12th month is free.'
      },
      {
        title: 'Guided setup',
        detail: 'Turn it on if the agency wants it: it is a one-time fee.'
      },
      {
        title: 'Complete if you wish',
        detail: '"More options": company name, contact, address, website, brand colour.'
      },
      { title: 'Create', detail: 'Click "Create the agency".' }
    ],
    consequences: [
      'The agency starts with a one-month (30-day) free trial, automatic and impossible to turn off. You can extend it from the Subscription tab.',
      'The administrator receives an invitation e-mail. If they have no account yet, one is created when they accept the invitation. No password is shown or sent.',
      'The creation is recorded in the platform log, in your name.',
      'A double click does not create two agencies. However, re-creating the same agency with the same administrator shortly afterwards is refused: the previous invitation stays valid.'
    ],
    faq: [
      {
        q: 'Why is the "Create the agency" button greyed out?',
        a: 'No pack is chosen. Click at least one pack.'
      },
      {
        q: 'Why are some extensions not shown?',
        a: 'Each extension is only offered with certain packs. Choose the relevant pack first.'
      },
      {
        q: 'What does the message about the Integrated Operator mean?',
        a: 'For the same volume the Integrated Operator costs less than your packs: it is shown for comparison.'
      },
      {
        q: 'Is the displayed price final?',
        a: 'The summary is a live calculation, in FCFA excluding tax, provided by the platform. It updates with every change.'
      }
    ],
    permissions: {
      roles: ['Platform super administrator']
    },
    related: [
      { label: 'Read the priced summary', helpId: 'administration.plateforme-agences.creation.recapitulatif' },
      { label: 'After creation', helpId: 'administration.plateforme-agences.creation.resultat' }
    ],
    keywords: ['new agency', 'drawer', 'wizard', 'packs', 'free trial', 'administrator invitation']
  },
  {
    id: 'administration.plateforme-agences.creation.recapitulatif',
    kind: 'section',
    title: 'Priced summary',
    summary:
      'It details, in FCFA excluding tax, what the chosen subscription will cost. It recalculates as soon as you change a pack or an extension.',
    howToRead: {
      notes: [
        'Each line is a pack, an extension or the guided setup, with its quantity.',
        '"Total excl. tax, monthly" and "Total excl. tax, annual (11 months)" are the two totals. With the annual cycle, 11 monthly payments are billed.',
        'The guided setup is added as a one-time fee if you turned it on.',
        'If the Integrated Operator costs less for the same volume, a message says so.'
      ]
    },
    consequences: ['The summary commits to nothing: only creating the agency records the subscription.'],
    faq: [
      { q: 'Why is the summary empty?', a: 'No pack is chosen. Click a pack to see the calculation.' },
      { q: 'Why does it say "Calculating…"?', a: 'The calculation updates a few moments after each change.' },
      { q: 'Is the trial month billed?', a: 'No: the agency starts with a one-month free trial.' }
    ],
    keywords: ['price', 'total excl. tax', 'rate', 'FCFA', 'estimate']
  },
  {
    id: 'administration.plateforme-agences.creation.resultat',
    kind: 'section',
    title: 'Agency created: details to pass on',
    summary:
      'Once the agency is created, the panel shows the chosen plan, the administrator and the invitation link. This link is the only thing to pass on to the administrator.',
    howToRead: {
      notes: [
        '"Modules and plan": the open modules, the packs, the cycle and the trial end date.',
        '"Administrator": their name and e-mail. The "Existing account" label means they already had an account.',
        '"Invitation link": can be copied. A message says whether the invitation e-mail was sent.',
        '"Agency already created" means nothing was re-created and the previous invitation is still valid.'
      ]
    },
    steps: [
      { title: 'Check the e-mail', detail: 'See whether "Invitation email sent." is displayed.' },
      {
        title: 'Copy the link',
        detail: 'Click "Copy" and pass it on through another channel if the e-mail was not sent or went unanswered.'
      },
      { title: 'Resend if needed', detail: '"Resend the invitation" generates a new link.' },
      {
        title: 'Continue',
        detail: '"Open the record" opens the agency; "Create another agency" starts again with an empty form.'
      }
    ],
    consequences: [
      'Resending the invitation produces a new link: the old one stops working.',
      'An e-mail can end up in spam or at the wrong address: the link therefore stays displayed and copyable even when the e-mail was sent.',
      'If the e-mail could not be sent, the agency is created anyway: pass the link on yourself.'
    ],
    faq: [
      {
        q: 'The link has disappeared, what should I do?',
        a: 'For an agency that already existed, the link already passed on stays valid. Click "Resend the invitation" to get a new one.'
      },
      { q: 'How long is the link valid?', a: 'An invitation is normally valid for 7 days.' },
      {
        q: 'Will the administrator receive a password?',
        a: 'No. They create or confirm their access by accepting the invitation.'
      }
    ],
    related: [
      { label: 'Manage the agency collaborators', helpId: 'administration.plateforme-agences.detail.collaborateurs' }
    ],
    keywords: ['invitation link', 'copy the link', 'administrator', 'credentials', 'resend']
  },

  // ----------------------------------------------------------------- detail
  {
    id: 'administration.plateforme-agences.detail',
    kind: 'page',
    title: 'Agency record',
    summary:
      'The record gathers everything the platform knows about an agency: its details, collaborators, subscription, invoices and activity. You can also suspend or reactivate it.',
    purpose:
      'The super administrator follows and corrects the life of a client agency here. Each tab is a domain: the chosen tab is kept in the page address, so it can be shared.',
    howToRead: {
      notes: [
        'Tabs: Overview, Team members, Subscription, Invoices, Activity, Statistics, Data export.',
        'The label to the right of the title gives the status: Active, Suspended or Inactive.'
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The agency works. The "Suspend" button is offered.' },
        { value: 'SUSPENDED', label: 'Suspended', description: 'Access cut. The "Enable" button is offered.' },
        { value: 'INACTIVE', label: 'Inactive', description: 'Agency not active. The "Enable" button is offered.' }
      ]
    },
    steps: [
      { title: 'Choose a tab', detail: 'Click the tab you want under the title.' },
      { title: 'Edit the details', detail: '"Edit" button at the top right.' },
      { title: 'Suspend', detail: '"Suspend", then confirm in the window.' },
      { title: 'Reactivate', detail: '"Enable", then confirm.' }
    ],
    consequences: [
      'Suspending an agency signs out all its collaborators, who lose access until it is reactivated. Their data is kept.',
      'The agency owner and co-owner portals also refuse access while it is suspended.',
      'No e-mail is sent to the agency or its collaborators: warn them yourself.',
      'Suspension and reactivation are recorded in the platform log, in your name.',
      'Activating does not sign anyone back in: each collaborator must sign in again.',
      'No agency deletion is possible from this record.'
    ],
    faq: [
      { q: 'Is suspending permanent?', a: 'No: "Enable" restores access. Data is not erased.' },
      {
        q: 'Does suspending the agency change its subscription?',
        a: 'No: suspension does not modify the subscription, which is managed separately in the Subscription tab.'
      },
      {
        q: 'How do I make the agency read-only without suspending it?',
        a: 'In the Subscription tab, "Set to read-only" button.'
      },
      {
        q: 'What happens to the chosen tab if I reload the page?',
        a: 'It stays displayed: the tab is part of the page address, which you can also share.'
      }
    ],
    permissions: {
      roles: ['Platform super administrator']
    },
    related: [
      { label: 'Subscription tab', helpId: 'administration.plateforme-agences.detail.abonnement' },
      { label: 'Invoices tab', helpId: 'administration.plateforme-agences.detail.factures' },
      { label: 'Edit agency', helpId: 'administration.plateforme-agences.modification' }
    ],
    keywords: ['suspend', 'reactivate', 'activate', 'agency record', 'agency status']
  },
  {
    id: 'administration.plateforme-agences.detail.apercu',
    kind: 'section',
    title: 'Agency overview',
    summary: 'This tab shows the agency identity details: logo, brand colour, contact details and status.',
    howToRead: {
      notes: [
        'Fields: name, legal name, e-mail, phone, city, country, website and status. A dash means "not filled in".',
        'It is read-only: to correct a detail, use "Edit".'
      ]
    },
    faq: [
      { q: 'How do I change the logo?', a: 'Via "Edit", "Upload a logo" button.' },
      { q: 'Where is the postal address?', a: 'It is not shown here; it is read and corrected in "Edit".' },
      { q: 'Where can I see the brand colour?', a: 'It is shown next to the logo when it is filled in.' }
    ],
    related: [{ label: 'Edit agency', helpId: 'administration.plateforme-agences.modification' }],
    keywords: ['details', 'contact details', 'logo', 'identity']
  },
  {
    id: 'administration.plateforme-agences.detail.collaborateurs',
    kind: 'section',
    title: 'Team members tab',
    summary:
      'The list of people who have access to the agency, with their role and last sign-in. You can invite some, open their record, disable or re-enable them.',
    steps: [
      { title: 'Invite', detail: '"Invite" button: opens the invitation form.' },
      { title: 'Search or filter', detail: 'By name or e-mail, by status or by role.' },
      { title: 'Open the record', detail: 'Eye icon.' },
      {
        title: 'Deactivate or enable',
        detail: 'Next icon on the row: it acts immediately, with no confirmation window.'
      }
    ],
    consequences: [
      'Disabling a collaborator closes all their sessions and cancels the pending invitations they had sent. They keep their account and can be re-enabled.',
      'You cannot disable the last active administrator of an agency, nor your own account.',
      'Disabling and re-enabling are recorded in the log, in your name.',
      'No e-mail is sent to the collaborator when you disable them.'
    ],
    faq: [
      {
        q: 'What does "Invitation pending" mean?',
        a: 'The person was invited but has not accepted the invitation yet.'
      },
      {
        q: 'Why is the disabling refused?',
        a: 'It is the last active administrator of the agency. First give the administrator role to someone else.'
      },
      {
        q: 'Where can I see all possible actions on a person?',
        a: 'In their record: roles, password, sessions and status.'
      }
    ],
    related: [
      { label: 'A collaborator record', helpId: 'administration.plateforme-agences.collaborateur' },
      { label: 'Invite a team member', helpId: 'administration.plateforme-agences.invitation' }
    ],
    keywords: ['team', 'users', 'members', 'disable', 'invitation']
  },
  {
    id: 'administration.plateforme-agences.detail.collaborateurs.tableau',
    kind: 'table',
    title: 'Agency collaborators table',
    summary: 'One row per collaborator: their name, roles, status and last sign-in.',
    howToRead: {
      columns: [
        { key: 'user', label: 'User', description: 'Full name, or e-mail if none, with the address below.' },
        { key: 'roles', label: 'Roles', description: 'The person roles in this agency.' },
        { key: 'status', label: 'Status', description: 'Active, Invitation pending or Deactivated.' },
        { key: 'lastLoginAt', label: 'Last sign-in', description: 'Date of the last sign-in, or "Never".' },
        { key: 'actions', label: 'Actions', description: 'View details, then Deactivate or Enable.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The person can use the agency.' },
        { value: 'PENDING_INVITE', label: 'Invitation pending', description: 'Invitation sent, not accepted yet.' },
        { value: 'DISABLED', label: 'Deactivated', description: 'Access to this agency withdrawn.' }
      ]
    },
    faq: [
      { q: 'What does the export contain?', a: 'All the collaborators matching your filters.' },
      { q: 'How do I filter by role?', a: 'Use the "Role" filter in the search bar.' },
      {
        q: 'What does the number in brackets in the title count?',
        a: 'The total number of collaborators matching your search.'
      }
    ],
    keywords: ['collaborator status', 'role', 'last sign-in']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement',
    kind: 'section',
    title: 'Subscription tab',
    summary:
      'It shows and manages the agency subscription: packs, usage, exemptions, open modules and extension requests. This is where you extend the trial or make the agency read-only.',
    purpose:
      'The agency subscription is the sum of its packs and extensions. The open modules are deduced from them automatically.',
    steps: [
      { title: 'Read the summary', detail: 'Status, phase, current period, trial end and overage policy.' },
      { title: 'Check usage', detail: 'The bars compare each capacity with its limit.' },
      { title: 'Add or remove a pack', detail: '"Packs and extensions" block.' },
      { title: 'Grant an exemption', detail: '"Grant an exception" button of the "Usage" block.' },
      { title: 'Handle requests', detail: 'Open "Extension requests" at the bottom of the tab.' }
    ],
    consequences: [
      'The actions in this tab are recorded in the platform log, in your name.',
      'No action in this tab sends an e-mail to the agency. Invoices are managed in the Invoices tab.'
    ],
    faq: [
      {
        q: 'Why does the overage policy block nothing?',
        a: 'When subscription checks are inactive (orange message), no overage is blocked, whatever policy is chosen.'
      },
      {
        q: 'Where did the modules go?',
        a: 'They are deduced from the packs and shown in "Included modules", read-only.'
      },
      {
        q: 'What happens when the agency has no subscription?',
        a: 'The tab says so: "This agency has no subscription yet."'
      }
    ],
    permissions: { roles: ['Platform super administrator'] },
    related: [
      { label: 'Subscription summary', helpId: 'administration.plateforme-agences.detail.abonnement.resume' },
      { label: 'Reasons requested', helpId: 'administration.plateforme-agences.detail.abonnement.motifs' }
    ],
    keywords: ['subscription', 'packs', 'trial', 'read-only', 'overage', 'quota']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.resume',
    kind: 'section',
    title: 'Subscription summary',
    summary:
      'It gives the status, phase, current period, trial end and subscription settings. The overage policy is changed here with one click.',
    howToRead: {
      statuses: [
        { value: 'TRIALING', label: 'Trial', description: 'Free trial period in progress.' },
        { value: 'ACTIVE', label: 'Active', description: 'Subscription in progress.' },
        {
          value: 'PAST_DUE',
          label: 'Overdue',
          description: 'A due payment is not settled. The grace days are running.'
        },
        { value: 'CANCELED', label: 'Cancelled', description: 'Subscription cancelled.' },
        { value: 'SUSPENDED', label: 'Suspended', description: 'Subscription suspended.' }
      ],
      notes: [
        'The "Phase" is the operating state: No subscription, Trial, Active, Grace period or Read-only.',
        '"Grace days": time allowed after an unpaid due payment before read-only mode (shown here, cannot be changed).',
        '"Overage policy": Block overage, Bill the overage or Warn only. The change is immediate.',
        '"Combo discount": percentage discount linked to combining packs.'
      ]
    },
    steps: [
      {
        title: 'Extend the trial',
        detail: 'During the trial, click "Extend", enter a number of days (15 by default, from 1 to 365) then confirm.'
      },
      { title: 'Change the overage policy', detail: 'Pick a value in the list: it is saved straight away.' },
      { title: 'Switch to read-only', detail: '"Set to read-only" button: a reason is required.' },
      { title: 'Lift read-only', detail: '"Lift read-only mode" button, then confirm.' }
    ],
    consequences: [
      'Extending the trial pushes back the trial end by the number of days entered, and the end of the current period with it.',
      'Manual read-only blocks the agency writes until you lift it yourself: neither a payment nor the scheduled task lifts it. Portals, payments and invoices remain accessible.',
      'The read-only reason stays displayed on the record and appears in the log. Lifting the measure is also logged.',
      'The policy change and the trial extension are recorded in the log.',
      'No e-mail is sent to the agency by these actions.'
    ],
    faq: [
      {
        q: 'What is the difference between manual read-only and unpaid read-only?',
        a: 'The manual one is decided by you and only lifted by you. The unpaid one follows the payment delay.'
      },
      { q: 'Why is "Extend" not shown?', a: 'It is only offered during the trial.' },
      {
        q: 'Why the orange message "Subscription checks inactive"?',
        a: 'The platform does not apply the limits yet: modules that were not subscribed stay accessible and nothing is blocked.'
      }
    ],
    related: [{ label: 'Reasons requested', helpId: 'administration.plateforme-agences.detail.abonnement.motifs' }],
    keywords: ['subscription status', 'phase', 'trial', 'grace', 'unpaid', 'read-only', 'overage policy']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.consommation',
    kind: 'section',
    title: 'Usage',
    summary:
      'Each bar compares what the agency uses with its limit: units, co-ownerships, building sites, owned properties, assets, inventory photos and signatures of the month.',
    howToRead: {
      notes: [
        '"12 / 50" means 12 used for a limit of 50.',
        'The bar turns orange from 80% and red at 100%.',
        'If the agency exceeds its limit, "X over the cap" appears under the bar.',
        'Analysed inventory photos and electronic signatures are counted per month.'
      ]
    },
    steps: [
      {
        title: 'Grant an exemption',
        detail:
          'Click "Grant an exception", choose the capacity, the quantity (negative to remove), the reason and, if you wish, an expiry date.'
      }
    ],
    consequences: [
      'An exemption adds (or removes) capacity without changing the packs. It is recorded in the log with its reason.',
      'The reason is mandatory.'
    ],
    faq: [
      {
        q: 'Does a red bar block the agency?',
        a: 'It depends on the overage policy and on the platform check mode. See the subscription summary.'
      },
      {
        q: 'Can an exemption stop by itself?',
        a: 'Yes, if you fill in "Expires on". Otherwise it stays until it is revoked.'
      },
      { q: 'Can capacity be removed?', a: 'Yes: enter a negative quantity.' }
    ],
    related: [{ label: 'Exemptions table', helpId: 'administration.plateforme-agences.detail.abonnement.derogations' }],
    keywords: ['usage', 'quota', 'capacity', 'ceiling', 'units']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.packs',
    kind: 'table',
    title: 'Packs and extensions',
    summary:
      'The list of the agency packs, extensions and guided setups, with their frozen monthly price. You can add some, change the discount or price, switch tier or remove.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Item', description: 'Name of the pack, extension or guided setup.' },
        { key: 'quantity', label: 'Quantity', description: 'Number of units subscribed.' },
        {
          key: 'price',
          label: 'Fixed monthly price',
          description: 'Quantity multiplied by the monthly price excluding tax of the unit, after any discount.'
        },
        { key: 'period', label: 'Start / end', description: 'Start date, and end date or "no end date".' },
        { key: 'status', label: 'Status', description: 'Active, Scheduled or Completed.' },
        { key: 'actions', label: 'Actions', description: 'Edit, switch tier, remove at the due date or immediately.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Item in force.' },
        { value: 'SCHEDULED', label: 'Scheduled', description: 'Item that will start later.' },
        { value: 'ENDED', label: 'Completed', description: 'Item stopped: no action possible.' }
      ]
    },
    steps: [
      { title: 'Add', detail: '"Add" button: choose the offer, the quantity and an optional discount.' },
      {
        title: 'Change the price',
        detail: '"Edit": percentage discount or frozen monthly price excluding tax per unit.'
      },
      { title: 'Switch Patrimoine tier', detail: '"Switch to Pro" or "Switch to Essential" on the Patrimoine packs.' },
      {
        title: 'Remove at the due date',
        detail: 'The item stays active until the end of the current period, without refund.'
      },
      { title: 'Remove immediately', detail: 'A reason is required. The item stops straight away, without refund.' }
    ],
    consequences: [
      'A discount or price change takes effect on the next invoice, without proration. The reason is optional and appears in the log.',
      'Moving to a higher tier is immediate, prorated over the period. Moving to a lower tier is scheduled for the due date, without proration. During the trial, the change is immediate and without proration.',
      'An immediate removal is not refunded. Removing a pack updates the modules open for the agency.',
      'Adding and removing are recorded in the platform log.'
    ],
    faq: [
      {
        q: 'Why can I not add a pack?',
        a: 'The agency already has it, or it is incompatible: Patrimoine Essentiel and Pro cannot be combined.'
      },
      { q: 'Why is "Remove at the end of the period" missing?', a: 'The end of the item is already scheduled.' },
      { q: 'Why are some extensions missing?', a: 'An extension can only be sold with certain packs.' }
    ],
    related: [{ label: 'Reasons requested', helpId: 'administration.plateforme-agences.detail.abonnement.motifs' }],
    keywords: ['pack', 'extension', 'discount', 'frozen price', 'remove', 'tier', 'patrimoine']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.derogations',
    kind: 'table',
    title: 'Capacity exemptions',
    summary: 'The capacity additions or removals granted by hand to the agency, with their reason and expiry date.',
    howToRead: {
      columns: [
        {
          key: 'capacityKey',
          label: 'Capacity',
          description: 'Capacity concerned: units, co-ownerships, building sites, etc.'
        },
        { key: 'delta', label: 'Quantity', description: 'Quantity added, or removed if negative.' },
        { key: 'reason', label: 'Reason', description: 'Reason entered when granted.' },
        { key: 'expiresAt', label: 'Expires on', description: 'Expiry date, or "no limit".' },
        { key: 'status', label: 'Status', description: 'Active, Expired or Revoked.' },
        { key: 'actions', label: 'Actions', description: 'Revoke an exemption that is still active.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The exemption counts in the capacity.' },
        { value: 'EXPIRED', label: 'Expired', description: 'The expiry date has passed.' },
        { value: 'REVOKED', label: 'Revoked', description: 'You cancelled it.' }
      ]
    },
    consequences: [
      'Revoking asks for confirmation and is recorded in the log. The capacity goes back to that of the packs.'
    ],
    faq: [
      { q: 'Can a revoked exemption be restored?', a: 'No: grant a new one.' },
      { q: 'Where can I see the full reason?', a: 'In the "Reason" column and in the revocation confirmation window.' },
      { q: 'What happens at expiry?', a: 'It is no longer counted; the row stays visible with the "Expired" status.' }
    ],
    keywords: ['exemption', 'commercial gesture', 'capacity', 'revoke']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.modules',
    kind: 'section',
    title: 'Included modules',
    summary:
      'The application modules (Agency, Co-ownership, Developer, Patrimoine) and their access level, deduced from the agency packs.',
    howToRead: {
      statuses: [
        { value: 'FULL', label: 'Open', description: 'The module is fully usable.' },
        { value: 'READ_ONLY', label: 'Read-only', description: 'The agency can view, not modify.' },
        { value: 'NONE', label: 'Closed', description: 'The module is not accessible.' }
      ],
      notes: ['This list is read-only: to open a module, add the matching pack.']
    },
    faq: [
      { q: 'How do I open a module?', a: 'Add the pack that contains it in "Packs and extensions".' },
      {
        q: 'Why is a module open when no pack contains it?',
        a: 'When subscription checks are inactive, all modules stay accessible.'
      },
      { q: 'What does "Read-only" mean here?', a: 'Access to the module is limited to viewing.' }
    ],
    keywords: ['modules', 'access', 'agency', 'syndic', 'promoter', 'patrimoine']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.demandes',
    kind: 'section',
    title: 'Extension requests',
    summary:
      'The requests the agency made to increase its capacity or add an offer. You mark them handled or rejected.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date of the request.' },
        { key: 'by', label: 'Requester', description: 'Person who made the request.' },
        { key: 'offer', label: 'Offer', description: 'Offer requested, with the quantity.' },
        { key: 'message', label: 'Message', description: 'Text entered by the requester.' },
        { key: 'status', label: 'Status', description: 'Open, Handled or Rejected.' },
        { key: 'actions', label: 'Actions', description: '"Mark as handled" or "Reject", while the request is open.' }
      ],
      statuses: [
        { value: 'OPEN', label: 'Open', description: 'Waiting for your decision.' },
        { value: 'HANDLED', label: 'Handled', description: 'You marked it handled.' },
        { value: 'DECLINED', label: 'Rejected', description: 'You rejected it.' }
      ]
    },
    consequences: [
      'Marking handled or rejecting only closes the request: the subscription is not modified. To grant the extension, add it yourself in "Packs and extensions".',
      'The decision is recorded in the log. A closed request cannot be reopened.'
    ],
    faq: [
      { q: 'Is the requester notified?', a: 'No e-mail is sent by this action.' },
      { q: 'How do I grant the request?', a: 'Add the requested offer, then mark the request "Handled".' },
      { q: 'Where do I open this section?', a: 'At the bottom of the tab: click "Extension requests".' }
    ],
    keywords: ['request', 'extension', 'handle', 'reject']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.apercu-facture',
    kind: 'section',
    title: 'Next invoice (preview)',
    summary:
      'A preview of the agency next subscription invoice: period, lines, total excluding tax, VAT and total including tax.',
    howToRead: {
      notes: [
        'Amounts are in FCFA.',
        'The preview creates no invoice: to produce one, use "Generate an invoice" in the Invoices tab.',
        '"Preview unavailable" appears if the calculation could not be done.'
      ]
    },
    faq: [
      { q: 'Is the preview sent to the agency?', a: 'No, only you can see it.' },
      {
        q: 'Why does the total change after a pack change?',
        a: 'The preview reflects the subscription as it is when you open the section.'
      },
      { q: 'Where do I generate the real invoice?', a: 'In the Invoices tab.' }
    ],
    related: [{ label: 'Invoices tab', helpId: 'administration.plateforme-agences.detail.factures' }],
    keywords: ['preview', 'upcoming invoice', 'VAT', 'incl. tax']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.motifs',
    kind: 'section',
    title: 'Windows that ask for a reason',
    summary:
      'Some sensitive actions ask you to enter a reason before confirming. The confirm button stays greyed out while the reason is empty.',
    howToRead: {
      notes: [
        '"Remove immediately": reason mandatory.',
        '"Set to read-only": reason mandatory, at least 3 characters.',
        '"Edit" a discount or a price: reason optional.',
        'Granting an exemption, issuing a credit note and setting read-only from an invoice also require a reason, in their own window.'
      ]
    },
    consequences: [
      'The reason is recorded in the platform log with your name and the date. It is not sent to the agency.',
      'For manual read-only, the reason is also displayed on the agency record.',
      'A reason cannot be edited afterwards.'
    ],
    faq: [
      { q: 'Why is the button greyed out?', a: 'The reason is mandatory: enter it to enable confirmation.' },
      {
        q: 'What reason should I write?',
        a: 'A clear sentence, for example "Commercial gesture" or "September unpaid invoice".'
      },
      {
        q: 'Does the agency see the reason?',
        a: 'Not for the removal and the discount. The reason for a manual read-only is shown on the record, on the platform side.'
      }
    ],
    keywords: ['reason', 'justification', 'log', 'confirmation']
  },
  {
    id: 'administration.plateforme-agences.detail.factures',
    kind: 'section',
    title: 'Invoices tab',
    summary:
      'The subscription invoices the platform issues to the agency. You can generate them, issue them, record a payment, issue a credit note or download the PDF.',
    steps: [
      { title: 'Generate an invoice', detail: '"Generate an invoice" button: next period, or monthly overage.' },
      { title: 'Issue', detail: 'On a draft, "Issue" gives the final number and sends the invoice.' },
      { title: 'Record a payment', detail: '"Mark as paid": payment method, date, reference, proof.' },
      { title: 'Correct', detail: '"Credit note" cancels an issued invoice.' },
      { title: 'Download', detail: '"PDF", or "Arabic translation" for the translated version.' }
    ],
    consequences: [
      'Issuing an invoice sends it by e-mail, PDF attached, to the agency active administrators; failing that, to the agency contact e-mail.',
      'All these actions are recorded in the platform log.'
    ],
    faq: [
      {
        q: 'Where do I open an invoice detail?',
        a: 'Click its number: a panel shows the lines, the payment and the online payments.'
      },
      {
        q: 'What does "Nothing to invoice for this period" mean?',
        a: 'There is no line to bill for the requested period.'
      },
      {
        q: 'What does "This invoice already exists" mean?',
        a: 'The invoice for this period was already created: nothing is duplicated.'
      }
    ],
    permissions: { roles: ['Platform super administrator'] },
    related: [{ label: 'Invoices table', helpId: 'administration.plateforme-agences.detail.factures.tableau' }],
    keywords: ['invoices', 'billing', 'subscription', 'issue', 'credit note', 'payment']
  },
  {
    id: 'administration.plateforme-agences.detail.factures.tableau',
    kind: 'table',
    title: 'Agency invoices table',
    summary: 'One row per invoice or credit note, with its nature, period, due date, amount including tax and status.',
    howToRead: {
      columns: [
        {
          key: 'number',
          label: 'Number',
          description: 'Invoice number, or "Draft" before issue. Click to open the detail.'
        },
        { key: 'nature', label: 'Nature', description: 'Period, Overrun or Credit note.' },
        { key: 'period', label: 'Period', description: 'Period covered by the invoice.' },
        { key: 'due', label: 'Due date', description: 'Payment deadline.' },
        { key: 'amount', label: 'Total amount', description: 'Total including all taxes, in FCFA.' },
        { key: 'status', label: 'Status', description: 'Situation of the invoice.' },
        {
          key: 'actions',
          label: 'Actions',
          description: 'PDF, Arabic translation, Issue, Mark as paid, Credit note, Set to read-only.'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Not issued yet, no final number.' },
        { value: 'ISSUED', label: 'Issued', description: 'Sent to the agency, waiting for payment.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'The due date has passed without payment.' },
        { value: 'PAID', label: 'Paid', description: 'The payment is recorded.' },
        { value: 'FAILED', label: 'Failed', description: 'The payment failed; the invoice remains to be settled.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Cancelled by a credit note.' },
        { value: 'REFUNDED', label: 'Refunded', description: 'Invoice refunded.' }
      ],
      notes: [
        '"Mark as paid" is offered for Issued, Overdue or Failed invoices.',
        '"Set to read-only" only appears on an Overdue overage invoice.'
      ]
    },
    faq: [
      {
        q: 'Which filters are available?',
        a: 'Search by number or payment reference, status, issue date, nature and amount including tax.'
      },
      {
        q: 'Does an unpaid overage block the agency?',
        a: 'No, not automatically: the invoice stays "Overdue". The "Set to read-only" button blocks it by hand.'
      },
      { q: 'Can a draft be deleted?', a: 'No deletion is offered in this tab.' }
    ],
    related: [
      { label: 'Record a payment', helpId: 'administration.plateforme-agences.detail.factures.paiement' },
      { label: 'Issue a credit note', helpId: 'administration.plateforme-agences.detail.factures.avoir' }
    ],
    keywords: ['invoice status', 'overdue', 'paid', 'draft', 'credit note', 'PDF']
  },
  {
    id: 'administration.plateforme-agences.detail.factures.generation',
    kind: 'section',
    title: 'Generate an invoice',
    summary:
      'This window creates the invoice for the next period or for the monthly overage of an annual subscription. You can issue it straight away.',
    steps: [
      { title: 'Choose the nature', detail: '"Next period" or "Monthly overage (annual subscription)".' },
      { title: 'Decide on issuing', detail: 'Tick "Issue immediately" to send the invoice right away.' },
      { title: 'Generate', detail: 'Click "Generate".' }
    ],
    consequences: [
      'Without the issue option, the invoice stays a draft: it is not sent.',
      'With immediate issue, the invoice gets its number and is sent by e-mail to the agency administrators.',
      'If an invoice already exists for this period, nothing is created twice.'
    ],
    faq: [
      { q: 'When should I choose "Overrun"?', a: 'To bill the overage of an annual subscription, month by month.' },
      { q: 'How do I send a draft later?', a: 'Click "Issue" on the draft row.' },
      { q: 'Can a draft be edited?', a: 'No editing is offered here.' }
    ],
    keywords: ['generate', 'create an invoice', 'next period', 'overage']
  },
  {
    id: 'administration.plateforme-agences.detail.factures.paiement',
    kind: 'section',
    title: 'Record a payment',
    summary:
      'This window records the payment of an invoice received outside the application: bank transfer, Mobile Money, cheque or cash.',
    steps: [
      { title: 'Choose the payment method', detail: 'Bank transfer, Mobile Money, Cheque or Cash.' },
      { title: 'Enter the date', detail: 'The payment date cannot be in the future.' },
      { title: 'Add a reference', detail: 'Transfer, transaction or cheque number (optional).' },
      { title: 'Attach a proof', detail: 'PDF or image, a single file (optional).' },
      { title: 'Save', detail: 'Click "Save payment".' }
    ],
    consequences: [
      'The invoice becomes "Paid".',
      'If the subscription due date is reached, or if the agency was unpaid, the subscription is renewed: the message "Payment recorded: subscription reactivated" confirms it.',
      'The payment is recorded in the log, in your name.'
    ],
    faq: [
      {
        q: 'Do online payments go through here?',
        a: 'No: online payments appear in the invoice detail, without any input from you.'
      },
      {
        q: 'Can a payment entered by mistake be cancelled?',
        a: 'No cancellation is offered in this tab: check before saving.'
      },
      { q: 'Is the proof mandatory?', a: 'No. It can then be downloaded from the invoice detail.' }
    ],
    keywords: ['payment', 'mark paid', 'transfer', 'mobile money', 'cheque', 'cash', 'proof']
  },
  {
    id: 'administration.plateforme-agences.detail.factures.avoir',
    kind: 'section',
    title: 'Issue a credit note',
    summary:
      'A credit note cancels an issued invoice. It requires a reason and can put its lines back on hold for a corrected invoice.',
    steps: [
      { title: 'Enter the reason', detail: 'The reason is mandatory.' },
      {
        title: 'Choose whether to re-bill',
        detail: 'Tick "Put the lines back on hold for a corrected invoice" if you want to re-bill afterwards.'
      },
      { title: 'Issue', detail: 'Click "Issue the credit note".' }
    ],
    consequences: [
      'The original invoice is cancelled and a credit note is created. An invoice can only receive one credit note.',
      'The credit note is sent by e-mail to the agency administrators.',
      'If the invoice was already paid, the credit note flags it as a refund due: the refund itself is made outside this screen.',
      'The operation is recorded in the log, reason included. It is irreversible.'
    ],
    faq: [
      {
        q: 'Which invoices can receive a credit note?',
        a: 'Subscription invoices that are Issued, Overdue or Paid. The "Credit note" button appears on other rows but the operation is refused there.'
      },
      { q: 'Can a credit note be issued on a credit note?', a: 'No.' },
      {
        q: 'What does the "Put the lines back on hold for a corrected invoice" box do?',
        a: 'It puts the billed items back on hold, so that a corrected invoice can take them again.'
      }
    ],
    keywords: ['credit note', 'cancel an invoice', 'refund']
  },
  {
    id: 'administration.plateforme-agences.detail.activite',
    kind: 'section',
    title: 'Activity tab',
    summary:
      'A quick look at the agency life: number of collaborators, last sign-in, subscription and enabled modules.',
    howToRead: {
      notes: [
        'Three counters: Team members, Active collaborators and Disabled collaborators.',
        '"Last sign-in": date of the last recorded sign-in in the agency, or "Never".',
        'The "Subscription" block recalls the status and the end of the current period.',
        '"Enabled modules" lists the open modules with their activation date.'
      ]
    },
    faq: [
      { q: 'Can I act from this tab?', a: 'No, it is read-only.' },
      {
        q: 'What is the difference with the Statistics tab?',
        a: 'Both give figures on the agency, from different sources; Statistics is more concise.'
      },
      { q: 'Where can I see the detail of user actions?', a: 'In the platform audit log.' }
    ],
    related: [{ label: 'Audit log', to: '/admin/audit' }],
    keywords: ['activity', 'last sign-in', 'enabled modules']
  },
  {
    id: 'administration.plateforme-agences.detail.statistiques',
    kind: 'section',
    title: 'Statistics tab',
    summary:
      'Key figures on the agency: active and disabled collaborators, active modules, subscription status and last sign-in.',
    howToRead: {
      notes: ['If no figure appears, the statistics could not be loaded.', 'The tab is read-only.']
    },
    faq: [
      { q: 'Why is the tab empty?', a: 'The statistics could not be read. Reload the page.' },
      { q: 'How do I act on collaborators?', a: 'From the Team members tab.' },
      { q: 'What does "No subscription" mean?', a: 'The agency has no recorded subscription.' }
    ],
    keywords: ['statistics', 'figures', 'indicators']
  },
  {
    id: 'administration.plateforme-agences.detail.export',
    kind: 'section',
    title: 'Agency data export',
    summary:
      'This tab prepares a complete ZIP archive of the agency data: one CSV file per type of data, an Excel summary and the attached files. The archive stays available for 7 days.',
    steps: [
      { title: 'Request the export', detail: 'Click "Prepare an export", then confirm.' },
      {
        title: 'Wait',
        detail: 'The state goes from "Pending" to "In progress" then "Ready"; the list updates by itself.'
      },
      { title: 'Download', detail: 'Click "Download" when the state is "Ready".' }
    ],
    consequences: [
      'Only one export at a time per agency: a new request is refused while an export is pending or running.',
      'The archive is deleted after 7 days. You must then prepare a new export.',
      'The request, each download and each deletion are recorded in the platform log.',
      'Passwords, sign-in tokens, secret keys and payment codes are never exported. The platform audit log is not included.'
    ],
    faq: [
      {
        q: 'What does the archive contain?',
        a: 'The agency business data: one CSV file per type of data, an Excel summary workbook and the attached files.'
      },
      {
        q: 'What is "Missing files" for?',
        a: 'It counts the attached files that are referenced but could not be found on the server at export time.'
      },
      { q: 'Is the agency notified?', a: 'No e-mail is sent: it is up to you to pass the archive on.' }
    ],
    permissions: { roles: ['Platform super administrator'] },
    related: [{ label: 'Export history', helpId: 'administration.plateforme-agences.detail.export.historique' }],
    keywords: ['export', 'archive', 'zip', 'csv', 'backup', 'data', 'recover data']
  },
  {
    id: 'administration.plateforme-agences.detail.export.historique',
    kind: 'table',
    title: 'Export history',
    summary: 'The list of exports requested for the agency, with their state, size and expiry date.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Requested on', description: 'Date and time of the request.' },
        { key: 'requestedBy', label: 'Requested by', description: 'Person who started the export.' },
        { key: 'status', label: 'Status', description: 'State of the export.' },
        { key: 'size', label: 'Size', description: 'Size of the archive.' },
        {
          key: 'counts',
          label: 'Tables / rows / files',
          description: 'Number of data types, rows and attached files exported.'
        },
        { key: 'missingFileCount', label: 'Missing files', description: 'Attached files not found at export time.' },
        { key: 'expiresAt', label: 'Expiry', description: 'Date after which the archive is deleted.' },
        { key: 'actions', label: 'Actions', description: 'Download (if ready) or Delete.' }
      ],
      statuses: [
        { value: 'QUEUED', label: 'Pending', description: 'The request is waiting its turn.' },
        { value: 'RUNNING', label: 'In progress', description: 'The archive is being prepared.' },
        { value: 'READY', label: 'Ready', description: 'The archive can be downloaded.' },
        { value: 'FAILED', label: 'Failed', description: 'The preparation failed.' },
        { value: 'EXPIRED', label: 'Expired', description: 'The archive was deleted.' }
      ]
    },
    consequences: [
      'Deleting an export asks for confirmation, is irreversible and is recorded in the log. An export in progress cannot be deleted.'
    ],
    faq: [
      {
        q: 'Why "Archive expired, prepare a new export"?',
        a: 'The archive is more than 7 days old: prepare a new export.'
      },
      { q: 'Why can I not delete an export?', a: 'It is being prepared.' },
      { q: 'How do I rerun a failed export?', a: 'Click "Prepare an export" again.' }
    ],
    keywords: ['export history', 'archive', 'expiry', 'download']
  },

  // ------------------------------------------------------------ modification
  {
    id: 'administration.plateforme-agences.modification',
    kind: 'page',
    title: 'Edit an agency',
    summary:
      'This form corrects the agency details: logo, name, contact details, address, subdomain, custom domain, website and brand colour.',
    purpose:
      'The super administrator updates the identity of the client agency here without touching its subscription.',
    steps: [
      {
        title: 'Change the logo',
        detail: '"Upload a logo" (PNG, JPEG or WebP, 2 MB maximum) or "Remove". The logo is saved straight away.'
      },
      { title: 'Correct the fields', detail: 'Only the name is mandatory.' },
      { title: 'Check the formats', detail: 'Valid e-mail, website in https://, colour in #RRGGBB format.' },
      { title: 'Save', detail: 'Click "Save": you go back to the record.' }
    ],
    consequences: [
      'The logo is uploaded or removed immediately, without waiting for "Save".',
      'The other fields are only saved with "Save". "Cancel" abandons the changes.',
      'A contact e-mail or website left empty is not sent.',
      'No e-mail is sent to the agency. The changes are recorded in the log.'
    ],
    faq: [
      {
        q: 'Can I change the status or the packs here?',
        a: 'No: the status is changed on the record, the packs in the Subscription tab.'
      },
      {
        q: 'What are the subdomain and custom domain for?',
        a: 'They are for the agency own web address; the form does not say more.'
      },
      { q: 'Why is my logo refused?', a: 'Only PNG, JPEG and WebP of 2 MB maximum are accepted.' }
    ],
    permissions: { roles: ['Platform super administrator'] },
    related: [{ label: 'Back to the agency record', helpId: 'administration.plateforme-agences.detail' }],
    keywords: ['edit agency', 'logo', 'contact details', 'brand colour', 'subdomain', 'domain']
  },
  {
    id: 'administration.plateforme-agences.modification.formulaire',
    kind: 'section',
    title: 'Edit form',
    summary: 'The editable fields of the agency. Only the name is mandatory.',
    howToRead: {
      notes: [
        'Fields: Name, Legal name, Contact email, Phone, City, Country, Address, Subdomain, Custom domain, Website, Brand colour.',
        'The phone is written for example "+225 07 00 00 00 00".',
        'The swatch next to the colour shows the entered shade when it is valid.'
      ]
    },
    faq: [
      {
        q: 'Why does "Save" refuse?',
        a: 'A field is invalid: empty name, badly written e-mail or website, colour outside the #RRGGBB format.'
      },
      {
        q: 'Can a field be emptied?',
        a: 'Yes for the free fields. E-mail, website and colour left empty are simply ignored.'
      },
      { q: 'Where is the administrator name?', a: 'It is managed in the Collaborators tab of the record.' }
    ],
    keywords: ['fields', 'form', 'legal name', 'address']
  },

  // ------------------------------------------------------------ collaborateur
  {
    id: 'administration.plateforme-agences.collaborateur',
    kind: 'page',
    title: 'Agency collaborator record',
    summary:
      'This record shows a collaborator of an agency: their identity, roles and possible actions (password, sessions, activation).',
    purpose:
      'The super administrator helps a collaborator here: change their roles, send them a reset link, sign them out or disable them.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The person can use the agency.' },
        { value: 'PENDING_INVITE', label: 'Invitation pending', description: 'Invitation sent, not accepted yet.' },
        { value: 'DISABLED', label: 'Deactivated', description: 'Access to this agency withdrawn.' }
      ],
      notes: [
        'Information: e-mail, full name, verified e-mail, last sign-in, member since, and invitation date if there is one.'
      ]
    },
    steps: [
      { title: 'Change the roles', detail: 'Tick or untick the roles, then "Save roles".' },
      { title: 'Reset the password', detail: '"Reset password" button, then confirm.' },
      { title: 'Sign the person out', detail: '"Revoke sessions" button, then confirm.' },
      { title: 'Deactivate or enable', detail: '"Deactivate account" or "Activate account" button, then confirm.' }
    ],
    consequences: [
      'Resetting the password sends an e-mail with a single-use link, valid for 24 hours, and closes all the person sessions. Their old password no longer works.',
      'Revoking the sessions forces the person to sign in again on all their devices.',
      'Disabling closes their sessions and cancels the pending invitations they had sent; the last active administrator and your own account cannot be disabled.',
      'These actions are recorded in the platform log, in your name.'
    ],
    faq: [
      {
        q: 'Is the new password shown?',
        a: 'No. The person chooses their password through the link received by e-mail.'
      },
      {
        q: 'Why a refusal message?',
        a: 'Some actions are protected, for example on the last active administrator or a protected administrator.'
      },
      { q: 'Do the roles apply to all agencies?', a: 'No: they only concern the agency of this record.' }
    ],
    permissions: { roles: ['Platform super administrator'] },
    related: [{ label: 'Roles on the record', helpId: 'administration.plateforme-agences.collaborateur.roles' }],
    keywords: ['collaborator', 'password', 'sessions', 'disable', 'role', 'user']
  },
  {
    id: 'administration.plateforme-agences.collaborateur.roles',
    kind: 'section',
    title: 'Collaborator roles',
    summary: 'The list of the agency roles. Ticked boxes are the collaborator roles; "Save roles" applies the change.',
    consequences: [
      'The new roles apply to this agency only.',
      'Some changes are refused to protect the agency, for example removing the last administrator.'
    ],
    faq: [
      { q: 'Can roles be combined?', a: 'Yes, several boxes can be ticked.' },
      { q: 'Where can I read what each role allows?', a: 'In "Roles and permissions" of the platform area.' },
      { q: 'Do I need to save?', a: 'Yes, clicking a box is not enough.' }
    ],
    related: [{ label: 'Roles and permissions', to: '/admin/roles-permissions' }],
    keywords: ['roles', 'rights', 'permissions', 'administrator', 'manager', 'accountant']
  },
  {
    id: 'administration.plateforme-agences.collaborateur.actions',
    kind: 'section',
    title: 'Account actions',
    summary: 'Three support actions: reset the password, revoke sessions, disable or enable the account.',
    consequences: [
      'Reset the password: an e-mail with a link valid for 24 hours goes to the person, and their sessions are closed.',
      'Revoke sessions: sign-out on all their devices.',
      'Deactivate: sessions closed, this person pending invitations cancelled.',
      'Each action asks for confirmation and is recorded in the log.'
    ],
    faq: [
      {
        q: 'What if the person does not receive the e-mail?',
        a: 'Check the address and the spam folder; the action has no other channel.'
      },
      {
        q: 'Does disabling delete the account?',
        a: 'No: the account and its data remain, only access to this agency is withdrawn.'
      },
      { q: 'How do I re-enable?', a: 'The same button becomes "Activate account".' }
    ],
    keywords: ['reset', 'forgotten password', 'revoke', 'sign out', 'disable']
  },

  // -------------------------------------------------------------- invitation
  {
    id: 'administration.plateforme-agences.invitation',
    kind: 'page',
    title: 'Invite a collaborator to an agency',
    summary:
      'This form invites a person to join the agency: enter their e-mail and tick at least one role. They receive an invitation by e-mail.',
    purpose:
      'The super administrator adds a collaborator to a client agency, for example when its administrator is unavailable.',
    steps: [
      { title: 'Enter the e-mail', detail: 'Address of the person to invite.' },
      { title: 'Choose the roles', detail: 'Tick at least one role; the description of each is shown.' },
      { title: 'Send', detail: 'Click "Send the invitation": you go back to the agency record.' }
    ],
    consequences: [
      'An invitation is sent by e-mail. If the e-mail could not be sent, the invitation is created anyway and a warning message tells you so.',
      'If a pending invitation already exists for this address, the new one is refused.',
      'A person who is already an active or disabled member of the agency cannot be invited again: re-enable them from their record.',
      'This address cannot be that of a platform super administrator.',
      'The invitation is valid for 7 days.'
    ],
    faq: [
      { q: 'Why is "Send the invitation" greyed out?', a: 'No role is ticked.' },
      {
        q: 'What if the person already has an account?',
        a: 'The invitation gives them access to this agency, unless they are already a member.'
      },
      {
        q: 'The e-mail was not sent, what should I do?',
        a: 'A warning is shown and the invitation exists anyway. This screen offers no resend.'
      }
    ],
    permissions: { roles: ['Platform super administrator'] },
    related: [{ label: 'Team members tab', helpId: 'administration.plateforme-agences.detail.collaborateurs' }],
    keywords: ['invite', 'invitation', 'new collaborator', 'add a user']
  },
  {
    id: 'administration.plateforme-agences.invitation.formulaire',
    kind: 'section',
    title: 'Invitation form',
    summary: 'The person e-mail and the roles to give them in the agency. Both are mandatory.',
    howToRead: {
      notes: [
        'The roles offered are those of the agency; their name and description are shown on screen.',
        'Tick at least one role, otherwise the send button stays greyed out.'
      ]
    },
    faq: [
      { q: 'Which role should I choose?', a: 'Read the description shown under each role; you can tick several.' },
      { q: 'Can the role be changed afterwards?', a: 'Yes, from the collaborator record.' },
      { q: 'Do capital letters in the e-mail matter?', a: 'No, the address is compared regardless of capitals.' }
    ],
    keywords: ['roles', 'e-mail', 'form']
  }
];

export default entries;
