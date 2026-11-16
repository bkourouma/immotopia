import type { HelpEntry } from '../../../types';

/** « assurances » zone of the « patrimoine » module (en). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.sinistres',
    kind: 'page',
    title: 'Claims',
    summary:
      'This page lists the claims of the whole agency, with their status and amounts. Use it to follow and search; status changes are made from the property record.',
    purpose:
      'A claim is damage reported to the insurer. Full follow-up of a file (status, documents, history) is done in the « Insurance and claims » tab of the property record concerned.',
    steps: [
      { title: 'Search and filter', detail: 'By text, status, property or policy.' },
      { title: 'Export', detail: 'The export button takes all the claims matching your filters.' },
      { title: 'Open a property', detail: 'Click the property reference to open its record and manage the file.' }
    ],
    faq: [
      {
        q: 'Where do I declare a claim?',
        a: 'In the property record, « Insurance and claims » tab, « Declare a claim » button.'
      },
      { q: 'Why is this page read-only?', a: 'It gives the overview; actions are done property by property.' },
      { q: 'I do not see this page.', a: 'It requires « View properties » and a plan that includes Patrimoine.' }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Requires « View properties ».' },
    related: [{ label: 'Claims table', helpId: 'patrimoine.sinistres.liste' }],
    keywords: ['claim', 'insurance', 'damage', 'compensation']
  },
  {
    id: 'patrimoine.sinistres.liste',
    kind: 'table',
    title: 'Claims table',
    summary:
      'Each row is a claim declared in your agency, across all properties. Use this page to follow and search claims: status changes are made from the property record.',
    purpose:
      'A claim is damage reported to the insurer (water damage, fire, theft…). This overview shows where every agency file stands, with the amounts claimed and compensated.',
    howToRead: {
      columns: [
        {
          key: 'bien',
          label: 'Property',
          description: 'The property reference. Click it to open the property record.'
        },
        { key: 'police', label: 'Policy', description: 'The insurer and number of the insurance policy concerned.' },
        { key: 'cause', label: 'Cause', description: 'The declared cause of the claim.' },
        { key: 'date', label: 'Claim date', description: 'The date the damage occurred.' },
        { key: 'statut', label: 'Status', description: 'How far the file has progressed (see the statuses below).' },
        {
          key: 'reclame',
          label: 'Amount claimed',
          description: "The amount requested from the insurer, in the policy's currency."
        },
        {
          key: 'indemnise',
          label: 'Compensated',
          description: 'The amount the insurer agreed to pay. It stays at 0 until the file is decided.'
        },
        {
          key: 'reste',
          label: 'Out-of-pocket amount',
          description:
            'What is not reimbursed: amount claimed minus amount compensated. A dash (—) is shown until the file is compensated, rejected or closed.'
        }
      ],
      statuses: [
        { value: 'DECLARED', label: 'Declared', description: 'The claim has just been recorded.' },
        {
          value: 'INSURER_NOTIFIED',
          label: 'Insurer notified',
          description: 'You have reported the claim to the insurer.'
        },
        { value: 'EXPERTISE', label: 'Expert appraisal', description: 'The insurer is having the damage assessed.' },
        { value: 'SETTLED', label: 'Compensated', description: 'The insurer has set a compensation.' },
        { value: 'REJECTED', label: 'Rejected', description: 'The insurer refused to cover the claim.' },
        { value: 'CLOSED', label: 'Closed', description: 'The file is finished: it can no longer be changed.' }
      ],
      notes: ['Amounts are in FCFA for a CFA franc policy; a policy in another currency shows its currency code.']
    },
    steps: [
      { title: 'Search', detail: 'Type a property, a policy, an insurer or a word from the description.' },
      { title: 'Filter', detail: 'Narrow the list by status, property or policy.' },
      {
        title: 'Export',
        detail: 'The export button retrieves all claims matching your filters, not only the displayed page.'
      },
      {
        title: 'Move a file forward',
        detail: 'Open the property record (click its reference), tab « Insurance and claims », then « Detail ».'
      }
    ],
    faq: [
      {
        q: 'Where do I declare a new claim?',
        a: 'Not from this page. Open the property record, tab « Insurance and claims », then « Declare a claim ».'
      },
      {
        q: 'Why is the out-of-pocket amount empty?',
        a: 'It is only calculated once the file is compensated, rejected or closed. Before that, the amount is not known.'
      },
      {
        q: 'I do not see any claim.',
        a: 'No claim has been declared yet, or your filters are too narrow. Clear the criteria to see the whole list again.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Reading requires « View properties » (view properties).'
    },
    related: [
      { label: "Declare and follow a property's claims", helpId: 'patrimoine.assurances.sinistres' },
      { label: 'Claim details', helpId: 'patrimoine.sinistres.detail' }
    ],
    keywords: ['claim', 'insurance', 'damage', 'water damage', 'fire', 'theft', 'compensation', 'insurer']
  },
  {
    id: 'patrimoine.sinistres.detail',
    kind: 'section',
    title: 'Claim details',
    summary:
      'This panel shows the whole life of a claim: status, amounts, dated history and attached documents. This is where you move it forward.',
    howToRead: {
      notes: [
        'The strip at the top follows the normal path: Declared, Insurer notified, Assessment, Compensated, Closed. A rejected claim replaces the « Compensated » step with « Rejected ».',
        'The compensation amount and the deductible are entered when moving to « Compensated ». The deductible is for information: it is not part of the calculation.',
        'The out-of-pocket amount is calculated automatically (amount claimed minus amount compensated) and cannot be entered. It appears once the file is compensated, rejected or closed.',
        'The history lists each status change with its date, the person who made it and any note.'
      ]
    },
    steps: [
      { title: 'Read the file', detail: 'Status, policy, date, cause, description and amounts are read-only.' },
      { title: 'Move the file forward', detail: 'Use the « Move to … » buttons below the table (see their help).' },
      {
        title: 'Attach documents',
        detail: 'Add photos, quotes, assessment report, letters or invoices in the « Documents » area.'
      }
    ],
    consequences: [
      'Opening this panel changes nothing. Each status change is recorded in the file history and in the agency audit log.',
      'The « Linked ticket » and « Rejection reason » lines only appear when they exist.'
    ],
    faq: [
      {
        q: 'Why do I not see any status buttons?',
        a: 'Either the claim is closed (no further step possible), or your role does not allow editing properties.'
      },
      {
        q: 'Can the amount claimed be corrected?',
        a: 'Not from this screen: the interface has no form to edit a claim.'
      }
    ],
    permissions: { note: 'Viewing requires « View properties », acting requires « Edit properties ».' },
    related: [
      { label: 'Change the status', helpId: 'patrimoine.sinistres.transitions' },
      { label: 'Claim documents', helpId: 'patrimoine.sinistres.documents' }
    ],
    keywords: ['claim', 'history', 'out-of-pocket', 'deductible', 'compensation']
  },
  {
    id: 'patrimoine.sinistres.declaration',
    kind: 'section',
    title: 'Declare a claim',
    summary:
      'This form records a new claim on a property, linked to one of its insurance policies. The file starts with the status « Declared ».',
    steps: [
      {
        title: 'Choose the policy',
        detail:
          'A policy of the property is required. Without a policy, the « Declare a claim » button is greyed out: add a policy first.'
      },
      { title: 'Claim date', detail: 'Required; it cannot be in the future.' },
      {
        title: 'Cause and description',
        detail: 'Cause: Water damage, Fire, Theft, Structural damage, Storm or Other. Describe what happened.'
      },
      {
        title: 'Amount claimed',
        detail:
          "The amount requested from the insurer, in the policy's currency (usually FCFA). The deductible is optional."
      },
      {
        title: 'Optional links',
        detail: 'You can link a maintenance ticket of the property and an expense already entered.'
      },
      { title: 'Submit', detail: 'Click « Declare ».' }
    ],
    consequences: [
      'The claim is created with the status « Declared » and its creation is recorded in the audit log.',
      'No expense is created: the linked expense is only a link. The application sends no message to the insurer.'
    ],
    faq: [
      {
        q: 'Can a declared claim be deleted or edited?',
        a: 'The interface offers neither editing nor deletion. Compensation amounts are entered at the status change.'
      },
      { q: 'Why is the currency imposed?', a: 'The claim is declared in the currency of its policy.' }
    ],
    permissions: { note: 'Requires « Edit properties ».' },
    related: [{ label: 'Insurance policies of the property', helpId: 'patrimoine.assurances.polices' }],
    keywords: ['declare', 'claim', 'declaration', 'insurance']
  },
  {
    id: 'patrimoine.sinistres.transitions',
    kind: 'section',
    title: "Change a claim's status",
    summary:
      'The « Move to … » buttons move the file forward. Only the steps allowed from the current status are offered.',
    howToRead: {
      statuses: [
        { value: 'DECLARED', label: 'Declared', description: 'Possible next step: « Insurer notified ».' },
        {
          value: 'INSURER_NOTIFIED',
          label: 'Insurer notified',
          description:
            'Possible steps: « Expert appraisal », « Compensated » or « Rejected » (the assessment can be skipped).'
        },
        {
          value: 'EXPERTISE',
          label: 'Expert appraisal',
          description: 'Possible steps: « Compensated » or « Rejected ».'
        },
        { value: 'SETTLED', label: 'Compensated', description: 'Possible next step: « Closed ».' },
        { value: 'REJECTED', label: 'Rejected', description: 'Possible next step: « Closed ».' },
        { value: 'CLOSED', label: 'Closed', description: 'No step possible.' }
      ]
    },
    steps: [
      {
        title: 'Click the button you want',
        detail: '« Insurer notified », « Expert appraisal » and « Closed » apply immediately.'
      },
      {
        title: 'Compensated',
        detail:
          'A window asks for the compensation amount (required, at most equal to the amount claimed), the deductible and an optional note.'
      },
      { title: 'Rejected', detail: 'A window asks for the rejection reason (required) and an optional note.' },
      { title: 'Confirm', detail: 'Click « Confirm ».' }
    ],
    consequences: [
      'The change is dated and recorded in the history with your name, and logged in the audit log.',
      '« Move to “Insurer notified” » sends nothing to the insurer: it only records that you notified them.',
      'On rejection, the compensation amount is set to 0: the out-of-pocket amount then equals the amount claimed.',
      'There is no going back. « Closed » is final: the claim and its documents can no longer be changed.'
    ],
    faq: [
      {
        q: 'I chose the wrong status, what now?',
        a: 'A change cannot be undone from the interface. Check before confirming, especially for « Compensated », « Rejected » and « Closed ».'
      },
      { q: 'Why is the compensation amount refused?', a: 'It cannot exceed the amount claimed.' }
    ],
    permissions: { note: 'Requires « Edit properties ».' },
    related: [{ label: 'Claim details', helpId: 'patrimoine.sinistres.detail' }],
    keywords: ['status', 'compensate', 'reject', 'close', 'assessment']
  },
  {
    id: 'patrimoine.sinistres.documents',
    kind: 'section',
    title: 'Claim documents',
    summary:
      'This area gathers the photos, quotes, reports and letters of the file, grouped by kind. Each document can be downloaded or removed.',
    howToRead: {
      notes: [
        'Kinds offered: Photo before, Photo after, Quote, Expert report, Insurer letter, Invoice.',
        'Accepted formats: PDF, Word (.doc, .docx), JPG, PNG and TIFF images.'
      ]
    },
    steps: [
      { title: 'Choose the kind', detail: 'In the « Document type » list.' },
      { title: 'Add', detail: 'Click « Add a document » and choose the file.' },
      {
        title: 'Download or remove',
        detail: '« Download » retrieves the file; « Remove » detaches the document from the claim after confirmation.'
      }
    ],
    consequences: [
      'The file is first stored in the property documents (type « Insurance »), then attached to the claim. If attaching fails, the file stays in the property documents.',
      '« Remove » does not delete the file: it stays in the property documents.',
      'Once the claim is closed, documents can no longer be added or removed.'
    ],
    faq: [
      { q: 'Where do I find a removed file?', a: 'In the property documents, with the type « Insurance ».' },
      {
        q: 'Why is there no add button any more?',
        a: 'The claim is closed, or your role does not allow editing properties.'
      }
    ],
    permissions: {
      note: 'Downloading requires « View properties », adding or removing requires « Edit properties ».'
    },
    related: [{ label: 'Property document vault', helpId: 'patrimoine.bien.coffre-fort' }],
    keywords: ['document', 'photo', 'quote', 'assessment', 'invoice']
  },
  {
    id: 'patrimoine.assurances.polices',
    kind: 'section',
    title: "Property's insurance policies",
    summary:
      'This card lists the insurance contracts of the property (insurer, coverage, dates, premium). It lets you add, edit or delete a policy.',
    purpose:
      'A policy is required to declare a claim. Its status is calculated from its dates, to spot contracts that are about to end.',
    steps: [
      {
        title: 'Add',
        detail: 'Click « Add a policy »: insurer, number, coverage type, start, end, annual premium, currency.'
      },
      { title: 'Coverage type', detail: 'Home multi-risk, Building multi-risk, Owner liability or Other.' },
      { title: 'Supporting document', detail: 'Optional: attach the contract (PDF, Word or image).' },
      { title: 'Edit or delete', detail: '« Edit » and « Delete » buttons on the row.' }
    ],
    consequences: [
      'The end date cannot be before the start date.',
      'The attachment is stored in the property documents (type « Insurance »).',
      'A policy with linked claims cannot be deleted, and its currency can no longer change.',
      'When a policy is about to end (30 days), an alert e-mail is sent to the agency administrators if this notification is enabled.'
    ],
    faq: [
      { q: 'Why can I not delete a policy?', a: 'Claims are linked to it. It must be kept.' },
      { q: 'I do not see « Add a policy ».', a: 'This action requires the « Edit properties » right.' }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires « View properties », editing requires « Edit properties ».'
    },
    related: [{ label: 'Policies table', helpId: 'patrimoine.assurances.polices.tableau' }],
    keywords: ['policy', 'insurance', 'contract', 'insurer', 'premium', 'coverage']
  },
  {
    id: 'patrimoine.assurances.polices.tableau',
    kind: 'table',
    title: 'Insurance policies table',
    summary:
      "Each row is a policy of the property. Status and due date are calculated from the dates and today's date.",
    howToRead: {
      columns: [
        { key: 'insurer', label: 'Insurer', description: 'The name of the insurance company.' },
        { key: 'policyNumber', label: 'Policy number', description: 'The contract number.' },
        { key: 'coverageType', label: 'Coverage', description: 'The type of cover taken out.' },
        { key: 'startDate', label: 'Start', description: 'The policy start date.' },
        { key: 'endDate', label: 'End', description: 'The policy end date.' },
        {
          key: 'annualPremium',
          label: 'Annual premium',
          description: 'The amount paid each year (premium); a dash if not entered.'
        },
        { key: 'status', label: 'Status', description: 'Calculated automatically (see below).' },
        {
          key: 'daysToExpiry',
          label: 'Due date',
          description: 'The number of days until the end, or since the end. A dash for a policy that has not started.'
        }
      ],
      statuses: [
        { value: 'UPCOMING', label: 'Upcoming', description: 'The policy has not started yet.' },
        { value: 'ACTIVE', label: 'Active', description: 'In force, with more than 30 days before the end.' },
        {
          value: 'EXPIRING_SOON',
          label: 'Expires soon',
          description: 'In force, with 30 days or less before the end.'
        },
        { value: 'EXPIRED', label: 'Expired', description: 'The end date has passed.' }
      ]
    },
    faq: [
      {
        q: 'Can the status be chosen?',
        a: 'No, it is derived from the dates. To renew, change the dates or add a new policy.'
      },
      { q: 'What does the export button do?', a: "It exports the property's policies table." },
      { q: 'The Actions column is missing.', a: 'It only appears if you have the « Edit properties » right.' }
    ],
    related: [{ label: 'Property policies', helpId: 'patrimoine.assurances.polices' }],
    keywords: ['policy', 'due date', 'expires', 'premium']
  },
  {
    id: 'patrimoine.assurances.sinistres',
    kind: 'section',
    title: "Property's claims",
    summary:
      "This card lists the property's claims with their cause, status, amount claimed and progress strip. « Detail » opens the full file.",
    steps: [
      { title: 'Declare', detail: 'Click « Declare a claim » (the property needs at least one policy).' },
      { title: 'Follow', detail: 'The strip under each row shows the step reached.' },
      { title: 'Open a file', detail: 'Click « Detail » to change the status and manage documents.' },
      { title: 'Search', detail: 'Beyond 10 claims, a search bar and filters (status, date, amount) appear.' }
    ],
    faq: [
      { q: 'Why is « Declare a claim » greyed out?', a: 'The property has no insurance policy. Add one first.' },
      { q: 'Where do I see the claims of the whole agency?', a: 'In the « Claims » page of the Portfolio module.' }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Declaring and changing the status require « Edit properties ».' },
    related: [
      { label: 'Declare a claim', helpId: 'patrimoine.sinistres.declaration' },
      { label: 'All claims', helpId: 'patrimoine.sinistres.liste' }
    ],
    keywords: ['claim', 'declare', 'file', 'insurance']
  },
  {
    id: 'patrimoine.assurances.carnet',
    kind: 'section',
    title: 'Property maintenance log',
    summary:
      'The log keeps a record of the work done on the property (plumbing, electricity, air conditioning…), most recent at the top.',
    purpose:
      'It helps you find what was done, by whom and at what cost, and follow upcoming maintenance due dates and warranty ends.',
    howToRead: {
      notes: [
        'Categories: Plumbing, Electricity, Air conditioning, Generator, Roofing and waterproofing, Painting, Other.',
        'Under each entry: vendor, cost, next due date and warranty end, when entered.'
      ]
    },
    steps: [
      {
        title: 'Add',
        detail: 'Click « Add an intervention »: category, date, vendor, cost, currency, description, due dates.'
      },
      { title: 'Filter', detail: 'The « All categories » list restricts the display to one category.' },
      { title: 'Export', detail: 'The « Export (CSV) » button downloads all the property entries.' },
      { title: 'Edit or delete', detail: '« Edit » and « Delete » links under each entry.' }
    ],
    consequences: [
      "The vendor is chosen among your agency's vendors; the optional supporting document is stored in the property documents (type « Other »).",
      'Deleting an entry is final.',
      'A next due date or warranty end that is approaching (30 days) triggers an alert e-mail to the agency administrators, if this notification is enabled.'
    ],
    faq: [
      { q: 'Does the export follow the category filter?', a: 'No, it contains all the entries of the property.' },
      {
        q: 'I do not see the edit buttons.',
        a: 'They require the « Edit properties » right. The export remains available.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Editing requires « Edit properties ».' },
    keywords: ['maintenance', 'work', 'warranty', 'vendor', 'log']
  }
];

export default entries;
