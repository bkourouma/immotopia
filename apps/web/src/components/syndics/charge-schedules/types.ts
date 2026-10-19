import {
  ChargeAllocationMethod,
  ChargeScheduleAmountSource,
  ChargeScheduleFrequency
} from '../../../types/syndic-types';

export interface ScheduleFormValues {
  label: string;
  frequency: ChargeScheduleFrequency;
  issueDay: number;
  dueOffsetDays: number;
  amountSource: ChargeScheduleAmountSource;
  budgetId?: string;
  fixedAmount?: number;
  allocationMethod?: ChargeAllocationMethod;
  currency: string;
  startDate: string;
  endDate?: string;
  active: boolean;
}
