import type { HelpEntry } from '../../../types';

/** « bien » zone of the « patrimoine » module (en): « Portfolio » tab of a property record. */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.bien.onglet',
    kind: 'section',
    title: 'Property Patrimoine tab',
    summary:
      'This tab gathers the financial follow-up of the property: yield, valuations, expenses, loans, works and documents. Each section has its own tab.',
    purpose:
      'It tells you what the property is worth, what it costs and what it earns. The figures in the Summary are recalculated from the other sections.',
    steps: [
      {
        title: 'Choose a section',
        detail: 'Summary, Valuations, Expenses, Loans, Works or Documents. The open section stays in the page address.'
      },
      { title: 'Enter the data', detail: 'In each section, « Add » opens an entry form.' },
      {
        title: 'Export',
        detail: 'The « Export » button offers « PDF summary » or « Excel workbook » for this property.'
      }
    ],
    consequences: [
      'Any valuation, expense, loan or works programme added, edited or deleted means the yield must be recalculated: it updates the next time the Summary is displayed.',
      'Deletions cannot be undone.'
    ],
    faq: [
      { q: 'I do not see the Patrimoine tab.', a: "It is only offered if your agency's plan includes Patrimoine." },
      {
        q: 'The yield stays empty or at « — ». Why?',
        a: 'Enter a valuation, and an acquisition price in a valuation for the net-net yield and the capital gain.'
      },
      {
        q: 'Where do I manage insurance?',
        a: 'In the « Insurance and claims » and « Maintenance log » tabs of the property record.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Reading requires « View properties », adding, editing or deleting requires « Edit properties ».'
    },
    related: [
      { label: 'Property summary', helpId: 'patrimoine.bien.synthese' },
      { label: 'Document vault', helpId: 'patrimoine.bien.coffre-fort' }
    ],
    keywords: ['patrimoine', 'property', 'yield', 'value', 'export']
  },
  {
    id: 'patrimoine.bien.synthese',
    kind: 'section',
    title: 'Property summary and yield',
    summary:
      'The Summary gives the current yield of the property, its projected yield over several years and a projection chart. It relies on your valuations, expenses, loans and leases.',
    howToRead: {
      notes: [
        'Gross yield: annual rents divided by the latest estimated value.',
        'Net yield: annual rents minus charges, divided by the latest estimated value. Charges are the non-capitalised expenses paid over the last 12 months.',
        'Net-net yield: rents minus charges minus the next 12 months of loan payments, divided by the cost basis.',
        'Unrealised gain: latest estimated value minus cost basis. The cost basis is the latest acquisition cost entered in a valuation, plus capitalised expenses.',
        'Rents come from the active leases of the property; only loans with the status « Active » count.',
        'Until the acquisition cost is known, the net-net yield and the capital gain show « — ».',
        'The « Projected yield » block applies the assumptions; bank ratios are shown when they can be calculated.'
      ]
    },
    steps: [
      { title: 'Read the yield', detail: '« Yield » and « Projected yield » blocks.' },
      {
        title: 'Set the assumptions',
        detail: 'Years, growth of value, rents and charges, vacancy rate (as a decimal: 0.05 for 5%).'
      },
      { title: 'Recalculate', detail: 'Click « Recalculate » to update the projected figures.' }
    ],
    consequences: [
      '« Recalculate » saves your assumptions for this property. If the server is unreachable, they are kept on your device, with a warning.',
      'The assumptions are projections, not guarantees.'
    ],
    faq: [
      {
        q: 'Why are the figures at « — »?',
        a: 'A valuation or an acquisition price is missing. Enter them in the « Valuations » section.'
      },
      {
        q: 'Does a major renovation distort the net yield?',
        a: 'Mark it « Capitalised »: it is added to the cost basis instead of the charges.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Saving assumptions requires « Edit properties ».' },
    related: [{ label: 'Valuations', helpId: 'patrimoine.bien.valorisations' }],
    keywords: ['yield', 'profitability', 'gross', 'net', 'capital gain', 'projection', 'vacancy']
  },
  {
    id: 'patrimoine.bien.valorisations',
    kind: 'table',
    title: 'Property valuations',
    summary:
      'Each row is an estimate of the property value at a date. The most recent one is used as the current value.',
    howToRead: {
      columns: [
        { key: 'valuatedAt', label: 'Date', description: 'The date of the estimate.' },
        { key: 'estimatedValue', label: 'Value', description: 'The estimated value of the property, in FCFA.' },
        { key: 'method', label: 'Method', description: 'Manual entry, Market estimate or Expert appraisal.' }
      ],
      notes: ['The form also asks for an acquisition cost and date, both optional, which feed the cost basis.']
    },
    steps: [
      {
        title: 'Add',
        detail: 'Click « Add »: date, estimated value, currency, acquisition cost and date, method, notes.'
      },
      { title: 'Edit', detail: '« Edit » button on the row.' },
      { title: 'Delete', detail: '« Delete » button, after confirmation.' },
      { title: 'Search', detail: 'Notes, method, date range or value range.' }
    ],
    consequences: ['Deletion is final.', 'Any change means the yield must be recalculated.'],
    faq: [{ q: 'How do I make the capital gain appear?', a: 'Enter the acquisition cost in a valuation.' }],
    related: [{ label: 'Property summary', helpId: 'patrimoine.bien.synthese' }],
    keywords: ['valuation', 'value', 'estimate', 'appraisal', 'acquisition']
  },
  {
    id: 'patrimoine.bien.depenses',
    kind: 'table',
    title: 'Property expenses',
    summary:
      "Each row is an expense paid for the property: tax, maintenance, insurance, renovation… A total of the current year's charges is shown under the table.",
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date', description: 'The payment date.' },
        { key: 'label', label: 'Label', description: 'The description of the expense.' },
        {
          key: 'category',
          label: 'Category',
          description:
            'Property tax, Co-ownership charges, Insurance, Routine maintenance, Renovation, Management fees, Common charges or Other.'
        },
        { key: 'recurrence', label: 'Frequency', description: 'One-off, Monthly, Quarterly or Yearly.' },
        { key: 'amount', label: 'Amount', description: 'The amount paid, in FCFA.' }
      ],
      notes: ['The total under the table counts the expenses of the current year, without capitalised expenses.']
    },
    steps: [
      {
        title: 'Add',
        detail: 'Click « Add »: category, label, amount, payment date, frequency, payment method, treasury account.'
      },
      {
        title: 'Recurring expense',
        detail:
          'Enter the date of a payment already made; it cannot be in the future. The following ones are deduced for the cash plan. End date optional.'
      },
      {
        title: 'Capitalised',
        detail: 'Turn it on for an expense that increases the value of the property (major renovation).'
      },
      {
        title: 'Supplier',
        detail: 'If « The agency placed the order and owes the invoice » is on, the supplier is required.'
      }
    ],
    consequences: [
      'A capitalised expense is added to the cost basis of the property, not to the charges: it is excluded from the net yield.',
      'For a property the agency holds on its own, without co-ownership or mandating owner, the expense is written to the accounting journal. When edited, its entry is cancelled then rewritten; when deleted, it is cancelled.',
      'If the agency owes the invoice, the expense is posted to the suppliers account; otherwise it is paid from the chosen treasury account (the cash desk by default).'
    ],
    faq: [
      {
        q: 'Does a deleted expense disappear from the accounts?',
        a: 'Its entry is reversed, not erased: the accounting history stays consistent.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Adding, editing, deleting requires « Edit properties ».' },
    related: [{ label: 'Property summary', helpId: 'patrimoine.bien.synthese' }],
    keywords: ['expense', 'charge', 'property tax', 'capitalised', 'frequency', 'supplier']
  },
  {
    id: 'patrimoine.bien.credits',
    kind: 'table',
    title: 'Property loans',
    summary:
      'Each row is a loan financing the property. The table shows the remaining capital, the monthly payment and the share already repaid.',
    howToRead: {
      columns: [
        { key: 'lender', label: 'Lender', description: 'The bank or lender.' },
        { key: 'remainingCapital', label: 'Outstanding principal', description: 'What is left to repay, in FCFA.' },
        { key: 'monthlyPayment', label: 'Monthly payment', description: 'The amount paid each month.' },
        {
          key: 'repaid',
          label: 'Refunded',
          description: 'The share of the initial capital already repaid, from 0 to 100%.'
        },
        { key: 'status', label: 'Status', description: 'See the statuses below.' }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'The loan is ongoing. It counts in the net-net yield and the bank ratios.'
        },
        { value: 'CLOSED', label: 'Closed', description: 'The loan is paid off.' },
        { value: 'DEFAULTED', label: 'In default', description: 'The loan is in payment default.' }
      ]
    },
    steps: [
      {
        title: 'Add',
        detail:
          'Lender, initial capital, remaining capital, interest rate, monthly payment, currency, start and end dates, status.'
      },
      { title: 'Update', detail: 'Edit the remaining capital and the status as repayments are made.' }
    ],
    consequences: [
      'The end date must be after the start date.',
      'Only « Active » loans enter the yield calculations; deletion is final.',
      'When the end of an active loan approaches, the agency receives an alert.'
    ],
    faq: [{ q: 'Does the remaining capital update by itself?', a: 'No, you enter and edit it yourself.' }],
    permissions: { feature: 'PATRIMOINE', note: 'Adding, editing, deleting requires « Edit properties ».' },
    keywords: ['loan', 'credit', 'mortgage', 'bank', 'monthly payment']
  },
  {
    id: 'patrimoine.bien.travaux',
    kind: 'table',
    title: 'Property works programmes',
    summary: 'Each row is a works programme, planned or done. A timeline above the table shows their schedule.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Title', description: 'The name of the programme.' },
        {
          key: 'constructionSite',
          label: 'Construction site',
          description: 'The linked construction site, or a dash.'
        },
        { key: 'plannedDate', label: 'Planned date', description: 'The planned date of the programme.' },
        { key: 'estimatedCost', label: 'Estimated cost', description: 'The planned budget, in FCFA.' },
        { key: 'actualCost', label: 'Actual cost', description: 'The cost actually paid.' },
        { key: 'status', label: 'Status', description: 'See the statuses below.' }
      ],
      statuses: [
        { value: 'PLANNED', label: 'Planned', description: 'Not started yet.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'The works have started.' },
        { value: 'COMPLETED', label: 'Completed', description: 'The works are finished.' },
        { value: 'CANCELLED', label: 'Cancelled', description: 'The programme is abandoned.' }
      ]
    },
    steps: [
      { title: 'Add', detail: 'Title, description, estimated cost, planned date, status, « Capitalised ».' },
      { title: 'Follow', detail: 'Edit the status, the completion date and the actual cost.' }
    ],
    consequences: [
      'If the programme is linked to a construction site, its actual cost comes from the site: the field can no longer be edited here.',
      'When the planned date of a planned programme approaches, the agency receives an alert. Deletion is final.'
    ],
    faq: [
      {
        q: 'Why can I not edit the actual cost?',
        a: 'The programme is linked to a construction site, which supplies this cost itself.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Adding, editing, deleting requires « Edit properties ».' },
    keywords: ['works', 'renovation', 'site', 'programme']
  },
  {
    id: 'patrimoine.bien.coffre-fort',
    kind: 'table',
    title: 'Property document vault',
    summary:
      'Each row is a document of the property: title deed, plan, diagnosis, insurance… Files are protected and downloaded after your rights are checked.',
    howToRead: {
      columns: [
        { key: 'fileName', label: 'File name', description: 'The name of the stored file.' },
        {
          key: 'documentType',
          label: 'Type',
          description: 'The kind of document (title, notarial deed, plan, diagnosis, insurance, mandate…).'
        },
        {
          key: 'expirationDate',
          label: 'Expiry',
          description: 'The expiry date and its state: No expiry, Valid, Expires in N days (30 at most) or Expired.'
        },
        { key: 'createdAt', label: 'Added on', description: 'The date it was added.' }
      ]
    },
    steps: [
      { title: 'Add', detail: 'Click « Add »: file, type, optional expiry date.' },
      { title: 'Download', detail: '« Download » button on the row.' },
      { title: 'Delete', detail: '« Delete » button, after confirmation.' }
    ],
    consequences: [
      'Documents are never reachable through a simple link: only authorised agency members download them.',
      'A third party only sees some if you ticked them in a shared access.',
      'Deletion erases the file and its record, with no way back.',
      'When expiry approaches (30 days), the property owners may be notified by e-mail or WhatsApp, depending on their consent and the notifications enabled.'
    ],
    faq: [
      {
        q: 'Which files can I add?',
        a: 'PDF, Word, JPG, PNG and TIFF images (plans can also be in DWG format). The content must match the file type.'
      },
      { q: 'I do not see the « Delete » button.', a: 'It requires the « Edit properties » right.' }
    ],
    permissions: {
      note: 'Downloading requires « View properties », adding and deleting require « Edit properties ».'
    },
    related: [{ label: 'Shared access', helpId: 'patrimoine.acces-tiers.liste' }],
    keywords: ['document', 'vault', 'land title', 'file', 'expiry']
  }
];

export default entries;
