import type { HelpEntry } from '../../../types';

/** Zone « echeances » du module « locatif » (en). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.echeances.liste',
    kind: 'page',
    title: 'Instalment list',
    summary: `Find your agency's rent instalments here: what is due, what is paid and what remains to be paid. This is the screen to collect a rent payment, send a payment link or remind a tenant.`,
    purpose: `An instalment is a rent payment due for a period (a month, for example), with its deadline. A lease's instalments are generated from the lease page; this screen is then used to follow payments and delays.\n\nThe same screen appears in the "Instalments" tab of a lease page: it then shows only that lease's instalments.`,
    steps: [
      {
        title: 'Search',
        detail: `Type a lease number, a property or a tenant name in the search field.`
      },
      {
        title: 'Filter',
        detail: `Use "Status", "Overdue only", "Due date" and, outside a lease page, "Tenant".`
      },
      {
        title: 'Collect a rent payment in cash',
        detail: `Click "Collect", check the amount, tenant and instalment, then "Confirm the payment".`
      },
      {
        title: 'Record another payment',
        detail: `Click "Payment…" (on a phone: "Detailed payment…") to choose the payment method, amount and date.`
      },
      {
        title: 'Send a payment link or a reminder',
        detail: `"Send a payment link" and "Send a reminder" buttons on the row.`
      },
      {
        title: 'Remind several tenants',
        detail: `"Send reminders in bulk" button, at the top of the screen.`
      },
      {
        title: 'Open the detail',
        detail: `Click "View" to open the instalment page.`
      },
      {
        title: 'Export',
        detail: `"Export" button: all instalments matching your filters are exported, not only the page shown.`
      }
    ],
    consequences: [
      `"Collect" immediately records a cash payment equal to the remaining balance, dated today, and links it to the instalment. You are asked to confirm before it is recorded.`,
      `In a lease tab, "Generate instalments" creates the lease's instalment plan. It is refused if instalments already exist or if the lease is canceled or ended.`,
      `"Recalculate statuses and penalties" updates the statuses of the lease's instalments, then calculates penalties for all overdue instalments of your agency, not only this lease.`,
      `"Delete all instalments" cannot be undone. It is refused if a payment is linked to an instalment of the lease, or if the lease ended less than 30 days ago.`,
      `A payment link or reminder that has been sent cannot be recalled.`
    ],
    faq: [
      {
        q: 'How is the "Amount outstanding" calculated?',
        a: `Amount due (rent + service charges + other fees + penalties) minus what has already been paid. A settled instalment no longer shows collection actions.`
      },
      {
        q: `Why does the status not change after a recalculation?`,
        a: `An instalment is "Overdue" the day after its date if nothing is paid, "Partial" as soon as a payment is recorded, and "Paid" when everything is settled. A "Draft" or "Cancelled" status cannot be filtered but is displayed.`
      },
      {
        q: `I do not see "Collect" or "Generate instalments". Why?`,
        a: `These actions depend on your permissions: "Create payments" and "Allocate payments" to collect, "Generate instalments" to generate. Ask your agency administrator.`
      },
      {
        q: `Why is there no link or reminder button on a row?`,
        a: `These buttons only appear if the instalment is "Not yet due", "Partial" or "Overdue", with a remaining balance, and if the lease is "Active".`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Viewing instalments requires "View instalments". Collecting requires "Create payments" and "Allocate payments"; the payment link requires "Create payments"; reminders require "Allocate payments"; generating, recalculating and deleting instalments require "Generate instalments".`
    },
    related: [
      { label: `How to read the instalment table`, helpId: 'locatif.echeances.liste.tableau' },
      { label: `Bulk reminders`, helpId: 'locatif.echeances.relance-lot' },
      { label: `Instalment page`, helpId: 'locatif.echeances.fiche' },
      { label: 'Payment list', helpId: 'locatif.paiements.liste' },
      { label: 'Lease list', helpId: 'locatif.baux.liste' }
    ],
    keywords: [
      'instalment',
      'installment',
      'rent',
      'collect',
      'collection',
      'unpaid',
      'late',
      'balance',
      'reminder',
      'recovery',
      'generate instalments'
    ]
  },
  {
    id: 'locatif.echeances.liste.tableau',
    kind: 'table',
    title: 'Instalment table',
    summary: `Each row is a rent instalment. The "Amount outstanding" is the figure to look at first.`,
    howToRead: {
      columns: [
        {
          key: 'bail',
          label: 'Lease',
          description: `The lease number, with the property concerned below it. Not shown in a lease tab.`
        },
        { key: 'locataire', label: 'Tenant', description: `The lease's main tenant. Not shown in a lease tab.` },
        { key: 'periode', label: 'Period', description: `The period covered by the rent (month and year).` },
        { key: 'due', label: 'Due date', description: `The payment deadline.` },
        { key: 'du', label: 'Amount due', description: `Rent, charges, other fees and penalties added together.` },
        { key: 'reste', label: 'Amount outstanding', description: `The amount due minus what has already been paid.` },
        { key: 'statut', label: 'Status', description: `The state of the instalment (see the statuses below).` },
        {
          key: 'actions',
          label: 'Actions',
          description: `View, Collect, Payment…, payment link, reminder. Only the actions possible on the row and allowed by your permissions are shown.`
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: `Instalment generated but not yet payable.` },
        { value: 'DUE', label: 'Not yet due', description: `Payable, no payment recorded, deadline not yet passed.` },
        { value: 'PARTIAL', label: 'Partial', description: `A payment has been recorded, but a balance remains.` },
        { value: 'PAID', label: 'Paid', description: `The amount due is fully settled.` },
        { value: 'OVERDUE', label: 'Overdue', description: `The deadline has passed and nothing is paid.` },
        { value: 'CANCELED', label: 'Cancelled', description: `Canceled instalment: it is no longer payable.` }
      ],
      notes: [
        `On a phone, the table becomes a series of cards: the remaining balance comes first, and penalties only appear if there are any.`,
        `The "Status" filter offers "Not yet due", "Partial", "Paid" and "Overdue".`
      ]
    },
    steps: [
      { title: 'Collect', detail: `"Collect" settles the whole balance in cash, dated today, after confirmation.` },
      {
        title: 'Payment…',
        detail: `Opens the payment form: the proposed amount is the remaining balance, you can change it.`
      },
      { title: 'View', detail: `Opens the instalment page with the amount breakdown, payment links and reminders.` }
    ],
    consequences: [
      `After a collection, the remaining balance goes down and the status becomes "Partial" or "Paid".`,
      `The table shows 50 instalments per page.`
    ],
    faq: [
      {
        q: 'Where can I see the detail of penalties and payments?',
        a: `Open the instalment page with "View": it details rent, charges, other fees, penalties and amount paid.`
      },
      {
        q: 'An instalment is settled, why is there no button?',
        a: `When the remaining balance is zero, only the "View" action remains.`
      },
      {
        q: 'The amount due has changed, why?',
        a: `Penalties may have been added or adjusted on the instalment: they are included in the amount due.`
      }
    ],
    related: [
      { label: `Instalment page`, helpId: 'locatif.echeances.fiche' },
      { label: 'Late penalties', helpId: 'locatif.penalites.liste' }
    ],
    keywords: ['table', 'rents', 'unpaid', 'balance', 'column']
  },
  {
    id: 'locatif.echeances.relance-lot',
    kind: 'section',
    title: 'Bulk reminders',
    summary: `This window prepares and sends rent reminders to all the tenants concerned in one go. You first see who will be reminded, then you confirm.`,
    purpose: `It is used to remind several unpaid instalments without opening each page. From a lease page, it only concerns that lease.`,
    howToRead: {
      columns: [
        { key: 'periode', label: 'Period', description: `The rent period.` },
        { key: 'due', label: 'Due date', description: `The payment deadline.` },
        {
          key: 'retard',
          label: 'Overdue',
          description: `Number of days late, or "In N days" if the deadline has not been reached yet.`
        },
        { key: 'reste', label: 'Remaining due', description: `The amount still to be paid.` },
        {
          key: 'niveau',
          label: 'Next level',
          description: `The reminder level that will be sent: 1 friendly reminder, 2 firm reminder, 3 final notice.`
        },
        { key: 'canaux', label: 'Channels', description: `Email and/or WhatsApp usable for this tenant.` },
        {
          key: 'lien',
          label: 'Attached link',
          description: `"Payment link" if an online payment link will be attached to the message, "No link" otherwise.`
        },
        { key: 'motif', label: 'Reason', description: `For an excluded row, the reason why it cannot be reminded.` }
      ],
      notes: [
        `Rows are grouped by tenant and by lease, with the "Total due" of each group.`,
        `Only eligible rows can be ticked; all of them are ticked at the start, up to 200.`
      ]
    },
    steps: [
      {
        title: 'Set the filters',
        detail: `"Minimum delay (days)" (1 by default) and "Days before due date (0 to 30)" (0 by default), then "Refresh".`
      },
      { title: 'Check the list', detail: `Read the eligible rows and the exclusion reasons.` },
      {
        title: 'Tick or untick',
        detail: `Keep only the instalments to remind. The "Amount due for the selection" updates.`
      },
      {
        title: 'Send',
        detail: `Click "Send N reminder(s)". The result shows the number sent, skipped and failed, row by row.`
      }
    ],
    consequences: [
      `Sending cannot be undone. The lease's main tenant receives the message by e-mail and/or WhatsApp, depending on what is usable: their consent is needed, an address or number, and this notification must be enabled for your agency.`,
      `The message contains the amount due and the due date. It attaches an online payment link if online payment is available for your agency, and repeats the agency's Mobile Money numbers if they are recorded.`,
      `There are three levels (friendly reminder, firm reminder, final notice), at least 7 days between two levels. Once all three are sent, the instalment can no longer be reminded.`,
      `The server rechecks each row when sending: a reminder may be "Skipped" if the situation has changed (payment received, payment being verified...). Each sending is recorded in the instalment's history.`
    ],
    faq: [
      {
        q: `Why is an instalment greyed out?`,
        a: `It is excluded for a reason shown in "Reason": already settled, reminder too recent, no usable e-mail or WhatsApp, lease not active, etc.`
      },
      {
        q: `Can I remind more than 200 instalments?`,
        a: `The selection is limited to 200 instalments. Send in several rounds.`
      },
      {
        q: `What happens if sending is interrupted?`,
        a: `A message says so, and the reminders shown in the result have already gone out: do not send them again.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `The "Send reminders in bulk" button requires "Allocate payments".`
    },
    related: [
      { label: `Reminder for a single instalment`, helpId: 'locatif.echeances.relance-individuelle' },
      { label: 'Instalment list', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['remind', 'reminder', 'unpaid', 'WhatsApp', 'e-mail', 'recovery', 'bulk', 'batch']
  },
  {
    id: 'locatif.echeances.relance-individuelle',
    kind: 'section',
    title: `Reminder for an instalment`,
    summary: `This window shows what will be sent to the tenant for an instalment: level, channels and message preview. Nothing is sent until you click "Send the reminder".`,
    purpose: `It lets you remind a tenant who has not paid, by e-mail and/or WhatsApp, keeping a record of the sending in the instalment's history.`,
    steps: [
      { title: `Open the window`, detail: `"Send a reminder" button on the instalment's row or on its page.` },
      {
        title: 'Read the alerts',
        detail: `If the instalment cannot be reminded, the window gives the reasons and the send button stays greyed out.`
      },
      {
        title: 'Choose the level',
        detail: `"Reminder level": 1 friendly reminder, 2 firm reminder, 3 final notice. The proposed level follows the reminders already sent.`
      },
      {
        title: 'Choose the channels',
        detail: `Tick "Email" and/or "WhatsApp". Only the channels usable for this tenant are offered.`
      },
      {
        title: 'Check the message',
        detail: `The preview is indicative; the text sent follows your agency's message template. A banner says whether an online payment link will be attached.`
      },
      { title: 'Send', detail: `Click "Send the reminder", then read the result channel by channel.` }
    ],
    consequences: [
      `Sending cannot be undone. The lease's main tenant is notified, subject to their consent and to this notification being enabled for your agency.`,
      `The message contains the amount due and the due date, an online payment link if available, and the agency's Mobile Money numbers if they are recorded.`,
      `At least 7 days are needed between two levels, and there are three levels at most. If all channels fail, the payment link created for the reminder is canceled.`,
      `Each channel attempted adds a line to the instalment's reminder history.`
    ],
    faq: [
      {
        q: `Why is the "Send the reminder" button greyed out?`,
        a: `Either the instalment is excluded (the window gives the reason), or no channel is ticked or usable.`
      },
      {
        q: `Can I choose a level other than the proposed one?`,
        a: `Yes, the "Reminder level" list allows it. The spacing and maximum rules still apply.`
      },
      {
        q: 'What does "Reminder too recent" mean?',
        a: `A reminder was sent less than 7 days ago for this instalment: wait before sending another one.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `The button requires "Allocate payments". It only appears for an instalment "Not yet due", "Partial" or "Overdue" with a remaining balance, on an "Active" lease.`
    },
    related: [
      { label: 'Bulk reminders', helpId: 'locatif.echeances.relance-lot' },
      { label: 'Reminder history', helpId: 'locatif.echeances.fiche.relances' }
    ],
    keywords: ['remind', 'friendly reminder', 'final notice', 'WhatsApp', 'e-mail', 'unpaid']
  },
  {
    id: 'locatif.echeances.fiche',
    kind: 'page',
    title: `Instalment page`,
    summary: `This page details a rent instalment: amounts, dates, payment links sent and the reminder history. This is where you check the remaining balance before sending a reminder.`,
    purpose: `It answers the question "why is this rent not settled?": it shows what makes up the amount due, what has been paid and what has already been tried to obtain payment.`,
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: `Instalment generated but not yet payable.` },
        {
          value: 'DUE',
          label: 'Due date',
          description: `Payable, deadline not yet passed (the list calls it "Not yet due").`
        },
        { value: 'PARTIAL', label: 'Partial', description: `A payment is recorded, a balance remains.` },
        { value: 'PAID', label: 'Paid', description: `Fully settled.` },
        { value: 'OVERDUE', label: 'Overdue', description: `Deadline passed and nothing paid.` },
        {
          value: 'CANCELED',
          label: 'Cancelled',
          description: `Canceled instalment. Its status is then displayed as is on this page.`
        }
      ],
      notes: [
        `The status is shown at the top right and in the "Information" card.`,
        `This page does not list payments one by one: see the lease's payment list to view them.`
      ]
    },
    steps: [
      { title: 'Read the amounts', detail: `"Financial information" card: from "Rent" to "Amount outstanding".` },
      { title: 'Send a reminder', detail: `"Send a reminder" button, at the top, if the instalment qualifies.` },
      {
        title: 'Send a payment link',
        detail: `In the "Mobile Money payment link" card, "Send a payment link" button.`
      },
      { title: 'Check the history', detail: `"Reminder history" card: who sent a reminder, when, on which channel.` },
      { title: 'Go back to the lease', detail: `"Back" button at the top left.` }
    ],
    consequences: [
      `This page is read-only: no amount can be changed here.`,
      `Sending a reminder or a link cannot be undone: the message goes to the tenant.`
    ],
    faq: [
      {
        q: 'How is the "Total due" calculated?',
        a: `Rent, service charges, other fees and penalties added together. The "Amount outstanding" is this total minus the "Amount paid".`
      },
      {
        q: 'Why are some buttons missing?',
        a: `Reminder and link only appear if the instalment is "Due date", "Partial" or "Overdue" with a remaining balance, on an "Active" lease, and according to your permissions.`
      },
      {
        q: 'Where do I correct an amount?',
        a: `Not on this page. A penalty is adjusted from the lease's "Penalties" tab; a payment is managed from the payment list.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Viewing the page requires "View instalments". Payment links and the reminder history require "View payments"; creating or revoking a link requires "Create payments"; sending a reminder requires "Allocate payments".`
    },
    related: [
      { label: 'Page amounts', helpId: 'locatif.echeances.fiche.finances' },
      { label: 'Payment links', helpId: 'locatif.echeances.fiche.liens' },
      { label: 'Reminder history', helpId: 'locatif.echeances.fiche.relances' },
      { label: 'Instalment list', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['instalment detail', 'rent', 'remaining balance', 'total due', 'reminder', 'payment link']
  },
  {
    id: 'locatif.echeances.fiche.finances',
    kind: 'section',
    title: 'Financial information',
    summary: `This card breaks down the amount due for the instalment and shows what has been paid. The "Amount outstanding" is red while a balance remains, green when everything is settled.`,
    howToRead: {
      notes: [
        `"Rent", "Service charges", "Other fees" and "Penalties" add up to the "Total due".`,
        `"Amount paid" is the sum already linked to this instalment.`,
        `"Amount outstanding" = "Total due" minus "Amount paid".`,
        `Amounts are in FCFA.`
      ]
    },
    consequences: [
      `"Penalties" come from the late-penalty calculation or a manual adjustment: they increase the total due and the remaining balance.`
    ],
    faq: [
      {
        q: `Why is the total due higher than the rent?`,
        a: `It includes service charges, other fees and any late penalties.`
      },
      {
        q: 'Can an amount be changed here?',
        a: `No, the card is read-only.`
      }
    ],
    related: [{ label: 'Late penalties', helpId: 'locatif.penalites.liste' }],
    keywords: ['amount', 'total due', 'charges', 'penalties', 'remaining balance', 'paid']
  },
  {
    id: 'locatif.echeances.fiche.informations',
    kind: 'section',
    title: `Instalment information`,
    summary: `This card gives the period, the deadline, the status and the useful dates of the instalment.`,
    howToRead: {
      notes: [
        `"Period": the month and year covered. "Due date": the payment deadline.`,
        `"Payment date": only appears once the instalment has been settled.`,
        `"Currency": always displayed as FCFA.`,
        `"Creation date" and "Last updated": when the instalment was generated and last modified.`
      ]
    },
    faq: [
      {
        q: `Why is there no "Payment date"?`,
        a: `It only appears when the instalment is settled.`
      },
      {
        q: 'What does "Overdue" mean?',
        a: `The deadline has passed and no payment is recorded. As soon as a payment is recorded, the instalment becomes "Partial", even if late.`
      }
    ],
    keywords: ['period', 'deadline', 'status', 'payment date']
  },
  {
    id: 'locatif.echeances.fiche.liens',
    kind: 'section',
    title: 'Mobile Money payment link',
    summary: `This card lets you send the tenant a link to pay the balance by Mobile Money, and lists the links already created for this instalment.`,
    purpose: `A link saves the tenant a trip: they pay from their phone. The amount is recalculated at payment time and does not appear in the link.`,
    steps: [
      {
        title: 'Create a link',
        detail: `Click "Send a payment link" (only visible if the instalment is still payable).`
      },
      { title: 'Follow up', detail: `In the table, read the views, the link status and the payment state.` },
      {
        title: 'Revoke',
        detail: `"Revoke" on an "Active" link: the tenant will no longer be able to pay with this link.`
      }
    ],
    consequences: [
      `Revocation is immediate. It only concerns this link: you can send a new one.`,
      `A reminder can also attach a payment link: it then appears in this table.`
    ],
    faq: [
      {
        q: 'Why is this card missing?',
        a: `It requires the "View payments" permission.`
      },
      {
        q: `What does "To be checked" mean?`,
        a: `The online payment needs checking before being taken into account. Contact your administrator if this lasts.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Viewing the card requires "View payments"; creating or revoking a link requires "Create payments".`
    },
    related: [
      { label: 'How to read the link table', helpId: 'locatif.echeances.fiche.liens.tableau' },
      { label: 'Send a payment link', helpId: 'locatif.echeances.fiche.lien-envoi' }
    ],
    keywords: ['link', 'Mobile Money', 'pay online', 'Orange Money', 'Wave', 'MTN']
  },
  {
    id: 'locatif.echeances.fiche.liens.tableau',
    kind: 'table',
    title: 'Payment link table',
    summary: `Each row is a link created for this instalment. It shows its validity, its views and the payment obtained.`,
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Created on', description: `Date and time the link was created.` },
        { key: 'expiresAt', label: 'Expires on', description: `Date and time after which the link no longer works.` },
        { key: 'viewCount', label: 'Views', description: `Number of times the link was opened.` },
        { key: 'lastViewedAt', label: 'Last viewed', description: `Date and time of the last opening.` },
        { key: 'status', label: 'Status', description: `State of the link (see the statuses below).` },
        {
          key: 'payment',
          label: 'Payment',
          description: `Where the payment made with this link stands, with the amount if a payment took place.`
        },
        { key: 'actions', label: 'Actions', description: `"Revoke", for an "Active" link only.` }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: `The link still works.` },
        { value: 'EXPIRED', label: 'Expired', description: `The validity period has passed.` },
        { value: 'REVOKED', label: 'Revoked', description: `The link was deactivated by the agency.` }
      ],
      notes: [
        `"Payment" column: "No payment", "Payment in progress", "Paid", "Failed", "Cancelled", "Expired" or "To be checked".`
      ]
    },
    faq: [
      {
        q: `An "Active" link was viewed several times: is that normal?`,
        a: `Yes, the tenant can open the link several times before paying.`
      },
      {
        q: `Can I see the address of a link already created again?`,
        a: `No, the address is only shown at creation, in "Copy link" mode. Create a new one if needed.`
      },
      {
        q: 'How do I export this table?',
        a: `Use the table's "Export" button.`
      }
    ],
    related: [{ label: 'Payment link card', helpId: 'locatif.echeances.fiche.liens' }],
    keywords: ['links', 'views', 'revoke', 'expired']
  },
  {
    id: 'locatif.echeances.fiche.lien-envoi',
    kind: 'section',
    title: 'Send a payment link',
    summary: `This window creates a Mobile Money payment link for the instalment. You send it to the tenant or copy it to pass it on yourself.`,
    steps: [
      { title: 'Choose the mode', detail: `"Send to the tenant (WhatsApp or e-mail)" or "Copy link".` },
      { title: 'Set the duration', detail: `"Validity (days)": from 1 to 30 days, 7 by default.` },
      { title: 'Confirm', detail: `Click "Send the link" or "Create the link".` },
      {
        title: 'Copy if needed',
        detail: `In copy mode, click "Copy" before closing: the link will not be shown again afterwards.`
      }
    ],
    consequences: [
      `In send mode, the tenant receives the link by WhatsApp or e-mail, depending on what is usable. If no channel is possible (no consent, no number or e-mail, notification disabled), the window explains it and nothing is sent.`,
      `The link cannot be recalled once sent; it can only be revoked from the "Mobile Money payment link" card.`,
      `The amount to pay is recalculated at payment time.`
    ],
    faq: [
      {
        q: `I closed the window without copying the link, what now?`,
        a: `Create a new link: the old one cannot be shown again.`
      },
      {
        q: `Why does sending say "No eligible channel"?`,
        a: `The tenant has no usable WhatsApp number or e-mail, or has not given consent.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Requires "Create payments". Only available for an instalment "Not yet due", "Partial" or "Overdue" with a remaining balance, on an "Active" lease.`
    },
    related: [{ label: 'Payment links', helpId: 'locatif.echeances.fiche.liens' }],
    keywords: ['payment link', 'copy the link', 'WhatsApp', 'e-mail', 'Mobile Money']
  },
  {
    id: 'locatif.echeances.fiche.relances',
    kind: 'section',
    title: 'Reminder history',
    summary: `This card keeps a record of the reminders sent for this instalment: when, on which channel and with what result. It is read-only.`,
    purpose: `Before sending a reminder, you see what has already been sent and at which level, to avoid pestering a tenant or repeating a message.`,
    consequences: [
      `Each channel attempted during a reminder adds a line, including in case of failure.`,
      `The next level and the 7-day gap between two reminders are calculated from this history.`
    ],
    faq: [
      {
        q: 'Why is this card missing?',
        a: `It requires the "View payments" permission.`
      },
      {
        q: `A line shows "Failed", what should I do?`,
        a: `The message did not go out on this channel. Check the tenant's contact details, then send a reminder again.`
      }
    ],
    permissions: { feature: 'RENTAL', note: `Requires "View payments".` },
    related: [
      { label: 'How to read the table', helpId: 'locatif.echeances.fiche.relances.tableau' },
      { label: 'Individual reminder', helpId: 'locatif.echeances.relance-individuelle' }
    ],
    keywords: ['reminders', 'history', 'sent', 'level', 'reminder']
  },
  {
    id: 'locatif.echeances.fiche.relances.tableau',
    kind: 'table',
    title: 'Reminder table',
    summary: `Each row is a reminder sent on one channel. A reminder sent by e-mail and by WhatsApp gives two rows.`,
    howToRead: {
      columns: [
        { key: 'sent_at', label: 'Sending date', description: `Date and time of the reminder.` },
        {
          key: 'level',
          label: 'Reminder level',
          description: `Level 1 friendly reminder, level 2 firm reminder or level 3 final notice.`
        },
        { key: 'channel', label: 'Channel', description: `Email or WhatsApp.` },
        {
          key: 'status',
          label: 'Status',
          description: `Result of the sending; in case of failure, the cause is shown below.`
        },
        { key: 'sent_by_name', label: 'Sent by', description: `The agency member who sent the reminder.` },
        {
          key: 'payment_link_id',
          label: 'Payment link',
          description: `"Attached link" if a payment link came with the message.`
        }
      ],
      statuses: [
        { value: 'SENT', label: 'Sent', description: `The message went out.` },
        { value: 'DELIVERED', label: 'Discount', description: `The message reached the tenant.` },
        { value: 'FAILED', label: 'Failed', description: `The message could not go out on this channel.` }
      ]
    },
    faq: [
      {
        q: `Why is the table empty?`,
        a: `No reminder has been sent yet for this instalment.`
      },
      {
        q: 'How do I send a new reminder?',
        a: `Use the "Send a reminder" button at the top of the page.`
      },
      {
        q: `"Sent by" is empty, why?`,
        a: `A dash is shown when the sender is not known.`
      }
    ],
    related: [{ label: 'Reminder history', helpId: 'locatif.echeances.fiche.relances' }],
    keywords: ['reminders', 'channel', 'failure', 'delivered']
  },
  {
    id: 'locatif.penalites.liste',
    kind: 'section',
    title: 'Late payment penalties',
    summary: `This screen lists the penalties calculated on rent paid late. You can recalculate them, adjust them with a reason, attach a supporting document or delete them.`,
    purpose: `A penalty is added to an overdue instalment and increases its remaining balance. The screen is in the "Penalties" tab of a lease page.`,
    steps: [
      { title: 'Calculate', detail: `"Calculate penalties" button: see the consequences below.` },
      {
        title: 'Search and filter',
        detail: `By text, "Calculated on", "Adjusted", "Amount withheld" and "Supporting document".`
      },
      {
        title: 'Adjust',
        detail: `"Adjust": enter the "Amount withheld" (0 is allowed) and the "Reason for the adjustment", which is required, then "Save adjustment".`
      },
      {
        title: 'Attach a supporting document',
        detail: `"⋮" menu then "Add supporting document": PDF, Word or image (JPEG, PNG). A new file replaces the old one.`
      },
      { title: 'Delete', detail: `"⋮" menu then "Delete", and confirm.` }
    ],
    consequences: [
      `"Calculate penalties" processes all overdue instalments of your agency whose lease is "Active", not only those of the open lease. The amount follows the lease's penalty rule, or otherwise the agency's: fixed amount, percentage of the rent or percentage of the balance, with a possible cap and a grace period.`,
      `A penalty already adjusted by hand is never recalculated.`,
      `The amount retained is added to the instalment's amount due and recorded on the tenant's account; the instalment's status is updated.`,
      `Adjusting changes the amount retained but keeps the original calculated amount and the reason.`,
      `Deletion cannot be undone: the penalty disappears from the instalment and from the tenant's account.`
    ],
    faq: [
      {
        q: `Why does an overdue instalment have no penalty?`,
        a: `The grace period may not have elapsed, the lease is not "Active", or the balance is below your agency's threshold. Then run "Calculate penalties".`
      },
      {
        q: 'Why is the reason required?',
        a: `An amount changed without a written explanation is hard to justify to the tenant and the owner.`
      },
      {
        q: 'I do not see the "Adjust" or "⋮" buttons.',
        a: `They require the "Edit penalties" permission. "Calculate penalties" requires "Calculate penalties".`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Viewing requires "View penalties"; calculating requires "Calculate penalties"; adjusting, attaching a supporting document and deleting require "Edit penalties".`
    },
    related: [
      { label: 'How to read the penalty table', helpId: 'locatif.penalites.liste.tableau' },
      { label: 'Instalment list', helpId: 'locatif.echeances.liste' },
      { label: 'Lease page', helpId: 'locatif.baux.fiche' }
    ],
    keywords: ['penalty', 'penalties', 'late', 'surcharge', 'adjust', 'goodwill gesture', 'supporting document']
  },
  {
    id: 'locatif.penalites.liste.tableau',
    kind: 'table',
    title: 'Penalty table',
    summary: `Each row is a late penalty. It shows the calculated amount and the amount actually retained.`,
    howToRead: {
      columns: [
        { key: 'date', label: 'Calculated on', description: `Date of the penalty's last calculation.` },
        { key: 'retard', label: 'Overdue', description: `Number of days late at the time of calculation.` },
        {
          key: 'montant',
          label: 'Calculated amount',
          description: `The amount found by the automatic calculation. A dash is shown if it is not known.`
        },
        {
          key: 'retenu',
          label: 'Amount withheld',
          description: `The amount actually due. If you adjusted it, the reason is shown below.`
        },
        {
          key: 'actions',
          label: 'Actions',
          description: `"Supporting document" to download the attached file, "Adjust" and the "⋮" menu.`
        }
      ],
      notes: [
        `A penalty has no status: it is either calculated or adjusted.`,
        `On a phone, the table becomes cards: the amount retained comes first.`
      ]
    },
    consequences: [`The amount retained is part of the amount due of the instalment concerned.`],
    faq: [
      {
        q: 'How do I open a supporting document?',
        a: `Click "Supporting document" in the row: the file is downloaded.`
      },
      {
        q: 'The amount retained differs from the calculated amount, why?',
        a: `The penalty was adjusted by hand: the reason entered is shown under the amount retained.`
      },
      {
        q: 'Can the list be exported?',
        a: `Yes, with "Export": all penalties matching your filters are exported.`
      }
    ],
    related: [{ label: 'Late penalties', helpId: 'locatif.penalites.liste' }],
    keywords: ['table', 'amount retained', 'calculated amount', 'adjusted']
  }
];

export default entries;
