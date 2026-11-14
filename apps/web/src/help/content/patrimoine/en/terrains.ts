import type { HelpEntry } from '../../../types';

/** Zone « terrains » du module « patrimoine » (en). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.terrains',
    kind: 'page',
    title: 'Land regularization',
    summary:
      'Track the land regularization procedures of your plots, from the village attestation to the land title. Each file gathers the steps, due dates, costs and documents of a property.',
    purpose:
      'Regularizing a plot takes several successive procedures. This screen shows you, for each property, where the file stands, what is overdue and what it costs.',
    steps: [
      {
        title: 'Open a file',
        detail: 'Click "New file", choose the property and the track, then "Create the file".'
      },
      {
        title: 'Find a file',
        detail: 'Use the search, or the Status and Property filters.'
      },
      {
        title: 'Follow up',
        detail: 'Click the property name to open the file and move its steps forward.'
      }
    ],
    consequences: [
      'A property can only have one file "In progress" at a time: a second one is refused.',
      'The "Côte d\'Ivoire" track is flagged "To be validated by a local legal expert": do not take it for legal advice.',
      "Regularization costs are a separate figure: they are not added to the property's cost price."
    ],
    faq: [
      {
        q: 'Why can I not create a file for this property?',
        a: 'This property already has a regularization file "In progress". Complete or abandon it first.'
      },
      {
        q: 'What does "To validate" mean?',
        a: 'The track has not yet been confirmed by a local legal expert: have it checked before relying on it.'
      },
      {
        q: 'Can the list be shared?',
        a: 'Yes: the filters are in the page address, which you can copy.'
      },
      {
        q: 'I cannot see the "New file" button.',
        a: 'Creating a file requires the right to edit properties; viewing requires the right to view properties.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires the "View properties" right; creating and editing a file require "Edit properties".'
    },
    related: [
      { label: 'File table', helpId: 'patrimoine.terrains.liste' },
      { label: 'New file', helpId: 'patrimoine.terrains.nouveau' },
      { label: 'File details', helpId: 'patrimoine.terrain' }
    ],
    keywords: [
      'plot',
      'land',
      'land regularization',
      'land title',
      'ACD',
      'village attestation',
      'boundary marking',
      'surveyor',
      'land file'
    ]
  },
  {
    id: 'patrimoine.terrains.liste',
    kind: 'table',
    title: 'Regularization file table',
    summary:
      'Each row is a file: the property, the track, the progress, the status, the costs, the next due date and the overdue steps.',
    howToRead: {
      columns: [
        {
          key: 'bien',
          label: 'Property',
          description: 'The property title (click to open the file) and its reference.'
        },
        {
          key: 'filiere',
          label: 'Track',
          description: 'The path followed. The "To validate" tag flags a track to be checked by a local legal expert.'
        },
        {
          key: 'avancement',
          label: 'Progress',
          description: 'The percentage and the number of steps completed out of the total.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'The state of the file (see below).'
        },
        {
          key: 'frais',
          label: 'Costs incurred',
          description: 'The sum of the costs entered on the steps, in FCFA.'
        },
        {
          key: 'echeance',
          label: 'Next due date',
          description: 'The nearest due date among the unfinished steps of a file in progress; a dash if there is none.'
        },
        {
          key: 'retard',
          label: 'Overdue steps',
          description: 'The number of "To do" or "In progress" steps whose due date has passed.'
        }
      ],
      statuses: [
        {
          value: 'EN_COURS',
          label: 'In progress',
          description: 'The file is moving forward: its steps can be edited.'
        },
        {
          value: 'TERMINEE',
          label: 'Completed',
          description: 'All required steps are completed and the file is closed. It can be reopened with a reason.'
        },
        {
          value: 'ABANDONNEE',
          label: 'Abandoned',
          description: 'The file is stopped without being finished. It can be reopened with a reason.'
        }
      ],
      notes: [
        'The search covers the property, the reference, the track, the current step and the status.',
        'The list is loaded in full: there are no pages. The export includes the files matching your filters.',
        'On a phone, each file is shown as a card.'
      ]
    },
    steps: [
      {
        title: 'Filter by property',
        detail: 'The Property filter only offers properties that already have a file.'
      },
      {
        title: 'Open',
        detail: 'Click the property name, or the card on a phone.'
      }
    ],
    faq: [
      {
        q: 'Why is the next due date empty?',
        a: 'The file is no longer in progress, or no unfinished step has a due date.'
      },
      {
        q: 'What are the costs incurred?',
        a: 'The total of the costs entered in each step, in FCFA.'
      },
      {
        q: 'How do I find all the files of a plot?',
        a: "Filter by property: the property's completed or abandoned files are shown too."
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'File details', helpId: 'patrimoine.terrain' }],
    keywords: ['files', 'progress', 'costs', 'due date', 'overdue', 'status']
  },
  {
    id: 'patrimoine.terrains.nouveau',
    kind: 'section',
    title: 'New regularization file',
    summary:
      "This form opens a property's file. Depending on the track chosen, the steps are prepared for you or entered by you.",
    purpose:
      'You choose the property, the track, optionally the start date and notes. The file opens straight away as "In progress".',
    steps: [
      {
        title: 'Property',
        detail: 'Search for and choose the property concerned.'
      },
      {
        title: 'Track',
        detail:
          '"Côte d\'Ivoire — from the village attestation to the land title" prepares six steps. "Custom" lets you write your own steps.'
      },
      {
        title: 'Start date and notes',
        detail: "The start date is optional: if left empty, it is today's date."
      },
      {
        title: 'Custom steps',
        detail: 'For the custom track, add 1 to 30 steps: label, optional due date, "Mandatory" box.'
      },
      {
        title: 'Create',
        detail: 'Click "Create the file": you land on the file details.'
      }
    ],
    consequences: [
      'The six steps of the "Côte d\'Ivoire" track are all required: Village attestation, Surveyor\'s technical file, Adversarial boundary marking, ACD request to the ministry, Final land concession order (ACD), Land title.',
      'No duration is suggested: set the due dates yourself in each step.',
      'If the property already has a file in progress, creation is refused with the message "This property already has an ongoing regularization file".'
    ],
    faq: [
      {
        q: 'Can I change track after creation?',
        a: 'No, the track is fixed at creation.'
      },
      {
        q: 'Can I edit the steps of the "Côte d\'Ivoire" track?',
        a: 'Their labels and whether they are required are fixed. You can edit the due date, cost, notes and document of each step.'
      },
      {
        q: 'How many steps can a custom track have?',
        a: 'At least one and at most thirty.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Requires the "Edit properties" right.'
    },
    related: [{ label: 'File details', helpId: 'patrimoine.terrain' }],
    keywords: ['new file', 'track', 'custom', "Côte d'Ivoire", 'create']
  },
  {
    id: 'patrimoine.terrain',
    kind: 'page',
    title: 'Regularization file details',
    summary:
      "A file follows a property's regularization step by step: progress, costs, step timeline and notes. You complete, abandon or reopen it from the top of the page.",
    purpose: 'This is where you move each procedure forward, attach supporting documents and keep track of costs.',
    howToRead: {
      statuses: [
        { value: 'EN_COURS', label: 'In progress', description: 'The file can be edited.' },
        {
          value: 'TERMINEE',
          label: 'Completed',
          description: 'File closed; the closing date is shown. Everything is read-only.'
        },
        {
          value: 'ABANDONNEE',
          label: 'Abandoned',
          description: 'File stopped; the closing date is shown. Everything is read-only.'
        }
      ],
      notes: [
        'Progress: the percentage of steps completed and their number out of the total.',
        "Regularization costs: the sum of the step costs. This amount is not included in the property's cost price.",
        'A "To be validated by a local legal expert" banner appears on an unconfirmed track.'
      ]
    },
    steps: [
      {
        title: 'Move the steps forward',
        detail: 'In the "Steps" card, click "Details and actions" for a step.'
      },
      {
        title: 'Complete the file',
        detail: '"Complete the file" button: possible when all required steps are completed. A reason is optional.'
      },
      {
        title: 'Abandon the file',
        detail: '"Abandon the file" button, with an optional reason.'
      },
      {
        title: 'Reopen',
        detail: 'A completed or abandoned file is reopened with "Reopen the file"; the reason is required.'
      }
    ],
    consequences: [
      'Completing or abandoning closes the file: no step or note can be edited until it is reopened.',
      'A file cannot be completed if a required step is not completed.',
      'Reopening is refused if the property now has another file in progress.',
      "The agency's administrators may receive an e-mail alert for an overdue step (only once per due date), if this notification is enabled for the agency."
    ],
    faq: [
      {
        q: 'Why is "Complete the file" refused?',
        a: 'A required step is not completed: the message shown says that all mandatory steps must be completed.'
      },
      {
        q: 'Why is everything greyed out?',
        a: 'The file is completed or abandoned. Click "Reopen the file" and give a reason.'
      },
      {
        q: "Where do I edit a step's cost?",
        a: 'In the step panel, "Cost incurred (XOF)" field.'
      },
      {
        q: 'Where do I find the property sheet?',
        a: 'The "View the property sheet" link is under the title.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires "View properties"; completing, abandoning, reopening and editing require "Edit properties".'
    },
    related: [
      { label: 'The file steps', helpId: 'patrimoine.terrain.etapes' },
      { label: 'A step panel', helpId: 'patrimoine.terrain.etape' },
      { label: 'The file notes', helpId: 'patrimoine.terrain.notes' },
      { label: 'Back to files', helpId: 'patrimoine.terrains' }
    ],
    keywords: ['file', 'complete', 'abandon', 'reopen', 'regularization costs', 'closure']
  },
  {
    id: 'patrimoine.terrain.etapes',
    kind: 'section',
    title: 'File steps',
    summary:
      "The timeline lists the steps in order, with their status, dates, cost and attached document. Actions are done in each step's panel.",
    purpose:
      'A step is a procedure to carry out. The "Côte d\'Ivoire" track has six, all required; a custom track has your own steps.',
    howToRead: {
      statuses: [
        { value: 'A_FAIRE', label: 'To do', description: 'The step has not started.' },
        { value: 'EN_COURS', label: 'In progress', description: 'The step has started; its start date is recorded.' },
        { value: 'TERMINEE', label: 'Completed', description: 'The step is finished; its end date is recorded.' },
        { value: 'BLOQUEE', label: 'Blocked', description: 'The step is waiting to be unblocked.' }
      ],
      notes: [
        '"Côte d\'Ivoire" track, in order: 1. Village attestation; 2. Surveyor\'s technical file; 3. Adversarial boundary marking; 4. ACD request to the ministry; 5. Final land concession order (ACD); 6. Land title.',
        'A non-required step carries the "Optional" tag. "Overdue" flags a "To do" or "In progress" step whose due date has passed.',
        'The "Due date" line also shows the start and end, and the "Cost" line shows the attached document.'
      ]
    },
    steps: [
      {
        title: 'Open a step',
        detail: 'Click "Details and actions".'
      },
      {
        title: 'Add a step',
        detail: 'Custom track only, file in progress: enter the label then "Add a step".'
      }
    ],
    consequences: [
      'A step can only be completed if all the required steps before it are completed.',
      'The steps of the "Côte d\'Ivoire" track can neither be added nor deleted.',
      'An added step is required.'
    ],
    faq: [
      {
        q: 'Why can I not complete step 3?',
        a: 'A previous required step is not completed.'
      },
      {
        q: 'What does a red dot on the timeline mean?',
        a: 'The step is overdue or blocked.'
      },
      {
        q: 'Where do I add a step to the "Côte d\'Ivoire" track?',
        a: 'It is not possible: only custom tracks accept extra steps.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Editing requires the "Edit properties" right.' },
    related: [{ label: 'A step panel', helpId: 'patrimoine.terrain.etape' }],
    keywords: ['steps', 'timeline', 'village attestation', 'boundary marking', 'ACD', 'land title', 'overdue']
  },
  {
    id: 'patrimoine.terrain.etape',
    kind: 'section',
    title: 'Step panel',
    summary:
      "A step's side panel is used to change its status, set the due date and cost, write notes and attach the supporting document.",
    purpose: 'Each step keeps its dates, cost and document: the panel is where you fill them in.',
    steps: [
      {
        title: 'Change the status',
        detail:
          'The buttons offered depend on the state: "Start", "Unblock", "Complete the step", "Mark as blocked", "Set back to to-do", "Reopen the step".'
      },
      {
        title: 'Set due date, cost and notes',
        detail: 'Fill in the due date, the cost incurred (XOF) and the notes, then "Save the step".'
      },
      {
        title: 'Attach a document',
        detail:
          'Choose an existing document of the property then "Attach", or upload a new file. "Download the document" and "Detach the document" are also offered.'
      },
      {
        title: 'Delete',
        detail: '"Delete the step": reserved for steps of a custom track that are to do, with no cost or document.'
      }
    ],
    consequences: [
      'Reopening a completed step requires a reason, and is only possible if no later step is completed: reopen the later ones first.',
      'Deleting a step is final. A file keeps at least one step.',
      "An uploaded document is added to the property's documents, with the document type suggested for the step; it stays there even if you detach it from the step.",
      'On the "Côte d\'Ivoire" track, the label and whether the step is required cannot be changed.'
    ],
    faq: [
      {
        q: 'Why is only one status button shown?',
        a: 'Only the allowed changes are offered; for example "Complete the step" disappears if a previous required step is not completed.'
      },
      {
        q: 'Which document should I attach to each step?',
        a: 'The suggested document type is shown under "Or upload a new file": for example Plan for the surveyor\'s file and the boundary marking, Final concession order (ACD) for the ACD, Title deed for the land title.'
      },
      {
        q: 'All the fields are greyed out.',
        a: 'The file is no longer "In progress": reopen it from its page.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Requires the "Edit properties" right.' },
    related: [{ label: 'The file steps', helpId: 'patrimoine.terrain.etapes' }],
    keywords: ['step', 'supporting document', 'cost', 'due date', 'block', 'reopen the step']
  },
  {
    id: 'patrimoine.terrain.notes',
    kind: 'section',
    title: 'File notes',
    summary: "A free space to keep the file's context: contacts, pending procedures, decisions.",
    steps: [
      {
        title: 'Write',
        detail: 'Enter your notes (5,000 characters at most).'
      },
      {
        title: 'Save',
        detail: 'Click "Save the notes".'
      }
    ],
    consequences: ['Notes can only be edited while the file is "In progress".'],
    faq: [
      {
        q: "Are these notes different from a step's notes?",
        a: 'Yes: these notes cover the whole file, each step has its own.'
      },
      {
        q: 'Why did the "Save the notes" button disappear?',
        a: 'The file is completed or abandoned.'
      },
      {
        q: 'Can I enter notes at creation?',
        a: 'Yes, the creation form has a "Notes" field.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Requires the "Edit properties" right.' },
    related: [{ label: 'File details', helpId: 'patrimoine.terrain' }],
    keywords: ['notes', 'comments', 'follow-up']
  }
];

export default entries;
