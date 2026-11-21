import { describeScheduleRule } from '../../components/syndics/charge-schedules/scheduleRuleSummary';

describe('describeScheduleRule — la règle de génération en français courant', () => {
  it('reste vide tant que la fréquence ou le jour d’émission manque', () => {
    expect(describeScheduleRule({})).toEqual([]);
    expect(describeScheduleRule({ frequency: 'MONTHLY' })).toEqual([]);
  });

  it('décrit le rythme et le délai avant échéance', () => {
    const [rythme] = describeScheduleRule({ frequency: 'QUARTERLY', issueDay: 5, dueOffsetDays: 15 });
    expect(rythme).toBe(
      "Un appel de charges est émis chaque trimestre, le 5 du premier mois de la période ; l'échéance tombe 15 jours après l'émission."
    );
  });

  it('dit « le jour même » quand le délai est nul', () => {
    const [rythme] = describeScheduleRule({ frequency: 'MONTHLY', issueDay: 1, dueOffsetDays: 0 });
    expect(rythme).toContain("l'échéance tombe le jour même de l'émission");
  });

  it('reprend le budget approuvé quand la source est le budget', () => {
    const lines = describeScheduleRule({ frequency: 'ANNUAL', issueDay: 1, dueOffsetDays: 30, amountSource: 'BUDGET' });
    expect(lines[1]).toBe("Le montant reprend le budget approuvé de l'exercice au moment de l'émission.");
  });

  it('nomme le montant fixe et son mode de répartition', () => {
    const shares = describeScheduleRule({
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 10,
      amountSource: 'FIXED',
      fixedAmount: 500000,
      allocationMethod: 'SHARES',
      currency: 'XOF'
    });
    expect(shares[1]).toMatch(/Montant fixe de 500\D?000.*FCFA par période, réparti selon les tantièmes\./);

    const equal = describeScheduleRule({
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 10,
      amountSource: 'FIXED',
      fixedAmount: 500000,
      allocationMethod: 'EQUAL'
    });
    expect(equal[1]).toContain('divisé à parts égales');

    const byType = describeScheduleRule({
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 10,
      amountSource: 'FIXED',
      allocationMethod: 'BY_LOT_TYPE'
    });
    expect(byType[1]).toContain('barème par type de lot');
  });

  it('ajoute la durée de la programmation quand les dates sont connues', () => {
    const lines = describeScheduleRule({
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 10,
      startDate: '2027-01-01',
      endDate: '2027-12-31'
    });
    expect(lines[lines.length - 1]).toBe('La programmation court du 01/01/2027 au 31/12/2027.');

    const open = describeScheduleRule({
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 10,
      startDate: '2027-01-01'
    });
    expect(open[open.length - 1]).toBe('La programmation démarre le 01/01/2027, sans date de fin.');
  });
});
