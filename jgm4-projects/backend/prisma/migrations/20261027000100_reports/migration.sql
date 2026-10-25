-- Etapa 7 — relatórios, ciclo de vida do projeto, plano de sustentação e pendências transferidas.
CREATE TYPE "CarriedOverStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "ReportGenerationLog" (
  "id" UUID NOT NULL, "projectId" UUID NOT NULL, "reportType" TEXT NOT NULL, "format" TEXT NOT NULL, "fileName" TEXT NOT NULL,
  "parameters" JSONB, "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "generatedByUserId" UUID, "generatedByRole" TEXT,
  CONSTRAINT "ReportGenerationLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ReportGenerationLog_projectId_generatedAt_idx" ON "ReportGenerationLog"("projectId", "generatedAt");
ALTER TABLE "ReportGenerationLog" ADD CONSTRAINT "ReportGenerationLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportGenerationLog" ADD CONSTRAINT "ReportGenerationLog_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProjectStatusEvent" (
  "id" UUID NOT NULL, "projectId" UUID NOT NULL, "fromStatus" "ProjectStatus" NOT NULL, "toStatus" "ProjectStatus" NOT NULL, "reason" TEXT NOT NULL, "note" TEXT,
  "effectiveDate" DATE NOT NULL, "expectedResumeDate" DATE, "createdByUserId" UUID, "createdByRole" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectStatusEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ProjectStatusEvent_projectId_createdAt_idx" ON "ProjectStatusEvent"("projectId", "createdAt");
ALTER TABLE "ProjectStatusEvent" ADD CONSTRAINT "ProjectStatusEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectStatusEvent" ADD CONSTRAINT "ProjectStatusEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SustainmentItem" (
  "id" UUID NOT NULL, "projectId" UUID NOT NULL, "routine" TEXT NOT NULL, "frequency" TEXT NOT NULL, "responsible" TEXT NOT NULL, "indicator" TEXT, "criterion" TEXT,
  "nextReviewDate" DATE, "active" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SustainmentItem_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SustainmentItem_projectId_active_idx" ON "SustainmentItem"("projectId", "active");
ALTER TABLE "SustainmentItem" ADD CONSTRAINT "SustainmentItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SustainmentItem" ADD CONSTRAINT "SustainmentItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CarriedOverItem" (
  "id" UUID NOT NULL, "projectId" UUID NOT NULL, "fromPhaseId" UUID NOT NULL, "toPhaseId" UUID NOT NULL, "description" TEXT NOT NULL, "responsible" TEXT NOT NULL,
  "dueDate" DATE, "status" "CarriedOverStatus" NOT NULL DEFAULT 'OPEN', "resolvedAt" TIMESTAMP(3), "createdByUserId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CarriedOverItem_pkey" PRIMARY KEY ("id"));
CREATE INDEX "CarriedOverItem_projectId_status_idx" ON "CarriedOverItem"("projectId", "status");
ALTER TABLE "CarriedOverItem" ADD CONSTRAINT "CarriedOverItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CarriedOverItem" ADD CONSTRAINT "CarriedOverItem_fromPhaseId_fkey" FOREIGN KEY ("fromPhaseId") REFERENCES "Phase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CarriedOverItem" ADD CONSTRAINT "CarriedOverItem_toPhaseId_fkey" FOREIGN KEY ("toPhaseId") REFERENCES "Phase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CarriedOverItem" ADD CONSTRAINT "CarriedOverItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Registros de exportação e de mudança de status são somente de acréscimo.
CREATE FUNCTION prevent_append_only_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro somente de acréscimo: alteração e exclusão não permitidas.';
END $$;
CREATE TRIGGER report_log_append_only BEFORE UPDATE OR DELETE ON "ReportGenerationLog" FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
CREATE TRIGGER project_status_event_append_only BEFORE UPDATE OR DELETE ON "ProjectStatusEvent" FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
