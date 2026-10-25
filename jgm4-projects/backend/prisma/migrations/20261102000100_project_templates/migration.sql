-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TemplateDependencyKind" AS ENUM ('TASK_AFTER_TASK', 'TASK_BLOCKED_BY_GATE', 'REQUEST_FOR_TASK');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "templateId" UUID,
ADD COLUMN     "templateNameSnapshot" TEXT,
ADD COLUMN     "templateVersion" INTEGER,
ADD COLUMN     "templateVersionSnapshot" INTEGER;

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "methodology" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplatePhase" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "plannedWeeks" INTEGER NOT NULL DEFAULT 1,
    "plannedJgm4Hours" INTEGER NOT NULL DEFAULT 0,
    "plannedClientHours" DECIMAL(8,2),

    CONSTRAINT "TemplatePhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateGate" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "TemplateGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateGateCriterion" (
    "id" UUID NOT NULL,
    "gateId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" "GateCriterionSource" NOT NULL DEFAULT 'MANUAL',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateGateCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTask" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,
    "responsibilityType" "ResponsibilityType" NOT NULL DEFAULT 'JOINT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "plannedJgm4Hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "plannedClientHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateChecklistItem" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRequest" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "relativeDueDays" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRequestRequirement" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateRequestRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDependency" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "kind" "TemplateDependencyKind" NOT NULL,
    "fromCode" TEXT NOT NULL,
    "toCode" TEXT NOT NULL,

    CONSTRAINT "TemplateDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTemplate_status_idx" ON "ProjectTemplate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTemplate_code_version_key" ON "ProjectTemplate"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TemplatePhase_templateId_order_key" ON "TemplatePhase"("templateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateGate_phaseId_key" ON "TemplateGate"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateGate_templateId_code_key" ON "TemplateGate"("templateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateGateCriterion_gateId_code_key" ON "TemplateGateCriterion"("gateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateTask_templateId_code_key" ON "TemplateTask"("templateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateChecklistItem_taskId_label_key" ON "TemplateChecklistItem"("taskId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRequest_templateId_code_key" ON "TemplateRequest"("templateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRequestRequirement_requestId_label_key" ON "TemplateRequestRequirement"("requestId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateDependency_templateId_kind_fromCode_toCode_key" ON "TemplateDependency"("templateId", "kind", "fromCode", "toCode");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePhase" ADD CONSTRAINT "TemplatePhase_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateGate" ADD CONSTRAINT "TemplateGate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateGate" ADD CONSTRAINT "TemplateGate_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TemplatePhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateGateCriterion" ADD CONSTRAINT "TemplateGateCriterion_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "TemplateGate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTask" ADD CONSTRAINT "TemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTask" ADD CONSTRAINT "TemplateTask_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TemplatePhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateChecklistItem" ADD CONSTRAINT "TemplateChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TemplateTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRequest" ADD CONSTRAINT "TemplateRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRequest" ADD CONSTRAINT "TemplateRequest_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TemplatePhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRequestRequirement" ADD CONSTRAINT "TemplateRequestRequirement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TemplateRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDependency" ADD CONSTRAINT "TemplateDependency_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

