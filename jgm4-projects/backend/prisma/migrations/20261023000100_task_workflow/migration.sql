-- CreateEnum
CREATE TYPE "ResponsibilityType" AS ENUM ('CLIENT', 'JGM4', 'JOINT');

-- CreateEnum
CREATE TYPE "TimeEntryOrganization" AS ENUM ('JGM4', 'CLIENT');

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "actualEndDate" TIMESTAMP(3),
ADD COLUMN     "actualStartDate" TIMESTAMP(3),
ADD COLUMN     "blockedByGateId" UUID,
ADD COLUMN     "clientResponsibleUserId" UUID,
ADD COLUMN     "currentOwnerType" TEXT NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "currentOwnerUserId" UUID,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "jgm4ResponsibleUserId" UUID,
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "nextActionDueDate" DATE,
ADD COLUMN     "plannedEndDate" DATE,
ADD COLUMN     "plannedStartDate" DATE,
ADD COLUMN     "predecessorTaskId" UUID,
ADD COLUMN     "responsibilityType" "ResponsibilityType" NOT NULL DEFAULT 'JOINT',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "plannedJgm4Hours" SET DATA TYPE DECIMAL(8,2),
ALTER COLUMN "plannedClientHours" SET DATA TYPE DECIMAL(8,2);

-- CreateTable
CREATE TABLE "TaskRequirement" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" UUID,

    CONSTRAINT "TaskRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvidence" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "referenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" UUID,

    CONSTRAINT "TaskEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "userId" UUID,
    "organizationType" "TimeEntryOrganization" NOT NULL,
    "date" DATE NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskRequirement_taskId_label_key" ON "TaskRequirement"("taskId", "label");

-- CreateIndex
CREATE INDEX "TaskEvidence_taskId_createdAt_idx" ON "TaskEvidence"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeEntry_projectId_phaseId_date_idx" ON "TimeEntry"("projectId", "phaseId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_organizationType_idx" ON "TimeEntry"("taskId", "organizationType");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientResponsibleUserId_fkey" FOREIGN KEY ("clientResponsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_jgm4ResponsibleUserId_fkey" FOREIGN KEY ("jgm4ResponsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_currentOwnerUserId_fkey" FOREIGN KEY ("currentOwnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_predecessorTaskId_fkey" FOREIGN KEY ("predecessorTaskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_blockedByGateId_fkey" FOREIGN KEY ("blockedByGateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRequirement" ADD CONSTRAINT "TaskRequirement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRequirement" ADD CONSTRAINT "TaskRequirement_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_projectId_phaseId_fkey" FOREIGN KEY ("projectId", "phaseId") REFERENCES "Phase"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_projectId_phaseId_taskId_fkey" FOREIGN KEY ("projectId", "phaseId", "taskId") REFERENCES "Task"("projectId", "phaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_phaseId_fkey" FOREIGN KEY ("projectId", "phaseId") REFERENCES "Phase"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_phaseId_taskId_fkey" FOREIGN KEY ("projectId", "phaseId", "taskId") REFERENCES "Task"("projectId", "phaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the original kickoff task and its identity while assigning the Plan C code.
INSERT INTO "AuditLog" ("id", "projectId", "entityType", "entityId", "action", "actorType", "oldValue", "newValue")
SELECT gen_random_uuid(), t."projectId", 'Task', t."id", 'PLAN_CODE_MAPPED', 'SYSTEM',
       jsonb_build_object('code', t."code", 'title', t."title"),
       jsonb_build_object('code', 'C00', 'title', 'Kick-off e alinhamento', 'plannedJgm4Hours', COALESCE(t."plannedJgm4Hours", 6), 'plannedClientHours', COALESCE(t."plannedClientHours", 2))
FROM "Task" t
WHERE t."projectId" = '9f1ead00-1c44-4000-8000-000000000002'::uuid AND t."code" = 'F0-001';

UPDATE "Task" SET "code" = 'C00', "title" = 'Kick-off e alinhamento',
  "description" = 'Atividade C00 do Plano C da Ollem.', "objective" = 'Kick-off e alinhamento',
  "instructions" = 'Executar kick-off e alinhamento conforme o padrão acordado com a JGM4 e registrar evidências.',
  "acceptanceCriteria" = 'Kick-off e alinhamento concluído e evidências aceitas pela JGM4.',
  "plannedJgm4Hours" = COALESCE("plannedJgm4Hours", 6), "plannedClientHours" = COALESCE("plannedClientHours", 2),
  "responsibilityType" = 'JOINT', "currentOwnerType" = 'SYSTEM', "nextAction" = 'Aguardar liberação das dependências.'
WHERE "projectId" = '9f1ead00-1c44-4000-8000-000000000002'::uuid AND "code" = 'F0-001';

INSERT INTO "AuditLog" ("id", "projectId", "entityType", "entityId", "action", "actorType", "oldValue", "newValue")
SELECT gen_random_uuid(), t."projectId", 'Task', t."id", 'PLAN_INITIALIZED', 'SYSTEM',
       jsonb_build_object('plannedJgm4Hours', NULL, 'plannedClientHours', NULL),
       jsonb_build_object('plannedJgm4Hours', t."plannedJgm4Hours", 'plannedClientHours', t."plannedClientHours")
FROM "Task" t
WHERE t."projectId" = '9f1ead00-1c44-4000-8000-000000000002'::uuid AND t."code" = 'C00';

INSERT INTO "AuditLog" ("id", "projectId", "entityType", "entityId", "action", "actorType", "oldValue", "newValue")
SELECT gen_random_uuid(), t."projectId", 'Task', t."id", 'PLAN_INITIALIZED', 'SYSTEM',
       jsonb_build_object('plannedJgm4Hours', t."plannedJgm4Hours", 'plannedClientHours', t."plannedClientHours"),
       jsonb_build_object('plannedJgm4Hours', COALESCE(t."plannedJgm4Hours", 4), 'plannedClientHours', COALESCE(t."plannedClientHours", 8))
FROM "Task" t
WHERE t."projectId" = '9f1ead00-1c44-4000-8000-000000000002'::uuid AND t."code" = 'C05';

UPDATE "Task" SET "title" = 'Zoneamento', "description" = 'Atividade C05 do Plano C da Ollem.',
  "objective" = 'Zoneamento', "plannedJgm4Hours" = COALESCE("plannedJgm4Hours", 4),
  "plannedClientHours" = COALESCE("plannedClientHours", 8), "responsibilityType" = 'JOINT',
  "currentOwnerType" = 'SYSTEM', "nextAction" = 'Aguardar o aceite da solicitação SOL-006.'
WHERE "projectId" = '9f1ead00-1c44-4000-8000-000000000002'::uuid AND "code" = 'C05';
