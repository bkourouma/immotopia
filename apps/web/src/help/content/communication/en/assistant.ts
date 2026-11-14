import type { HelpEntry } from '../../../types';

/** « assistant » zone of the « communication » module (en): the conversation page with the assistant. */
const entries: HelpEntry[] = [
  {
    id: 'communication.assistant.page',
    kind: 'page',
    title: 'Assistant',
    summary:
      "The assistant is a conversation in which you ask questions in everyday language about your agency's data. It searches and presents results, and can prepare certain actions that you approve before they are carried out.",
    purpose:
      'It saves you from going through the menus: finding a property or a lease, listing documents, preparing a rent receipt or an account statement. What it can do depends on what is enabled for your agency: the welcome sentence announces the subjects covered.\n\nIt acts with your own rights: data you cannot view stays closed to it.',
    howToRead: {
      notes: [
        'Answers are written by an artificial intelligence: check important figures on the screen concerned.',
        'An answer may come with cards (properties, leases, documents) and a "Results" button that opens the "Results and documents" panel.'
      ]
    },
    steps: [
      {
        title: 'Ask your question',
        detail:
          'Type in "Write your message…", then press Enter (Shift+Enter for a new line) or click "Send". At the start, you can also click a suggestion.'
      },
      { title: 'Stop if needed', detail: 'While the answer is being written, "Stop the response" cuts it short.' },
      { title: 'Start over', detail: '"New conversation" clears the conversation shown.' }
    ],
    consequences: [
      'Asking a question changes nothing.',
      'When the assistant proposes to create or change something, a card shows you the changes. Nothing is saved until you click "Approve and run". The assistant deletes nothing.',
      'Leaving the page stops the answer in progress, and the conversation is not reopened when you come back.'
    ],
    faq: [
      {
        q: 'Why do I read "The assistant is not enabled for this agency"?',
        a: 'The assistant has not been enabled for your agency. Ask an administrator to enable it.'
      },
      {
        q: 'Why do I read "The assistant is not available for this account"?',
        a: 'It is reserved for agency staff.'
      },
      {
        q: 'Can the assistant change my data without asking me?',
        a: 'No. A change goes through an approval card: without your click on "Approve and run", nothing is done.'
      },
      {
        q: 'Can I find my conversation later?',
        a: 'No. It disappears when you leave the page: copy what you need, or download the results.'
      }
    ],
    permissions: {
      roles: ['Agency team member'],
      note: 'The assistant must be enabled for the agency. It uses your own rights.'
    },
    related: [
      { label: 'Writing to the assistant and approving an action', helpId: 'communication.assistant.conversation' },
      { label: 'The "Results and documents" panel', helpId: 'communication.assistant.resultats' }
    ],
    keywords: [
      'assistant',
      'AI',
      'artificial intelligence',
      'chat',
      'discussion',
      'copilot',
      'question',
      'receipt',
      'account statement'
    ]
  },
  {
    id: 'communication.assistant.conversation',
    kind: 'section',
    title: 'Writing to the assistant and approving an action',
    summary:
      'Write as you would speak to a colleague. When the assistant proposes an action, you check it on a card before approving it.',
    purpose:
      'Examples of requests: "Show me the available properties", "Find a lease by number", "Generate a rent receipt". The more precise the request (lease number, property name), the more accurate the answer.',
    steps: [
      { title: 'Word your request', detail: 'You can chain questions in the same conversation.' },
      {
        title: 'Read the approval card',
        detail:
          'It shows the module, the target record, the "Data concerned" (before and after), the "Warnings" and the time left before it expires. These items are computed by the system, not by the assistant.'
      },
      {
        title: 'Approve or reject',
        detail:
          '"Approve and run" carries out the action. "Reject" changes nothing. For a "Sensitive action", first type the word requested (CONFIRMER).'
      },
      {
        title: 'A receipt or an account statement',
        detail:
          'The assistant offers a card with the lease, the property, the period and the amount: "Confirm and generate" creates the document, which you can then download.'
      }
    ],
    consequences: [
      'After "Approve and run", the card shows "Executed" with the result, or the error met.',
      'A card that is not approved expires: ask the assistant for it again. The data may have changed in the meantime.',
      '"Reject" does not inform the assistant: tell it in a message if you want it to take this into account.',
      'If the requested document already exists, the card says so ("This document already existed").'
    ],
    faq: [
      {
        q: 'The assistant says it did something: is that true?',
        a: 'Only the "Executed" card is proof. If it does not appear, nothing was saved.'
      },
      {
        q: 'Why must I type a word to approve?',
        a: 'Some actions are sensitive because they are hard to undo: the card then asks you to type CONFIRMER.'
      },
      {
        q: 'Why does the assistant refuse to delete?',
        a: 'It cannot delete any data. It can offer an alternative such as archiving, if the application provides one.'
      }
    ],
    related: [{ label: 'Assistant overview', helpId: 'communication.assistant.page' }],
    keywords: ['approve', 'validate', 'confirm', 'card', 'sensitive action', 'receipt', 'document', 'plan']
  },
  {
    id: 'communication.assistant.resultats',
    kind: 'section',
    title: 'Results and documents',
    summary:
      'When the assistant produces a table, a chart or a text, it opens in this panel, next to the conversation.',
    purpose:
      'On a computer, the panel appears on the right from the first result. On a phone, it opens full screen with the "Results" button or with the "Open" chip of the message.',
    howToRead: {
      notes: [
        'If there are several results, the "Displayed result" list lets you switch between them; the last one received is shown by default.',
        'A table that is too long is cut: the message "Result truncated: only the first rows are shown" says so.'
      ]
    },
    steps: [
      { title: 'Open the panel', detail: 'Click "Results" in the header if the panel is closed.' },
      {
        title: 'Download',
        detail: '"Download" button: a table as CSV or Excel, a chart as an image or CSV data, a text as a file.'
      },
      { title: 'Close', detail: '"Close panel" closes it; the "Results" button reopens it.' }
    ],
    consequences: [
      'The panel changes nothing: it presents data and downloads it to your device.',
      'Results disappear with the conversation ("New conversation" or leaving the page): download what you want to keep.'
    ],
    related: [{ label: 'Assistant overview', helpId: 'communication.assistant.page' }],
    keywords: ['results', 'table', 'chart', 'download', 'excel', 'csv', 'export']
  }
];

export default entries;
