-- Add new event triggers for payment declarations (notify agency on declaration, notify tenant on approval/rejection)
ALTER TYPE "EventTrigger" ADD VALUE 'PAYMENT_DECLARED';
ALTER TYPE "EventTrigger" ADD VALUE 'PAYMENT_DECLARATION_REJECTED';
