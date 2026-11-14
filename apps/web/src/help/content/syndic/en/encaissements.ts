import type { HelpEntry } from '../../../types';

/** « encaissements » zone of the « syndic » module (en): collections, treasury and payments. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Recovery
  {
    id: 'syndic.recouvrement.liste',
    kind: 'page',
    title: 'Overdue payment recovery',
    summary:
      'This screen tracks charge calls that are past due and not fully paid: late items, reminders, penalties and payment schedules. You use it to chase late co-owners, one by one or in bulk.',
    purpose:
      'It is used to recover unpaid charges for a co-ownership. It starts from charge calls whose due date has passed and whose remaining balance is above zero.',
    howToRead: {
      notes: [
        '"Units in arrears" (late units): number of units concerned. A unit counts once, even with several unpaid calls. "Amount still owed" (remaining amount due): total of the remaining balances.',
        'Four tabs: "Arrears table", "Reminder history", "Late payment penalties" and "Payment plans".',
        'The "Manual reminder", "Apply penalty" and "Create payment plan" buttons stay greyed out as long as no call is late.'
      ]
    },
    steps: [
      {
        title: 'Spot the late items',
        detail: 'Open the "Arrears table" tab: each row is a past-due call with its remaining balance.'
      },
      {
        title: 'Remind in bulk',
        detail: 'Click "Send bulk reminders", read the preview, then confirm with "Envoyer … relance(s)".'
      },
      { title: 'Remind one case', detail: 'Button "Manual reminder": choose the call, the level and the channel.' },
      { title: 'Apply a penalty', detail: 'Button "Apply penalty": choose the call and the monthly rate.' },
      {
        title: 'Grant extra time',
        detail: 'Button "Create payment plan": set the total and the instalments agreed with the co-owner.'
      },
      { title: 'Follow up', detail: 'The "Reminder history" tab shows what was sent and what failed.' }
    ],
    consequences: [
      'A recorded reminder cannot be withdrawn. If sending fails, it stays in the history with the cause of the failure.',
      "A penalty is added to the co-owner's account. A waived penalty is credited back but cannot be reinstated.",
      'A unit with an active payment schedule is no longer reminded by the bulk reminders.'
    ],
    faq: [
      {
        q: 'Why is a call missing from the table?',
        a: 'Only past-due calls with a remaining balance above zero are listed. A call that is settled, even by an advance, is not.'
      },
      {
        q: 'What is the difference with "Overdue cases" in Treasury?',
        a: 'Here "Units in arrears" counts lots. Treasury counts late calls: a unit with two unpaid calls counts as two there.'
      },
      {
        q: 'Does the channel chosen for a manual reminder change how it is sent?',
        a: 'No, it is only recorded in the history. Sending goes by e-mail and, if WhatsApp is active for the agency, by WhatsApp.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager', 'Accountant'],
      note: 'Viewing the screen and the reminder preview requires the right to view the Syndic module. Sending a reminder, applying or waiving a penalty and creating a schedule require the right to edit the Syndic module.'
    },
    related: [
      { label: 'Recovery indicators', helpId: 'syndic.recouvrement.indicateurs' },
      { label: 'Late items table', helpId: 'syndic.recouvrement.retards' },
      { label: 'Bulk reminders', helpId: 'syndic.recouvrement.relances-groupees' },
      { label: 'Treasury', helpId: 'syndic.tresorerie.liste' },
      { label: 'Payments', helpId: 'syndic.paiements.liste' }
    ],
    keywords: ['unpaid', 'late', 'reminder', 'penalty', 'payment schedule', 'recovery', 'charges', 'co-owner']
  },
  {
    id: 'syndic.recouvrement.indicateurs',
    kind: 'section',
    title: 'Recovery indicators',
    summary:
      'Two cards summarise the co-ownership arrears: the number of units concerned and the total remaining amount due.',
    howToRead: {
      notes: [
        '"Units in arrears": units with at least one past-due, unpaid call. A unit counts once.',
        '"Amount still owed": sum of the remaining balances of past-due calls. A call covered by a payment or an advance is not counted.',
        'The cards turn red as soon as there is a late item.'
      ]
    },
    faq: [
      {
        q: 'Do these figures follow payments?',
        a: 'Yes. They are recalculated after each reminder, penalty or schedule saved, and when the page is reloaded.'
      },
      {
        q: 'Why does the amount not drop after a waived penalty?',
        a: 'The cards count the remaining balances of charge calls. Penalties are tracked separately, in the "Late payment penalties" tab.'
      },
      {
        q: 'Does a payment schedule remove the unit from the late items?',
        a: 'No. The remaining balance stays counted until it is paid; the schedule only stops the bulk reminders.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    keywords: ['late units', 'amount due', 'total unpaid']
  },
  {
    id: 'syndic.recouvrement.retards',
    kind: 'table',
    title: 'Late items table',
    summary:
      'This table lists every past-due, unpaid charge call, with the remaining balance and the number of days late.',
    purpose: 'It is the recovery work list: from it you decide who to remind, penalise or put on a payment schedule.',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'The unit concerned.' },
        { key: 'owner', label: 'Owner', description: 'The co-owner of the unit; "No owner" if none is linked.' },
        { key: 'dueDate', label: 'Due date', description: 'Due date of the charge call.' },
        { key: 'daysLate', label: 'Days overdue', description: 'Days elapsed since the due date.' },
        { key: 'amount', label: 'Amount', description: 'Amount of the call.' },
        { key: 'paid', label: 'Paid', description: 'Part already paid.' },
        { key: 'outstanding', label: 'Outstanding', description: 'What is still due.' }
      ],
      notes: [
        'Search covers the unit, the owner and their e-mail. You can filter by days late, due date and remaining balance.',
        'The table is complete: search and paging are done on screen, without a new call to the server.'
      ]
    },
    steps: [
      { title: 'Search', detail: 'Type a unit or a name, or open the filters for days late and remaining balance.' },
      {
        title: 'Act',
        detail:
          'Then use the buttons at the top of the screen: "Manual reminder", "Apply penalty" or "Create payment plan".'
      },
      { title: 'Export', detail: 'The table can be exported from its toolbar.' }
    ],
    faq: [
      {
        q: 'Where is a call paid?',
        a: 'Not here: collections are recorded from the call payments or the "Payments" tab.'
      },
      {
        q: 'Why does a row show "No owner"?',
        a: 'No co-owner is linked to the lot. No reminder can be sent until this is fixed.'
      },
      {
        q: 'What does the search cover?',
        a: "The unit, the owner and the owner's email. You can also filter by days late, due date and amount left."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    related: [{ label: 'Bulk reminders', helpId: 'syndic.recouvrement.relances-groupees' }],
    keywords: ['late items', 'unpaid', 'remaining balance', 'days late']
  },
  {
    id: 'syndic.recouvrement.relances',
    kind: 'table',
    title: 'Reminder history',
    summary:
      'This table keeps a record of all reminders for unpaid charges, successful or failed, with their level and channel.',
    purpose: 'It lets you know who has already been reminded, when, and why a message was not sent.',
    howToRead: {
      columns: [
        { key: 'reminderLevel', label: 'Floor', description: 'Rank of the reminder for this call, from 1 to 4.' },
        { key: 'channel', label: 'Channel', description: 'Channel recorded with the reminder (see the note below).' },
        { key: 'status', label: 'Status', description: 'Result of the reminder.' },
        { key: 'lot', label: 'Unit', description: 'The unit reminded.' },
        { key: 'owner', label: 'Owner', description: 'The co-owner of the lot.' },
        { key: 'sentAt', label: 'Sent on', description: 'Date and time of sending.' },
        {
          key: 'cause',
          label: 'Cause',
          description: 'Reason for the failure, only for failed reminders; otherwise a dash.'
        }
      ],
      statuses: [
        { value: 'SENT', label: 'Sent', description: 'The reminder was sent.' },
        { value: 'DELIVERED', label: 'Distributed', description: 'The reminder was delivered.' },
        { value: 'FAILED', label: 'Failed', description: 'Sending did not succeed. The cause is shown.' }
      ],
      notes: [
        'Common failure causes: "the co-owner has no e-mail address", "No co-owner linked to the unit", "the call is already settled", "Reminder notification is disabled for the agency", or a mail server error.',
        'The channel is just a mention: actual sending goes by e-mail and, if WhatsApp is active for the agency, by WhatsApp. No SMS or push notification is sent by this function.',
        'Filters: status, channel, level, sending date and lot.'
      ]
    },
    faq: [
      {
        q: 'Does a failed reminder block the next one?',
        a: 'No. A failed reminder is not counted as delivered: it does not delay the next reminder.'
      },
      {
        q: 'How do I fix the cause of a failure?',
        a: "Depending on the cause: add the co-owner's e-mail on their record, link a co-owner to the unit, or check the reminder notification in the agency settings. Then remind again."
      },
      {
        q: 'Up to which level do reminders go?',
        a: 'The level goes from 1 to 4. After level 4, bulk reminders stay at level 4.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    related: [
      { label: 'Bulk reminders', helpId: 'syndic.recouvrement.relances-groupees' },
      { label: 'Manual reminder', helpId: 'syndic.recouvrement.relance-manuelle' }
    ],
    keywords: ['reminder', 'follow-up', 'sending failure', 'e-mail', 'whatsapp']
  },
  {
    id: 'syndic.recouvrement.penalites',
    kind: 'table',
    title: 'Late payment penalties',
    summary: 'This table lists the penalties applied to late calls. You can apply a new one or grant a waiver.',
    purpose:
      "A penalty is an amount calculated on the remaining balance of a late call. It is recorded in the co-owner's account.",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'The penalised lot.' },
        { key: 'owner', label: 'Owner', description: 'The co-owner of the lot.' },
        { key: 'daysLate', label: 'Days overdue', description: 'Days late used for the calculation.' },
        { key: 'penaltyRate', label: 'Rate', description: 'Monthly rate applied, as a percentage.' },
        { key: 'penaltyAmount', label: 'Amount', description: 'Amount of the penalty.' },
        { key: 'status', label: 'Status', description: 'Active or waived.' },
        { key: 'action', label: 'Action', description: '"Discount" button on a penalty that is still active.' }
      ],
      statuses: [
        { value: 'false', label: 'Active', description: 'The penalty is due.' },
        { value: 'true', label: 'Discount', description: 'The penalty was cancelled with a reason.' }
      ],
      notes: [
        'Calculation: remaining balance × monthly rate × days late ÷ 30, capped at the remaining balance. The monthly rate cannot exceed 10%. A preview is shown before you confirm.',
        '"Days overdue (optional)": if left empty, the actual delay since the due date is used.'
      ]
    },
    steps: [
      {
        title: 'Apply',
        detail: 'Button "Apply penalty": choose the call, the monthly rate and, if needed, the days late, then "Apply".'
      },
      {
        title: 'Waive',
        detail: 'On an active row, click "Discount", enter the reason (required), then "Apply discount".'
      }
    ],
    consequences: [
      "Applying a penalty debits it to the co-owner's account, immediately.",
      'Granting a waiver credits the same amount back. It is final: the screen does not allow the penalty to be reinstated.',
      'No message is sent to the co-owner.'
    ],
    faq: [
      { q: 'Can a settled call be penalised?', a: 'No. Applying a penalty is refused if the call is already settled.' },
      { q: 'Can a penalty be edited?', a: 'No. Waive it with a reason, then apply a new one if needed.' },
      {
        q: 'Is the penalty amount counted in "Amount still owed"?',
        a: 'No. That card only counts the remaining balances of charge calls.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing penalties requires the right to view the Syndic module. Applying or waiving a penalty requires the right to edit the Syndic module.'
    },
    keywords: ['penalty', 'late interest', 'waiver', 'surcharge']
  },
  {
    id: 'syndic.recouvrement.echeanciers',
    kind: 'table',
    title: 'Payment schedules',
    summary: 'This table lists the payment plans agreed with co-owners to settle a call in several instalments.',
    purpose:
      'A schedule formalises an agreement to pay in instalments. While it is active, the unit is left out of the bulk reminders.',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'The unit concerned.' },
        { key: 'owner', label: 'Owner', description: 'The co-owner of the lot.' },
        { key: 'chargeCall', label: 'Call', description: 'Period of the charge call concerned.' },
        { key: 'totalAmount', label: 'Total amount', description: 'Sum to be paid according to the agreement.' },
        { key: 'agreedAt', label: 'Agreement', description: 'Date of the agreement.' },
        { key: 'instalments', label: 'Instalments', description: 'Each date with its amount.' },
        { key: 'status', label: 'Status', description: 'State of the schedule.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The schedule is under way.' },
        { value: 'COMPLETED', label: 'Completed', description: 'The schedule has been carried through.' },
        { value: 'DEFAULTED', label: 'Defaulted', description: 'The instalments were not respected.' }
      ]
    },
    steps: [
      {
        title: 'Create',
        detail: 'Button "Create payment plan": choose the call, the "Total amount" and the "Agreement date (optional)".'
      },
      {
        title: 'Enter the instalments',
        detail: 'For each instalment, give the date and the amount. "Add an instalment" adds one.'
      },
      { title: 'Confirm', detail: 'Click "Create". The total must equal the sum of the instalments.' }
    ],
    consequences: [
      "The schedule changes neither the call's remaining balance nor the payments: it records the agreement.",
      'While a schedule is active on a unit, bulk reminders leave it out (reason "Active payment plan").',
      'No message is sent to the co-owner.'
    ],
    faq: [
      {
        q: 'Why is creation refused?',
        a: 'Either the call is already settled, or the total entered does not match the sum of the instalments.'
      },
      {
        q: 'Does the schedule track payments by itself?',
        a: 'This screen does not show which instalments were paid. Payments are recorded as usual on the call.'
      },
      {
        q: 'Does a payment plan notify the co-owner?',
        a: 'No. No message is sent: the plan only records the agreement.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing schedules requires the right to view the Syndic module. Creating one requires the right to edit the Syndic module.'
    },
    keywords: ['payment plan', 'instalments', 'agreement', 'payment extension']
  },
  {
    id: 'syndic.recouvrement.relances-groupees',
    kind: 'section',
    title: 'Bulk reminders',
    summary:
      'The "Send bulk reminders" button first opens a preview: the reminders that will be sent and the calls left out. Nothing is sent before you confirm.',
    purpose:
      'Remind in one go every co-owner whose call is past due, without missing any or reminding anyone twice too quickly.',
    howToRead: {
      columns: [
        { key: 'lotNumber', label: 'Unit', description: 'The unit reminded.' },
        { key: 'period', label: 'Period', description: 'Period of the charge call.' },
        { key: 'nextLevel', label: 'Next level', description: 'Level of the reminder about to be sent, from 1 to 4.' }
      ],
      statuses: [
        {
          value: 'PAYMENT_PLAN_ACTIVE',
          label: 'Active payment plan',
          description: 'The unit has an active payment schedule.'
        },
        {
          value: 'REMINDER_TOO_RECENT',
          label: 'Reminder too recent',
          description: 'The delay since the last reminder has not elapsed (7 days by default).'
        },
        {
          value: 'DECLARED_PAYMENT_PENDING',
          label: 'Declared payment being verified',
          description:
            'A declared mobile payment is waiting for your validation, for fewer business days than the alert delay.'
        }
      ],
      notes: [
        'Past-due calls with a remaining balance above zero are reminded. The next level is the number of reminders already sent plus one, at most 4.',
        'After sending, a summary shows the number of reminders sent, the failures by cause and the calls left out.'
      ]
    },
    steps: [
      { title: 'Open the preview', detail: 'Click "Send bulk reminders".' },
      {
        title: 'Check',
        detail: 'Read the list of reminders about to go and the list of calls left out with their reason.'
      },
      { title: 'Confirm', detail: 'Click "Envoyer … relance(s)". If there is nothing to send, only "Close" remains.' }
    ],
    consequences: [
      'Sending is final: each reminder is recorded in the history, even if sending fails.',
      'Each reminder goes by e-mail to the co-owner. If WhatsApp is active for the agency and the co-owner has a number, it also goes by WhatsApp.',
      'Reminders are recorded with the "Email" channel.'
    ],
    faq: [
      {
        q: 'Can the preview differ from the actual sending?',
        a: 'Both use the same rules, but sending recalculates at the moment you confirm.'
      },
      {
        q: 'Why is a call left out?',
        a: 'A schedule is active, a reminder is too recent, or a declared mobile payment is waiting for your validation. The reason is displayed.'
      },
      {
        q: 'How do I change the delay between two reminders?',
        a: 'This screen does not offer it. Without a co-ownership-specific setting, the delay is 7 days.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing the preview requires the right to view the Syndic module. Sending the reminders requires the right to edit the Syndic module.'
    },
    related: [{ label: 'Reminder history', helpId: 'syndic.recouvrement.relances' }],
    keywords: ['mass reminder', 'automatic reminders', 'follow-up', 'e-mail', 'preview']
  },
  {
    id: 'syndic.recouvrement.relance-manuelle',
    kind: 'section',
    title: 'Manual reminder',
    summary: 'This window reminds a co-owner about a specific call, choosing the level and the channel.',
    purpose: 'Use it for a particular case, outside the bulk reminders, for example after a phone conversation.',
    steps: [
      { title: 'Choose the call', detail: 'In "Charge call", search by unit, co-owner or remaining balance.' },
      { title: 'Set the level', detail: '"Floor" from 1 to 4 (1 by default).' },
      {
        title: 'Choose the channel',
        detail: '"Channel": Email, SMS, WhatsApp or Push. It is recorded with the reminder.'
      },
      { title: 'Create', detail: 'Click "Create".' }
    ],
    consequences: [
      'The reminder is recorded at once, then sent by e-mail to the co-owner and, if WhatsApp is active for the agency, by WhatsApp.',
      'The chosen channel does not direct the sending: it only appears in the history.',
      'If sending fails, the message "Reminder saved, sending failed" gives the cause. The reminder stays in the history with the status "Failed".'
    ],
    faq: [
      { q: 'Can a settled call be reminded?', a: 'No, the reminder is refused if the call is already settled.' },
      {
        q: 'Does a declared payment block the manual reminder?',
        a: 'No. Only the bulk reminders leave out those calls.'
      },
      {
        q: 'What happens if sending fails?',
        a: 'The message "Reminder saved, sending failed" gives the cause. The reminder stays in the history with the status "Failed".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    related: [{ label: 'Reminder history', helpId: 'syndic.recouvrement.relances' }],
    keywords: ['reminder', 'follow-up', 'level', 'channel']
  },

  // ------------------------------------------------------------------ Treasury
  {
    id: 'syndic.tresorerie.liste',
    kind: 'page',
    title: 'Co-ownership treasury',
    summary:
      'This screen gives the financial position of the co-ownership: funds, calls issued, payments received and unpaid items. Four tabs detail each figure.',
    purpose:
      'It answers the question "where does the co-ownership money stand?". It is also used to create funds (current account, works fund) and adjust their balance.',
    howToRead: {
      notes: [
        '"Total funds": sum of the fund balances. "Total called": sum of the charge calls issued.',
        '"Total paid": part of the calls that has been paid. "Amount outstanding": total called minus total paid.',
        '"Total advances": payments received not yet allocated to a call.',
        '"Overdue cases": number of past-due unpaid calls. "Amount overdue": their remaining balance.',
        'Clicking a card opens the tab that details it.'
      ]
    },
    steps: [
      { title: 'Read the cards', detail: 'They summarise the situation at a glance.' },
      { title: 'See the funds', detail: '"Fund details" tab: balances, rename, adjust, history.' },
      { title: 'Check calls and payments', detail: '"Charge call details" and "Received payment details" tabs.' },
      {
        title: 'Handle the late items',
        detail: '"Arrears and overdue details" tab, then the "Collections" screen to send reminders.'
      }
    ],
    consequences: [
      'Creating a fund or adjusting its balance changes "Total funds" right away and leaves a trace in the fund\'s history.'
    ],
    faq: [
      {
        q: 'Where do I record a collection?',
        a: 'Not here: this screen is for reading. Payments are entered from the charge calls or the "Payments" screen.'
      },
      {
        q: 'Why can a fund be negative?',
        a: 'It is allowed (cash advance), but a warning is shown after the adjustment.'
      },
      { q: 'What does clicking a card do?', a: "It opens the tab that details the card's figure." }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager', 'Accountant'],
      note: 'Viewing requires the right to view the Syndic module. Creating, renaming or adjusting a fund requires the right to edit the Syndic module.'
    },
    related: [
      { label: 'Fund details', helpId: 'syndic.tresorerie.fonds' },
      { label: 'Recovery', helpId: 'syndic.recouvrement.liste' },
      { label: 'Payments', helpId: 'syndic.paiements.liste' }
    ],
    keywords: ['finances', 'funds', 'balance', 'cash', 'calls', 'payments', 'unpaid']
  },
  {
    id: 'syndic.tresorerie.indicateurs',
    kind: 'section',
    title: 'Treasury indicators',
    summary:
      'Seven cards summarise the funds, calls, payments and late items of the co-ownership. Clickable cards open the detail tab.',
    howToRead: {
      notes: [
        '"Total funds": combined fund balances. "Total called": all charge calls issued. "Total paid": what has been paid on those calls.',
        '"Amount outstanding": total called minus total paid. "Total advances": overpayments received, not yet allocated to a call.',
        '"Overdue cases": number of past-due unpaid calls (a unit with two unpaid calls counts two). "Amount overdue": their remaining balance.'
      ]
    },
    faq: [
      {
        q: 'Why is "Total paid" lower than the sum of payments?',
        a: 'Advances not allocated to a call are not counted in "Total paid"; they are in "Total advances".'
      },
      {
        q: 'Where do I see the detail of a card?',
        a: 'Click it: "Total funds", "Total called", "Total paid", "Amount outstanding" and the two late cards open the matching tab.'
      },
      { q: 'How is "Left to pay" calculated?', a: 'It is "Total called" minus "Total paid".' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    keywords: ['total called', 'total paid', 'advances', 'remaining to pay']
  },
  {
    id: 'syndic.tresorerie.fonds',
    kind: 'table',
    title: 'Fund details',
    summary:
      'This table lists the co-ownership funds (current account, works fund…) with their balance. You can create them, rename them and adjust their balance.',
    purpose: 'A fund is a reserve of money tracked separately. Each movement is kept in its history.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Fund', description: 'Name of the fund.' },
        { key: 'balance', label: 'Balance', description: 'Current balance, in FCFA.' },
        { key: 'actions', label: 'Actions', description: '"Rename", "Adjust balance" and "Movement history".' }
      ]
    },
    steps: [
      {
        title: 'Create a fund',
        detail: 'Button "New fund": "Fund name", "Initial balance" (0 by default), currency in FCFA.'
      },
      { title: 'Rename', detail: 'Button "Rename", then "Save".' },
      { title: 'Adjust the balance', detail: 'Button "Adjust balance": see the sheet "Adjust a fund balance".' },
      { title: 'Consult', detail: '"Movement history" opens the list of the fund movements.' }
    ],
    faq: [
      { q: 'Can a fund be deleted?', a: 'The screen does not offer deletion.' },
      { q: 'Which currencies are possible?', a: 'Only FCFA.' },
      {
        q: 'What balance should a new fund start with?',
        a: 'The "Initial balance" is 0 by default. You can enter another amount when creating the fund.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing funds requires the right to view the Syndic module. Creating, renaming and adjusting require the right to edit the Syndic module.'
    },
    related: [{ label: 'Adjust a fund balance', helpId: 'syndic.tresorerie.ajustement' }],
    keywords: ['works fund', 'current account', 'reserve', 'balance']
  },
  {
    id: 'syndic.tresorerie.ajustement',
    kind: 'section',
    title: 'Adjust a fund balance',
    summary: 'This window records a manual movement on a fund: an adjustment, or an expense paid by the fund.',
    purpose: 'Use it to correct a balance or to record an expense paid directly by the fund.',
    steps: [
      { title: 'Choose the nature', detail: '"Type of movement": "Adjustment" or "Expense paid by the fund".' },
      {
        title: 'Choose the direction',
        detail: '"Credit (increase balance)" or "Debit (decrease balance)". An expense is always a debit.'
      },
      { title: 'Enter amount and reason', detail: 'The "Amount" and the "Reason" are required.' },
      { title: 'Apply', detail: 'Click "Apply".' }
    ],
    consequences: [
      'The balance changes right away and the movement is kept in "Movement history".',
      'The balance can become negative: this is allowed, with the warning "the fund balance is now negative".'
    ],
    faq: [
      {
        q: 'How do I correct an entry mistake?',
        a: 'The screen does not offer cancelling a movement. Record an adjustment in the opposite direction with a clear reason.'
      },
      {
        q: 'What is the difference between adjustment and expense?',
        a: 'An adjustment goes both ways. An expense always decreases the fund.'
      },
      {
        q: 'Can the balance become negative?',
        a: 'Yes, this is allowed. The screen then shows the warning "the fund balance is now negative".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    keywords: ['adjustment', 'expense', 'balance correction', 'debit', 'credit']
  },
  {
    id: 'syndic.tresorerie.appels',
    kind: 'table',
    title: 'Fund call details',
    summary: 'This table lists the charge calls issued, with what has been paid and what remains due.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Reference', description: 'Number of the call.' },
        { key: 'period', label: 'Period', description: 'Period covered by the call.' },
        { key: 'lotLabel', label: 'Unit', description: 'The unit called.' },
        { key: 'ownerLabel', label: 'Co-owner', description: 'The co-owner of the unit; "No co-owner" if none.' },
        { key: 'amount', label: 'Amount called', description: 'Amount of the call.' },
        { key: 'paid', label: 'Paid', description: 'Part paid.' },
        { key: 'outstanding', label: 'Outstanding', description: 'What is still due.' },
        { key: 'dueDate', label: 'Due date', description: 'Payment deadline.' },
        { key: 'status', label: 'Status', description: 'State of the call.' }
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'Nothing is paid yet and the due date has not passed.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Part of it is paid.' },
        { value: 'PAID', label: 'Paid', description: 'The call is settled.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'The due date has passed and an amount remains due.' }
      ],
      notes: [
        'Search and filters (status, unit) are done by the server. There is no column sorting.',
        'The "Charges" screen is used to create and manage calls; here, you consult them.'
      ]
    },
    faq: [
      { q: 'Where do I create a call?', a: 'In the "Charges" screen of the co-ownership, not in Treasury.' },
      { q: 'Why is a call "Overdue"?', a: 'Its due date has passed and an amount is still due.' },
      {
        q: 'Can the columns be sorted?',
        a: 'No. Use the search and the filters (status, unit), which are handled by the server.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    keywords: ['charge calls', 'fund calls', 'due date', 'remaining balance']
  },
  {
    id: 'syndic.tresorerie.paiements',
    kind: 'table',
    title: 'Received payment details',
    summary: 'This table lists the payments received, with one row per charge call paid.',
    purpose: 'It lets you find which payment settled which call, on what date and by what means.',
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date', description: 'Date of the payment.' },
        { key: 'lotLabel', label: 'Unit', description: 'The paying lot.' },
        { key: 'ownerLabel', label: 'Co-owner', description: 'The co-owner of the lot.' },
        { key: 'chargeReference', label: 'Related charge call', description: 'The call settled by this row.' },
        { key: 'amount', label: 'Amount', description: 'Amount allocated to this call.' },
        { key: 'method', label: 'Method', description: 'Means of payment.' }
      ],
      notes: [
        'Possible methods: Cash, Bank transfer, Cheque, Mobile money, Direct debit, Card, Online payment, Other.',
        'A payment that settles several calls appears on several rows. Advances not allocated to a call are not listed here.',
        'Pages are limited to 100 rows. Filters: method, payment date, amount.'
      ]
    },
    faq: [
      {
        q: 'Why is a payment missing?',
        a: 'If it is not yet allocated to a call (advance), it is not listed. It counts in "Total advances".'
      },
      { q: 'Can I export?', a: 'Yes, from the table toolbar, with the current filters.' },
      {
        q: 'How many rows are shown per page?',
        a: 'Up to 100 rows per page. You can filter by method, payment date and amount.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    keywords: ['collections', 'settlements', 'receipts', 'payment method']
  },
  {
    id: 'syndic.tresorerie.impayes',
    kind: 'table',
    title: 'Unpaid and late item details',
    summary:
      'This table lists past-due unpaid calls, with the remaining balance, the days late and the number of reminders already sent.',
    howToRead: {
      columns: [
        { key: 'lotLabel', label: 'Unit', description: 'The late lot.' },
        { key: 'ownerLabel', label: 'Co-owner', description: 'The co-owner of the lot.' },
        { key: 'outstanding', label: 'Amount due', description: 'Remaining balance of the call.' },
        { key: 'daysLate', label: 'Days overdue', description: 'Days since the due date.' },
        { key: 'remindersCount', label: 'Reminders', description: 'Number of reminders recorded for the call.' }
      ],
      notes: [
        'Filters: days late, amount due, "Already reminded" or "Never reminded". Numeric columns can be sorted.',
        'To send reminders, apply a penalty or create a schedule, go through the "Collections" screen.'
      ]
    },
    faq: [
      {
        q: 'What is the difference with Recovery?',
        a: 'Same list of late items, but read-only here. Recovery lets you act.'
      },
      {
        q: 'How do I find co-owners who were never reminded?',
        a: 'Use the "Never reminded" filter. The "Already reminded" filter shows the others.'
      },
      { q: 'What does the "Reminders" column count?', a: 'The number of reminders recorded for the call.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    related: [{ label: 'Overdue payment recovery', helpId: 'syndic.recouvrement.liste' }],
    keywords: ['unpaid', 'late items', 'reminded']
  },

  // ------------------------------------------------------------------ Payments
  {
    id: 'syndic.paiements.liste',
    kind: 'page',
    title: 'Payments',
    summary:
      'This screen gathers charge call payments other than manual collection: mobile money transfers declared by co-owners, online payment and transfers to the bank.',
    purpose:
      'It is used to approve or reject declared payments, follow online payments and record transfers to the bank. Three tabs divide it.',
    howToRead: {
      notes: [
        '"Declared payments" tab: the validation queue, the mobile money receiving numbers and the settings.',
        '"Online payment" tab: the co-ownership payment account and the tracking of payments.',
        '"Payouts to the bank" tab: the transfers recorded to the bank account.',
        'The "Payments" menu shows a counter: the number of pending declarations.'
      ]
    },
    steps: [
      {
        title: 'Prepare reception',
        detail:
          'In "Declared payments", add at least one active receiving number, then turn on "Accept declared payments".'
      },
      {
        title: 'Process declarations',
        detail: 'Click "Review": compare with the operator statement, then "Approve" or "Reject".'
      },
      {
        title: 'Enable online payment',
        detail: 'In the "Online payment" tab: set up the account, then "Enable online payment".'
      },
      { title: 'Settle the cases to check', detail: 'Payments marked "To decide" need a decision from the manager.' },
      {
        title: 'Transfer to the bank',
        detail: 'Once the money has reached the bank, record it in "Payouts to the bank".'
      }
    ],
    consequences: [
      'Approving a declaration or accepting a payment to settle records the collection on the unit calls. This cannot be undone from this screen.',
      'Receipts and settlement receipts are issued and sent by e-mail to the co-owner.'
    ],
    faq: [
      { q: 'Which mobile money operators are known?', a: 'Orange Money, MTN MoMo, Moov Money, Wave, or "Other".' },
      {
        q: 'I do not see the "Pay" button on the co-owner side.',
        a: "Online payment must be active and complete for this co-ownership. It does not use the agency's account."
      },
      { q: 'Why are some buttons hidden?', a: 'They require the right to edit the Syndic module.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager', 'Accountant'],
      note: 'Viewing requires the right to view the Syndic module. Approving, rejecting, checking, settling, transferring and managing numbers require the right to edit it. Configuring the online payment account additionally requires "Edit the agency settings".'
    },
    related: [
      { label: 'Declared payments', helpId: 'syndic.paiements.declares' },
      { label: 'Online payment account', helpId: 'syndic.paiements.passerelle' },
      { label: 'Transfers to the bank', helpId: 'syndic.paiements.reversements' },
      { label: 'Recovery', helpId: 'syndic.recouvrement.liste' }
    ],
    keywords: [
      'mobile money',
      'orange money',
      'mtn',
      'moov',
      'wave',
      'online payment',
      'declaration',
      'transfer to bank'
    ]
  },
  {
    id: 'syndic.paiements.declares',
    kind: 'table',
    title: 'Declared payments',
    summary:
      'This table is the queue of mobile money transfers that co-owners say they have made. You check them, then approve or reject them.',
    purpose:
      'The co-owner pays to a receiving number of the co-ownership then declares it on their portal. Nothing is credited until you approve.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Submitted on', description: 'Date the declaration was submitted.' },
        {
          key: 'declaredBy',
          label: 'Declarant',
          description: 'Who declared; the "Manager" tag marks a declaration entered by the agency.'
        },
        { key: 'lots', label: 'Unit(s)', description: 'Units concerned.' },
        {
          key: 'receivingNumber',
          label: 'Receiving number',
          description: 'Operator, number and holder that received the transfer.'
        },
        {
          key: 'transactionReference',
          label: 'Reference',
          description: 'Transaction reference given by the operator.'
        },
        {
          key: 'amount',
          label: 'Declared amount',
          description: 'Declared amount; "accepted: …" appears if the accepted amount is different.'
        },
        { key: 'paidAt', label: 'Payment of', description: 'Date and time of the transfer.' },
        { key: 'status', label: 'Status', description: 'State, with possible alert tags.' },
        { key: 'actions', label: 'Actions', description: '"Review" opens the detail.' }
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'To be checked. Nothing is credited yet.' },
        { value: 'APPROVED', label: 'Approved', description: 'Collected on the unit calls.' },
        { value: 'REJECTED', label: 'Rejected', description: 'Refused, with a reason shown to the co-owner.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Cancelled by the co-owner before your decision.' }
      ],
      notes: [
        'Without a status choice, only "Pending" payments are shown.',
        'Tags: "Overdue" (pending for longer than the alert delay), "Suspected duplicate", "Read by AI".',
        'Counters above the table: "Pending", "Overdue" (click to filter) and "Suspected duplicate".'
      ]
    },
    steps: [
      { title: 'Open', detail: 'Click "Review" or the row.' },
      { title: 'Compare', detail: 'Check the amount, the date and the reference against the operator statement.' },
      { title: 'Decide', detail: '"Approve" or "Reject" in the drawer.' },
      {
        title: 'Enter for a co-owner',
        detail: '"Declare for a co-owner" creates a declaration on their behalf; it remains to be approved.'
      }
    ],
    consequences: [
      'A declaration credits nothing while it is "Pending".',
      'Managers allowed to approve receive an e-mail summary of declarations to check, with a daily alert at 8 am (Abidjan time) for the late ones, if the agency has enabled this sending.'
    ],
    faq: [
      {
        q: 'Where is the declaration I am looking for?',
        a: 'It may no longer be "Pending". Change the "Status" filter or choose "All".'
      },
      {
        q: 'What does "Suspected duplicate" mean?',
        a: 'Same receiving number, same amount and same payer as another declaration within 10 minutes, or a reference already present on a recorded payment.'
      },
      {
        q: 'Do bulk reminders send a reminder for a declared call?',
        a: 'No, not while the declaration has been pending for fewer business days than the alert delay.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing the queue requires the right to view the Syndic module. "Declare for a co-owner", approving and rejecting require the right to edit the Syndic module.'
    },
    related: [
      { label: 'Review a declaration', helpId: 'syndic.paiements.declaration' },
      { label: 'Declared payment settings', helpId: 'syndic.paiements.reglages' },
      { label: 'Receiving numbers', helpId: 'syndic.paiements.numeros' }
    ],
    keywords: ['payment declaration', 'transfer', 'mobile money', 'screenshot', 'transaction reference']
  },
  {
    id: 'syndic.paiements.declaration',
    kind: 'section',
    title: 'Review a declaration',
    summary:
      'This drawer shows everything needed to decide: control alerts, payment detail, units and calls concerned, screenshot.',
    purpose: 'You compare the declaration with the operator statement before approving or rejecting it.',
    howToRead: {
      notes: [
        'Alerts: reference already used on a recorded payment, probable duplicate, excess that will become an advance, partial payment, declarant no longer the current co-owner, screenshot showing another receiving number, date in a closed fiscal year, pending for several business days.',
        'The "AI" tags mark a field read by the AI, edited or not by the declarant. The AI approves nothing.',
        '"Units and calls concerned": if no call is specified, the payment applies to the oldest open calls of the lot.',
        'A processed declaration also shows the accepted amount and date, who processed it, the rejection reason or note, and the documents issued.'
      ]
    },
    steps: [
      { title: 'Read the alerts', detail: 'They appear at the top while the declaration is pending.' },
      { title: 'Check the detail', detail: 'Declarant, payer number, receiving number, amount, date and reference.' },
      { title: 'Look at the screenshot', detail: 'An image enlarges on click; a PDF opens in a new tab.' },
      { title: 'Decide', detail: '"Approve" or "Reject" at the bottom of the drawer.' }
    ],
    consequences: [
      'The buttons are only available for an "Pending" declaration and if you have the right to edit the Syndic module.'
    ],
    faq: [
      {
        q: 'The screenshot does not display.',
        a: 'Click "Try again". With no screenshot attached, the screen shows "No screenshot attached".'
      },
      {
        q: 'Someone has already processed it.',
        a: 'The screen shows "This declaration has already been processed" and the list refreshes.'
      },
      { q: 'Which calls does the payment apply to if none is specified?', a: 'The oldest open calls of the unit.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing requires the right to view the Syndic module; approving and rejecting require the right to edit the Syndic module.'
    },
    related: [
      { label: 'Approve a declaration', helpId: 'syndic.paiements.validation' },
      { label: 'Reject a declaration', helpId: 'syndic.paiements.rejet' }
    ],
    keywords: ['drawer', 'alerts', 'screenshot', 'AI'],
    tour: {
      steps: [
        {
          target: 'decl-alertes',
          title: 'The alerts',
          description: 'Read them first: duplicate, excess, partial payment, closed fiscal year…'
        },
        {
          target: 'decl-details',
          title: 'The declared payment',
          description: 'Compare this information with the operator statement.'
        },
        {
          target: 'decl-capture',
          title: 'The screenshot',
          description: 'The screenshot attached by the declarant, if any.'
        },
        { target: 'decl-valider', title: 'Approve', description: 'Collects the payment on the unit calls.' },
        {
          target: 'decl-rejeter',
          title: 'Reject',
          description: 'Refuses the declaration with a reason shown to the co-owner.'
        }
      ]
    }
  },
  {
    id: 'syndic.paiements.validation',
    kind: 'section',
    title: 'Approve a declaration',
    summary:
      'This window collects the declaration, as declared or after correcting the amount, the date or the calls concerned.',
    purpose: 'Approval turns the declaration into a real collection on the unit charge calls.',
    steps: [
      { title: 'Read the alerts', detail: 'Excess, partial payment and duplicate are recalled at the top.' },
      {
        title: 'Correct if needed',
        detail:
          'Turn on "Correct before validating": accepted date, "Amount withheld" per unit, "Charge calls concerned".'
      },
      {
        title: 'Add a note',
        detail: '"Note" of 10 to 500 characters; required in case of correction and shown to the co-owner.'
      },
      { title: 'Approve', detail: '"Validate as declared" or "Validate with correction".' }
    ],
    consequences: [
      'The collection is recorded on the unit calls, the oldest first if none is chosen. An excess becomes an advance on the unit; with a partial payment, the rest remains due.',
      'A receipt is issued for the payment and a settlement receipt for each call settled. They are sent by e-mail to the co-owner.',
      'The co-owner is notified, on a single channel (e-mail or WhatsApp) according to their preferences and the agency configuration.',
      'Approval is final: the screen does not allow it to be undone.'
    ],
    faq: [
      {
        q: 'What is the maximum amount after correction?',
        a: 'The total accepted cannot exceed the declared amount, and at least one unit must have an amount above 0.'
      },
      {
        q: 'The declared date falls in a closed fiscal year.',
        a: 'Correction is required: enter a date in an open fiscal year.'
      },
      {
        q: 'Someone has already approved.',
        a: 'You see "This declaration has just been processed or cancelled" and nothing is collected twice.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    related: [{ label: 'Reject a declaration', helpId: 'syndic.paiements.rejet' }],
    keywords: ['approve', 'collect', 'correction', 'accepted amount', 'settlement receipt', 'advance']
  },
  {
    id: 'syndic.paiements.rejet',
    kind: 'section',
    title: 'Reject a declaration',
    summary: 'This window refuses a declaration with a reason and a text that the co-owner will be able to read.',
    steps: [
      {
        title: 'Choose the reason',
        detail:
          '"Payment not found", "Amount does not match", "Reference already used", "Wrong receiving number" or "Other".'
      },
      { title: 'Write the text', detail: '"Text (required)" of 10 to 500 characters.' },
      { title: 'Confirm', detail: 'Click "Reject the declaration".' }
    ],
    consequences: [
      'A rejected declaration cannot be reopened: the co-owner will submit a new one. The reference becomes free again.',
      'The reason and the text are shown to the co-owner, who is notified on a single channel (e-mail or WhatsApp).',
      'No collection is recorded.'
    ],
    faq: [
      {
        q: 'Can I undo a rejection?',
        a: 'No. Ask the co-owner to declare again, or enter the declaration with "Declare for a co-owner".'
      },
      { q: 'Who reads the text?', a: 'The co-owner. Stay clear and courteous.' },
      { q: 'How long should the rejection text be?', a: 'It is required and must be 10 to 500 characters long.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    related: [{ label: 'Approve a declaration', helpId: 'syndic.paiements.validation' }],
    keywords: ['reject', 'refuse', 'rejection reason']
  },
  {
    id: 'syndic.paiements.declaration-tiers',
    kind: 'section',
    title: 'Declare for a co-owner',
    summary:
      'This window enters, on behalf of a co-owner, a declaration of a mobile money transfer. It remains to be approved.',
    purpose: 'Useful when a co-owner has handed you their proof of payment without going through their portal.',
    steps: [
      {
        title: 'Choose the co-owner and the units',
        detail:
          '"Units concerned": up to 10 units, each with its "Unit share (FCFA)"; "Charge calls concerned" may stay empty (oldest first).'
      },
      {
        title: 'Fill in the transfer',
        detail: '"Receiving number", "Payer’s number", "Date and time of the transfer", "Transaction reference".'
      },
      { title: 'Attach the screenshot', detail: 'Optional: JPEG, PNG, WebP or PDF, 5 MB at most.' },
      { title: 'Create', detail: 'Click "Create the declaration": the declaration drawer opens so you can approve it.' }
    ],
    consequences: ['The declaration credits nothing until you approve it.', 'It is marked "Manager" in the queue.'],
    faq: [
      {
        q: 'What are the limits?',
        a: 'The total amount does not exceed 5 000 000 FCFA, and the transfer is less than 90 days old and not in the future.'
      },
      {
        q: 'Which reference should I enter?',
        a: 'From 4 to 40 characters: letters, digits, dot or hyphen. It is saved in capitals and without spaces.'
      },
      { q: 'The window says no number is usable.', a: 'First add an active receiving number.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    keywords: ['enter a declaration', 'on behalf of the co-owner', 'proof of payment']
  },
  {
    id: 'syndic.paiements.numeros',
    kind: 'section',
    title: 'Mobile money receiving numbers',
    summary:
      'This card lists the numbers to which co-owners send their transfers. Each number is tracked on its own treasury account.',
    howToRead: {
      columns: [
        { key: 'operator', label: 'Operator', description: 'Orange Money, MTN MoMo, Moov Money, Wave or Autre.' },
        {
          key: 'phoneNumber',
          label: 'Number',
          description: 'Receiving number; a tag flags a number shared with other co-ownerships.'
        },
        { key: 'holderName', label: 'Holder', description: 'Account holder.' },
        { key: 'label', label: 'Label', description: 'Optional label.' },
        {
          key: 'treasury',
          label: 'Treasury account',
          description: 'Accounting account of the number and its balance.'
        },
        { key: 'pendingDeclarations', label: 'Pending', description: 'Declarations to check on this number.' },
        { key: 'isActive', label: 'Status', description: 'Actif or Inactif.' }
      ]
    },
    steps: [
      { title: 'Add', detail: '"Add a number": operator, number, holder, label, "Active".' },
      { title: 'Edit', detail: '"Edit" changes the holder, the label or the state.' },
      { title: 'Deactivate', detail: '"Deactivate" removes the number from what is offered to co-owners.' },
      { title: 'Delete', detail: '"Delete" is only possible if no declaration uses this number.' }
    ],
    consequences: [
      'A deactivated number is no longer offered, but declarations already pending can still be approved.',
      'Once a declaration exists, the operator and the number can no longer be edited: deactivate it and add a new one.'
    ],
    faq: [
      { q: 'Which number format?', a: 'An Ivorian mobile number, for example 07 07 07 07 07.' },
      {
        q: 'Why is there an orange tag on a number?',
        a: 'This number also receives payments for other co-ownerships: matching is done on the reference.'
      },
      { q: 'When can a number be deleted?', a: 'Only if no declaration uses that number. Otherwise, deactivate it.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing requires the right to view the Syndic module; adding, editing, deactivating and deleting require the right to edit it.'
    },
    related: [{ label: 'Declared payment settings', helpId: 'syndic.paiements.reglages' }],
    keywords: ['receiving number', 'orange money', 'mtn momo', 'moov money', 'wave', 'treasury account']
  },
  {
    id: 'syndic.paiements.reglages',
    kind: 'section',
    title: 'Declared payment settings',
    summary:
      'This card sets how the co-ownership accepts declared mobile money payments: activation, alert delay, screenshot, instruction and AI reading.',
    howToRead: {
      notes: [
        '"Accept declared payments": off by default. Without an active receiving number, the portal shows nothing.',
        '"Alert delay (business days)": from 1 to 15, 3 by default. A declaration pending for longer is "Overdue".',
        '"Screenshot required": off by default.',
        '"Instructions shown to the co-owner": text of at most 500 characters.',
        '"Pre-fill the declaration with AI from the screenshot": the AI suggests values that the co-owner reads over; it approves and credits nothing. A monthly reading quota is displayed.'
      ]
    },
    steps: [
      { title: 'Edit', detail: 'Change the settings you want.' },
      { title: 'Save', detail: 'The "Save" button only becomes active if there is a change.' }
    ],
    consequences: [
      'Turning off "Accept declared payments" hides the function from co-owners; declarations already received remain to be processed.',
      'When the monthly AI reading quota is reached, automatic reading is suspended until next month.'
    ],
    faq: [
      {
        q: 'AI reading is greyed out.',
        a: 'It is not available on this server: the message "Automatic reading is not available on this server" is shown.'
      },
      {
        q: 'Should the screenshot be required?',
        a: 'It helps with checking. If you require it, a co-owner cannot declare without attaching it.'
      },
      { q: 'What is the default alert delay?', a: '3 working days. You can set it from 1 to 15 working days.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing requires the right to view the Syndic module; saving requires the right to edit it.'
    },
    keywords: ['settings', 'alert delay', 'required screenshot', 'instruction', 'AI reading']
  },
  {
    id: 'syndic.paiements.passerelle',
    kind: 'section',
    title: 'Co-ownership payment account',
    summary:
      'This card configures the co-ownership PaySecureHub merchant account for online payment. Each co-ownership collects on its own account.',
    purpose:
      'Without an active and complete configuration, co-owners do not see the "Pay" button, even if the agency has its own account.',
    howToRead: {
      statuses: [
        { value: 'usable', label: 'Online payment active', description: 'The configuration is active and complete.' },
        { value: 'unusable', label: 'Online payment not usable', description: 'The "Pay" button is not offered.' }
      ],
      notes: [
        '"Method": "Simulator" (test, if available) or "Live". In real mode, the merchant identifier and the key are required.',
        'The key is never displayed again: "Replace the key" enters a new one; otherwise it stays unchanged.',
        '"Notification address (IPN)": to be given to PaySecureHub for this account.',
        '"Provider fees" follows the agency setting (payer or agency).',
        '"Book balance of account 5525": money collected online, before transfer. "Balance at the provider": read from PaySecureHub, with "Refresh".',
        '"Last test": result of the last "Test the connection".'
      ]
    },
    steps: [
      { title: 'Choose the mode', detail: '"Simulator" or "Live".' },
      { title: 'Fill in the account', detail: '"Merchant ID" and "API key".' },
      { title: 'Enable', detail: 'Switch on "Enable online payment", then "Save".' },
      { title: 'Test', detail: '"Test the connection" checks the account and shows the balance.' }
    ],
    consequences: [
      'While payments are in progress, the mode, the identifier and the key cannot change.',
      'Testing and saving send nothing to co-owners.'
    ],
    faq: [
      {
        q: 'I cannot edit this card.',
        a: 'It requires the right to edit the Syndic module and "Edit the agency settings". Without them, it stays read-only.'
      },
      {
        q: 'No encryption key is configured.',
        a: 'Saving a key is impossible until the server is configured. Contact the administrator.'
      },
      {
        q: 'Is the API key shown again after saving?',
        a: 'No. To change it, use "Replace the key"; otherwise it stays unchanged.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing requires the right to view the Syndic module. Saving and testing require the right to edit the Syndic module and "Edit the agency settings".'
    },
    related: [{ label: 'Online payments', helpId: 'syndic.paiements.en-ligne' }],
    keywords: ['paysecurehub', 'gateway', 'merchant account', 'API key', 'simulator', 'online payment']
  },
  {
    id: 'syndic.paiements.en-ligne',
    kind: 'table',
    title: 'Online payments',
    summary:
      'This table tracks payments made online by co-owners. You can check a payment with the provider or settle those that could not be recorded on their own.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date of the attempt.' },
        { key: 'codePaiement', label: 'Code', description: 'Payment code; the "Simulator" tag marks a test.' },
        { key: 'lot', label: 'Unit', description: 'The paying lot.' },
        { key: 'payer', label: 'Payer', description: 'The payer; "Record not found" if their record has disappeared.' },
        { key: 'calls', label: 'Charge calls', description: 'Periods of the calls concerned.' },
        {
          key: 'amount',
          label: 'Amount',
          description: 'Amount requested; "Receipt" appears if the amount received is different.'
        },
        { key: 'origin', label: 'Source', description: 'Co-owner portal or payment link, with the means used.' },
        { key: 'status', label: 'Status', description: 'State of the payment, with the reason if needed.' },
        { key: 'actions', label: 'Actions', description: '"Check" and "Decide".' }
      ],
      statuses: [
        {
          value: 'REVIEW',
          label: 'To decide',
          description: 'Collected at the provider but not recorded automatically: a decision is needed.'
        },
        { value: 'PENDING', label: 'Pending', description: 'Payment in progress.' },
        { value: 'SUCCESS', label: 'Paid', description: 'Collected and recorded.' },
        { value: 'FAILED', label: 'Failed', description: 'The payment did not succeed.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Cancelled.' },
        { value: 'EXPIRED', label: 'Expired', description: 'The attempt expired.' }
      ],
      notes: [
        'A banner flags the payments to settle; "View" filters on them.',
        'The pills above the table give the number of payments per status.'
      ]
    },
    steps: [
      {
        title: 'Check',
        detail: '"Check" (pending or to-settle payments) queries the provider and updates the status.'
      },
      { title: 'Settle', detail: '"Decide" (payments to settle) opens the decision: see the sheet "Settle a payment".' }
    ],
    consequences: [
      '"Check" can move a payment to "Paid" and record the collection. If there is nothing new, the message "No change at the provider" is shown.'
    ],
    faq: [
      {
        q: 'Why are there payments "To decide"?',
        a: 'The payment arrived but cannot be recorded on its own: different amount, closed fiscal year, call gone, transaction already recorded, or a contrary state from the provider.'
      },
      { q: 'Where is the code to give to support?', a: 'In the "Code" column: the copy icon takes it in one click.' },
      {
        q: 'What does "Check" do?',
        a: 'It queries the provider and updates the status. If nothing is new, the message "No change at the provider" is shown.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing requires the right to view the Syndic module; "Check" and "Decide" require the right to edit it.'
    },
    related: [
      { label: 'Settle a payment', helpId: 'syndic.paiements.decision' },
      { label: 'Payment link for a call', helpId: 'syndic.paiements.lien' }
    ],
    keywords: ['online payment', 'tracking', 'check', 'to settle', 'payment code']
  },
  {
    id: 'syndic.paiements.decision',
    kind: 'section',
    title: 'Settle a payment',
    summary:
      'This window decides the fate of an online payment that the system could not record on its own: accept it (collect) or refuse it.',
    purpose:
      'The reason at the top explains why the payment is blocked. The table summarises the amount requested, the amount received, the unit, the payer and the calls concerned.',
    howToRead: {
      statuses: [
        {
          value: 'AMOUNT_MISMATCH',
          label: 'Amount paid differs from the amount expected',
          description: 'Accepting collects the amount received.'
        },
        {
          value: 'FISCAL_YEAR_CLOSED',
          label: 'Financial year closed on the payment date',
          description: 'Accepting requires a collection date in an open fiscal year.'
        },
        {
          value: 'CALLS_UNAVAILABLE',
          label: 'A targeted charge call has disappeared or no longer belongs to the unit',
          description: 'Accepting or refusing are both possible.'
        },
        {
          value: 'DUPLICATE_TRANSACTION',
          label: 'Provider transaction already recorded',
          description: 'Only refusal is possible.'
        },
        {
          value: 'CONTRARY_STATE',
          label: 'The provider reports a failure or cancellation after a success',
          description:
            'If the collection already exists: accepting only closes the tracking. Otherwise, accepting collects and refusing is possible.'
        }
      ]
    },
    steps: [
      { title: 'Read the reason', detail: 'The yellow alert gives the reason.' },
      { title: 'Choose', detail: '"Accept" or "Reject"; the forbidden option is greyed out.' },
      { title: 'Date', detail: 'When collecting, "Collection date" (today if empty, never in the future).' },
      { title: 'Note', detail: '"Note (required)", 500 characters at most, kept in the audit log.' },
      { title: 'Save', detail: '"Save the decision".' }
    ],
    consequences: [
      'Accepting records the collection on the unit calls and issues the receipts and settlement receipts, sent by e-mail to the co-owner. If the amount received is not reported, the amount requested is recorded.',
      'Refusing records nothing and does not refund the payer: the money stays with PaySecureHub, the refund is done outside ImmoTopia.',
      'The decision is final.'
    ],
    faq: [
      { q: 'Why is "Reject" greyed out?', a: 'When the collection already exists, it cannot be cancelled here.' },
      { q: 'How do I refund a payer?', a: 'Directly with PaySecureHub, outside this screen.' },
      { q: 'Is the note required?', a: 'Yes, with at most 500 characters. It is kept in the audit log.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    keywords: ['settle', 'accept', 'refuse', 'to settle', 'refund']
  },
  {
    id: 'syndic.paiements.reversements',
    kind: 'table',
    title: 'Transfers to the bank',
    summary:
      'This table lists the recorded transfers of money collected by PaySecureHub or the operators to the co-ownership bank account.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'Date of the transfer.' },
        {
          key: 'treasuryAccountNumber',
          label: 'Account',
          description: '5525 for online payment, or the account of the receiving number.'
        },
        { key: 'reference', label: 'Reference', description: 'Reference of the bank transfer.' },
        { key: 'amount', label: 'Amount', description: 'Amount transferred.' },
        { key: 'note', label: 'Note', description: 'Optional note.' }
      ],
      notes: [
        'Filters: text, account and period.',
        'The button is greyed out when no account has a balance to transfer.'
      ]
    },
    steps: [{ title: 'Record', detail: '"Record a payout" opens the entry window.' }],
    faq: [
      {
        q: 'Is the transfer triggered here?',
        a: 'No. This screen only records the accounting entry, once the money has reached the bank account.'
      },
      { q: 'Why is the record button greyed out?', a: 'Because no account has a balance to transfer.' },
      { q: 'How do I find a transfer?', a: 'Filter by text, account and period.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing requires the right to view the Syndic module; recording requires the right to edit it.'
    },
    related: [{ label: 'Record a transfer', helpId: 'syndic.paiements.reversement' }],
    keywords: ['transfer to bank', 'bank transfer', 'account 5525', 'bank']
  },
  {
    id: 'syndic.paiements.reversement',
    kind: 'section',
    title: 'Record a transfer',
    summary:
      'This window records that a sum collected online or by mobile money has been paid into the co-ownership bank account.',
    steps: [
      {
        title: 'Choose the account',
        detail: '"Account to pay out": PaySecureHub (5525) or a receiving number, with its balance.'
      },
      { title: 'Enter the amount', detail: '"Amount paid out": at most the account balance.' },
      { title: 'Date and reference', detail: '"Payout date" (not in the future) and "Transfer reference" (required).' },
      { title: 'Save', detail: '"Note (optional)" if needed, then "Save".' }
    ],
    consequences: [
      'The accounting entry is posted (collection account to bank account 521) and the account balance drops by the amount.',
      'No bank transfer is triggered and nobody is notified.'
    ],
    faq: [
      { q: 'The amount exceeds the balance.', a: 'The transfer is refused: reduce it to the displayed balance.' },
      {
        q: 'What happens in the accounts?',
        a: 'The entry moves from the collection account to the bank account 521, and the account balance goes down by the transferred amount.'
      },
      {
        q: 'Which information is required?',
        a: 'The "Transfer reference" is required, and the transfer date cannot be in the future.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    keywords: ['transfer', 'bank transfer', 'accounting entry']
  },
  {
    id: 'syndic.paiements.lien',
    kind: 'section',
    title: 'Payment link for a call',
    summary:
      'This window creates a "Pay this charge call" link for a charge call, to send to the co-owner or copy. It also lists the existing links.',
    purpose:
      'The co-owner pays the remaining balance of the call by Mobile Money, without logging in. The amount is recalculated at the time of payment.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Created on', description: 'Creation date.' },
        { key: 'expiresAt', label: 'Expires on', description: 'Expiry date.' },
        { key: 'origin', label: 'Source', description: 'Manager, or attached to a notice or a reminder.' },
        { key: 'viewCount', label: 'Views', description: 'Number of times the link was opened.' },
        { key: 'payment', label: 'Payment', description: 'Status of the payment made with this link, or a dash.' },
        { key: 'status', label: 'Status', description: 'Active, Expired or Revoked.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The link can still be used.' },
        { value: 'EXPIRED', label: 'Expired', description: 'The validity period has passed.' },
        { value: 'REVOKED', label: 'Revoked', description: 'The link has been deactivated.' }
      ]
    },
    steps: [
      { title: 'Choose the delivery', detail: '"Send to the co-owner (WhatsApp or e-mail)" or "Copy link".' },
      { title: 'Duration', detail: '"Validity (days)" from 1 to 30, 7 by default.' },
      { title: 'Create', detail: '"Send the link" or "Create the link".' },
      {
        title: 'Revoke',
        detail: '"Revoke" deactivates an active link; the co-owner will no longer be able to pay with it.'
      }
    ],
    consequences: [
      'The full link is displayed only once, at creation: after the window is closed, it cannot be read again.',
      'For "Send", the link goes by WhatsApp or by e-mail. With no eligible channel (no WhatsApp number or usable e-mail, or no consent), nothing is sent and the cause is shown.',
      'The link only exists if online payment is active for the co-ownership.'
    ],
    faq: [
      {
        q: 'I see the list but not the create button.',
        a: 'Creating, sending and revoking require the right to edit the Syndic module; the list only requires the right to view.'
      },
      { q: 'How do I see expired links?', a: 'Turn on "Also show expired and revoked links".' },
      { q: 'How long does a link stay valid?', a: 'You choose the "Validity (days)" from 1 to 30; it is 7 by default.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing the list requires the right to view the Syndic module; creating, sending and revoking require the right to edit it.'
    },
    related: [{ label: 'Online payments', helpId: 'syndic.paiements.en-ligne' }],
    keywords: ['payment link', 'pay this call', 'mobile money', 'secure link']
  }
];

export default entries;
