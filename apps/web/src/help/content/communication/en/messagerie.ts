import type { HelpEntry } from '../../../types';

/** « messagerie » zone of the « communication » module (en). */
const entries: HelpEntry[] = [
  {
    id: 'communication.messagerie.notifications',
    kind: 'page',
    title: 'Notification center',
    summary:
      'Find here every notification addressed to you, newest first. You can search them, keep only the unread ones and mark them as read.',
    purpose:
      'A notification tells you about an event that concerns you, for example the arrival of a new private message. This page is personal: everyone sees only their own, in the agency or portal they are signed in to (staff member, tenant, owner or co-owner).\n\nEmails, WhatsApp messages or SMS that the application sends you are also listed here, with their channel, when the delivery is recorded in your name.',
    steps: [
      { title: 'Search', detail: 'Type a word from the title or message in « Search ».' },
      { title: 'Filter', detail: 'Turn on « Unread only » or choose a « Period ».' },
      {
        title: 'Spot what is new',
        detail: 'An unread notification has a blue dot and its title in bold.'
      },
      {
        title: 'Open',
        detail: 'Click the title when it is clickable: the notification is marked as read and the related screen opens.'
      },
      { title: 'Mark as read', detail: 'Click « Mark as read » without opening the notification.' },
      { title: 'Read everything at once', detail: 'Click « Mark all as read ».' }
    ],
    consequences: [
      '« Mark all as read » applies to all your unread notifications, not only those displayed or filtered. No button lets you set a notification back to « unread ».',
      'Marking a notification as read does not delete it: it stays in the list. This page offers no deletion.',
      'For a private message, the notification never copies the text: it only says that you received a message, with the sender’s name as the title.'
    ],
    faq: [
      {
        q: 'Why does a red « Failed » tag appear?',
        a: 'A delivery on that channel (email, WhatsApp or SMS) did not go out, and « A delivery failed » is shown. The details are reserved for the agency administrator, in the notification log.'
      },
      {
        q: 'Why is the title of a notification not clickable?',
        a: 'Some notifications have no related screen: they can only be read here.'
      },
      {
        q: 'Who else sees my notifications?',
        a: 'Other users do not see your list. An administrator with the « View the notification log » permission sees the deliveries made by the agency and their recipients, but never the content of private messages.'
      },
      {
        q: 'What is the bell at the top of the screen for?',
        a: 'It shows the number of unread notifications and opens the latest ones without leaving your screen. « See all » brings you back here.'
      }
    ],
    permissions: {
      note: 'No specific permission: every signed-in person sees their own notifications. The page is also used by tenants, owners and co-owners in their portal.'
    },
    related: [
      { label: 'Reading a notification', helpId: 'communication.messagerie.notifications.liste' },
      { label: 'The notification bell', helpId: 'communication.messagerie.cloche' },
      { label: 'Internal messaging', helpId: 'communication.messagerie.messages' },
      { label: 'Agency notification log', helpId: 'communication.messagerie.journal' }
    ],
    keywords: ['notification', 'notifications', 'alert', 'bell', 'unread', 'mark as read', 'notice', 'message received']
  },
  {
    id: 'communication.messagerie.notifications.liste',
    kind: 'section',
    title: 'Reading a notification',
    summary:
      'Each notification shows its title, message, date and, for every channel used, a « channel · status » tag. The status tells you whether the message actually went out.',
    howToRead: {
      statuses: [
        {
          value: 'PENDING',
          label: 'Pending',
          description: 'The delivery is in progress or has not been attempted yet.'
        },
        { value: 'SENT', label: 'Sent', description: 'The message went out.' },
        {
          value: 'DELIVERED',
          label: 'Delivered',
          description:
            'The channel confirmed that the message arrived. This status is rare: you will most often see « Sent ».'
        },
        {
          value: 'FAILED',
          label: 'Failed',
          description: 'The delivery did not succeed. The « A delivery failed » alert is shown under the notification.'
        },
        {
          value: 'SKIPPED',
          label: 'Not sent',
          description:
            'The delivery was deliberately skipped, for example because the channel is disabled, an address is missing or the recipient has not given consent.'
        }
      ],
      notes: [
        'The possible channels are « In the app », « Email », « WhatsApp » and « SMS ». A notification that only shows « In the app » is a simple notice visible here and in the bell: nothing is sent by email or SMS.',
        'Read or unread is not a delivery status: the blue dot and the bold title show it.',
        'A single failed channel is enough to show the alert, even if another channel went out.'
      ]
    },
    consequences: [
      'You only see a general failure reason. The precise reason is consulted by the agency administrator in the notification log.'
    ],
    faq: [
      {
        q: 'Is a « Sent » notification necessarily read?',
        a: 'No. « Sent » only says that the message went out. Only the blue dot shows that you have not yet marked it as read.'
      },
      {
        q: 'Are notifications sorted?',
        a: 'Yes, from newest to oldest. Use the search and the period to go further back.'
      },
      {
        q: 'I do not see any pagination.',
        a: 'It only appears when there are more notifications than one page can display.'
      }
    ],
    related: [{ label: 'Notification center', helpId: 'communication.messagerie.notifications' }],
    keywords: ['status', 'sent', 'failed', 'channel', 'dot', 'unread']
  },
  {
    id: 'communication.messagerie.cloche',
    kind: 'section',
    title: 'The notification bell',
    summary:
      'The bell at the top of the screen shows the number of unread notifications. One click opens the latest ones in a panel, without leaving your screen.',
    purpose:
      'The bell is present on every screen for agency staff and for portal clients. Next to it, the « Messaging » icon shows the number of conversations that contain unread messages.',
    steps: [
      { title: 'Check the counter', detail: 'The number is updated every 30 seconds while the page is visible.' },
      { title: 'Open the panel', detail: 'Click the bell: the 20 latest notifications are displayed.' },
      { title: 'Sort', detail: 'Turn on « Unread only » to hide those already read.' },
      {
        title: 'Act',
        detail:
          'Click a title to open the related screen (the notification is then marked as read), or « Mark as read ».'
      },
      { title: 'See all', detail: 'The « See all » button opens the full notification center.' }
    ],
    consequences: [
      '« Mark all as read » resets the counter to zero. The button is greyed out when nothing is unread.',
      'Opening a conversation in messaging also marks that message’s notification as read: the bell counter goes down at the same time.'
    ],
    faq: [
      {
        q: 'I do not see the bell.',
        a: 'It does not appear for an account that is attached neither to an agency nor to a client portal.'
      },
      {
        q: 'The number does not change.',
        a: 'It updates every 30 seconds, and only while the tab is visible. During a temporary network outage, it keeps its last value.'
      },
      {
        q: 'What does 99 mean?',
        a: 'The counter stops displaying beyond 99 unread notifications.'
      }
    ],
    related: [
      { label: 'Notification center', helpId: 'communication.messagerie.notifications' },
      { label: 'Internal messaging', helpId: 'communication.messagerie.messages' }
    ],
    keywords: ['bell', 'badge', 'counter', 'unread notifications', 'panel']
  },
  {
    id: 'communication.messagerie.messages',
    kind: 'page',
    title: 'Internal messaging',
    summary:
      'Write to the members of your agency and, depending on your profile, to its clients. Each conversation is private: only its participants can read it.',
    purpose:
      'A discussion thread attached to the agency, shared by staff and portal clients (tenant, owner, co-owner).\n\nA staff member can write to a colleague and, with the « View contacts » permission, to a client. A client can only write to a team member and sees neither other clients’ names nor anyone’s email.',
    steps: [
      {
        title: 'Open a conversation',
        detail: 'Click a conversation in the list.'
      },
      {
        title: 'Start one',
        detail: 'Click « New conversation », choose one or more people, then « Start ».'
      },
      {
        title: 'Find a conversation',
        detail: 'Type the title or a participant’s name in « Search conversations ».'
      },
      {
        title: 'Write',
        detail: 'Type your text in « Write a message », then press Enter to send (Shift + Enter for a new line).'
      },
      {
        title: 'See who takes part',
        detail: 'Click the « Participants » button.'
      },
      {
        title: 'On a phone',
        detail: 'The list and the thread are shown one after the other: the back arrow returns to the list.'
      }
    ],
    consequences: [
      'A sent message can no longer be edited or deleted: no button allows it.',
      'Each other participant receives an in-app notification « You have received a new message. », titled with your name and without the message text. No email or SMS is sent.',
      'Only the participants read a conversation, not even the agency administrator or the platform team.',
      'A person added later only sees the messages sent after they joined.',
      'The list and the open conversation refresh every 30 seconds.'
    ],
    faq: [
      {
        q: 'Can I send a file or a photo?',
        a: 'No, messaging only carries text, up to 5,000 characters per message.'
      },
      {
        q: 'How do I know whether my message has been read?',
        a: 'There is no read receipt: the recipient is only sent a notification.'
      },
      {
        q: 'My message does not go out.',
        a: 'An empty message, one over 5,000 characters, or more than 30 sent per minute is refused. Your text stays in the writing area.'
      },
      {
        q: 'I cannot find a client in the list.',
        a: 'Only staff with the « View contacts » permission see clients, and only those with an active account.'
      }
    ],
    permissions: {
      note: 'Every staff member and every portal client has access, with no specific plan. Writing to a client requires the « View contacts » permission.'
    },
    related: [
      { label: 'Conversation list', helpId: 'communication.messagerie.messages.conversations' },
      { label: 'New conversation', helpId: 'communication.messagerie.messages.nouvelle' },
      { label: 'Conversation thread and writing area', helpId: 'communication.messagerie.messages.fil' },
      { label: 'Participants', helpId: 'communication.messagerie.messages.participants' },
      { label: 'Notification center', helpId: 'communication.messagerie.notifications' }
    ],
    keywords: ['messaging', 'message', 'conversation', 'discussion', 'chat', 'write', 'group', 'client', 'team']
  },
  {
    id: 'communication.messagerie.messages.conversations',
    kind: 'section',
    title: 'Conversation list',
    summary: 'All your conversations, newest first. A number shows the messages you have not read yet.',
    howToRead: {
      notes: [
        'The title is the group’s title; without one, it is the names of the other participants. Below it you see the beginning of the last message.',
        'To the right of the title, the time of the last message if it is from today, otherwise the date (day/month).',
        'The number in a badge is the count of unread messages in that conversation. The title is then in bold.'
      ]
    },
    steps: [
      { title: 'Search', detail: 'Type in « Search conversations »: title or participant.' },
      {
        title: 'See more',
        detail: '« Show more conversations » extends the list (from 50 to 100 at most). Beyond that, use the search.'
      }
    ],
    consequences: [
      'For a staff member, the search covers the title and the name or email of the other participants. For a client, it covers the title and the names of staff only.',
      'A conversation you have left disappears from your list.'
    ],
    faq: [
      {
        q: 'A conversation has disappeared from my list.',
        a: 'You may have left it: a conversation you left does not come back to your list.'
      },
      {
        q: 'Why does a conversation show names instead of a title?',
        a: 'A direct discussion, or a group created without a title, takes the names of the other participants.'
      },
      {
        q: 'My search finds nothing.',
        a: 'The message « No conversations match your search. » is shown. Try another word or clear the search.'
      }
    ],
    related: [
      { label: 'Internal messaging', helpId: 'communication.messagerie.messages' },
      { label: 'New conversation', helpId: 'communication.messagerie.messages.nouvelle' }
    ],
    keywords: ['conversations', 'list', 'unread', 'search', 'badge']
  },
  {
    id: 'communication.messagerie.messages.nouvelle',
    kind: 'section',
    title: 'New conversation',
    summary: 'Choose one person for a direct discussion, or several for a group. The conversation opens right away.',
    steps: [
      { title: 'Search', detail: 'Type a name in « Search for a person »: the list is filtered.' },
      {
        title: 'Tick',
        detail:
          'Tick one person for a direct discussion, several for a group. A « Team » or « Client » tag shows their profile.'
      },
      {
        title: 'Name the group',
        detail: 'As soon as you tick at least two people, a « Group title (optional) » field appears.'
      },
      { title: 'Start', detail: 'Click « Start ». The button stays greyed out until someone is ticked.' }
    ],
    consequences: [
      'A direct discussion with the same person is never created twice: you reopen the existing conversation.',
      'Nobody is notified until you have sent a first message.',
      'A group has at most 50 participants, including you, and 5 as soon as it contains a client.',
      'A client can only start a direct discussion with a team member: no groups.'
    ],
    faq: [
      {
        q: 'Why can I not name my conversation?',
        a: 'The title only exists for a group: tick at least two people.'
      },
      {
        q: 'A person is missing from the list.',
        a: 'Only active people of the agency are offered. Clients are only offered to staff who have the « View contacts » permission.'
      },
      {
        q: 'An « Action failed » error message is shown.',
        a: 'One of the rules above is not met (too many participants, group with a client too large), or a send that was too fast was blocked. Check your choice and try again.'
      }
    ],
    related: [
      { label: 'Internal messaging', helpId: 'communication.messagerie.messages' },
      { label: 'Participants', helpId: 'communication.messagerie.messages.participants' }
    ],
    keywords: ['new conversation', 'group', 'direct discussion', 'start', 'participants']
  },
  {
    id: 'communication.messagerie.messages.fil',
    kind: 'section',
    title: 'Conversation thread and writing area',
    summary:
      'The thread shows the messages in order, yours on the right and the others’ on the left. At the bottom, the « Write a message » area is used to reply.',
    howToRead: {
      notes: [
        'For another person’s message, the author’s name is shown with their profile (« Team » in blue, « Client » in yellow) and the time.',
        'Line breaks are kept, and the text is displayed as is.',
        'A client sees « Other participant » instead of another client’s name.'
      ]
    },
    steps: [
      { title: 'Write', detail: 'Type your message in « Write a message ».' },
      { title: 'Send', detail: 'Press Enter, or click the send button. Shift + Enter starts a new line.' },
      {
        title: 'Reread the history',
        detail: 'Click « Load older messages » at the top of the thread when it appears.'
      }
    ],
    consequences: [
      'Sending is final: a message can be neither edited nor deleted.',
      'Each other participant is notified by an in-app notification, without the text of the message.',
      'Opening the conversation, with the page visible, marks its new messages as read.'
    ],
    faq: [
      {
        q: 'Why is the send button greyed out?',
        a: 'It is greyed out while the writing area is empty or contains only spaces.'
      },
      {
        q: 'What is the maximum size?',
        a: 'A message has at most 5,000 characters: typing stops at that limit.'
      },
      {
        q: 'I cannot see the older messages of a group.',
        a: 'If you were added after they were sent, you do not see them: a participant only sees what was written since they joined.'
      }
    ],
    related: [
      { label: 'Internal messaging', helpId: 'communication.messagerie.messages' },
      { label: 'Participants', helpId: 'communication.messagerie.messages.participants' }
    ],
    keywords: ['thread', 'message', 'write', 'send', 'history', 'composer']
  },
  {
    id: 'communication.messagerie.messages.participants',
    kind: 'section',
    title: 'Participants',
    summary:
      'The list of people in the conversation, with their profile. In a group, you can add people or leave the conversation.',
    steps: [
      { title: 'Show the list', detail: 'Click « Participants » above the thread. A second click closes it.' },
      {
        title: 'Add someone',
        detail: 'In a group, click « Add participants », tick the people, then « Add ».'
      },
      {
        title: 'Leave',
        detail: 'In a group, click « Leave the conversation », then « Leave » to confirm.'
      }
    ],
    consequences: [
      'Leaving a group removes you from it: you no longer see the conversation or its messages. No button lets you go back, and the other participants cannot add you again.',
      'An added person only sees the messages sent after they joined.',
      'A group has at most 50 participants, and 5 as soon as it contains a client.',
      'A direct discussion has neither « Add participants » nor « Leave the conversation ».'
    ],
    faq: [
      {
        q: 'What do « Agency team » or « Other participant » mean?',
        a: 'These names protect privacy. A client sees « Agency team » for a staff member whose name is not filled in, and « Other participant » in place of another client.'
      },
      {
        q: 'What do « Team » and « Client » mean?',
        a: '« Team » designates an active member of the agency; « Client » a tenant, owner or co-owner who has an account on their portal.'
      },
      {
        q: 'Why can I not add one more person?',
        a: 'The group has reached its limit: 50 participants, or 5 if it contains a client.'
      }
    ],
    related: [
      { label: 'New conversation', helpId: 'communication.messagerie.messages.nouvelle' },
      { label: 'Internal messaging', helpId: 'communication.messagerie.messages' }
    ],
    keywords: ['participants', 'add', 'leave', 'group', 'team', 'client']
  },
  {
    id: 'communication.messagerie.journal',
    kind: 'page',
    title: 'Notification log',
    summary:
      'View every notification sent by the agency, channel by channel, with the failures and their reason. You can resend a delivery that failed.',
    purpose:
      'When the application notifies someone by email, WhatsApp, SMS or in the app, the delivery is recorded here with its recipient, channel and result. This is the screen to open to find out why a tenant, an owner or a staff member did not receive a message.\n\nPrivate messages from messaging never appear here, not even as a summary.',
    steps: [
      {
        title: 'Search',
        detail: 'Type a name, a title or a word from the message in « Search ».'
      },
      {
        title: 'Filter',
        detail: 'Choose a « Recipient », a « Channel » or a « Status ». The « Period » is set under « More filters ».'
      },
      { title: 'Open the detail', detail: 'Click a row: the detail panel opens.' },
      {
        title: 'Resend',
        detail: 'On a failed row, click « Resend ». A message confirms the result.'
      },
      { title: 'Refresh', detail: 'Click « Refresh » to reload the list.' }
    ],
    consequences: [
      '« Resend » really sends the message to the recipient again. Only use it if the delivery did fail: if the first message did arrive in the end, it may be received twice.',
      'Only failed channels are replayed. A resend is refused if the message cannot be replayed, if the recipient has withdrawn consent or is no longer active: the delivery stays failed and the reason explains why.',
      'Resending is irreversible, and the log cannot be exported. The table shows the recipients and the text of the notifications of the whole agency.'
    ],
    faq: [
      {
        q: 'Why does a « Sent » row have a « Resend » button?',
        a: 'The overall status is « Sent » as soon as one channel went out. If another channel failed, the button remains available to replay it.'
      },
      {
        q: 'I do not see this screen in the menu.',
        a: 'It requires the « View the notification log » permission. By default it is given to the agency’s administrators and managers; ask your administrator for any other role.'
      },
      {
        q: 'The resend failed again.',
        a: 'A message tells you so. Open the detail: the reason for the failure is shown in red on the channel concerned.'
      },
      {
        q: 'Where is the private message I am looking for?',
        a: 'Messages from internal messaging are never recorded here, to protect their content.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager'],
      note: 'Requires the « View the notification log » permission. It is given by default to the agency’s administrators and managers, and can be assigned to a custom role.'
    },
    related: [
      { label: 'How to read the log', helpId: 'communication.messagerie.journal.tableau' },
      { label: 'Delivery detail', helpId: 'communication.messagerie.journal.detail' },
      { label: 'Email notifications', helpId: 'communication.canaux.email' },
      { label: 'WhatsApp notifications', helpId: 'communication.canaux.whatsapp' }
    ],
    keywords: [
      'log',
      'notifications',
      'deliveries',
      'failure',
      'resend',
      'email',
      'whatsapp',
      'sms',
      'delivery history',
      'not received'
    ]
  },
  {
    id: 'communication.messagerie.journal.tableau',
    kind: 'table',
    title: 'How to read the log',
    summary:
      'Each row is a notification sent to one person. The tags in the « Channels » column show the result on each channel; the « Status » column gives the overall result.',
    howToRead: {
      columns: [
        {
          key: 'createdAt',
          label: 'Date',
          description: 'Date and time the notification was created, newest first.'
        },
        { key: 'recipient', label: 'Recipient', description: 'The person the notification is addressed to.' },
        { key: 'title', label: 'Notification', description: 'The title of the notification.' },
        {
          key: 'channels',
          label: 'Channels',
          description:
            'One « channel · status » tag per channel used: « In the app », « Email », « WhatsApp » or « SMS ».'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'Overall result: « Sent » as soon as one channel went out, « Failed » if all of them failed.'
        }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'Pending',
          description: 'The delivery is in progress or has not been attempted yet.'
        },
        { value: 'SENT', label: 'Sent', description: 'The message went out.' },
        {
          value: 'DELIVERED',
          label: 'Delivered',
          description: 'The channel confirmed that the message arrived. This status is rare.'
        },
        {
          value: 'FAILED',
          label: 'Failed',
          description: 'The delivery did not succeed: the « Resend » button is offered.'
        },
        {
          value: 'SKIPPED',
          label: 'Not sent',
          description:
            'The delivery was deliberately skipped: channel disabled, address or number missing, consent missing.'
        }
      ],
      notes: [
        'A delivery that only shows « In the app » produced no email or SMS.',
        'The « Resend » button appears as soon as one channel has failed, even if the overall status is « Sent ».'
      ]
    },
    faq: [
      {
        q: 'How do I find the deliveries to a specific recipient?',
        a: 'Choose them in « Recipient ». The list offers the people the agency has already notified.'
      },
      {
        q: 'How do I see only the failures?',
        a: 'Choose « Failed » in « Status ».'
      },
      {
        q: 'Are the rows clickable?',
        a: 'Yes: a click opens the notification detail, channel by channel.'
      }
    ],
    related: [
      { label: 'Notification log', helpId: 'communication.messagerie.journal' },
      { label: 'Delivery detail', helpId: 'communication.messagerie.journal.detail' }
    ],
    keywords: ['columns', 'status', 'channel', 'recipient', 'filter']
  },
  {
    id: 'communication.messagerie.journal.detail',
    kind: 'section',
    title: 'Delivery detail',
    summary:
      'The panel that opens when you click a row shows the message, who triggered it and, for each channel, the attempts and the reason for any failure.',
    howToRead: {
      notes: [
        '« Recipient », « Triggered by » (the person whose action caused the delivery, when known), « Date » and « Message » describe the notification.',
        'Each channel has its own card: « Target » (the email address or number aimed at), « Attempts », « Last attempt » and « Sent on ».',
        'On a failed channel, the red « Delivery failed » box gives the reason, for example: the mail server rejected the email, or WhatsApp was not sent for lack of consent or number.'
      ]
    },
    steps: [
      { title: 'Read the reason', detail: 'Spot the channel in red and read the reason for the failure.' },
      {
        title: 'Fix the cause',
        detail: 'For example, add the missing address or number in the person’s record.'
      },
      { title: 'Resend', detail: 'Click « Resend » at the top of the panel.' }
    ],
    consequences: [
      'After a resend, the panel updates: « Attempts » goes up, and the message « Notification resent. » or a warning appears.',
      'Resending sends the message to the recipient again and cannot be undone.'
    ],
    faq: [
      {
        q: 'What does « Reason not provided. » mean?',
        a: 'The channel failed without giving an explanation. Try again with « Resend »; if the failure persists, check the channel configuration.'
      },
      {
        q: 'What does « Attempts » mean?',
        a: 'The number of times the application tried to send the message on that channel.'
      },
      {
        q: 'Why is no « Target » shown?',
        a: 'For an « In the app » notice, there is no address or number: the message is only visible in the bell and in the notification center.'
      }
    ],
    related: [
      { label: 'Notification log', helpId: 'communication.messagerie.journal' },
      { label: 'How to read the log', helpId: 'communication.messagerie.journal.tableau' }
    ],
    keywords: ['detail', 'attempts', 'reason', 'failure', 'resend', 'target']
  },
  {
    id: 'communication.messagerie.journal-plateforme',
    kind: 'page',
    title: 'Notifications (platform)',
    summary:
      'See the notifications sent by every agency, with failures and their reason. You can resend a notification that failed.',
    purpose:
      "This screen is reserved for platform super-administrators. It shows the same log as an agency's, but for all agencies at once: useful to understand why an agency reports that a tenant, an owner or a team member did not receive a message.\n\nPrivate messages from the messaging feature never appear here.",
    steps: [
      { title: 'Search', detail: 'Type a recipient, a title or a word from the message in « Search ».' },
      {
        title: 'Filter',
        detail: 'Pick an « Agency », a « Channel » or a « Status ». The « Period » is set under « More filters ».'
      },
      { title: 'Open the detail', detail: 'Click a row: the detail panel opens, with the agency concerned.' },
      {
        title: 'Resend',
        detail: 'On a failed row, click « Resend ». A message confirms the result.'
      },
      { title: 'Refresh', detail: 'Click « Refresh » to reload the list.' }
    ],
    consequences: [
      '« Resend » really sends the message to the recipient again, on behalf of their agency. Only use it if the sending truly failed: if the first message eventually arrived, it may be received twice.',
      'Only failed channels are replayed. A resend is refused if the message cannot be replayed, if the recipient withdrew consent or is no longer active: the sending stays failed and the reason explains why.',
      'Resending cannot be undone. This screen shows the recipients and the text of the notifications of every agency: do not share its content.'
    ],
    faq: [
      {
        q: "How is it different from an agency's log?",
        a: 'The table gains an « Agency » column and the « Recipient » filter is replaced by the « Agency » filter. Everything else reads the same way.'
      },
      {
        q: 'Why does a « Sent » row have a « Resend » button?',
        a: 'The overall status is « Sent » as soon as one channel went out. If another channel failed, the button stays available to replay it.'
      },
      {
        q: 'I cannot see this screen.',
        a: "It is reserved for platform super-administrators. An agency administrator sees only their own agency's log, from « Notification log »."
      },
      {
        q: 'The resend failed again.',
        a: 'A message tells you so. Open the detail: the reason for the failure appears on the channel concerned.'
      }
    ],
    permissions: {
      roles: ['Platform super-administrator'],
      note: "Reserved for super-administrators. Viewing requires the right to see the platform's agencies; resending requires the right to edit them. Resends are limited in number over a short period."
    },
    related: [
      { label: 'How to read the log', helpId: 'communication.messagerie.journal.tableau' },
      { label: "An agency's notification log", helpId: 'communication.messagerie.journal' },
      { label: 'Detail of a sending', helpId: 'communication.messagerie.journal.detail' }
    ],
    keywords: ['platform notifications', 'all agencies', 'sendings', 'failure', 'resend', 'super-administrator', 'log']
  }
];

export default entries;
