-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PLANNED', 'BLOCKED', 'AVAILABLE', 'REQUESTED', 'CLIENT_PREPARING', 'SENT_TO_JGM4', 'JGM4_REVIEW', 'ADJUSTMENT_REQUESTED', 'ACCEPTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProjectRequest" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "taskId" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "clientResponsibleId" UUID,
    "dueDate" DATE,
    "status" "RequestStatus" NOT NULL DEFAULT 'PLANNED',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "estimatedClientHours" DECIMAL(8,2),
    "acceptanceCriteria" TEXT NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestRequirement" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" UUID,

    CONSTRAINT "RequestRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "userId" UUID,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectRequest_projectId_status_idx" ON "ProjectRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectRequest_projectId_phaseId_idx" ON "ProjectRequest"("projectId", "phaseId");

-- CreateIndex
CREATE INDEX "ProjectRequest_taskId_idx" ON "ProjectRequest"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRequest_projectId_code_key" ON "ProjectRequest"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RequestRequirement_requestId_label_key" ON "RequestRequirement"("requestId", "label");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_entityType_entityId_createdAt_idx" ON "AuditLog"("projectId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_phaseId_id_key" ON "Task"("projectId", "phaseId", "id");

-- AddForeignKey
ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_projectId_phaseId_fkey" FOREIGN KEY ("projectId", "phaseId") REFERENCES "Phase"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_projectId_phaseId_taskId_fkey" FOREIGN KEY ("projectId", "phaseId", "taskId") REFERENCES "Task"("projectId", "phaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_clientResponsibleId_fkey" FOREIGN KEY ("clientResponsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestRequirement" ADD CONSTRAINT "RequestRequirement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProjectRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestRequirement" ADD CONSTRAINT "RequestRequirement_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mantém o ID da atividade de zoneamento da Etapa 1, adotando o código do Plano C.
WITH mapped AS (
  UPDATE "Task" SET "code" = 'C05'
  WHERE "projectId" = '9f1ead00-1c44-4000-8000-000000000002'::uuid AND "code" = 'F0-002'
    AND NOT EXISTS (SELECT 1 FROM "Task" WHERE "projectId" = '9f1ead00-1c44-4000-8000-000000000002'::uuid AND "code" = 'C05')
  RETURNING "id", "projectId"
)
INSERT INTO "AuditLog" ("id", "projectId", "entityType", "entityId", "action", "actorType", "oldValue", "newValue")
SELECT gen_random_uuid(), "projectId", 'Task', "id", 'CODE_MAPPED', 'SYSTEM', '{"code":"F0-002"}'::jsonb, '{"code":"C05"}'::jsonb FROM mapped;

-- Auditoria somente de acréscimo: sem alteração, exclusão ou truncamento dos logs.
CREATE FUNCTION prevent_audit_log_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog é imutável: alteração e exclusão não permitidas.';
END;
$$;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_change();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_change();
