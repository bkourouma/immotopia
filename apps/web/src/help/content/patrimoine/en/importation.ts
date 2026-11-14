import type { HelpEntry } from '../../../types';

/** Zone « importation » du module « patrimoine » (en). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.importation',
    kind: 'page',
    title: 'Import my portfolio',
    summary:
      'Bring in your portfolio from an Excel or CSV file, in six steps. Errors are detected before anything is written: only the lines you approve are imported.',
    purpose:
      'Instead of entering your properties one by one, you load a file. Two natures are possible: "Properties" (creates properties held by the agency) and "Valuations" (adds valuations to existing properties). Leases and tenants are not imported here.',
    steps: [
      {
        title: 'The nature',
        detail: 'Choose "Properties" or "Valuations", then "Continue".'
      },
      {
        title: 'The file',
        detail: 'Download the Excel template, fill it in, then drop your file (.xlsx or .csv).'
      },
      {
        title: 'The columns',
        detail: 'Say which field each column of your file matches, then "Preview".'
      },
      {
        title: 'The preview',
        detail: 'Fix the cells in error, uncheck the lines not to import, then "Import".'
      },
      {
        title: 'The import',
        detail: 'Wait: the lines are sent one by one. You can stop the import.'
      },
      {
        title: 'The report',
        detail: 'Check the result of each line and download the report as a CSV file.'
      }
    ],
    consequences: [
      'The file is read on your computer and is never sent as is: only the approved lines go out, one at a time.',
      'The import cannot be undone in one click: there is no button to cancel the lines already imported. Each property created is a real property of the agency.',
      'An imported property is held by the agency: no owner or mandate is created.',
      'For the "Properties" nature, the import may count against your subscription capacity (owned properties or units), and it is impossible if the subscription is read-only.'
    ],
    faq: [
      {
        q: 'Can I import my tenants and leases?',
        a: 'No. This import only creates properties and their valuations.'
      },
      {
        q: 'What are the file limits?',
        a: '.xlsx and .csv formats, 5 MB at most and 1,000 data lines. A CSV must be in UTF-8; otherwise it is read as Windows-1252 and a warning invites you to check the accents.'
      },
      {
        q: 'Where is the example line of my file?',
        a: "The template's example line is ignored automatically; the number of ignored lines is shown."
      },
      {
        q: 'What if the import stops?',
        a: 'The report lists the lines not processed or rejected. Use "Re-run the rejected lines" or go back to the preview.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Reserved for users who can create or edit properties.'
    },
    related: [
      { label: 'The nature', helpId: 'patrimoine.importation.nature' },
      { label: 'The file', helpId: 'patrimoine.importation.fichier' },
      { label: 'The columns', helpId: 'patrimoine.importation.colonnes' },
      { label: 'The preview', helpId: 'patrimoine.importation.apercu' },
      { label: 'The report', helpId: 'patrimoine.importation.rapport' }
    ],
    keywords: [
      'import',
      'bulk import',
      'Excel',
      'CSV',
      'file',
      'data migration',
      'template',
      'properties',
      'valuations'
    ],
    tour: {
      steps: [
        {
          target: 'import-etapes',
          title: 'The six steps',
          description: 'The bar shows where you are: nature, file, columns, preview, import, report.'
        },
        {
          target: 'import-etape-courante',
          title: 'The step title',
          description: 'The "?" next to the title explains the current step.'
        },
        {
          target: 'import-contenu',
          title: 'The step content',
          description: 'This is where you choose, drop, correct and then start the import.'
        }
      ]
    }
  },
  {
    id: 'patrimoine.importation.nature',
    kind: 'section',
    title: 'Step 1: the nature',
    summary: 'You choose what your file contains: properties to create, or valuations to add to existing properties.',
    purpose: 'Each nature has its own fields, its own rules and its own template. A file contains only one nature.',
    steps: [
      {
        title: 'Choose the nature',
        detail:
          '"Properties" creates properties held by the agency, one per line, with an optional acquisition value. "Valuations" adds valuations to existing properties, linked by their reference or exact title.'
      },
      {
        title: 'Continue',
        detail:
          'The "Continue" button becomes active when a nature is chosen and the reference lists are loaded. If loading fails, click "Try again".'
      }
    ],
    consequences: ['Nothing is written at this step.', 'Several valuations per property are allowed.'],
    faq: [
      {
        q: 'Where do I import my leases and tenants?',
        a: 'They are not imported here: the message at the top of the step says so.'
      },
      {
        q: 'I must create properties then their valuations. In what order?',
        a: 'First "Properties", then "Valuations" with the reference assigned to each property (visible in the report).'
      },
      {
        q: 'Why is "Continue" greyed out?',
        a: 'No nature is chosen, or the reference lists (districts, properties…) are still loading.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'The file', helpId: 'patrimoine.importation.fichier' }],
    keywords: ['nature', 'properties', 'valuations', 'choose']
  },
  {
    id: 'patrimoine.importation.fichier',
    kind: 'section',
    title: 'Step 2: the file',
    summary: 'Download the template, fill it in, then drop your file. It is read on your computer and is not sent.',
    purpose:
      'The Excel template contains the right columns for the chosen nature and an example line. Starting from the template avoids most column errors.',
    steps: [
      {
        title: 'Download the template',
        detail: 'Click "Download the Excel template" and fill it in.'
      },
      {
        title: 'Drop the file',
        detail:
          'Drag the file into the area, or click to choose it. Accepted formats: .xlsx and .csv (separator ; or ,), 5 MB and 1,000 lines at most.'
      },
      {
        title: 'Wait for reading',
        detail: '"Reading the file…" is displayed, then you move on to the columns step.'
      },
      {
        title: 'Go back',
        detail: '"Back to the nature" lets you change the nature.'
      }
    ],
    consequences: [
      'The file stays on your computer: it is read here and is never sent.',
      'A file that is too big, too long or in another format is refused with an error message.',
      'A CSV that is not in UTF-8 is read as Windows-1252: check the accents in the preview.'
    ],
    faq: [
      {
        q: 'My file is refused. Why?',
        a: 'A red message gives the reason: size, number of lines or columns, or unaccepted format.'
      },
      {
        q: 'Can I use my own file without the template?',
        a: 'Yes. At the next step you match each column to a field; common column names are often recognised.'
      },
      {
        q: 'Is my data sent when I load it?',
        a: 'No. Only the approved lines go out, at import time.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [
      { label: 'The nature', helpId: 'patrimoine.importation.nature' },
      { label: 'The columns', helpId: 'patrimoine.importation.colonnes' }
    ],
    keywords: ['template', 'xlsx', 'csv', 'drop', 'limits', 'size']
  },
  {
    id: 'patrimoine.importation.colonnes',
    kind: 'section',
    title: 'Step 3: the columns',
    summary: 'You say which field each column of your file matches. Required fields are marked with a star.',
    purpose:
      'ImmoTopia suggests a match when the column name is recognised. Check it and complete any that is missing.',
    steps: [
      {
        title: 'Check the file',
        detail: 'The file name, the sheet read and the number of lines found are shown at the top.'
      },
      {
        title: 'Match the columns',
        detail:
          'In each column\'s list, choose the document field. A field can be used only once. Leave "Do not import this column" to skip a column.'
      },
      {
        title: 'Complete the required fields',
        detail:
          'Properties: Title, Property type, City / district, Transaction type. Valuations: Property (reference or title), Valuation date, Estimated value.'
      },
      {
        title: 'Preview',
        detail: 'The "Preview" button becomes active when no required field is missing.'
      }
    ],
    consequences: [
      'Nothing is written at this step.',
      'The city / district must match exactly a district of the geographic reference.'
    ],
    faq: [
      {
        q: 'Why is "Preview" greyed out?',
        a: 'A required field is matched to no column: the "Required fields not mapped" warning lists them.'
      },
      {
        q: 'A column is wrongly recognised. What can I do?',
        a: 'Change the field in that column\'s list, or choose "Do not import this column".'
      },
      {
        q: 'A message mentions an ignored example line. Is that a problem?',
        a: "No: it is the template's example line, deliberately left aside."
      },
      {
        q: 'The accents look odd. Why?',
        a: 'The file is not in UTF-8 and was read as Windows-1252: check the accents in the preview.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [
      { label: 'Column matching table', helpId: 'patrimoine.importation.correspondance' },
      { label: 'The preview', helpId: 'patrimoine.importation.apercu' }
    ],
    keywords: ['columns', 'mapping', 'matching', 'required fields']
  },
  {
    id: 'patrimoine.importation.correspondance',
    kind: 'table',
    title: 'Column matching table',
    summary: 'Each row is a column of your file. You choose the document field it feeds.',
    howToRead: {
      columns: [
        {
          key: 'entete',
          label: 'File column',
          description: 'The column title as it appears in your file.'
        },
        {
          key: 'exemple',
          label: 'Example',
          description: 'The value of the first data line, to help you recognise the column.'
        },
        {
          key: 'champ',
          label: 'Document field',
          description:
            'The field to feed. A star marks a required field. A short hint appears under the list when there is one.'
        }
      ],
      notes: ['This table has no export: it is only used to choose the matches.']
    },
    faq: [
      {
        q: 'Can I match two columns to the same field?',
        a: 'No: if you choose a field that is already taken, it is removed from the other column.'
      },
      {
        q: 'What is the hint under the list for?',
        a: 'It gives the expected values, for example the list of property types.'
      },
      {
        q: 'How do I skip a column?',
        a: 'Clear the list, which shows "Do not import this column".'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Step 3: the columns', helpId: 'patrimoine.importation.colonnes' }],
    keywords: ['matching', 'file column', 'document field']
  },
  {
    id: 'patrimoine.importation.apercu',
    kind: 'section',
    title: 'Step 4: the preview',
    summary:
      'You see each line as it will be imported. You correct the cells, uncheck what must not go out, then start the import.',
    purpose:
      'This is the last check before writing: input errors, possible duplicates and subscription capacity are shown here.',
    steps: [
      {
        title: 'Read the summary',
        detail: 'The banner counts the lines that are ready, in error, possible duplicates, skipped and over quota.'
      },
      {
        title: 'Correct',
        detail: 'Every cell can be edited. The state of the line updates immediately.'
      },
      {
        title: 'Choose for duplicates',
        detail:
          '"Ignore duplicates" (default choice): the line is unchecked and not imported. Or refuse them: the line then stays in error until it is corrected or unchecked.'
      },
      {
        title: 'Uncheck',
        detail: 'An unchecked line is not imported. "Check all" acts on every line.'
      },
      {
        title: 'Import',
        detail: 'Click "Import N line(s)": N is the number of ready lines.'
      }
    ],
    consequences: [
      'The "Import" button is greyed out if there is no ready line, if the subscription is read-only, or while the capacity is being estimated.',
      'For "Properties", a duplicate is a reference already used, or the same title with the same address, in the file or among your properties. For "Valuations", only duplicates within the file are flagged.',
      'By default, possible duplicates are ignored (not imported): change the choice to refuse them and see the error.',
      'Depending on your subscription, lines beyond the capacity are held back ("Over quota"), billed as overage, or sent with a simple warning.',
      'The capacity estimate is indicative: the server remains the authority and may refuse or bill differently.'
    ],
    faq: [
      {
        q: 'What does "Over quota (estimate)" mean?',
        a: "Your subscription capacity is reached: the line will not be sent. The estimate may differ from the server's check."
      },
      {
        q: 'Which lines count against the capacity?',
        a: 'If your pack has an owned-properties capacity, every line counts. Otherwise only lines offered for Rental or Short-term rental count.'
      },
      {
        q: 'How do I see only the errors?',
        a: 'Tick "Show only lines in error".'
      },
      {
        q: 'A message says the subscription is read-only.',
        a: 'The import is impossible until the subscription is brought back in order.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [
      { label: 'Preview table', helpId: 'patrimoine.importation.apercu-tableau' },
      { label: 'The import', helpId: 'patrimoine.importation.import' }
    ],
    keywords: ['preview', 'duplicates', 'errors', 'quota', 'capacity', 'import']
  },
  {
    id: 'patrimoine.importation.apercu-tableau',
    kind: 'table',
    title: 'Preview table',
    summary:
      'Each line of your file is shown with its editable cells and its state. Errors are flagged on the cell and in the "Status" column.',
    howToRead: {
      columns: [
        {
          key: 'selection',
          label: 'Checkbox',
          description:
            'Checked: the line will be imported. Unchecked: it is left aside. The header checkbox acts on every line.'
        },
        {
          key: 'numero',
          label: 'Line',
          description: 'The line number in your file.'
        },
        {
          key: 'etat',
          label: 'Status',
          description: 'The diagnosis of the line (see the states below).'
        }
      ],
      statuses: [
        { value: 'ready', label: 'Ready', description: 'The line will be imported.' },
        {
          value: 'error',
          label: 'In error',
          description:
            'At least one cell is invalid; the reason is written under the state. Correct it or uncheck the line.'
        },
        {
          value: 'duplicate-probable',
          label: 'Possible duplicate',
          description:
            'The line looks like another line of the file or an existing property. Depending on your choice, it is ignored or refused.'
        },
        {
          value: 'duplicate-ignored',
          label: 'Duplicate ignored',
          description: 'The "Ignore duplicates" choice unchecked this line: it will not be imported.'
        },
        { value: 'unchecked', label: 'Unchecked', description: 'You unchecked the line.' },
        {
          value: 'over-quota',
          label: 'Over quota (estimate)',
          description: 'The subscription capacity is reached: the line will not be sent.'
        }
      ],
      notes: [
        'Between "Line" and "Status", one column per document field. A star marks a required field.',
        'Under a cell, "Read: …" shows how ImmoTopia understood the value (date, amount…).'
      ]
    },
    faq: [
      {
        q: 'How do I correct a cell?',
        a: 'Type directly in the cell: the line is checked again immediately.'
      },
      {
        q: 'Why does a corrected line stay displayed with "Show only lines in error"?',
        a: 'The line being edited stays visible until you leave the cell.'
      },
      {
        q: 'Does the export contain everything?',
        a: 'It includes the table lines with their state, without the checkboxes.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Step 4: the preview', helpId: 'patrimoine.importation.apercu' }],
    keywords: ['line state', 'error', 'duplicate', 'uncheck', 'cells']
  },
  {
    id: 'patrimoine.importation.import',
    kind: 'section',
    title: 'Step 5: the import',
    summary: 'The ready lines are sent one by one. A progress bar shows how far the import has got.',
    purpose:
      'Each line is created by the same functions as manual entry: a property can therefore be refused for the same reasons as in normal entry.',
    steps: [
      {
        title: 'Wait',
        detail: '"Import in progress: X of Y" is displayed. Keep the page open.'
      },
      {
        title: 'Stop if needed',
        detail: '"Stop the import": the current line finishes, the following ones are not processed.'
      }
    ],
    consequences: [
      'Lines already created stay created, even if you stop the import.',
      'Lines not processed appear in the report; they can be run again.',
      'If the server request limit is reached (1,000 requests per 15 minutes), the import stops: wait a few minutes then run it again.'
    ],
    faq: [
      {
        q: 'Can I leave the page?',
        a: 'No, stay on it: sending is done from your browser.'
      },
      {
        q: 'I clicked "Stop the import". What happens?',
        a: '"Stop requested: the current line is finishing." The other lines will be marked not processed.'
      },
      {
        q: 'Can what was imported be cancelled?',
        a: 'No, there is no cancel button.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'The report', helpId: 'patrimoine.importation.rapport' }],
    keywords: ['import in progress', 'progress', 'stop', 'request limit']
  },
  {
    id: 'patrimoine.importation.rapport',
    kind: 'section',
    title: 'Step 6: the report',
    summary:
      'You see the result of each line: imported, skipped, in error, rejected by the server, partial, over quota or not processed.',
    purpose:
      'The report is used to check the import, to correct then run again what failed, and to keep a trace as a CSV file.',
    howToRead: {
      statuses: [
        { value: 'importee', label: 'Imported', description: 'The line was created.' },
        {
          value: 'ignoree',
          label: 'Ignored',
          description: 'The line was set aside (duplicate ignored or box unchecked).'
        },
        { value: 'en_erreur', label: 'In error', description: 'The line was invalid and was not sent.' },
        {
          value: 'refusee_serveur',
          label: 'Rejected by the server',
          description: 'The server refused the line; the reason is shown. It can be run again.'
        },
        {
          value: 'partielle',
          label: 'Partial: property created, valuation to be added',
          description: 'The property was created but its acquisition valuation was refused.'
        },
        {
          value: 'hors_quota',
          label: 'Over quota',
          description: 'The subscription capacity did not allow the line to be sent.'
        },
        { value: 'non_traitee', label: 'Not processed', description: 'The import stopped before this line.' }
      ],
      notes: ['The counters of the "Report" table cover all lines of the file.']
    },
    steps: [
      {
        title: 'Read the counters',
        detail: 'Imported, Ignored, In error, Rejected by the server, Partial, Over quota, Not processed.'
      },
      {
        title: 'Explain the failures',
        detail:
          'The "Lines requiring explanation" table gives the reason for each rejected, partial or unprocessed line.'
      },
      {
        title: 'Download',
        detail: '"Download the report (CSV)" keeps a trace of the import.'
      },
      {
        title: 'Run again',
        detail: '"Re-run the rejected lines (N)" sends again the lines the server refused that can be run again.'
      },
      {
        title: 'Continue',
        detail: '"Back to the preview" to correct, or "Import another file" to start over.'
      }
    ],
    consequences: [
      'A "Partial" line is not run again: the property already exists. Add its valuation through the "Valuations" import.',
      'If the server did not answer, the reason says the item may have been created: check the property list before creating it again.',
      'If the import was stopped, a warning says so, and the remaining lines were not processed.'
    ],
    faq: [
      {
        q: 'Why does "Re-run" not appear?',
        a: 'No rejected line can be run again.'
      },
      {
        q: 'Where do I find the reference assigned to a property?',
        a: 'In the CSV report and in the detail column; it is used to link valuations afterwards.'
      },
      {
        q: 'Is the report kept?',
        a: 'Not in the application: download it before leaving the page.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Lines requiring explanation', helpId: 'patrimoine.importation.rapport-tableau' }],
    keywords: ['report', 'result', 'rejected', 'run again', 'partial', 'CSV']
  },
  {
    id: 'patrimoine.importation.rapport-tableau',
    kind: 'table',
    title: 'Lines requiring explanation',
    summary:
      'This table only lists the lines that need an explanation: rejected by the server, partial or not processed.',
    howToRead: {
      columns: [
        { key: 'numero', label: 'Line', description: 'The line number in your file.' },
        { key: 'statut', label: 'Status', description: 'What happened to the line.' },
        {
          key: 'motif',
          label: 'Reason',
          description: "The reason, with advice when the server's answer was not received."
        }
      ],
      statuses: [
        { value: 'refusee_serveur', label: 'Rejected by the server', description: 'To correct then run again.' },
        {
          value: 'partielle',
          label: 'Partial: property created, valuation to be added',
          description: 'Do not run again: add the valuation through the "Valuations" import.'
        },
        { value: 'non_traitee', label: 'Not processed', description: 'The import stopped before this line.' }
      ],
      notes: [
        'The search covers the line number, the reason, the detail and the original cells.',
        'The export contains all lines requiring explanation that match your search.'
      ]
    },
    faq: [
      {
        q: 'Why is an imported line not here?',
        a: 'Only lines requiring explanation are listed; successful lines are in the "Imported" counter.'
      },
      {
        q: 'What does "Server response not received" mean?',
        a: 'The result is unknown: the property may have been created. Check the property list before creating the line again.'
      },
      {
        q: 'How do I find a line?',
        a: 'Use the search, or filter by status.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Step 6: the report', helpId: 'patrimoine.importation.rapport' }],
    keywords: ['lines requiring explanation', 'reason', 'rejected', 'not processed']
  }
];

export default entries;
