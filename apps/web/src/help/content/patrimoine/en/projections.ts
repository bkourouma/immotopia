import type { HelpEntry } from '../../../types';

/** « projections » zone of the « patrimoine » module (en). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.projections',
    kind: 'page',
    title: 'Projections',
    summary:
      'This screen estimates your net worth year after year, based on assumptions you can change. Nothing calculated here changes your real data.',
    purpose:
      'Start from your assets and debts as of today, choose a horizon (from 1 to 30 years) and a scenario, then look at the curve. You can then simulate a sale, a purchase, a loan, an early repayment or a monthly saving, and save your settings under a name.',
    steps: [
      {
        title: 'Set the projection',
        detail:
          'Choose the horizon, the base scenario (Cautious, Central or Optimistic) and, if you wish, "Compare the three scenarios".'
      },
      {
        title: 'Read the results',
        detail: 'The curve, then the "Annual table", give net worth year by year.'
      },
      {
        title: 'Adjust the assumptions',
        detail: 'In the "Assumptions" card, change the growth rates and inflation, then "Apply assumptions".'
      },
      {
        title: 'Simulate an operation',
        detail: 'In "Simulate", add one or more operations then "Run the simulation".'
      },
      {
        title: 'Keep your settings',
        detail: 'In "Saved scenarios", give a name and click "Save this scenario".'
      }
    ],
    consequences: [
      'These are indicative assumptions, not a forecast. A banner reminds you of this at the top of the screen.',
      'Your income is not taken into account: your debt monthly payments are assumed to be paid from your income, so net worth increases by the principal repaid.',
      'Only assets with the status "Active" that have a value, and debts with the status "Active", enter the calculation. An asset with no value is flagged and left out.',
      'Simulations change neither your assets nor your debts. Only the scenarios you save are kept.'
    ],
    faq: [
      {
        q: 'What do "Today" and "Year 3" mean?',
        a: '"Today" is the current situation. "Year 3" is the situation at the end of the third year.'
      },
      {
        q: 'Why is no projection displayed?',
        a: 'You need at least one asset with a value. The "My assets" link takes you there.'
      },
      {
        q: 'Why is my horizon rejected?',
        a: 'The horizon must be a whole number from 1 to 30. As long as it is invalid, no calculation is run.'
      },
      {
        q: 'Are my settings saved automatically?',
        a: 'No. To find them again, save them in "Saved scenarios".'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Calculating and opening a scenario requires "View personal patrimony"; saving, renaming, updating or deleting a scenario requires "Edit personal patrimony".'
    },
    related: [
      { label: 'Projection settings', helpId: 'patrimoine.projections.reglages' },
      { label: 'Assumptions', helpId: 'patrimoine.projections.hypotheses' },
      { label: 'Simulate', helpId: 'patrimoine.projections.simulation' },
      { label: 'My assets', to: '/tenant/:tenantId/patrimoine/actifs' }
    ],
    keywords: ['projection', 'simulation', 'future', 'horizon', 'scenario', 'forecast', 'future net worth']
  },
  {
    id: 'patrimoine.projections.reglages',
    kind: 'section',
    title: 'Projection settings',
    summary:
      'Three settings drive the calculation: the horizon in years, the base scenario and the option to compare the three scenarios.',
    howToRead: {
      notes: [
        'Horizon: a whole number from 1 to 30 years (10 by default).',
        'Base scenario: Cautious, Central (default) or Optimistic. Each sets different growth rates by class and a different inflation, visible in "Assumptions".',
        '"Compare the three scenarios" plots the three curves together; your custom assumptions then apply to all three.',
        'Changing the base scenario clears your custom assumptions.'
      ]
    },
    consequences: [
      'Each change reruns the calculation. For the horizon, the calculation waits until you finish typing.'
    ],
    faq: [
      {
        q: 'Which scenario should I choose?',
        a: 'Cautious assumes low growth and higher inflation, Optimistic the opposite. Central is in between. None is a forecast.'
      }
    ],
    keywords: ['horizon', 'base scenario', 'prudent', 'central', 'optimistic', 'compare']
  },
  {
    id: 'patrimoine.projections.avertissements',
    kind: 'section',
    title: 'Good to know about these results',
    summary:
      'This yellow banner lists the points that limit the reliability of the calculation: unreliable values, asset with no value, undersized debt, negative cash, operation that no longer applies.',
    howToRead: {
      notes: [
        '"x % of the starting value relies on low-reliability values": share of today\'s total assets that rests on low-reliability values.',
        '"An asset has no value": it is not counted in the projection.',
        '"A debt\'s monthly payment does not cover its interest": its principal does not decrease, and unpaid interest is not counted.',
        '"A debt reached maturity with a remaining balance": this balance is kept as is, without interest.',
        '"Cash becomes negative in year n": in the simulation, your purchases, repayments or other outflows exceed the available money.',
        '"An operation no longer applies": the targeted asset or debt no longer exists or is no longer active.'
      ]
    },
    keywords: ['warning', 'alert', 'negative cash', 'debt', 'unreliable value']
  },
  {
    id: 'patrimoine.projections.courbe',
    kind: 'section',
    title: 'Net worth per year',
    summary:
      'The curve shows projected net worth from year 0 (today) to the horizon. Exact values can be read in the annual table.',
    howToRead: {
      notes: [
        'Without comparison: one "Base" curve for the chosen scenario.',
        'With "Compare the three scenarios": one curve per scenario, with a different line pattern; the base scenario curve is thicker.',
        'After a simulation: an orange dashed "Simulation" curve is added.',
        'Hover over the curve to read the exact amount.'
      ]
    },
    related: [
      { label: 'Annual table', helpId: 'patrimoine.projections.tableau' },
      { label: 'Assumptions', helpId: 'patrimoine.projections.hypotheses' }
    ],
    keywords: ['curve', 'chart', 'scenarios', 'projected net worth']
  },
  {
    id: 'patrimoine.projections.tableau',
    kind: 'table',
    title: 'Annual table',
    summary:
      'One row per year for the base trajectory: assets, debts, net worth and real value. It is the numerical version of the curve.',
    howToRead: {
      columns: [
        {
          key: 'year',
          label: 'Year',
          description: '"Today" for the current situation, then "Year 1", "Year 2"… (end of each year).'
        },
        {
          key: 'assets',
          label: 'Assets',
          description: 'Projected total assets: each asset grows at the rate of its class, and vehicles depreciate.'
        },
        {
          key: 'debts',
          label: 'Debts',
          description:
            'Projected remaining principal: each year, 12 monthly payments repay interest first, then principal.'
        },
        { key: 'netWorth', label: 'Net worth', description: 'Assets minus debts.' },
        {
          key: 'realNetWorth',
          label: "Real value (today's purchasing power)",
          description:
            "Net worth divided by cumulative inflation: it expresses what this sum would be worth in today's purchasing power."
        }
      ],
      notes: ['The table always shows the base projection, never the simulation.']
    },
    faq: [
      {
        q: 'Why is real value lower than net worth?',
        a: "Because it removes the effect of the assumed inflation. At 3 % inflation, 1,000,000 FCFA in one year is worth about 970,000 FCFA in today's money."
      }
    ],
    related: [{ label: 'Net worth per year', helpId: 'patrimoine.projections.courbe' }],
    keywords: ['table', 'year', 'real value', 'inflation', 'export']
  },
  {
    id: 'patrimoine.projections.ecart',
    kind: 'table',
    title: 'Difference from the base',
    summary:
      'After a simulation, this table compares, year by year, the net worth of the base and that of the simulation. The sentence above gives the difference at the last year.',
    howToRead: {
      columns: [
        { key: 'year', label: 'Year', description: 'The year concerned.' },
        { key: 'base', label: 'Base', description: 'Net worth without your operations.' },
        { key: 'simulated', label: 'Simulation', description: 'Net worth with your simulated operations.' },
        {
          key: 'delta',
          label: 'Difference',
          description: 'Simulation minus base, with its sign: + if the simulation does better, − otherwise.'
        }
      ]
    },
    related: [{ label: 'Simulate', helpId: 'patrimoine.projections.simulation' }],
    keywords: ['difference', 'comparison', 'simulation', 'delta']
  },
  {
    id: 'patrimoine.projections.hypotheses',
    kind: 'section',
    title: 'Assumptions',
    summary:
      'This card displays the assumptions actually used: annual growth of each asset class and annual inflation. You can change them.',
    purpose:
      'The proposed rates are indicative and nominal: they depend on the base scenario. Adjust them according to your knowledge of the market.',
    steps: [
      { title: 'Change a rate', detail: 'Change the growth of a class or the inflation.' },
      {
        title: 'Apply',
        detail: '"Apply assumptions" reruns the calculation. Changed values are marked "Custom".'
      },
      {
        title: 'Go back to the start',
        detail: '"Restore default assumptions" removes your customisations.'
      }
    ],
    howToRead: {
      notes: [
        'Growth: between −50 % and 100 % per year and per class. Inflation: between 0 % and 100 %.',
        'A class without its own rate follows the base scenario. Vehicles and equipment do not follow this rate: they depreciate according to their information (cost, useful life, residual value).',
        'A savings asset that has an expected rate uses that rate rather than its class rate.',
        'Inflation is only used to calculate real value.'
      ]
    },
    consequences: ['Your custom assumptions are only kept if you save a scenario.'],
    faq: [
      {
        q: 'A rate is rejected, why?',
        a: 'A message states the limits: growth between −50 % and 100 %, inflation between 0 % and 100 %.'
      }
    ],
    keywords: ['assumptions', 'growth', 'inflation', 'rate', 'customised']
  },
  {
    id: 'patrimoine.projections.simulation',
    kind: 'section',
    title: 'Simulate',
    summary:
      'You add imaginary operations (sale, purchase, loan, repayment, saving), then run them all at once to see their effect on net worth.',
    purpose: 'A simulation does not change your data: it answers the question "what if I did this?".',
    steps: [
      {
        title: 'Choose the type',
        detail: '"Operation type": sale of an asset, purchase of an asset, new loan, early repayment or monthly saving.'
      },
      { title: 'Fill in the fields', detail: 'Years range from 1 up to the chosen horizon.' },
      { title: 'Add the operation', detail: 'It joins the "Simulated operations" list. "Remove" removes it.' },
      {
        title: 'Run',
        detail: '"Run the simulation" calculates the "Simulation" curve and the "Difference from the baseline" table.'
      }
    ],
    howToRead: {
      notes: [
        'Sale of an asset: assets with the status "Active", valued, excluding "Accounts and mobile money". Without a sale price, it is the projected value of the asset that year; fees in percent are deducted. The money goes into the simulated cash. A debt linked to the asset is not paid off by the sale.',
        'Purchase of an asset: class, name, price, year, optional growth. The price leaves the cash; the asset is worth its price, then grows.',
        'New loan: amount, annual rate, term in years (1 to 30). The amount enters the cash, the debt is repaid by constant monthly payments.',
        'Early repayment: an "Active" debt, an amount that does not exceed the remaining principal projected for that year. It leaves the cash.',
        'Monthly saving: amount per month, from the start year to the end year (by default, the horizon). Each year adds 12 deposits to the cash, without interest in the year of the deposit.',
        'At most 50 operations. Within the same year, growth and maturities come first, then saving, then the other operations in the order of the list.'
      ]
    },
    consequences: [
      'No real data is modified.',
      'If you change the list, a message invites you to rerun the simulation to update the results.',
      'Calculation errors are shown under the operation concerned (for example a repayment greater than the remaining principal).'
    ],
    faq: [
      {
        q: 'Why can I not sell an account?',
        a: 'An account or a mobile money balance is not an asset you sell. Use monthly saving or a repayment instead.'
      },
      {
        q: 'What does "negative cash" mean?',
        a: 'Your simulated purchases or repayments exceed the available money (accounts included). The calculation continues but warns you.'
      }
    ],
    permissions: { note: 'Calculating requires "View personal patrimony".' },
    related: [{ label: 'Difference from the base', helpId: 'patrimoine.projections.ecart' }],
    keywords: ['simulate', 'sale', 'purchase', 'loan', 'early repayment', 'monthly saving', 'operation', 'what if']
  },
  {
    id: 'patrimoine.projections.scenarios',
    kind: 'section',
    title: 'Saved scenarios',
    summary:
      'Save your settings (horizon, base scenario, custom assumptions, simulated operations) under a name, to reopen them later.',
    steps: [
      { title: 'Save', detail: 'Enter a "Scenario name" then "Save this scenario".' },
      {
        title: 'Open',
        detail: '"Open" reloads the settings and reruns the calculation on your current data.'
      },
      { title: 'Rename', detail: '"Rename", new name, then "Confirm".' },
      {
        title: 'Update',
        detail: '"Update" replaces the scenario settings with those of the screen, after confirmation.'
      },
      { title: 'Delete', detail: '"Delete", then confirm.' }
    ],
    consequences: [
      'No result is stored: only the settings are. The figures therefore change if your assets or debts change.',
      'Deletion is final.',
      'The name is limited to 120 characters. A name already in use is rejected, and you cannot exceed 100 saved scenarios.',
      'If an asset or a debt cited by a scenario no longer exists, the operation is ignored with a warning.'
    ],
    faq: [
      {
        q: 'I cannot see the buttons to save.',
        a: 'You need the right "Edit personal patrimony". Without it, you can only open scenarios.'
      }
    ],
    permissions: {
      note: 'Opening requires "View personal patrimony"; the other actions require "Edit personal patrimony".'
    },
    keywords: ['scenario', 'save', 'open', 'rename', 'backup']
  }
];

export default entries;
