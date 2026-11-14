import type { HelpEntry } from '../../../types';

/** Zone « assemblees » du module « syndic » (en) : general meetings and document vault. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Meetings: list
  {
    id: 'syndic.assemblees.liste',
    kind: 'page',
    title: 'General meetings',
    summary:
      'This tab lists the general meetings of the co-ownership and lets you create one. Each row leads to the meeting record, where the session is prepared and held.',
    purpose:
      'This is where a meeting starts: you schedule it here (type, date, time, place), then enter the agenda, resolutions and proxies, and send the notice from its record.',
    steps: [
      {
        title: 'Create the meeting',
        detail:
          'Click "New meeting", choose the type, the date, the start time, then, if you wish, the end time and the place.'
      },
      {
        title: 'Leave the notice box unticked',
        detail:
          '"Send convocations now" is unticked by default: this gives you time to enter the agenda before sending.'
      },
      { title: 'Open the record', detail: 'Click "View details" to prepare the meeting.' },
      {
        title: 'Follow the status',
        detail:
          'From the row, "Open the session" or "Cancel the meeting" for a scheduled meeting, "Close the session" for a meeting in progress.'
      },
      { title: 'Find a meeting', detail: 'Use the search, the status, the date or the type.' }
    ],
    consequences: [
      'Creating the meeting sends nothing unless you tick "Send convocations now". If you tick it, the notices go out straight away, in the background, before you have entered the agenda.',
      'After a send, a banner shows the number of e-mails sent and failed, with a "Resend the notice" button if some failed.',
      'Cancelling a meeting and closing a session are final.'
    ],
    faq: [
      {
        q: 'Why are the notices not sent at creation?',
        a: 'To let you enter the agenda first. You then send them from the meeting record with "Send convocations".'
      },
      {
        q: 'Can I delete a meeting?',
        a: 'Not from this screen. While it is "Scheduled" (scheduled), you can cancel it.'
      },
      {
        q: 'What should I do if the message says the meeting may have been created?',
        a: 'A network break prevented the reply from being seen. Check the list before trying again: the meeting may already be there.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager'],
      note: 'Viewing the list requires "View the Syndic module". Creating, opening, closing or cancelling requires "Edit the Syndic module". The standard meeting (notice, resolutions, entered votes, minutes) is included in the Syndic pack; live meeting and video are a paid option, described in the "Live" sheet.'
    },
    related: [
      { label: 'List of meetings', helpId: 'syndic.assemblees.tableau' },
      { label: 'Create a general meeting', helpId: 'syndic.assemblees.creation' },
      { label: 'Meeting record', helpId: 'syndic.assemblees.detail' }
    ],
    keywords: ['AG', 'general meeting', 'co-ownership', 'notice', 'session', 'meeting', 'schedule']
  },
  {
    id: 'syndic.assemblees.tableau',
    kind: 'table',
    title: 'List of meetings',
    summary:
      'This table shows each meeting with its type, date, times, place and status. You can open it or change its status from the row.',
    purpose: 'It helps you find a meeting and move its status forward without opening its record.',
    howToRead: {
      columns: [
        { key: 'type', label: 'Type', description: 'Ordinary or Extraordinary.' },
        { key: 'scheduledAt', label: 'Date', description: 'Date and time of the meeting (day/month/year).' },
        { key: 'startTime', label: 'Start', description: 'Start time. "-" if not filled in.' },
        { key: 'endTime', label: 'End', description: 'End time. "-" if not filled in.' },
        { key: 'location', label: 'Venue', description: 'Place of the meeting, or "Not provided" (not filled in).' },
        { key: 'status', label: 'Status', description: 'Stage of the meeting (see the statuses below).' },
        { key: 'actions', label: 'Actions', description: '"View details" and the status button that applies.' }
      ],
      statuses: [
        {
          value: 'PLANNED',
          label: 'Scheduled',
          description: 'The meeting is being prepared: agenda, resolutions, proxies, notice.'
        },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'The session is open: attendance and votes.' },
        { value: 'COMPLETED', label: 'Closed', description: 'Votes are frozen; no further changes.' },
        { value: 'CANCELLED', label: 'Cancelled', description: 'The meeting is not taking place; no further changes.' }
      ],
      notes: ['Filters cover text, status, date and type. The export reproduces the table columns.']
    },
    steps: [
      { title: 'View', detail: '"View details" opens the meeting record.' },
      { title: 'Open the session', detail: 'Available for a "Scheduled" meeting.' },
      {
        title: 'Close',
        detail: '"Close the session" is available for an "In progress" meeting; a confirmation is requested.'
      }
    ],
    consequences: [
      'A cancelled meeting can no longer receive votes.',
      'Closing freezes the votes and cannot be undone.'
    ],
    faq: [
      {
        q: 'Why is there no status button on a closed meeting?',
        a: 'A closed or cancelled meeting no longer changes status.'
      },
      {
        q: 'Can I cancel a meeting in progress?',
        a: 'No: an open session is closed, not cancelled.'
      },
      {
        q: 'Where do I see the agenda?',
        a: 'In the meeting record, with "View details".'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Changing the status requires "Edit the Syndic module".'
    },
    related: [{ label: 'Status, closing and minutes', helpId: 'syndic.assemblees.detail.statuts' }],
    keywords: ['status', 'scheduled', 'closed', 'cancelled', 'open the session', 'list']
  },
  {
    id: 'syndic.assemblees.creation',
    kind: 'section',
    title: 'Create a general meeting',
    summary:
      'This window creates the meeting with its type, date, times and place. It also offers to send the notices right away.',
    purpose:
      'Creating the meeting opens its working record. The agenda, resolutions and proxies are added there afterwards.',
    steps: [
      { title: 'Type', detail: '"Ordinary" or "Extraordinary".' },
      { title: 'Date and start time', detail: 'Both are required, in two separate fields.' },
      { title: 'End time and place', detail: 'Optional. The end time must be after the start time.' },
      {
        title: 'Notices',
        detail:
          'Tick "Send convocations now" only if you want to send them without waiting. Otherwise, send them from the meeting once the agenda is entered.'
      },
      { title: 'Confirm', detail: 'Click "Create".' }
    ],
    consequences: [
      'If the box is ticked, all co-owners are notified in the background, without waiting for the sending to finish on screen.',
      'With the box unticked, no send is recorded: the meeting record will show "Send convocations".'
    ],
    faq: [
      {
        q: 'Why does a message reject the end time?',
        a: 'The end time must be after the start time.'
      },
      {
        q: 'Can I change the date later?',
        a: 'The record lets you change the start time, end time and place. For the date, check with your administrator: the record does not offer to change it.'
      },
      {
        q: 'Does a double click create two meetings?',
        a: 'No: the screen prevents duplicate sending and reuses the same creation when you retry after a network break.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Creating a meeting requires "Edit the Syndic module".' },
    related: [{ label: 'Notice to co-owners', helpId: 'syndic.assemblees.detail.convocation' }],
    keywords: ['new meeting', 'create', 'ordinary', 'extraordinary', 'date', 'place']
  },

  // ------------------------------------------------------------------ Meetings: record
  {
    id: 'syndic.assemblees.detail',
    kind: 'page',
    title: 'General meeting record',
    summary:
      'The record gathers everything about a meeting: date and place, agenda, resolutions, proxies, notice, live session and results. Its status determines what can still be changed.',
    purpose:
      'Before the session, you prepare and send the notice. During the session, you record attendance and votes. After closing, everything is frozen and you download the minutes.',
    steps: [
      { title: 'Check date, time and place', detail: '"Start time", "End time" and "Venue", then "Save".' },
      { title: 'Enter the agenda', detail: '"Agenda" card, "Add an item" button.' },
      { title: 'Add the resolutions', detail: '"Add a resolution" button: title, description and majority rule.' },
      { title: 'Record the proxies', detail: '"Proxies" card, "Add a proxy".' },
      { title: 'Send the notice', detail: '"Send convocations", or "Notice of meeting (Word)" for one lot.' },
      { title: 'Open the session', detail: '"Open the session" then attendance and votes.' },
      { title: 'Close', detail: '"Close the session", then "Generate Word minutes".' }
    ],
    consequences: [
      'Closing and cancelling are final: no more votes, resolutions, proxies, or changes to the agenda, date or place.',
      'A notice that has been sent cannot be recalled: only a limited resend exists.'
    ],
    faq: [
      {
        q: 'Why are all the buttons greyed out?',
        a: 'The meeting is closed or cancelled: it is frozen. A tooltip gives the reason.'
      },
      {
        q: 'Where do I enter the votes?',
        a: 'In the "Agenda and votes" card: choose the voting unit then "For", "Against" or "Abstention".'
      },
      {
        q: 'The "Live" card shows "Live AG and video — option not subscribed". Is that normal?',
        a: 'Yes if the "Live AG and video" option is not subscribed. The standard meeting remains usable.'
      },
      {
        q: 'Where are the official minutes?',
        a: '"Generate Word minutes" downloads the minutes. You can then add them in the "Documents" tab.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager'],
      note: 'Viewing requires "View the Syndic module"; any change requires "Edit the Syndic module". The "Live" card (console, online vote, video) belongs to the paid "Live AG and video" option.'
    },
    related: [
      { label: 'Calendar', helpId: 'syndic.assemblees.detail.ordre-du-jour' },
      { label: 'Resolution results', helpId: 'syndic.assemblees.detail.resultats' },
      { label: 'Proxies', helpId: 'syndic.assemblees.detail.pouvoirs' },
      { label: 'Notice to co-owners', helpId: 'syndic.assemblees.detail.convocation' },
      { label: 'Live', helpId: 'syndic.assemblees.detail.direct' }
    ],
    keywords: ['AG', 'prepare a meeting', 'notice', 'agenda', 'vote', 'minutes', 'session'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'ag-ordre-du-jour',
          title: 'Enter the agenda',
          description: 'Add each item to discuss with "Add an item". The agenda can be changed until closing.'
        },
        {
          target: 'ag-pouvoirs',
          title: 'Record the proxies',
          description:
            'A co-owner can appoint another co-owner or an agency contact: one proxy per grantor. Proxies can no longer be changed after closing.'
        },
        {
          target: 'ag-vote',
          title: 'Enter the votes',
          description:
            'Once the resolutions are added, choose the voting unit then "For", "Against" or "Abstention". The header buttons (resolutions, notices, opening the session) depend on the status: see the help sheet.'
        }
      ]
    }
  },
  {
    id: 'syndic.assemblees.detail.statuts',
    kind: 'section',
    title: 'Status, closing and minutes',
    summary:
      'The status shows where the meeting stands and determines what remains editable. The record buttons move it forward: open the session, close it or cancel it.',
    purpose:
      'The flow is one-way: a scheduled meeting is opened then closed, or cancelled before opening. Closing gives the final results.',
    howToRead: {
      statuses: [
        { value: 'PLANNED', label: 'Scheduled', description: 'You prepare; the notice can be sent or resent.' },
        {
          value: 'IN_PROGRESS',
          label: 'In progress',
          description: 'The session is open. Only "Close the session" remains possible.'
        },
        { value: 'COMPLETED', label: 'Closed', description: 'Everything is frozen, results included.' },
        { value: 'CANCELLED', label: 'Cancelled', description: 'Everything is frozen; no vote is possible.' }
      ]
    },
    steps: [
      { title: 'Open the session', detail: '"Open the session" button for a "Scheduled" meeting.' },
      { title: 'Cancel', detail: '"Cancel the meeting", with confirmation, as long as the session is not open.' },
      { title: 'Close', detail: '"Close the session", with confirmation.' },
      {
        title: 'Download the minutes',
        detail: '"Generate Word minutes" downloads a Word file to your device.'
      }
    ],
    consequences: [
      'Opening fills in the start time if it was empty. Closing fills in the end time if it was empty.',
      'Closing shuts the votes still open, recalculates the results one last time and freezes them, then closes the video room.',
      'The minutes include the co-ownership, type, date, times, place, quorum, agenda and discussions, resolutions with their rule, votes and result, proxies, and the attendance sheet.',
      'The minutes are neither sent nor filed automatically: add them in the "Documents" tab (type "General meeting minutes") to share them.'
    ],
    faq: [
      {
        q: 'Can a closed meeting be reopened?',
        a: 'No. A closed or cancelled meeting no longer changes status.'
      },
      {
        q: 'Can a session that is already open be cancelled?',
        a: 'No: a session in progress can only be closed.'
      },
      {
        q: 'Can I close without having opened the session?',
        a: 'No: the session must be opened first.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Changing the status requires "Edit the Syndic module".' },
    related: [{ label: 'Documents', helpId: 'syndic.documents.liste' }],
    keywords: ['open the session', 'close', 'cancel', 'minutes', 'official minutes', 'Word']
  },
  {
    id: 'syndic.assemblees.detail.ordre-du-jour',
    kind: 'section',
    title: 'Agenda',
    summary:
      'This card lists the items to cover during the meeting, in order, with their discussions. You add, edit or delete items here.',
    purpose:
      'The agenda is the outline of the session and appears in the Word notice (if there are no items, the proposed resolutions are used) and in the minutes.',
    steps: [
      { title: 'Add an item', detail: '"Add an item": title, order number and one line per discussion.' },
      { title: 'Edit', detail: '"Edit" on the item: change the title, order or discussions.' },
      { title: 'Delete', detail: '"Delete", with confirmation.' }
    ],
    consequences: [
      'The agenda remains editable while the meeting is "Scheduled" or "In progress": discussions can be entered during the session.',
      'A closed or cancelled meeting accepts no further changes.',
      'Deleting an item is final.'
    ],
    faq: [
      {
        q: 'How do I change the order of the items?',
        a: 'Edit the item\'s "Order" field: items are shown in ascending order.'
      },
      {
        q: 'Is an agenda item a resolution?',
        a: 'No. Resolutions are voted on and managed separately with "Add a resolution".'
      },
      {
        q: 'Does the agenda go out in the notice e-mail?',
        a: 'The default notice message does not include it. The agenda appears in the "Notice of meeting (Word)".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Adding, editing or deleting an item requires "Edit the Syndic module".' },
    related: [{ label: 'Notice to co-owners', helpId: 'syndic.assemblees.detail.convocation' }],
    keywords: ['item', 'discussion', 'agenda']
  },
  {
    id: 'syndic.assemblees.detail.resolution',
    kind: 'section',
    title: 'Add a resolution',
    summary:
      'This window creates a resolution to vote on, with its majority rule. The rule decides how the result is calculated in shares.',
    purpose:
      "A resolution is a decision put to the units' vote. The result is recalculated at each vote and frozen at closing.",
    howToRead: {
      notes: [
        'Article 24 — simple majority: "For" must exceed "Against" in votes cast (shares); abstentions are excluded. This is the default rule.',
        'Article 25 — absolute majority: "For" must exceed 50% of the shares of all units, whether they vote or not.',
        'Article 26 — double majority: more than half of the co-owners and at least 2/3 of the shares.',
        'Unanimity: all units vote "For".'
      ]
    },
    steps: [
      { title: 'Title', detail: 'Required.' },
      { title: 'Description', detail: 'Optional: details put to the vote.' },
      { title: 'Majority rule', detail: 'Choose the rule; the hint under the field recalls it.' },
      { title: 'Add', detail: 'Click "Add".' }
    ],
    consequences: [
      'A resolution can no longer be added or deleted on a closed or cancelled meeting.',
      'It can only be deleted while its vote is not open and no vote has been entered.',
      'No quorum rule blocks the result: the quorum is indicative.'
    ],
    faq: [
      {
        q: 'Which rule should I choose?',
        a: 'The one that applies to the decision under the co-ownership rules and the law. If in doubt, ask for advice: the application calculates, it does not choose for you.'
      },
      {
        q: 'Is a resolution created twice if I click twice?',
        a: 'No: a double click or an immediate retry does not create a duplicate.'
      },
      {
        q: 'Can the rule be changed afterwards?',
        a: 'The record does not offer it. If no vote is open, delete the resolution and recreate it.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Adding or deleting a resolution requires "Edit the Syndic module".' },
    related: [{ label: 'Resolution results', helpId: 'syndic.assemblees.detail.resultats' }],
    keywords: ['resolution', 'majority', 'article 24', 'article 25', 'article 26', 'unanimity', 'shares']
  },
  {
    id: 'syndic.assemblees.detail.resultats',
    kind: 'table',
    title: 'Resolution results',
    summary:
      'For each resolution, this table gives its rule, the "For", "Against" and "Abstention" votes (in units and shares) and its result.',
    purpose: 'It lets you follow the vote in real time. Results are final at closing.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Resolution', description: 'Title of the resolution.' },
        { key: 'rule', label: 'Rule', description: 'Majority rule applied.' },
        { key: 'for', label: 'For', description: 'Number of units and shares voting "For".' },
        { key: 'against', label: 'Against', description: 'Number of units and shares voting "Against".' },
        { key: 'abstain', label: 'Abstention', description: 'Number of units and shares abstaining.' },
        {
          key: 'reference',
          label: 'Reference total',
          description: 'Total against which "For" is compared: the shares cast for article 24, all shares otherwise.'
        },
        { key: 'result', label: 'Result', description: 'Calculated decision (see the statuses).' },
        { key: 'actions', label: 'Actions', description: '"Delete", only if no vote is open or entered.' }
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'No vote recorded.' },
        { value: 'APPROVED', label: 'Approved', description: 'The majority rule is met.' },
        { value: 'REJECTED', label: 'Rejected', description: 'The majority rule is not met.' }
      ],
      notes: [
        '"Voting in progress" replaces the result while a vote is open and the meeting is not closed: the provisional decision is hidden.',
        'An absent unit does not vote: any ballots it has are not counted.'
      ]
    },
    steps: [
      { title: 'Read the votes', detail: 'Each column gives the units and the shares.' },
      { title: 'Filter', detail: 'Search by title or filter by "Result".' }
    ],
    consequences: [
      'The filter only changes the display: no count is recalculated.',
      'The result is recalculated at each vote and frozen at closing.'
    ],
    faq: [
      {
        q: 'Why is the result "Voting in progress"?',
        a: 'A vote is open. The decision only appears when the vote or the session is closed.'
      },
      {
        q: 'Why has "Delete" disappeared?',
        a: 'A vote is open, closed or entered: the resolution can no longer be deleted.'
      },
      {
        q: 'Do shares count for more than the number of units?',
        a: 'Yes: the result is calculated in shares; a unit with 400 shares weighs four times a unit with 100.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Viewing requires "View the Syndic module".' },
    related: [{ label: 'Add a resolution', helpId: 'syndic.assemblees.detail.resolution' }],
    keywords: ['result', 'vote', 'shares', 'approved', 'rejected', 'majority']
  },
  {
    id: 'syndic.assemblees.detail.quorum',
    kind: 'section',
    title: 'Quorum',
    summary:
      'The quorum is the share of present or represented shares compared to the co-ownership total. It is given for information only.',
    purpose: 'It shows whether the meeting is sufficiently represented before you record the votes.',
    howToRead: {
      notes: [
        'Percentage = represented shares ÷ total shares. The line below gives these two figures.',
        'Counted are the units signed "Present" or "Represented", and those that voted without signing. A unit signed "Absent" is never counted.',
        'In the live console, "Present", "Represented" and "Online" count units, and "joined" counts the co-owners who opened their link.'
      ]
    },
    consequences: ['No quorum rule blocks a vote or a result: you are the judge.'],
    faq: [
      {
        q: 'How do I raise the quorum?',
        a: 'Sign in the present units, record the proxies or enter the votes: a unit that votes is counted present.'
      },
      {
        q: 'Why is a unit not counted?',
        a: 'It is signed "Absent", or it has neither attendance nor vote.'
      },
      {
        q: 'Is the quorum in the minutes?',
        a: 'Yes, it is included in the Word minutes.'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Lots and attendance', helpId: 'syndic.assemblees.detail.direct-presences' }],
    keywords: ['quorum', 'attendance', 'shares', 'represented']
  },
  {
    id: 'syndic.assemblees.detail.vote',
    kind: 'section',
    title: 'Agenda and votes (entry)',
    summary:
      'This card lets you enter by hand a unit\'s vote on each resolution. Choose the voting unit, then "For", "Against" or "Abstention".',
    purpose:
      'This is the standard entry, without the live option: the manager records the votes cast in the room or received in writing.',
    steps: [
      {
        title: 'Choose the voting unit',
        detail:
          'The "Voting unit" menu names the unit\'s owner(s) at the date of the meeting, and the proxy holder if there is a proxy.'
      },
      { title: 'Vote', detail: 'Click "For", "Against" or "Abstention".' },
      { title: 'Correct', detail: 'Vote again with the same unit: the new vote replaces the old one.' }
    ],
    consequences: [
      'The vote is recorded with the origin "Entered by the manager" and replaces any online vote of the same unit; an online owner cannot replace a vote entered by the manager.',
      'A unit that votes is signed "Present" if it was not yet. A unit signed "Absent" cannot vote: change its attendance first.',
      'The result and the quorum are recalculated immediately. Voting is possible as long as the meeting is neither closed nor cancelled.'
    ],
    faq: [
      {
        q: 'A co-owner has several units: how many votes?',
        a: 'One vote per unit: enter each unit\'s vote in the "Voting unit" menu.'
      },
      {
        q: 'What does "represented by" mean?',
        a: 'A proxy is recorded for this voter. The vote is still entered unit by lot.'
      },
      {
        q: 'Why can I no longer vote?',
        a: 'The meeting is closed or cancelled: votes are frozen.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Entering a vote requires "Edit the Syndic module".' },
    related: [
      { label: 'Resolution results', helpId: 'syndic.assemblees.detail.resultats' },
      { label: 'Proxies', helpId: 'syndic.assemblees.detail.pouvoirs' }
    ],
    keywords: ['vote', 'enter a vote', 'voting unit', 'for', 'against', 'abstention']
  },
  {
    id: 'syndic.assemblees.detail.pouvoirs',
    kind: 'table',
    title: 'Proxies',
    summary:
      "This table lists the meeting's proxies: a co-owner (the grantor) gives a person (the proxy holder) a mandate to represent them.",
    purpose: 'A proxy lets an absent co-owner be represented and counted in the quorum.',
    howToRead: {
      columns: [
        { key: 'grantor', label: 'Principal', description: 'The co-owner being represented.' },
        { key: 'lots', label: 'Units', description: "This co-owner's lots." },
        { key: 'representative', label: 'Proxy holder', description: 'The person representing them.' },
        { key: 'actions', label: 'Actions', description: '"Remove" the proxy.' }
      ]
    },
    steps: [
      {
        title: 'Add a proxy',
        detail:
          '"Add a proxy": choose the grantor (a co-owner of the co-ownership) then the proxy holder (another agency contact).'
      },
      { title: 'Save', detail: 'The proxy appears in the table.' },
      { title: 'Remove', detail: '"Remove", with confirmation.' }
    ],
    consequences: [
      'One proxy per grantor and per meeting. The proxy holder cannot be the grantor.',
      'With the session open, the grantor\'s units become "Represented" (except those already "Present"); removing the proxy returns them to "Absent". The proxy holder cannot be an owner of the unit they represent.',
      'No change is possible after closing or cancelling.'
    ],
    faq: [
      {
        q: 'Why is "Add a proxy" greyed out?',
        a: 'No unit has a registered co-owner.'
      },
      {
        q: 'Can the proxy holder vote?',
        a: 'With the live option, they can vote online for the represented unit, unless the owner has already voted themselves. The manager can also enter the vote.'
      },
      {
        q: 'Can a proxy holder give a proxy to someone else?',
        a: 'No: a proxy cannot be passed on.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Adding or removing a proxy requires "Edit the Syndic module".' },
    related: [{ label: 'Lots and attendance', helpId: 'syndic.assemblees.detail.direct-presences' }],
    keywords: ['proxy', 'power of attorney', 'grantor', 'proxy holder', 'represented']
  },
  {
    id: 'syndic.assemblees.detail.convocation',
    kind: 'section',
    title: 'Notice to co-owners',
    summary:
      'The notice informs co-owners of the date, time and place of the meeting. It is sent from the record, or downloaded in Word for one lot.',
    purpose:
      'There are two distinct actions: sending a message to all co-owners, and the Word document for one unit, to print or send yourself.',
    steps: [
      {
        title: 'Enter the agenda',
        detail: 'A confirmation window recalls the number of items entered, or warns that there are none.'
      },
      {
        title: 'Send',
        detail: '"Send convocations" ("Scheduled" meeting). After a first send, the button becomes "Resend the notice".'
      },
      {
        title: 'Read the result',
        detail: 'A message gives the number of e-mails sent, failed and without an e-mail address.'
      },
      { title: 'Word notice', detail: 'Choose a unit in "Choose a unit", then "Notice of meeting (Word)".' }
    ],
    consequences: [
      'Recipients: the current owners of the units, joint owners included, once each. Units with 0 shares are not notified.',
      'Channels: e-mail, if the "General meeting notice" notification is enabled in Communication > Notifications e-mail and the co-owner has an address; WhatsApp message if this notification is enabled and a number is known. Otherwise nothing goes out on that channel.',
      'The message gives the co-ownership, date, time and place. The personal link for following and voting online only appears with the "Live AG and video" option. The default message does not contain the agenda.',
      'A resend only targets co-owners who failed or were never served. It is limited to one every 10 minutes per meeting and only possible for a "Scheduled" meeting.',
      "The Word notice includes the unit's co-owner, the agenda (otherwise the resolutions), the date, the place and the quorum; it sends nothing.",
      'The application does not check the delay between sending and the date of the meeting.'
    ],
    faq: [
      {
        q: 'Why was no e-mail sent?',
        a: 'The message displayed says why: notification disabled, no co-owner to notify, or co-owners without an e-mail address.'
      },
      {
        q: 'If I resend, do all co-owners receive a second message?',
        a: 'No: only those who were not served (failed or never sent).'
      },
      {
        q: 'The "Resend" button says to wait. Why?',
        a: 'A resend is only possible every 10 minutes for the same meeting.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Sending or resending requires "Edit the Syndic module"; the Word notice requires "View the Syndic module".'
    },
    related: [
      { label: 'Calendar', helpId: 'syndic.assemblees.detail.ordre-du-jour' },
      { label: 'Live', helpId: 'syndic.assemblees.detail.direct' }
    ],
    keywords: ['notify', 'notice', 'e-mail', 'WhatsApp', 'resend', 'Word', 'co-owners']
  },
  {
    id: 'syndic.assemblees.detail.direct',
    kind: 'section',
    title: 'Live',
    summary:
      'The "Live" card is the session console: quorum, attendance, opening votes, personal links, video, discussion and recordings. It refreshes every 5 seconds.',
    purpose:
      'It is used to run the session, in the room or remotely, and to let co-owners vote online with their personal link. It is hidden for a cancelled meeting.',
    steps: [
      { title: 'Prepare', detail: 'Before opening, check the participants and their personal links.' },
      { title: 'Open the session', detail: 'The quorum and votes update here.' },
      { title: 'Sign in attendance', detail: '"Lots and attendance" card.' },
      { title: 'Run the vote', detail: '"Live resolutions" card: "Open the vote", then "Close the vote".' },
      { title: 'Project', detail: 'The "Project" button opens the projection screen in a new tab.' }
    ],
    consequences: [
      'Paid option: "Live AG and video", 20 000 FCFA excl. VAT per month, reserved for the Syndic pack and included in the Integrated Operator pack. It adds the console, personal links, online voting, projection and video.',
      'Without the option, while the subscription is strictly enforced, the card shows "Live AG and video — option not subscribed" with the "Request the option" button. Without strict enforcement, nothing is blocked.',
      'The standard meeting (notice, resolutions, entered votes, proxies, minutes) remains usable without the option.'
    ],
    faq: [
      {
        q: 'The console does not load: what should I do?',
        a: 'Click "Try again" in the banner: the console keeps the last data displayed.'
      },
      {
        q: 'Why does the refresh stop?',
        a: 'It pauses when the tab is hidden or an attendance menu is open, and stops at closing.'
      },
      {
        q: 'Where do I request the option?',
        a: 'With the "Request the option" button, which leads to the Subscription page.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Paid "Live AG and video" option of the Syndic pack (extension at 20 000 FCFA excl. VAT per month). Viewing the session requires "View the Syndic module"; signing attendance, opening or closing a vote, issuing links, managing video and discussion require "Edit the Syndic module".'
    },
    related: [
      { label: 'Lots and attendance', helpId: 'syndic.assemblees.detail.direct-presences' },
      { label: 'Live resolutions', helpId: 'syndic.assemblees.detail.direct-votes' },
      { label: 'Participants and personal links', helpId: 'syndic.assemblees.detail.direct-participants' },
      { label: 'Video conference', helpId: 'syndic.assemblees.detail.direct-visio' }
    ],
    keywords: ['live', 'session', 'console', 'online vote', 'option', 'video', 'EXT_AG_EN_DIRECT', 'project']
  },
  {
    id: 'syndic.assemblees.detail.direct-presences',
    kind: 'table',
    title: 'Lots and attendance',
    summary:
      'This table lists the units of the session and lets you sign them in: present, represented or absent. Attendance feeds the quorum.',
    purpose: 'It sets who is present or represented, hence which unit counts in the quorum and can vote.',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'Unit number (sortable).' },
        { key: 'shares', label: 'Shares', description: 'Weight of the lot.' },
        { key: 'voters', label: 'Voter(s)', description: 'Owner(s) of the unit at the date of the meeting.' },
        {
          key: 'online',
          label: 'Online',
          description: 'Online if the co-owner is connected through their personal link.'
        },
        {
          key: 'status',
          label: 'Status',
          description: "Attendance of the unit; the proxy holder's name is shown if represented."
        },
        { key: 'attendance', label: 'Attendance', description: "Menu to change the unit's attendance." }
      ],
      statuses: [
        { value: 'PRESENT', label: 'Present', description: 'The unit counts in the quorum and can vote.' },
        {
          value: 'REPRESENTED',
          label: 'Represented',
          description: 'A proxy holder represents it; it counts in the quorum.'
        },
        { value: 'ABSENT', label: 'Absent', description: 'Outside the quorum; cannot vote.' }
      ]
    },
    steps: [
      {
        title: 'One unit',
        detail:
          'In "Attendance": "Present in the room", "Absent", "Represented" (if a proxy exists) or "Represented by…".'
      },
      { title: 'Several units', detail: 'Tick units, then "Mark present in the room" or "Mark absent".' }
    ],
    consequences: [
      'An "Absent" unit leaves the quorum and its ballots are no longer counted.',
      '"Present online" is not chosen by hand: the unit becomes online when its owner joins the meeting through their link.',
      'The owner of a unit cannot be its proxy holder.',
      'After closing, the table is read-only.'
    ],
    faq: [
      {
        q: 'Why is "Represented" greyed out?',
        a: 'No proxy is registered for this lot. Use "Represented by…" or add a proxy.'
      },
      {
        q: 'The table moves while I choose?',
        a: 'The refresh pauses when a menu is open.'
      },
      {
        q: 'What happens to an absent unit that had voted?',
        a: 'Its vote is no longer counted in the results.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: '"Live AG and video" option. Signing attendance requires "Edit the Syndic module".'
    },
    related: [{ label: 'Quorum', helpId: 'syndic.assemblees.detail.quorum' }],
    keywords: ['attendance', 'presence', 'attendance sheet', 'absent', 'represented', 'lots']
  },
  {
    id: 'syndic.assemblees.detail.direct-votes',
    kind: 'section',
    title: 'Live resolutions',
    summary:
      'This card runs the vote of each resolution during the session: open the vote, follow participation, close it. Connected co-owners vote with their personal link.',
    purpose: 'It manages online voting; entering by hand remains possible with "Enter a vote".',
    howToRead: {
      statuses: [
        { value: 'PENDING', label: 'Vote not open yet', description: 'The vote has not been opened.' },
        { value: 'OPEN', label: 'Vote open', description: 'Present co-owners can vote online.' },
        { value: 'CLOSED', label: 'Vote closed', description: 'The vote is over; it can be reopened.' }
      ],
      notes: [
        '"Participation" gives the number of units that voted out of the total.',
        '"Vote origin" distinguishes online votes, proxy holders\' votes and those entered by the manager.'
      ]
    },
    steps: [
      { title: 'Open', detail: '"Open the vote" (the session must be open).' },
      { title: 'Follow', detail: 'Participation and shares update.' },
      { title: 'Close', detail: '"Close the vote", with confirmation.' },
      { title: 'Reopen', detail: '"Reopen the vote" on a closed vote.' },
      { title: 'Enter by hand', detail: '"Enter a vote" takes you to the "Agenda and votes" card.' }
    ],
    consequences: [
      'Closing the vote shows the result to connected co-owners.',
      'Online vote: the co-owner must have joined the meeting, the session must be in progress and the vote open. A vote entered by the manager cannot be changed online; a proxy holder does not replace the vote given by the owner themselves.',
      'Closing the session closes the votes still open.'
    ],
    faq: [
      {
        q: 'Why is "Open the vote" missing?',
        a: 'The session is not "In progress", or the vote is already open.'
      },
      {
        q: 'Where is the majority rule?',
        a: 'Under the title of each resolution, with its explanation.'
      },
      {
        q: 'Does voting go through the video?',
        a: 'No: voting is done through the personal link or entered by the manager.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: '"Live AG and video" option. Opening or closing a vote requires "Edit the Syndic module".'
    },
    related: [
      { label: 'Agenda and votes (entry)', helpId: 'syndic.assemblees.detail.vote' },
      { label: 'Resolution results', helpId: 'syndic.assemblees.detail.resultats' }
    ],
    keywords: ['online vote', 'open the vote', 'close the vote', 'participation', 'live resolutions']
  },
  {
    id: 'syndic.assemblees.detail.direct-participants',
    kind: 'table',
    title: 'Participants and personal links',
    summary:
      'This table lists the notified co-owners and their personal link to join the meeting online. You can copy or revoke these links.',
    purpose: 'Each co-owner accesses the meeting, the video and the vote through a link of their own.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Participant', description: 'Name, and e-mail if any.' },
        { key: 'lots', label: 'Units', description: 'Numbers of their lots.' },
        { key: 'joined', label: 'Joined', description: 'Date of their first arrival, or "Not yet" (not yet).' },
        {
          key: 'online',
          label: 'Online',
          description: 'Online or offline; "In the video meeting" if they are in the room.'
        },
        { key: 'links', label: 'Active links', description: 'Number of links still valid.' },
        { key: 'actions', label: 'Actions', description: '"Copy link" and "Revoke links".' }
      ]
    },
    steps: [
      {
        title: 'Copy the link',
        detail:
          '"Copy link" generates a link and copies it; if it cannot be copied, a window displays it so you can copy it by hand.'
      },
      { title: 'Pass it on', detail: 'Send it to the co-owner yourself.' },
      { title: 'Revoke', detail: '"Revoke links", with confirmation.' }
    ],
    consequences: [
      'Revoking makes the links already sent to this participant unusable.',
      'A link remains valid up to 7 days after the date of the meeting.',
      'After closing, the actions are disabled.'
    ],
    faq: [
      {
        q: 'Do co-owners receive their link automatically?',
        a: 'Yes, in the notice, if the option is subscribed. You can copy another one here.'
      },
      {
        q: 'Why is "Revoke links" greyed out?',
        a: 'This participant has no active link.'
      },
      {
        q: 'What is the difference between "Joined" and "Online"?',
        a: '"Joined" dates from their first arrival; "Online" says whether they are connected right now.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: '"Live AG and video" option. Copying or revoking requires "Edit the Syndic module".'
    },
    related: [{ label: 'Notice to co-owners', helpId: 'syndic.assemblees.detail.convocation' }],
    keywords: ['personal link', 'participants', 'revoke', 'copy the link', 'online']
  },
  {
    id: 'syndic.assemblees.detail.direct-visio',
    kind: 'section',
    title: 'Video conference',
    summary:
      'Two tools coexist: the "Built-in video meeting" built into ImmoTopia, with its moderator controls, and a simple "Video conference" link to Zoom, Meet or Teams.',
    purpose:
      'It lets remote co-owners follow the meeting. The built-in video is only displayed if it is available on your platform.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Participant', description: 'Name; "Manager" for moderators.' },
        {
          key: 'state',
          label: 'Status',
          description: '"Hand raised" (hand raised) or "writing disabled" (writing muted).'
        },
        { key: 'media', label: 'Microphone and camera', description: 'State of the microphone and camera.' },
        { key: 'joinedAt', label: 'Joined at', description: 'Time of entry into the room.' },
        { key: 'actions', label: 'Actions', description: 'Moderation controls.' }
      ]
    },
    steps: [
      {
        title: 'Open the video',
        detail: '"Open the video meeting" shows the room; "Close the video meeting" hides it.'
      },
      {
        title: 'Moderate',
        detail: '"Mute microphone", "Turn off camera", "Forbid microphone and camera", "Disable writing", "Remove".'
      },
      {
        title: 'All microphones',
        detail: 'The "Forbid microphones for everyone" switch mutes everyone; co-owners keep the raised hand.'
      },
      { title: 'External link', detail: '"Video conference" card: paste a link starting with https://, then "Save".' }
    ],
    consequences: [
      '"Remove" removes the person from the room; they can come back, without speaking rights, unless you tick "Also revoke their personal links".',
      'Voting never goes through the video.',
      'Closing or cancelling the meeting closes the room.'
    ],
    faq: [
      {
        q: 'Why is there no "Built-in video meeting"?',
        a: 'It is not available on your platform. The external link remains usable.'
      },
      {
        q: 'My link is rejected.',
        a: 'It must start with https://.'
      },
      {
        q: 'Can the session be recorded?',
        a: 'Yes if recording is available: "Record the meeting", once the session is open. See the "Recordings" card.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: '"Live AG and video" option. Moderating the video requires "Edit the Syndic module".'
    },
    related: [
      { label: 'Discussion', helpId: 'syndic.assemblees.detail.direct-discussion' },
      { label: 'Recordings', helpId: 'syndic.assemblees.detail.direct-enregistrements' }
    ],
    keywords: ['video', 'video conference', 'microphone', 'camera', 'raised hand', 'Zoom', 'Meet', 'Teams']
  },
  {
    id: 'syndic.assemblees.detail.direct-discussion',
    kind: 'section',
    title: 'Discussion',
    summary:
      'The discussion is a moderated written exchange during the video. You open or close it to co-owners and can hide messages.',
    purpose: 'It keeps a written thread during the session. This card only appears if the discussion is available.',
    steps: [
      { title: 'Open or close', detail: 'The "Discussion open to co-owners" switch.' },
      { title: 'Write', detail: 'During the session, you can write even with the discussion closed.' },
      { title: 'Hide', detail: '"Hide" hides a message from co-owners; "Restore" restores it.' }
    ],
    consequences: [
      'A hidden message remains readable, greyed out, for you.',
      'The discussion is read-only after the session.'
    ],
    faq: [
      { q: 'Is a hidden message deleted?', a: 'No, it is only hidden from co-owners.' },
      {
        q: 'Who can write?',
        a: 'Co-owners when the discussion is open and their writing is not muted; you always, during the session.'
      },
      { q: "How do I mute someone's writing?", a: 'In the video table, with "Disable writing".' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: '"Live AG and video" option. Moderating requires "Edit the Syndic module".'
    },
    related: [{ label: 'Video conference', helpId: 'syndic.assemblees.detail.direct-visio' }],
    keywords: ['discussion', 'messages', 'chat', 'hide', 'moderation']
  },
  {
    id: 'syndic.assemblees.detail.direct-enregistrements',
    kind: 'table',
    title: 'Recordings',
    summary:
      "This table lists the session's recordings: their status, start, duration and size. You can play, download or delete them.",
    purpose:
      'It keeps a record of the session. The card only appears if recording is available or if recordings already exist.',
    howToRead: {
      columns: [
        {
          key: 'status',
          label: 'Status',
          description: 'State of the recording; the cause is shown in case of failure.'
        },
        { key: 'startedAt', label: 'Start', description: 'Start date and time.' },
        { key: 'duration', label: 'Duration', description: 'Length of the file.' },
        { key: 'size', label: 'Size', description: 'Size of the file.' },
        { key: 'actions', label: 'Actions', description: '"Play", "Download", "Try again", "Delete".' }
      ],
      statuses: [
        { value: 'RECORDING', label: 'In progress', description: 'The recording is running.' },
        { value: 'PROCESSING', label: 'Processing', description: 'The file is being prepared.' },
        { value: 'AVAILABLE', label: 'Available', description: 'The file can be played or downloaded.' },
        { value: 'FAILED', label: 'Failed', description: 'Processing failed; "Try again" restarts it.' },
        { value: 'DELETED', label: 'Deleted', description: 'The file has been erased.' }
      ]
    },
    steps: [
      { title: 'Start', detail: '"Record the meeting" in the "Built-in video meeting" card, session open.' },
      { title: 'Stop', detail: '"Stop recording".' },
      { title: 'View', detail: '"Play" or "Download" once it is "Available".' }
    ],
    consequences: [
      'Deleting permanently erases the file; it is irreversible.',
      'The recording notice appears in the notice when recording is enabled.',
      'If processing takes too long, the list stops refreshing: reload the page.'
    ],
    faq: [
      { q: 'Why is "Record the meeting" greyed out?', a: 'The session is not open yet, or it is closed.' },
      { q: 'What should I do with a failed recording?', a: 'Click "Try again"; otherwise delete it.' },
      { q: 'Can the recording be edited?', a: 'No: you can only play it, download it or delete it.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: '"Live AG and video" option. Playing or downloading requires "View the Syndic module"; starting, stopping, retrying or deleting requires "Edit the Syndic module".'
    },
    related: [{ label: 'Video conference', helpId: 'syndic.assemblees.detail.direct-visio' }],
    keywords: ['recording', 'video', 'session', 'download', 'MP4']
  },

  // ------------------------------------------------------------------ Documents
  {
    id: 'syndic.documents.liste',
    kind: 'page',
    title: 'Document vault',
    summary:
      'The vault gathers the co-ownership documents: rules, minutes, diagnostics, insurance, budgets. You decide which ones co-owners see on their portal.',
    purpose:
      'It centralises the documents useful for management and tracks expiry dates, for example of an insurance policy or a diagnostic.',
    steps: [
      { title: 'Add', detail: '"Add a document" button: title, type, file, visibility, expiry date.' },
      { title: 'View', detail: '"Download" retrieves the file; "Open" follows an external link.' },
      { title: 'Manage visibility', detail: '"Make visible" or "Remove from portal" in the "Portal" column.' }
    ],
    consequences: [
      'A visible document can be viewed and downloaded by co-owners on their portal.',
      'An expired date is shown in red; nothing is sent automatically.'
    ],
    faq: [
      { q: 'Which files can I upload?', a: 'PDF, Word, JPEG, PNG or TIFF, up to 10 MB.' },
      { q: 'Who sees my documents?', a: 'The agency teams. Co-owners only see those marked "Visible on the portal".' },
      { q: 'Can I delete a document?', a: 'Not from this screen: you can only remove it from the portal.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager'],
      note: 'Viewing and downloading require "View the Syndic module"; adding a document or changing its visibility requires "Edit the Syndic module".'
    },
    related: [{ label: 'Co-ownership documents', helpId: 'syndic.documents.tableau' }],
    keywords: ['documents', 'vault', 'rules', 'minutes', 'insurance', 'diagnostic', 'portal']
  },
  {
    id: 'syndic.documents.tableau',
    kind: 'table',
    title: 'Co-ownership documents',
    summary:
      'This table lists the documents with their type, expiry and visibility to co-owners. You can download them and change their visibility.',
    purpose: 'It helps you find a document and decide whether it is shared with co-owners.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Title', description: 'Name of the document.' },
        {
          key: 'type',
          label: 'Type',
          description: 'Co-ownership regulations, General meeting minutes, Diagnostic, Insurance, Budget or Other.'
        },
        { key: 'expiresAt', label: 'Expiry', description: 'Expiry date, in red if past; "No expiry" otherwise.' },
        {
          key: 'visibleToCoOwners',
          label: 'Visible on the portal',
          description: '"Yes" if co-owners see it on their portal.'
        },
        { key: 'fileUrl', label: 'Document', description: '"Download" (uploaded file) or "Open" (external link).' },
        {
          key: 'visibility',
          label: 'Portal',
          description: '"Make visible" or "Remove from portal"; shown with the edit right.'
        }
      ]
    },
    steps: [
      {
        title: 'Search',
        detail: 'Search by title, file name or type; filter by type, visibility, date added or expiry.'
      },
      { title: 'Download', detail: '"Download" or "Open".' },
      { title: 'Change visibility', detail: 'The button in the "Portal" column, then confirm.' }
    ],
    consequences: [
      'Making visible gives all co-owners of the co-ownership access to the document; removing it from the portal hides it from them.',
      'The file can only be downloaded through the application, after the agency is checked.'
    ],
    faq: [
      { q: 'Why is the "Portal" column missing?', a: 'You do not have the right to edit the Syndic module.' },
      {
        q: 'Is a document visible as soon as it is added?',
        a: 'By default only the rules and the meeting minutes; other types are not, unless you tick the box.'
      },
      { q: 'Can the list be exported?', a: 'Yes, with the table export.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Changing visibility requires "Edit the Syndic module".' },
    related: [{ label: 'Add a document', helpId: 'syndic.documents.ajout' }],
    keywords: ['documents', 'visible', 'portal', 'expiry', 'download']
  },
  {
    id: 'syndic.documents.ajout',
    kind: 'section',
    title: 'Add a document',
    summary: 'This window puts a document in the vault: title, type, file, visibility to co-owners and expiry date.',
    purpose: 'It files a co-ownership document and decides whether co-owners can view it.',
    steps: [
      {
        title: 'Title and type',
        detail:
          'Required. Types: "Condominium rules", "General meeting minutes", "Diagnostic", "Insurance", "Budget", "Other".'
      },
      {
        title: 'Visibility',
        detail:
          'The "Visible to co-owners" box is ticked automatically for the rules and the meeting minutes; you can change it.'
      },
      { title: 'File', detail: '"Choose a file": one only, PDF, Word, JPEG, PNG or TIFF, 10 MB at most.' },
      { title: 'Expiry date', detail: 'Optional.' },
      { title: 'Confirm', detail: 'Click "Add".' }
    ],
    consequences: [
      'A visible document can be viewed and downloaded by co-owners on their portal.',
      'The file is checked: its content must match its type.'
    ],
    faq: [
      {
        q: 'Why is the file rejected?',
        a: 'Format not accepted, file too large or content that does not match the extension.'
      },
      { q: 'Is the file required?', a: 'Yes: "Please select a file" is displayed otherwise.' },
      {
        q: 'Can I add the meeting minutes?',
        a: 'Yes: choose the type "General meeting minutes"; it will be visible to co-owners by default.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Adding a document requires "Edit the Syndic module".' },
    related: [{ label: 'Status, closing and minutes', helpId: 'syndic.assemblees.detail.statuts' }],
    keywords: ['add a document', 'upload', 'minutes', 'rules', 'file']
  }
];

export default entries;
