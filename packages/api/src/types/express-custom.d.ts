import { GlobalRole } from '@prisma/client';

declare global {
  namespace Express {
    // Extend the User interface (used by Passport and our verifyToken middleware)
    interface User {
      id?: string;
      userId?: string; // For JWT compatibility where we map id to userId or vice versa
      email?: string;
      globalRole?: GlobalRole;
    }
  }
}

export {};
