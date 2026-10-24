ALTER TYPE "PhaseStatus" ADD VALUE IF NOT EXISTS 'LOCKED';
ALTER TYPE "PhaseStatus" ADD VALUE IF NOT EXISTS 'WAITING_GATE';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'IMPLEMENTATION_COMPLETED';
ALTER TYPE "GateStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
CREATE TYPE "GateRecommendation" AS ENUM ('ADVANCE', 'DO_NOT_ADVANCE');
CREATE TYPE "GateClientDecision" AS ENUM ('APPROVE', 'HOLD', 'REJECT');
CREATE TYPE "GateCriterionSource" AS ENUM ('TASK', 'REQUEST', 'MANUAL', 'INDICATOR', 'DOCUMENT');
ALTER TABLE "Phase" ADD COLUMN "plannedStartDate" DATE, ADD COLUMN "plannedEndDate" DATE,
  ADD COLUMN "actualStartDate" DATE, ADD COLUMN "actualEndDate" DATE,
  ADD COLUMN "plannedClientHours" DECIMAL(8,2);
ALTER TABLE "Gate" ADD COLUMN "technicalRecommendation" "GateRecommendation",
  ADD COLUMN "technicalApprovedByUserId" UUID, ADD COLUMN "technicalApprovedAt" TIMESTAMP(3),
  ADD COLUMN "clientDecision" "GateClientDecision", ADD COLUMN "clientDecisionComment" TEXT,
  ADD COLUMN "clientDecisionByUserId" UUID, ADD COLUMN "clientDecisionAt" TIMESTAMP(3),
  ADD COLUMN "correctionReason" TEXT, ADD COLUMN "correctionInstructions" TEXT,
  ADD COLUMN "currentOwnerType" TEXT NOT NULL DEFAULT 'SYSTEM', ADD COLUMN "currentOwnerUserId" UUID,
  ADD COLUMN "nextAction" TEXT, ADD COLUMN "nextActionDueDate" DATE;
CREATE TABLE "GateCriterion" (
  "id" UUID NOT NULL, "gateId" UUID NOT NULL, "code" TEXT NOT NULL, "description" TEXT NOT NULL,
  "mandatory" BOOLEAN NOT NULL DEFAULT true, "satisfied" BOOLEAN NOT NULL DEFAULT false,
  "satisfiedAt" TIMESTAMP(3), "satisfiedByUserId" UUID, "sourceType" "GateCriterionSource",
  "sourceEntityId" UUID, "evidenceRequired" BOOLEAN NOT NULL DEFAULT false, "evidenceReference" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "GateCriterion_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "GateCriterion_gateId_code_key" ON "GateCriterion"("gateId", "code");
CREATE INDEX "GateCriterion_gateId_order_idx" ON "GateCriterion"("gateId", "order");
ALTER TABLE "GateCriterion" ADD CONSTRAINT "GateCriterion_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- The first phase remains available; future phases are locked until the preceding Gate is formally approved.
UPDATE "Phase" SET "status" = 'LOCKED' WHERE "order" > 0 AND "status" <> 'COMPLETED';
UPDATE "Phase" SET "status" = 'AVAILABLE' WHERE "order" = 0 AND "status" IN ('BLOCKED', 'LOCKED');
ALTER TABLE "Phase" ALTER COLUMN "status" SET DEFAULT 'LOCKED';
