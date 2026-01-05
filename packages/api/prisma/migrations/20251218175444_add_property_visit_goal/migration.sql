-- CreateEnum
CREATE TYPE "PropertyVisitGoal" AS ENUM ('CONTACT_TAKING', 'NETWORKING', 'EVALUATION', 'CONTRACT_SIGNING', 'FOLLOW_UP', 'NEGOTIATION', 'OTHER');

-- AlterTable
ALTER TABLE "property_visits" ADD COLUMN     "goal" "PropertyVisitGoal";
