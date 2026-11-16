import type { HelpEntry } from '../../../types';

/** Zone « canaux » du module « communication » (en). */
const entries: HelpEntry[] = [
  {
    id: 'communication.canaux.email',
    kind: 'page',
    title: 'Email notifications',
    summary:
      'Choose which automatic emails your agency sends and to whom, and customize their subject and text. Each row of the table is one specific event and its recipient.',
    purpose:
      'When something happens in the application (a lease activated, a payment approved, a service charge call issued…), an email is sent automatically to the intended person: tenant, owner, co-owner or agency staff member. Here you decide whether that email is sent or not, and you can replace its text with your own.',
    steps: [
      {
        title: 'Find the event',
        detail: 'In the table, search for the event, or filter by recipient, by "Enable" status or by trigger event.'
      },
      {
        title: 'Turn on or off',
        detail: 'Use the switch in the "Enable" column: the change is saved immediately.'
      },
      {
        title: 'Open the template',
        detail:
          'Click "Edit" in the row, or choose the event in the list at the top of the screen, then click a recipient.'
      },
      {
        title: 'Adapt the text',
        detail: 'Change the subject and the body of the message, using the suggested variables.'
      },
      {
        title: 'Save',
        detail: 'Click "Save". The new text is used from the next email onwards.'
      }
    ],
    consequences: [
      'A switch turned off: the email for that event is no longer sent by your agency. Emails already sent are not affected.',
      'The text you save goes to your clients exactly as written. Read it again: variables between double curly braces are replaced by the real information when the email is sent.',
      'Exception: the "Payment receiving account changed" alert is always sent to the agency administrators, whatever its switch.',
      'A few events in the list, such as "Deal created" or "Appointment reminder", are not linked to any automatic sending for now: setting them up changes nothing.'
    ],
    faq: [
      {
        q: 'Why are the switches greyed out?',
        a: 'You do not have the right to edit the agency settings. The screen then shows "Read-only": ask your agency administrator for this right.'
      },
      {
        q: 'Can I send a test email?',
        a: 'No, this screen has no test sending. The message is sent the first time the event really happens.'
      },
      {
        q: 'An event I am looking for is not listed.',
        a: 'Depending on your agency pack, some events may not be offered: only those of the modules you own are shown.'
      }
    ],
    permissions: {
      note: 'The menu requires access to the Communication module. Changing a switch or a text also requires the right to edit the agency settings.'
    },
    related: [
      {
        label: 'How to read the table',
        helpId: 'communication.canaux.email.tableau'
      },
      {
        label: 'Choose an event and its recipient',
        helpId: 'communication.canaux.email.evenement'
      },
      {
        label: 'Edit an email template',
        helpId: 'communication.canaux.email.modele'
      },
      {
        label: 'WhatsApp notifications',
        helpId: 'communication.canaux.whatsapp'
      }
    ],
    keywords: [
      'email',
      'e-mail',
      'mail',
      'notification',
      'automatic message',
      'template',
      'subject',
      'switch',
      'reminder',
      'communication'
    ]
  },
  {
    id: 'communication.canaux.email.evenement',
    kind: 'section',
    title: 'Choose an event and its recipient',
    summary:
      'Select the event to customize, then the recipient whose message you want to edit. The same event can notify several people with different texts.',
    purpose:
      'An event such as "New maintenance ticket" can notify the agency, the tenant and the owner at the same time, each with their own email. This block lets you choose which one to edit.',
    steps: [
      {
        title: 'Search for the event',
        detail: 'Open the "Select a trigger event" list and type a few letters to filter it.'
      },
      {
        title: 'See the recipients',
        detail: 'They appear as buttons under "Recipients for this event".'
      },
      {
        title: 'Choose a recipient',
        detail: 'Click its button: its template opens just below.'
      }
    ],
    consequences: ['If you change the event or the recipient before clicking "Save", what you typed is lost.'],
    faq: [
      {
        q: 'What is the difference with the table at the bottom?',
        a: 'The table shows all events with their switch. This list groups the events so you can edit the text of each recipient.'
      },
      {
        q: 'What is the "Edit" button in the table for?',
        a: 'It directly opens the event and the recipient of that row, at the top of the screen.'
      },
      {
        q: 'Why is there only one recipient button for some events?',
        a: 'Because the event notifies only one person or one group.'
      }
    ],
    related: [
      {
        label: 'Edit an email template',
        helpId: 'communication.canaux.email.modele'
      },
      {
        label: 'How to read the table',
        helpId: 'communication.canaux.email.tableau'
      }
    ],
    keywords: ['trigger event', 'recipient', 'tenant', 'owner', 'agency']
  },
  {
    id: 'communication.canaux.email.modele',
    kind: 'section',
    title: 'Email template',
    summary:
      'See the default template of an email and replace its subject and body with your own texts. Leave empty to keep the original template.',
    purpose:
      'Each email has a template supplied with the application. You can customize it to use the tone of your agency, add your contact details or change some wording.',
    steps: [
      {
        title: 'Read the original template',
        detail: 'It is shown in "Default template": the subject, then the body.'
      },
      {
        title: 'Start from this template',
        detail: 'Click "Use this template in the fields below". Nothing is saved at this stage.'
      },
      {
        title: 'Edit',
        detail: 'Change "Custom subject (empty = default subject)" and "Custom HTML body (empty = default content)".'
      },
      {
        title: 'Insert variables',
        detail: 'Click a variable under "Variables for this event".'
      },
      {
        title: 'Apply to other recipients',
        detail: 'If the event has several, tick those that should receive the same text.'
      },
      {
        title: 'Save',
        detail: 'Click "Save".'
      },
      {
        title: 'Go back to the original',
        detail: 'Click "Reset to the default template".'
      }
    ],
    consequences: [
      'The fields are already filled with the original template. If you click "Save" without changing anything, that text is saved as your custom text: it will no longer follow changes made to the original template.',
      'When saving, the body is cleaned: disallowed elements (such as scripts) are removed. The subject loses its line breaks and cannot exceed 500 characters.',
      'After "Save" or "Reset", the editor closes and the list is reloaded.',
      '"Reset" erases your subject and body without asking for confirmation, and also sets the event back to "Enable": it cannot be undone.'
    ],
    faq: [
      {
        q: 'Can I write HTML?',
        a: 'Yes, the body is entered in an HTML code editor. Disallowed elements are removed when saving.'
      },
      {
        q: 'What happens if I empty the subject?',
        a: 'The default subject is used.'
      },
      {
        q: 'How can I check the result before it is sent?',
        a: 'This screen has no preview and no test sending: read your text carefully, variables included.'
      }
    ],
    permissions: {
      note: 'Editing requires the right to edit the agency settings. Without it, the fields are read-only.'
    },
    related: [
      {
        label: 'Email variables',
        helpId: 'communication.canaux.email.variables'
      },
      {
        label: 'Apply a template to other recipients',
        helpId: 'communication.canaux.email.appliquer'
      }
    ],
    keywords: ['template', 'subject', 'body', 'customize', 'reset', 'html']
  },
  {
    id: 'communication.canaux.email.variables',
    kind: 'section',
    title: 'Email variables',
    summary:
      'Variables are words between double curly braces, such as {{agencyName}}, replaced when the email is sent by the real information. The list shown depends on the chosen event.',
    purpose:
      'They let you write a single template that adapts to each email: recipient name, agency name, amount, due date, link to the portal…',
    howToRead: {
      notes: [
        '{{agencyName}}: the name of the agency.',
        '{{contactName}}: the name of the recipient, for events that offer it.',
        '{{tenantName}}: the name of the tenant.',
        '{{ownerName}}: the name of the owner.',
        '{{amount}}: the amount of the payment or of the instalment.',
        '{{dueDate}}: the due date.'
      ]
    },
    steps: [
      {
        title: 'Show the template',
        detail: 'Choose an event and a recipient to open its template.'
      },
      {
        title: 'Click a variable',
        detail: 'Under "Variables for this event", click the one you need.'
      },
      {
        title: 'Move it',
        detail: 'It is added at the end of the body: cut and paste it where you want.'
      }
    ],
    consequences: [
      'The click adds the variable to the body only, always at the end. To use one in the subject, type it by hand.',
      'Use only the variables in the list: they are the only ones the application knows for this event.'
    ],
    faq: [
      {
        q: 'Why does the list change depending on the event?',
        a: 'Each event knows different information: a payment has an amount, a maintenance ticket has a title.'
      },
      {
        q: 'Why does clicking a variable do nothing?',
        a: 'Without the right to edit the agency settings, variables cannot be inserted.'
      },
      {
        q: 'Do I have to type the curly braces?',
        a: 'No, the click adds them. If you type a variable by hand, write two curly braces on each side of the name.'
      }
    ],
    related: [
      {
        label: 'Email template',
        helpId: 'communication.canaux.email.modele'
      }
    ],
    keywords: ['variable', 'curly braces', 'name', 'amount', 'date', 'insert']
  },
  {
    id: 'communication.canaux.email.appliquer',
    kind: 'section',
    title: 'Apply a template to other recipients',
    summary: 'Copy the same subject and the same body to the other recipients of the same event, in one go.',
    purpose:
      'When an event notifies several people (for example the tenant and the owner), you can write one text and apply it to the others without typing it again. This block only appears if the event has several recipients.',
    steps: [
      {
        title: 'Write the text',
        detail: 'Write the subject and the body for the chosen recipient.'
      },
      {
        title: 'Tick the others',
        detail: 'Tick the recipients who should receive the same text.'
      },
      {
        title: 'Save',
        detail: 'Click "Save": the text is saved for all ticked recipients.'
      }
    ],
    consequences: [
      'The subject and the body replace the custom texts already saved for the ticked recipients.',
      'Only the subject and the body are copied: the switch of each recipient does not change.',
      'Variables are not the same for each recipient: check that the ones you use exist for all of them.'
    ],
    faq: [
      {
        q: 'Why is this block missing?',
        a: 'The event has only one recipient.'
      },
      {
        q: 'Can I undo it?',
        a: 'Yes, recipient by recipient, with "Reset to the default template".'
      },
      {
        q: 'Do the boxes stay ticked?',
        a: 'No, they are unticked after saving.'
      }
    ],
    related: [
      {
        label: 'Email template',
        helpId: 'communication.canaux.email.modele'
      }
    ],
    keywords: ['copy', 'several recipients', 'same text', 'tick']
  },
  {
    id: 'communication.canaux.email.tableau',
    kind: 'table',
    title: 'Email notification list',
    summary: 'All the automatic emails the application can send, with their recipient and their switch.',
    purpose: 'This table gives you the overview: which ones are active, for whom, and which ones you have turned off.',
    howToRead: {
      columns: [
        {
          key: 'label',
          label: 'Trigger event',
          description: 'The name of the event and, in grey below, what triggers it.'
        },
        {
          key: 'recipientLabel',
          label: 'Recipient',
          description:
            'The person or group who receives the email: tenant, owner, co-owner, agency administrators or managers…'
        },
        {
          key: 'enabled',
          label: 'Enable',
          description:
            'Switch: on, the email is sent; off, it is not sent. Everything is on until you change something.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'The "Edit" button opens the template of the row, at the top of the screen.'
        }
      ],
      notes: [
        'The same event appears on several rows when several people are notified, each with their own text.',
        'Search and filters work on the list already loaded; the table shows 20 rows per page.'
      ]
    },
    steps: [
      {
        title: 'Search',
        detail: 'Type a word from the event, the recipient or the description, or use the filters.'
      },
      {
        title: 'Turn on or off',
        detail: 'Click the switch of the row.'
      },
      {
        title: 'Edit the text',
        detail: 'Click "Edit".'
      }
    ],
    consequences: [
      'The switch acts immediately, with no save button: a message confirms "Notification enabled" or "Notification disabled".',
      'Without the right to edit the agency settings, the switches are greyed out.'
    ],
    faq: [
      {
        q: 'What does "Agency (admins)" mean?',
        a: 'The agency administrators receive this email.'
      },
      {
        q: 'Why is everything on at the start?',
        a: 'An event for which nothing has been saved is considered enabled.'
      },
      {
        q: 'Do I have to click "Save" after a switch?',
        a: 'No, the change is saved immediately.'
      }
    ],
    related: [
      {
        label: 'Email notifications',
        helpId: 'communication.canaux.email'
      }
    ],
    keywords: ['list', 'events', 'switch', 'enable', 'disable', 'filter']
  },
  {
    id: 'communication.canaux.whatsapp',
    kind: 'page',
    title: 'WhatsApp notifications',
    summary:
      'Set up your agency automatic WhatsApp messages: which event sends a message, to whom, and with what text. A message is sent only to a person who has given their WhatsApp consent and whose number is filled in.',
    purpose:
      'When an event happens (a rent instalment, a lease activated, a service charge call issued…), the application can send a WhatsApp message to the tenant, the owner, the co-owner or the managers. Here you choose the active events and you can replace the default text.\n\nActual sending also depends on the WhatsApp provider set up by the platform administrator.',
    steps: [
      {
        title: 'Find the event',
        detail: 'In the table, search for the event, or filter by recipient or by "Enable" status.'
      },
      {
        title: 'Turn on or off',
        detail: 'Use the switch in the "Enable" column: it is saved immediately.'
      },
      {
        title: 'Open the message',
        detail: 'Click "Edit" in the row, or the button of the event under "Edit an event message".'
      },
      {
        title: 'Adapt the text',
        detail: 'Change the message, then click "Save".'
      }
    ],
    consequences: [
      'A switch turned off: this WhatsApp message is no longer sent by your agency.',
      'Four messages are off until you turn them on: "Lease ending soon (owner, WhatsApp)", "Document to renew (owner, WhatsApp)", "Owner monthly report (WhatsApp)" and "Rent payment link (WhatsApp)". The others are on by default.',
      'Two events run with no action on your part when they are on and the platform has enabled them: the WhatsApp group invitation of a new CRM contact and the announcement of a published property in that group.',
      'A few events, such as "Appointment reminder", "Deal stage changed", "Contract renewal alert (WhatsApp)" and "Common area incident (WhatsApp)", are not linked to any sending for now.'
    ],
    faq: [
      {
        q: 'Why does a person receive nothing?',
        a: 'Check that their WhatsApp consent is ticked and that their WhatsApp number (or main phone) is filled in on their contact record.'
      },
      {
        q: 'Can I send a test message?',
        a: 'No, this screen has no test sending.'
      },
      {
        q: 'An event I am looking for is not listed.',
        a: 'Depending on your agency pack, some events may not be offered: only those of the modules you own are shown.'
      }
    ],
    permissions: {
      note: 'The menu requires access to the Communication module. Changing a setting requires the same access (or being an agency administrator): otherwise saving is refused.'
    },
    related: [
      {
        label: 'How to read the table',
        helpId: 'communication.canaux.whatsapp.tableau'
      },
      {
        label: 'Choose the event to edit',
        helpId: 'communication.canaux.whatsapp.evenement'
      },
      {
        label: 'WhatsApp message of an event',
        helpId: 'communication.canaux.whatsapp.message'
      },
      {
        label: 'WhatsApp group message',
        helpId: 'communication.canaux.whatsapp-groupe'
      },
      {
        label: 'Email notifications',
        helpId: 'communication.canaux.email'
      }
    ],
    keywords: [
      'whatsapp',
      'message',
      'notification',
      'consent',
      'number',
      'twilio',
      'reminder',
      'automatic message',
      'communication'
    ]
  },
  {
    id: 'communication.canaux.whatsapp.evenement',
    kind: 'section',
    title: 'Choose the event to edit',
    summary: 'Each button is a WhatsApp event. Click one to open its message.',
    purpose:
      'Under the buttons, a green box reminds you what the event triggers and its recipient: tenant, owner, co-owner, CRM contact or managers.',
    steps: [
      {
        title: 'Click a button',
        detail: 'The chosen button becomes solid.'
      },
      {
        title: 'Read the box',
        detail: 'It describes the event and shows the recipient.'
      },
      {
        title: 'Edit',
        detail: 'The message form opens just below.'
      }
    ],
    consequences: ['If you change the event before clicking "Save", what you typed is lost.'],
    faq: [
      {
        q: 'How can I find an event quickly?',
        a: 'Use the table search, then "Edit" on the row you found.'
      },
      {
        q: 'What is the difference with the table?',
        a: 'The table shows the switch of each event; the buttons open the message to edit.'
      },
      {
        q: 'Why are not all events shown?',
        a: 'Depending on your agency pack, some events may not be offered.'
      }
    ],
    related: [
      {
        label: 'WhatsApp message of an event',
        helpId: 'communication.canaux.whatsapp.message'
      }
    ],
    keywords: ['event', 'button', 'recipient']
  },
  {
    id: 'communication.canaux.whatsapp.message',
    kind: 'section',
    title: 'WhatsApp message of an event',
    summary:
      'Replace the default message of an event with your own text, or leave the field empty to keep the original message.',
    purpose:
      'The message is plain text, with no HTML layout. You can add variables that are replaced by the real information when it is sent.',
    steps: [
      {
        title: 'Read the message',
        detail: 'The "Custom message (empty = default message)" field is already filled with the original message.'
      },
      {
        title: 'Edit',
        detail: 'Change the text as you wish.'
      },
      {
        title: 'Insert variables',
        detail: 'Click a variable under "Variables for this event (click to insert)".'
      },
      {
        title: 'Save',
        detail: 'Click "Save". The form stays open.'
      },
      {
        title: 'Go back to the original',
        detail: 'Click "Reset to the default message".'
      }
    ],
    consequences: [
      'The field is already filled with the original message. If you click "Save" without changing anything, that text is saved as your custom message: it will no longer follow changes made to the original message.',
      'Text only, no HTML. Beyond 4000 characters, saving is refused.',
      'If a "Content SID (Twilio)" is filled in and the platform sends its messages with Twilio, the Twilio template is sent, not this text.',
      '"Reset to the default message" erases your text and the Twilio settings without asking for confirmation, and sets the switch back to its original state: it cannot be undone.'
    ],
    faq: [
      {
        q: 'Can I add a link?',
        a: 'Yes: write the full address (https://…). The application removes punctuation stuck to the end so that WhatsApp recognizes it as a link.'
      },
      {
        q: 'What happens to a variable with no value?',
        a: 'It disappears from the message: an empty variable is replaced by nothing.'
      },
      {
        q: 'How do I go back to the original message?',
        a: 'Click "Reset to the default message".'
      }
    ],
    related: [
      {
        label: 'WhatsApp message variables',
        helpId: 'communication.canaux.whatsapp.variables'
      },
      {
        label: 'Twilio template',
        helpId: 'communication.canaux.whatsapp.twilio'
      }
    ],
    keywords: ['message', 'text', 'customize', 'reset', 'link']
  },
  {
    id: 'communication.canaux.whatsapp.variables',
    kind: 'section',
    title: 'WhatsApp message variables',
    summary:
      'Variables are words between double curly braces, such as {{tenantName}}, replaced when the message is sent by the real information. The list depends on the chosen event.',
    purpose:
      'They let you write a single message that adapts to each sending: recipient name, agency name, amount, due date…',
    howToRead: {
      notes: [
        '{{agencyName}}: the name of the agency.',
        '{{tenantName}}: the name of the tenant.',
        '{{ownerName}}: the name of the owner.',
        '{{amount}}: the amount.',
        '{{dueDate}}: the due date.'
      ]
    },
    steps: [
      {
        title: 'Choose an event',
        detail: 'Its variables appear under the message field.'
      },
      {
        title: 'Click a variable',
        detail: 'It is added at the end of the message.'
      },
      {
        title: 'Move it',
        detail: 'Cut and paste it where you want.'
      }
    ],
    consequences: [
      'A variable with no value when sending is replaced by nothing.',
      'Use only the variables in the list: they are the only ones the application knows for this event.'
    ],
    faq: [
      {
        q: 'Why does the list change depending on the event?',
        a: 'Each event knows different information: a payment has an amount, a ticket has a title.'
      },
      {
        q: 'Do I have to type the curly braces?',
        a: 'No, the click adds them. If you type a variable by hand, write two curly braces on each side of the name.'
      },
      {
        q: 'Is the variable placed at the cursor?',
        a: 'No, it is always added at the end of the message.'
      }
    ],
    related: [
      {
        label: 'WhatsApp message of an event',
        helpId: 'communication.canaux.whatsapp.message'
      }
    ],
    keywords: ['variable', 'curly braces', 'insert', 'name', 'amount']
  },
  {
    id: 'communication.canaux.whatsapp.twilio',
    kind: 'section',
    title: 'Twilio template (business-initiated message)',
    summary:
      'To write first to a person, Twilio requires a message template approved in advance. Enter here its identifier (Content SID) and the mapping of its variables.',
    purpose:
      'The blue box at the top of the screen explains it: to send before the client has replied, Twilio requires a pre-approved template. This section links the event to that template.',
    howToRead: {
      notes: [
        'Content SID (Twilio): the identifier of the approved template, in the form HX followed by digits and letters.',
        'Variable mapping (JSON): for each number of the template (1, 2…), the name of the variable to put there. Example on the screen: number 1 receives the appointment date (appointmentDate), number 2 its time (appointmentTime).'
      ]
    },
    steps: [
      {
        title: 'Get the identifier',
        detail: 'Have the Content SID of an approved template from your Twilio account at hand.'
      },
      {
        title: 'Open the section',
        detail: 'Expand "Twilio template (business-initiated message)" under the variables.'
      },
      {
        title: 'Paste the identifier',
        detail: 'Fill in "Content SID (Twilio)".'
      },
      {
        title: 'Map the variables',
        detail: 'Fill in "Variable mapping (JSON)" following the example shown under the field.'
      },
      {
        title: 'Save',
        detail: 'Click "Save".'
      }
    ],
    consequences: [
      'With a Content SID, the message sent is that of the approved template: your custom message is not used.',
      'This setting only matters if the platform sends its messages with Twilio. With another provider, it is ignored and the message text is sent instead.',
      'If the variable mapping is badly written, the values are not passed to the template.'
    ],
    faq: [
      {
        q: 'Where can I find the Content SID?',
        a: 'In your Twilio account, on the page of the approved template: it starts with HX.'
      },
      {
        q: 'Do I have to fill in this section for every event?',
        a: 'No, only for the events you want to send first.'
      },
      {
        q: 'What if I leave it empty?',
        a: 'The application sends the message text. According to the screen, Twilio requires an approved template to write first: without one, sending may be refused.'
      }
    ],
    related: [
      {
        label: 'WhatsApp message of an event',
        helpId: 'communication.canaux.whatsapp.message'
      }
    ],
    keywords: ['twilio', 'content sid', 'approved template', 'whatsapp', 'business-initiated']
  },
  {
    id: 'communication.canaux.whatsapp.tableau',
    kind: 'table',
    title: 'WhatsApp notification list',
    summary: 'All the automatic WhatsApp messages the application can send, with their recipient and their switch.',
    purpose:
      'This table gives you the overview: which messages are active, for whom, and which ones you have turned off.',
    howToRead: {
      columns: [
        {
          key: 'label',
          label: 'Trigger event',
          description: 'The name of the event and, in grey below, what triggers it.'
        },
        {
          key: 'recipientLabel',
          label: 'Recipient',
          description:
            'The person or group who receives the message: tenant, owner, co-owner, CRM contact, WhatsApp group…'
        },
        {
          key: 'enabled',
          label: 'Enable',
          description:
            'Switch: on, the message is sent; off, it is not sent. Most are on until you change something; four messages for owners and tenants are off at the start.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'The "Edit" button opens the message of the row, at the top of the screen.'
        }
      ],
      notes: ['Search and filters work on the list already loaded; the table shows 20 rows per page.']
    },
    steps: [
      {
        title: 'Search',
        detail: 'Type a word from the event, the recipient or the description, or use the filters.'
      },
      {
        title: 'Turn on or off',
        detail: 'Click the switch of the row.'
      },
      {
        title: 'Edit the message',
        detail: 'Click "Edit".'
      }
    ],
    consequences: [
      'The switch acts immediately, with no save button: a message confirms "Notification enabled" or "Notification disabled".',
      'Turning a message on is not enough to send it: the person must have given their WhatsApp consent and have a number filled in.'
    ],
    faq: [
      {
        q: 'Why are some messages off at the start?',
        a: 'They are alerts added later: they stay off to avoid sending messages nobody asked for.'
      },
      {
        q: 'Do I have to click "Save" after a switch?',
        a: 'No, the change is saved immediately.'
      },
      {
        q: 'What does "WhatsApp group" as a recipient mean?',
        a: 'The message is posted in the broadcast WhatsApp group, not sent to a person.'
      }
    ],
    related: [
      {
        label: 'WhatsApp notifications',
        helpId: 'communication.canaux.whatsapp'
      }
    ],
    keywords: ['list', 'events', 'switch', 'enable', 'disable', 'filter']
  },
  {
    id: 'communication.canaux.whatsapp-groupe',
    kind: 'page',
    title: 'WhatsApp group message',
    summary:
      'Write a free message, with or without an image, and send it in one click to the broadcast WhatsApp group. The message is sent right away and cannot be recalled from the application.',
    purpose:
      'This group is used to broadcast news to your contacts, for example newly available properties. Announcements of published properties go to this same group: here, you send a one-off message yourself.',
    steps: [
      {
        title: 'Write',
        detail: 'Type your message in the large input field.'
      },
      {
        title: 'Format',
        detail: 'Use the buttons above the field: bold, italic, strikethrough, code, emojis, list.'
      },
      {
        title: 'Add an image',
        detail: 'Optional: click "Image" (JPEG or PNG).'
      },
      {
        title: 'Check',
        detail: 'The number of characters is shown under the field.'
      },
      {
        title: 'Send',
        detail: 'Click "Send to group".'
      }
    ],
    consequences: [
      'All members of the group see the message. There is no confirmation before sending and no cancellation afterwards.',
      'The group is set in the platform configuration: you cannot choose another one here, and without that configuration sending is refused.',
      'The text is not kept: if you leave the screen before sending, it is lost. After a successful send, the field is emptied.',
      'This screen does not keep a list of sent messages.'
    ],
    faq: [
      {
        q: 'Why is the "Send to group" button greyed out?',
        a: 'You need at least a text or an image.'
      },
      {
        q: 'Is there a maximum length?',
        a: 'Yes: 4000 characters at most. Beyond that, sending is refused.'
      },
      {
        q: 'Is contact consent checked?',
        a: 'No: the message goes to the group, not to each contact. Only people who are already members of the group receive it.'
      }
    ],
    permissions: {
      note: 'The menu requires access to the Communication module. Sending requires the same access (or being an agency administrator).'
    },
    related: [
      {
        label: 'WhatsApp formatting',
        helpId: 'communication.canaux.whatsapp-groupe.mise-en-forme'
      },
      {
        label: 'Attached image',
        helpId: 'communication.canaux.whatsapp-groupe.image'
      },
      {
        label: 'Send to group',
        helpId: 'communication.canaux.whatsapp-groupe.envoi'
      },
      {
        label: 'WhatsApp notifications',
        helpId: 'communication.canaux.whatsapp'
      }
    ],
    keywords: ['group', 'whatsapp', 'broadcast', 'free message', 'announcement', 'image']
  },
  {
    id: 'communication.canaux.whatsapp-groupe.mise-en-forme',
    kind: 'section',
    title: 'WhatsApp formatting',
    summary: 'The buttons above the field add WhatsApp formatting: bold, italic, strikethrough, code, list and emojis.',
    purpose: 'WhatsApp formats text using symbols placed around the words. The buttons add them for you.',
    howToRead: {
      notes: [
        'Bold: the text between asterisks, *like this*.',
        'Italic: the text between underscores, _like this_.',
        'Strikethrough: the text between tildes, ~like this~.',
        'Code: the text between backticks, `like this`.'
      ]
    },
    steps: [
      {
        title: 'Select a word',
        detail: 'Highlight it in the input field.'
      },
      {
        title: 'Click the button',
        detail: '"Bold", "Italic", "Strikethrough" or "Code": the symbols are added around the word.'
      },
      {
        title: 'Make a list',
        detail: '"List" adds a dash at the start of a new line.'
      },
      {
        title: 'Add an emoji',
        detail: '"Emojis" opens a palette of 16 emojis: click one to insert it at the cursor.'
      }
    ],
    consequences: [
      'The field shows the symbols, not the result: WhatsApp applies the formatting on reception.',
      'Avoid spaces inside the symbols, otherwise the formatting is not applied.'
    ],
    faq: [
      {
        q: 'Why does the bold not show in the field?',
        a: 'That is normal: the field shows the symbols, not the rendering.'
      },
      {
        q: 'Can I type the symbols by hand?',
        a: 'Yes, the buttons only add them.'
      },
      {
        q: 'Is there a preview of the message?',
        a: 'No, only a preview of the attached image.'
      }
    ],
    related: [
      {
        label: 'WhatsApp group message',
        helpId: 'communication.canaux.whatsapp-groupe'
      }
    ],
    keywords: ['bold', 'italic', 'strikethrough', 'code', 'emoji', 'list', 'format']
  },
  {
    id: 'communication.canaux.whatsapp-groupe.image',
    kind: 'section',
    title: 'Attached image',
    summary: 'Add an image to your message: it is sent with your text as its caption.',
    purpose: 'The image is optional. You can also send an image alone, without text.',
    steps: [
      {
        title: 'Choose the file',
        detail: 'Click "Image" and select a photo.'
      },
      {
        title: 'Check the preview',
        detail: 'It appears under the field, with the file name.'
      },
      {
        title: 'Remove it',
        detail: 'Click "Remove the image" if you change your mind.'
      }
    ],
    consequences: [
      'Accepted formats: JPEG and PNG, 5 MB at most. Any other file is refused by the screen.',
      'Your text becomes the caption of the image.',
      'If sending the image fails while you wrote a text, the text is sent alone and the screen says so. Without a text, sending fails.',
      'A copy of the image is kept by the application.'
    ],
    faq: [
      {
        q: 'Why is my image refused?',
        a: 'It is neither JPEG nor PNG, or it is larger than 5 MB.'
      },
      {
        q: 'Can I send several images?',
        a: 'No, only one image per message.'
      },
      {
        q: 'Can I send the image without text?',
        a: 'Yes: the send button is active as soon as there is a text or an image.'
      }
    ],
    related: [
      {
        label: 'Send to group',
        helpId: 'communication.canaux.whatsapp-groupe.envoi'
      }
    ],
    keywords: ['image', 'photo', 'jpeg', 'png', 'caption', 'attach']
  },
  {
    id: 'communication.canaux.whatsapp-groupe.envoi',
    kind: 'section',
    title: 'Send to group',
    summary: 'The "Send to group" button immediately broadcasts your message to the configured WhatsApp group.',
    purpose: 'This is the final step: once sent, the message is visible to all members of the group.',
    steps: [
      {
        title: 'Check',
        detail: 'Check the text, the number of characters and the image, if any.'
      },
      {
        title: 'Send',
        detail: 'Click "Send to group".'
      },
      {
        title: 'Wait for the confirmation',
        detail: 'A confirmation message says that the message has been sent and through which provider.'
      }
    ],
    consequences: [
      'Sending is immediate and final: the application does not let you recall the message.',
      'After a successful send, the text and the image are cleared from the screen.',
      'In case of an error, nothing is cleared: you can correct and try again.'
    ],
    faq: [
      {
        q: 'What does "image not sent, text sent" mean?',
        a: 'The image could not be sent, but your text was sent alone to the group.'
      },
      {
        q: 'Why does the WhatsApp provider refuse sending?',
        a: 'The platform WhatsApp service rejected the message. Try again later or tell the administrator.'
      },
      {
        q: 'What if the group is not configured?',
        a: 'Sending is refused with an error message: ask the platform administrator to configure the group.'
      }
    ],
    related: [
      {
        label: 'WhatsApp group message',
        helpId: 'communication.canaux.whatsapp-groupe'
      }
    ],
    keywords: ['send', 'group', 'broadcast', 'error', 'provider']
  }
];

export default entries;
