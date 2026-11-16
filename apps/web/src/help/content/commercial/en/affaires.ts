import type { HelpEntry } from '../../../types';

/** “affaires” (deals) zone of the “commercial” module (en): list, creation, editing and deal record. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Deals list
  {
    id: 'commercial.affaires.liste',
    kind: 'page',
    title: 'Deals (sales pipeline)',
    summary:
      "Here you find your agency's deals: your clients' requests (purchase, rental, sale, management, mandate), sorted by progress, as a pipeline or as a list.",
    purpose:
      'A deal tracks an opportunity with a contact. It always starts at the “New” stage and moves on to “Won” or “Lost”. It is your follow-up board for clients to call back.',
    steps: [
      {
        title: 'Create a deal',
        detail:
          '“New deal” opens the form at the top of the page. Choose the type and the contact, then “Create the deal”.'
      },
      {
        title: 'Search and filter',
        detail:
          'Use “Search” and the Step, Type and Team member criteria. “More filters” adds the creation date and the budget.'
      },
      {
        title: 'Choose the view',
        detail: '“Pipeline” (opened by default) shows one column per stage; “List” shows a table.'
      },
      {
        title: 'Move a deal forward',
        detail: 'In the pipeline, drag the card to the new stage. You can also change the stage in the deal record.'
      },
      {
        title: 'Open or export',
        detail: 'Click a card or “View details”. “CSV” and “Excel” export all the deals that match your criteria.'
      }
    ],
    consequences: [
      'A new deal always starts at “New”, even when created from another column.',
      'Moving a card changes the stage immediately, without confirmation. No e-mail or message is sent to the client; the change is written to the audit log.',
      'A deal cannot be deleted: to close it, set it to “Won” or “Lost”. From the Pipeline with no stage criterion, the export leaves out those two stages.'
    ],
    faq: [
      {
        q: 'Where are the “Won” and “Lost” deals?',
        a: 'By default the pipeline only shows four stages. Choose them in the Step criterion, or switch to the List view.'
      },
      {
        q: 'I cannot see the create or edit actions.',
        a: 'They require the “Create deals” and “Edit deals” rights. Check with your agency administrator.'
      },
      {
        q: 'The card goes back to its column or an error appears.',
        a: 'Saving failed (missing right, or the deal was changed by a colleague). Refresh the page and try again.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'View: “View deals”. Create: “Create deals”. Edit or change the stage: “Edit deals”.'
    },
    related: [
      { label: 'Search, criteria and views', helpId: 'commercial.affaires.liste.recherche' },
      { label: 'The pipeline by stage', helpId: 'commercial.affaires.liste.kanban' },
      { label: 'The List view table', helpId: 'commercial.affaires.liste.tableau' },
      { label: 'Create a deal', helpId: 'commercial.affaires.nouvelle' }
    ],
    keywords: ['deal', 'deals', 'pipeline', 'kanban', 'opportunity', 'prospect', 'stage', 'client', 'sales', 'export'],
    tour: {
      steps: [
        {
          target: 'affaires-nouvelle',
          title: 'Create a deal',
          description: 'This button opens the creation form.'
        },
        {
          target: 'affaires-recherche',
          title: 'Search and filter',
          description: 'Type a name or an area, or filter by stage, type or team member.'
        },
        {
          target: 'affaires-vues',
          title: 'List or pipeline',
          description: 'Switch between the table and the columns by stage.'
        },
        {
          target: 'affaires-pipeline',
          title: 'The pipeline',
          description: 'Drag a card to another column to change the stage.'
        },
        {
          target: 'affaires-tableau',
          title: 'The table',
          description: 'One row per deal; the icons open the deal or its form.'
        }
      ]
    }
  },
  {
    id: 'commercial.affaires.liste.recherche',
    kind: 'section',
    title: 'Search, criteria and choice of view',
    summary:
      'This bar filters the pipeline, the list and the export at the same time. It groups the “Search” field, the criteria and the choice between “List” and “Pipeline”.',
    howToRead: {
      notes: [
        "“Search”: type a contact's name or company name, an e-mail, a phone number, an area, the assigned collaborator's name or the closing reason.",
        'Step: one or more stages among New, Qualified, Viewing, Negotiation, Won and Lost. In the pipeline, only the chosen columns are displayed.',
        'Type: Purchase, Rental, Sale, Property management, Mandate.',
        'Team member: keeps only the deals assigned to that collaborator.',
        'Under “More filters”: Creation date (period) and Budget (minimum and maximum, in FCFA).',
        'The number of results is displayed next to the bar. The criteria are kept in the page address.'
      ]
    },
    steps: [
      { title: 'Type or choose', detail: 'Type in “Search” or choose a value in a criterion.' },
      { title: 'Add criteria', detail: 'Click “More filters” for the date and the budget.' },
      { title: 'Start over', detail: 'If nothing matches, “Clear filters” removes all filters.' }
    ],
    consequences: ['Filtering changes no deal: it only changes what is displayed and what will be exported.'],
    faq: [
      {
        q: 'Is the choice of List or Pipeline remembered?',
        a: 'No: each time you open the page, the “Pipeline” view is displayed first.'
      },
      {
        q: 'Why does the Team member filter find nothing?',
        a: 'It only shows deals that have an assigned collaborator. A deal without a collaborator appears in no result of this filter.'
      },
      {
        q: 'Does the Step filter change the pipeline?',
        a: 'Yes: the pipeline then only shows the columns of the chosen stages, including “Won” and “Lost” if you choose them.'
      }
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Deals overview', helpId: 'commercial.affaires.liste' }],
    keywords: ['filter', 'search', 'criteria', 'budget', 'stage', 'type', 'collaborator', 'date']
  },
  {
    id: 'commercial.affaires.liste.kanban',
    kind: 'section',
    title: 'Deals pipeline',
    summary:
      'Each column is a stage in the life of a deal and each card is a deal. Drag a card from one column to another to move it forward.',
    purpose: 'The pipeline shows at a glance where your clients stand and what is waiting at each stage.',
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'New', description: 'New request, not yet qualified. This is the starting stage.' },
        {
          value: 'QUALIFIED',
          label: 'Qualified',
          description: "The client's need is clarified and considered serious."
        },
        { value: 'VISIT', label: 'Viewing', description: 'The client is visiting or about to visit properties.' },
        { value: 'NEGOTIATION', label: 'Negotiation', description: 'The deal is being negotiated.' },
        {
          value: 'WON',
          label: 'Won',
          description: 'The deal is concluded. This column only appears if you choose it in the Step criterion.'
        },
        {
          value: 'LOST',
          label: 'Lost',
          description: 'The deal is abandoned. This column only appears if you choose it in the Step criterion.'
        }
      ],
      notes: [
        'The number at the top of each column is the total of deals at that stage, even if not all the cards are loaded yet.',
        'A card shows the contact (initials and name), the age (the time if it is today, “3j” for three days, otherwise day and month), the deal type, the maximum budget in FCFA and the area.',
        'Cards load 30 at a time: “Show more” at the bottom of a column loads the next ones. “This stage appears to be empty” means a column with no deal.',
        '“Add a deal” at the top of a column opens the creation form at the top of the page; the deal always starts at “New”.'
      ]
    },
    steps: [
      { title: 'Open a deal', detail: 'Click its card.' },
      {
        title: 'Change the stage',
        detail: 'Drag the card to the column you want, then release.'
      },
      { title: 'See more cards', detail: 'Click “Show more” at the bottom of the column.' },
      {
        title: 'See Won or Lost',
        detail: 'Choose the stage in the Step criterion of the search bar.'
      }
    ],
    consequences: [
      'Releasing the card changes the stage immediately, with no confirmation or success message; the two columns concerned reload.',
      "It is reversible: put the card back in its former column. Leaving “Won” or “Lost” clears the deal's closing date.",
      'No e-mail or message is sent to the client. The change is written to the audit log.',
      'If saving fails (missing right, deal changed by a colleague), an error message appears and the card stays in its column.'
    ],
    faq: [
      {
        q: 'I cannot drag cards on my phone.',
        a: 'Drag and drop depends on your device. If it does not work, open the deal and change the stage from its record.'
      },
      {
        q: "Where can I see a deal's estimated value?",
        a: "The card shows the client's maximum budget. The estimated value of the transaction is in the deal record."
      },
      {
        q: 'The column total is larger than the number of visible cards.',
        a: 'Cards load 30 at a time. Click “Show more” to display the next ones.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'Moving a card requires “Edit deals”.'
    },
    related: [
      { label: 'Change the stage from the record', helpId: 'commercial.affaires.detail.etape' },
      { label: 'Search, criteria and views', helpId: 'commercial.affaires.liste.recherche' }
    ],
    keywords: ['kanban', 'column', 'card', 'drag', 'stage', 'pipeline', 'new', 'qualified', 'negotiation']
  },
  {
    id: 'commercial.affaires.liste.tableau',
    kind: 'table',
    title: 'Deals table (List view)',
    summary:
      'Each row is a deal of your agency. The table shows the type, the contact, the stage, the budget and the area, with action icons.',
    howToRead: {
      columns: [
        {
          key: 'type',
          label: 'Type',
          description: 'The deal type: Purchase, Rental, Sale, Property management or Mandate.'
        },
        {
          key: 'contact',
          label: 'Contact',
          description: 'The first and last name of the contact concerned by the deal.'
        },
        {
          key: 'stage',
          label: 'Stage',
          description: "The deal's current stage, in a colored badge (see the stages below)."
        },
        {
          key: 'budget',
          label: 'Budget',
          description:
            "The client's budget in FCFA: “minimum - maximum FCFA”, or “Up to … FCFA” if there is only a maximum. A dash means no maximum budget is entered."
        },
        {
          key: 'locationZone',
          label: 'Location',
          description: 'The area or commune targeted. A dash means it is not filled in.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "Four icons: “Add an activity” and “Add an appointment” (both open the deal's activity form, at the top of the page), “View details” and “Edit”."
        }
      ],
      statuses: [
        { value: 'NEW', label: 'New', description: 'New request. This is the starting stage of every deal.' },
        { value: 'QUALIFIED', label: 'Qualified', description: "The client's need is clarified." },
        { value: 'VISIT', label: 'Viewing', description: 'The client is visiting or about to visit properties.' },
        { value: 'NEGOTIATION', label: 'Negotiation', description: 'The deal is being negotiated.' },
        { value: 'WON', label: 'Won', description: 'The deal is concluded.' },
        { value: 'LOST', label: 'Lost', description: 'The deal is abandoned.' }
      ],
      notes: [
        'The most recent deals come first. The table cannot be sorted by column: use the search and the filters.',
        'The list displays 20 deals per page, with “Previous” and “Next” when there are more. It shows all stages, “Won” and “Lost” included, unless filtered.',
        'The “Edit” icon opens the edit form at the top of the page, without leaving the list.'
      ]
    },
    steps: [
      { title: 'Open a deal', detail: 'Click the “View details” icon on the row.' },
      { title: 'Correct a deal', detail: 'Click the “Edit” icon, change the fields, then “Update the deal”.' }
    ],
    consequences: [
      'Saving a change reloads the list. The stage cannot be changed in this form: use the pipeline or the deal record.'
    ],
    faq: [
      {
        q: 'How do I change the stage from the list?',
        a: 'Open the record with “View details” and choose the new stage in the drop-down list, or switch to the Pipeline view.'
      },
      {
        q: 'What does a dash in a column mean?',
        a: 'The information is not filled in on the deal (no maximum budget, no area).'
      },
      {
        q: 'Why does “Add an appointment” open an activity form?',
        a: 'Both icons open the same form for adding an activity to the deal, at the top of the page.'
      }
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Deals overview', helpId: 'commercial.affaires.liste' }],
    keywords: ['table', 'list', 'columns', 'statuses', 'stage', 'budget', 'location', 'actions']
  },

  // ---------------------------------------------------------------- Creation
  {
    id: 'commercial.affaires.nouvelle',
    kind: 'page',
    title: 'Create a deal',
    summary:
      'This form records a new deal: what a contact is looking for or offering, their budget, the area and the type of property. The deal is created at the “New” stage.',
    purpose:
      'Create a deal as soon as a client expresses a need: it links the request to its contact and puts it in the pipeline, so you do not lose track of it.',
    steps: [
      {
        title: 'Choose the deal type',
        detail: 'Purchase, Rental, Sale, Property management or Mandate. “Purchase” is suggested by default.'
      },
      {
        title: 'Choose the contact',
        detail:
          "The contact is required. If you come from a contact's record, it is already selected and the field does not appear."
      },
      { title: 'Enter budget and area', detail: 'Minimum and maximum budget in FCFA, then the commune wanted.' },
      { title: 'Specify the property', detail: 'Property type, estimated value, then the criteria that depend on it.' },
      { title: 'Describe the need', detail: "Add the client's constraints in “Description / specific needs”." },
      { title: 'Save', detail: 'Click “Create the deal”. “Cancel” abandons the entry.' }
    ],
    consequences: [
      'The deal is created at the “New” stage. The form has no “Step” field: it is changed afterwards from the pipeline or the record.',
      'Creating sends no e-mail or message; it is written to the audit log.',
      "After saving, you go back to the contact's record if you came from it, otherwise to the deals list.",
      'The same form opens at the top of the list with “New deal”: you stay there after saving.'
    ],
    faq: [
      {
        q: 'What is the minimum to fill in?',
        a: 'Only the contact is required (the deal type is already chosen). If the maximum budget is lower than the minimum budget, saving is refused.'
      },
      {
        q: 'I cannot find my contact.',
        a: 'Create it first in the contacts, then come back and create the deal.'
      },
      {
        q: 'Can I choose the stage when creating?',
        a: 'No, the deal always starts at “New”. Move it forward afterwards in the pipeline.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Creating a deal requires “Create deals”.' },
    related: [
      { label: 'General information', helpId: 'commercial.affaires.nouvelle.informations' },
      { label: 'Budget and location', helpId: 'commercial.affaires.nouvelle.budget' },
      { label: 'Specific criteria', helpId: 'commercial.affaires.nouvelle.criteres' },
      { label: 'Deals list', to: '/tenant/:tenantId/crm/deals' }
    ],
    keywords: ['new deal', 'create a deal', 'add a deal', 'opportunity', 'prospect', 'need'],
    tour: {
      steps: [
        {
          target: 'affaire-informations',
          title: 'Type and contact',
          description: 'Choose the deal type and the contact concerned: the contact is required.'
        },
        {
          target: 'affaire-budget',
          title: 'Budget and area',
          description: 'Enter the budget range in FCFA and the commune wanted.'
        },
        {
          target: 'affaire-bien',
          title: 'Property type',
          description: 'Choose the property type: the criteria offered on the right depend on it.'
        },
        {
          target: 'affaire-enregistrer',
          title: 'Save',
          description: 'The deal is created at the “New” stage, with no message sent to the client.'
        }
      ]
    }
  },
  {
    id: 'commercial.affaires.nouvelle.informations',
    kind: 'section',
    title: 'General information',
    summary: 'The two essential fields of a deal: its type and the contact concerned.',
    howToRead: {
      notes: [
        'Purchase: the contact wants to buy a property.',
        'Rental: the contact wants to rent a property.',
        'Sale: an owner wants to sell their property.',
        'Property management: an owner wants to entrust the management of their property.',
        'Mandate: a management, sale or rental mandate.',
        'Contact: required. Without a contact, saving shows “The contact is required”.'
      ]
    },
    steps: [
      { title: 'Choose the type', detail: 'Open the “Deal type” list and choose the matching line.' },
      { title: 'Choose the contact', detail: 'Open the “Contact” list and select the person concerned.' }
    ],
    consequences: [
      'The type can be changed later with “Edit”. It appears in the pipeline, the list, the export and the record.'
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Create a deal', helpId: 'commercial.affaires.nouvelle' }],
    keywords: ['type', 'purchase', 'rental', 'sale', 'management', 'mandate', 'contact']
  },
  {
    id: 'commercial.affaires.nouvelle.budget',
    kind: 'section',
    title: 'Budget and location',
    summary:
      "The client's budget range in FCFA and the commune they are aiming for. These fields are optional but very useful.",
    howToRead: {
      notes: [
        'Minimum budget and Maximum budget: in FCFA. The maximum budget must be higher than the minimum, otherwise saving shows an error under the field.',
        'Geographic area (district): type the name of a commune and choose it in the list.',
        'The maximum budget appears on the pipeline card. The budget, the area and the number of rooms are also used to search for matching properties.'
      ]
    },
    steps: [
      { title: 'Enter the budget', detail: 'Type the amounts without spaces: they format themselves automatically.' },
      { title: 'Choose the commune', detail: 'Type for example “Cocody” and select the result.' }
    ],
    consequences: [
      'An empty field blocks nothing. In the property search, a budget or an area that is not filled in counts as a perfect match.'
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Matching properties', helpId: 'commercial.affaires.detail.correspondance' }],
    keywords: ['budget', 'fcfa', 'area', 'commune', 'location', 'minimum', 'maximum']
  },
  {
    id: 'commercial.affaires.nouvelle.bien',
    kind: 'section',
    title: 'Property type and estimated value',
    summary: 'The type of property wanted or offered, and the amount at which the deal should be concluded.',
    howToRead: {
      notes: [
        'Property type: Flat, Villa, House, Plot, Office, Retail unit, Studio, Duplex, Penthouse, Building or Other. The field is optional and can be cleared.',
        "Estimated transaction value (FCFA): the estimated amount at which the deal should be concluded. It is not the client's budget."
      ]
    },
    steps: [
      {
        title: 'Choose the property type',
        detail: 'The “Specific criteria” card on the right fills in according to your choice.'
      },
      { title: 'Enter the estimated value', detail: 'Optional: enter the amount in FCFA.' }
    ],
    consequences: [
      'The estimated value does not appear in the pipeline or in the list: you find it in the deal record.'
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Specific criteria', helpId: 'commercial.affaires.nouvelle.criteres' }],
    keywords: ['property type', 'apartment', 'villa', 'land', 'estimated value', 'building']
  },
  {
    id: 'commercial.affaires.nouvelle.criteres',
    kind: 'section',
    title: 'Specific criteria',
    summary:
      'This card changes according to the chosen property type. Fill in what matters to the client: everything is optional.',
    howToRead: {
      notes: [
        'As long as no property type is chosen, the card invites you to select one.',
        'Flat, studio, duplex, penthouse: number of rooms, floor area, furnishing condition, floor, amenities (lift, parking space, balcony, terrace).',
        'Villa, house: living area, plot area, amenities (garden, swimming pool, garage, parking space).',
        'Plot: area, plot type (Urban, Village, Agricultural, Industrial), serviced, buildable.',
        'Office: floor area, number of offices, reception, parking space. Retail unit: floor area, retail type, shop window, parking space.',
        'Building: number of floors and flats, standing, parking spaces, occupancy rate, lift. Other: a description of the property wanted.'
      ]
    },
    steps: [
      { title: 'Choose the property type first', detail: 'The fields of the card appear immediately.' },
      { title: 'Fill in the useful criteria', detail: 'Leave empty what the client does not specify.' }
    ],
    consequences: [
      'The criteria are saved with the deal and appear in the “Property type and criteria” card of the record.',
      'For now, the search for matching properties mainly reads the budget, the area and the number of rooms; the surface and the equipment are kept for your information.',
      'If you change the property type before saving, only the criteria of the type finally chosen are saved.'
    ],
    faq: [
      {
        q: 'Why do some fields disappear?',
        a: 'Each property type has its own criteria. Change the property type to display the fields of another type.'
      },
      {
        q: 'Are the criteria required?',
        a: 'No. All criteria are optional: an empty criterion excludes no property.'
      },
      {
        q: 'Where can I find these criteria afterwards?',
        a: 'In the deal record, “Property type and criteria” card. Only the criteria filled in appear there.'
      }
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Property type and estimated value', helpId: 'commercial.affaires.nouvelle.bien' }],
    keywords: ['criteria', 'rooms', 'surface', 'equipment', 'garden', 'pool', 'parking', 'floor', 'standing']
  },
  {
    id: 'commercial.affaires.nouvelle.complements',
    kind: 'section',
    title: 'Additional information',
    summary: "A free field to note the client's needs: constraints, desired equipment, deadlines.",
    howToRead: {
      notes: [
        'The text entered in “Description / specific needs” appears in the deal record, in a card of the same name.',
        'If the property type is “Other”, the “Description of the property type” field reuses the same text: the two fields are linked.'
      ]
    },
    steps: [{ title: 'Describe the need', detail: 'Write in your own words what the client expects from this deal.' }],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Create a deal', helpId: 'commercial.affaires.nouvelle' }],
    keywords: ['description', 'needs', 'constraints', 'notes']
  },

  // ---------------------------------------------------------------- Editing
  {
    id: 'commercial.affaires.modifier',
    kind: 'page',
    title: 'Edit a deal',
    summary:
      "The edit form is the creation form, filled in with the deal's current information. Change what has evolved, then click “Update the deal”.",
    steps: [
      {
        title: 'Open the form',
        detail: 'From the deal record, click “Edit”.'
      },
      { title: 'Change the fields', detail: 'The sections are the same as for creation: see “Create a deal”.' },
      {
        title: 'Save',
        detail: '“Update the deal” takes you back to the record. “Cancel” goes back without changing anything.'
      }
    ],
    consequences: [
      'The form has no “Step” field: change the stage from the pipeline or from the record.',
      'When saving, the application checks that nobody changed the deal in the meantime. Otherwise: “This deal was modified by another user. Refresh the page and try again.”',
      "The deal's activities are kept. No e-mail or message is sent; the change is written to the audit log."
    ],
    faq: [
      {
        q: "How do I change a deal's stage?",
        a: 'Not in this form: open the record and use the drop-down list, or drag the card in the pipeline.'
      },
      {
        q: 'I see “modified by another user”.',
        a: 'A colleague saved the deal before you. Refresh the page to see their changes, then redo your edit.'
      },
      {
        q: 'Are the activities already entered lost?',
        a: 'No. Editing the deal does not touch its activity history.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Editing a deal requires “Edit deals”.' },
    related: [
      { label: 'Create a deal', helpId: 'commercial.affaires.nouvelle' },
      { label: 'Deal record', helpId: 'commercial.affaires.detail' }
    ],
    keywords: ['edit a deal', 'correct', 'update', 'modify']
  },

  // ---------------------------------------------------------------- Deal record
  {
    id: 'commercial.affaires.detail',
    kind: 'page',
    title: 'Deal record',
    summary:
      'This page gathers what you know about a deal: contact, budget, criteria, latest activities and matching properties. This is where you change the stage, edit the deal and look for properties to offer.',
    purpose:
      'Open the record before a call or a meeting to find what the client is looking for and what has already been done.',
    howToRead: {
      notes: [
        'The header shows the deal type, the stage (colored badge), then the contact, their e-mail, their phone, the area, the budget and the “Created on” and “Edited on” dates. A missing line means the information is not filled in.',
        'The budget is written “minimum - maximum FCFA”, “Up to … FCFA” or “From … FCFA” depending on what is entered.',
        'The “Property type and criteria” and “Description / specific needs” cards only appear if this information was entered.'
      ]
    },
    steps: [
      {
        title: 'Change the stage',
        detail: 'Choose the new stage in the drop-down list, under the “Back” button.'
      },
      { title: 'Edit', detail: 'Click “Edit” to open the form.' },
      { title: 'Go back', detail: '“Back” takes you back to the deals list.' },
      {
        title: 'Look for properties',
        detail: 'In the “Property matching” card, click “Search for matches”.'
      }
    ],
    consequences: [
      'The stage change is saved as soon as you choose, with the message “Deal stage updated”. See the stage help for details.',
      'A deal cannot be deleted: to close it, set it to “Won” or “Lost”.'
    ],
    faq: [
      {
        q: "I cannot see the contact's phone.",
        a: "It only appears if it is filled in on the contact's record."
      },
      {
        q: 'A message says the deal was changed by another user.',
        a: 'A colleague saved it before you. Refresh the page and try again.'
      },
      {
        q: 'Why does the timeline show only ten activities?',
        a: 'The record displays the ten most recent activities of the deal.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'Viewing the record requires “View deals”; “Edit” and the stage change require “Edit deals”; the property search requires “Run the property/deal matching”.'
    },
    related: [
      { label: 'Change the stage', helpId: 'commercial.affaires.detail.etape' },
      { label: 'Matching properties', helpId: 'commercial.affaires.detail.correspondance' },
      { label: 'Deals list', to: '/tenant/:tenantId/crm/deals' }
    ],
    keywords: ['deal record', 'detail', 'deal', 'contact', 'stage', 'budget', 'client']
  },
  {
    id: 'commercial.affaires.detail.etape',
    kind: 'section',
    title: "Change a deal's stage",
    summary:
      'The badge next to the deal type shows the current stage. The drop-down list on the right of the header changes it, and the change is saved right away.',
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'New', description: 'New request, starting stage.' },
        { value: 'QUALIFIED', label: 'Qualified', description: "The client's need is clarified." },
        { value: 'VISIT', label: 'Viewing', description: 'The client is visiting or about to visit properties.' },
        { value: 'NEGOTIATION', label: 'Negotiation', description: 'The deal is being negotiated.' },
        { value: 'WON', label: 'Won', description: 'The deal is concluded: its closing date is recorded.' },
        { value: 'LOST', label: 'Lost', description: 'The deal is abandoned: its closing date is recorded.' }
      ]
    },
    steps: [
      { title: 'Open the list', detail: 'Click the drop-down list located under the “Back” button.' },
      { title: 'Choose the stage', detail: 'Click the stage you want (you can also type its name).' },
      { title: 'Check', detail: 'The message “Deal stage updated” confirms it was saved.' }
    ],
    consequences: [
      'The change is immediate, without confirmation. It is reversible: choose another stage, even from “Won” or “Lost”.',
      'Moving to “Won” or “Lost” records the closing date; leaving it clears it.',
      'No e-mail or message is sent to the client or a colleague. The change is written to the audit log, with the former and the new stage.',
      "Changing the stage changes neither the contact's status nor a property's status.",
      'When a sale is concluded in the Sales module (deed signed) and its offer is linked to this deal, the deal automatically moves to “Won”.'
    ],
    faq: [
      {
        q: 'The stage does not change and an error appears.',
        a: 'You may be missing the “Edit deals” right, or a colleague changed the deal in the meantime. Refresh the page and try again.'
      },
      {
        q: 'What is the difference between “Won” and “Lost”?',
        a: '“Won” means the deal succeeded; “Lost” means it is abandoned. No reason is asked here.'
      },
      {
        q: 'Can I reopen a “Won” or “Lost” deal?',
        a: 'Yes: choose another stage. The closing date is then cleared.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Changing the stage requires “Edit deals”.' },
    related: [{ label: 'The pipeline by stage', helpId: 'commercial.affaires.liste.kanban' }],
    keywords: ['stage', 'won', 'lost', 'negotiation', 'qualified', 'close', 'reopen']
  },
  {
    id: 'commercial.affaires.detail.criteres',
    kind: 'section',
    title: 'Property type and criteria',
    summary:
      'This card recalls the property wanted: property type, estimated value of the transaction and the criteria entered (rooms, surface, equipment…).',
    howToRead: {
      notes: [
        'Property type sought: apartment, villa, land, etc.',
        "Estimated transaction value: the amount at which the deal should be concluded, in FCFA. It is not the client's budget.",
        'The criteria (number of rooms, surface, land area, furnishing, floor, number of offices, type of business) and the equipment (tags) only appear if they were filled in.',
        'The card is absent if none of this information was entered.'
      ]
    },
    steps: [{ title: 'Correct an item', detail: 'Click “Edit” at the top of the record.' }],
    consequences: ['The card is read-only: it only changes through the edit form.'],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Specific criteria', helpId: 'commercial.affaires.nouvelle.criteres' }],
    keywords: ['criteria', 'property type', 'estimated value', 'equipment', 'surface']
  },
  {
    id: 'commercial.affaires.detail.chronologie',
    kind: 'section',
    title: 'Deal activity timeline',
    summary:
      'This card lists the activities linked to the deal (calls, e-mails, visits, notes, tasks…), from the most recent to the oldest.',
    howToRead: {
      notes: [
        'The number in brackets is the number of activities displayed: at most ten, the most recent.',
        'Each activity shows its type, its direction (incoming, outgoing, internal), its date and time, its subject, its content, its result, its author and, if there is one, the next planned action.',
        'The “Contact” and “Deal” buttons open the matching record; clicking the activity opens the activities screen filtered on the deal.'
      ]
    },
    steps: [{ title: 'See the whole history', detail: "Click an activity to open the deal's activities screen." }],
    consequences: ['The card is read-only: you cannot add or delete an activity from it.'],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Deal record', helpId: 'commercial.affaires.detail' }],
    keywords: ['activities', 'history', 'calls', 'notes', 'timeline', 'follow-up']
  },
  {
    id: 'commercial.affaires.detail.correspondance',
    kind: 'section',
    title: 'Property matching',
    summary:
      "This card searches, among your agency's properties, those that suit the client. You can add the chosen properties to the deal's shortlist (“shortlist”).",
    purpose: 'It saves you from browsing the whole catalog to find properties to offer the client.',
    howToRead: {
      notes: [
        'Nothing is displayed until you click “Search for matches”. At most 20 properties are offered, from the closest to the least close.',
        'The properties examined are those of the agency (or of its clients under an active mandate) that are published and have the status Available, Reserved or Under offer.',
        'Each result shows the property title, its price, its surface, its rooms and its area, then an overall score.',
        '“Match details” gives five percentages: Budget (30% of the score), Location (25%), Size (20%), Features (15%) and Price consistency (10%). Rely mainly on these five percentages.',
        'A criterion that the deal does not fill in counts as a perfect match (100%).'
      ]
    },
    steps: [
      { title: 'Start the search', detail: 'Click “Search for matches”.' },
      {
        title: 'Examine a property',
        detail: 'Read the score and the details; “View details” opens the property record.'
      },
      { title: 'Keep a property', detail: 'Click “Add to shortlist”: the button becomes “Added to the shortlist”.' }
    ],
    consequences: [
      "Adding a property saves it in the deal's shortlist, with the status “Shortlisted”. It changes neither the property nor the deal's stage, and nothing is sent to the client.",
      'Adding the same property twice does not create a duplicate.',
      'The search results are not kept: run the search again if you leave the page.'
    ],
    faq: [
      {
        q: 'No property is offered.',
        a: 'No published and available property of the agency matches, or no property is published. Check the published properties, then run the search again.'
      },
      {
        q: 'I cannot see the search button, or a message mentions rights.',
        a: 'The search and adding to the shortlist require the “Run the property/deal matching” right. Ask your agency administrator for it.'
      },
      {
        q: 'How is the area compared?',
        a: "The name of the deal's area is compared with that of the property's area: identical is a full match; one contained in the other is a partial match."
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'Requires “Run the property/deal matching”.'
    },
    related: [
      { label: 'Budget and location', helpId: 'commercial.affaires.nouvelle.budget' },
      { label: 'Deal record', helpId: 'commercial.affaires.detail' }
    ],
    keywords: ['matching', 'properties', 'shortlist', 'selection', 'offer', 'suggest']
  }
];

export default entries;
