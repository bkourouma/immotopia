import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Form } from 'antd';
import { ScheduleFormFields } from '../../components/syndics/charge-schedules/ScheduleFormFields';
import { formModes } from './charges-form-modes-mock';

/** Réglage du champ « Date de fin » de la programmation d'appels automatiques. */

const T = { timeout: 15000 };

vi.mock('../../hooks/useFormFieldModes', async () => (await import('./charges-form-modes-mock')).formModesModule);

const Harness: React.FC = () => {
  const [form] = Form.useForm();
  return (
    <>
      <ScheduleFormFields form={form} editing={null} approvedBudgetOptions={[]} />
      <button onClick={() => void form.validateFields().catch(() => undefined)}>valider</button>
    </>
  );
};

describe('ScheduleFormFields — date de fin réglable', () => {
  beforeEach(() => {
    formModes.current = {};
  });

  it('sans réglage : date de fin optionnelle', () => {
    render(<Harness />);
    expect(screen.getByText('Date de fin (optionnelle)')).toBeTruthy();
  });

  it('masquée : absente du formulaire', () => {
    formModes.current = { endDate: 'HIDDEN' };
    render(<Harness />);
    expect(screen.queryByText(/Date de fin/)).toBeNull();
  });

  it('obligatoire : message de validation', async () => {
    formModes.current = { endDate: 'REQUIRED' };
    render(<Harness />);
    fireEvent.click(screen.getByText('valider'));
    expect(await screen.findByText('La date de fin est obligatoire', {}, T)).toBeTruthy();
  });
});
