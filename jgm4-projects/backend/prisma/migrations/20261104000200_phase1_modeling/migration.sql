-- CreateEnum
CREATE TYPE "ActionClassification" AS ENUM ('EXECUTE_NOW', 'PARALLEL', 'ACQUISITION', 'DEVELOPMENT', 'FUTURE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "category" TEXT,
ADD COLUMN     "classification" "ActionClassification",
ADD COLUMN     "milestoneId" UUID,
ADD COLUMN     "priority" "TaskPriority",
ADD COLUMN     "responseData" JSONB;

-- CreateTable
CREATE TABLE "PhaseMilestone" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "GateStatus" NOT NULL DEFAULT 'BLOCKED',
    "plannedDate" DATE,
    "actualDate" DATE,
    "jgm4ResponsibleUserId" UUID,
    "clientResponsibleUserId" UUID,
    "technicalOpinion" TEXT,
    "technicalRecommendation" "GateRecommendation",
    "technicalApprovedByUserId" UUID,
    "technicalApprovedAt" TIMESTAMP(3),
    "clientDecision" "GateClientDecision",
    "clientDecisionComment" TEXT,
    "clientDecisionByUserId" UUID,
    "clientDecisionAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneCriterion" (
    "id" UUID NOT NULL,
    "milestoneId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "satisfied" BOOLEAN NOT NULL DEFAULT false,
    "satisfiedAt" TIMESTAMP(3),
    "satisfiedByUserId" UUID,
    "evidenceReference" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilestoneCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "taskId" UUID,
    "milestoneId" UUID,
    "requestId" UUID,
    "authorUserId" UUID NOT NULL,
    "authorRole" "UserRole" NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhaseMilestone_phaseId_order_idx" ON "PhaseMilestone"("phaseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseMilestone_projectId_code_key" ON "PhaseMilestone"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseMilestone_projectId_id_key" ON "PhaseMilestone"("projectId", "id");

-- CreateIndex
CREATE INDEX "MilestoneCriterion_milestoneId_order_idx" ON "MilestoneCriterion"("milestoneId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneCriterion_milestoneId_code_key" ON "MilestoneCriterion"("milestoneId", "code");

-- CreateIndex
CREATE INDEX "Comment_projectId_taskId_createdAt_idx" ON "Comment"("projectId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_projectId_milestoneId_createdAt_idx" ON "Comment"("projectId", "milestoneId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_projectId_requestId_createdAt_idx" ON "Comment"("projectId", "requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRequest_projectId_id_key" ON "ProjectRequest"("projectId", "id");

-- CreateIndex
CREATE INDEX "Task_milestoneId_idx" ON "Task"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_id_key" ON "Task"("projectId", "id");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_milestoneId_fkey" FOREIGN KEY ("projectId", "milestoneId") REFERENCES "PhaseMilestone"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseMilestone" ADD CONSTRAINT "PhaseMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseMilestone" ADD CONSTRAINT "PhaseMilestone_projectId_phaseId_fkey" FOREIGN KEY ("projectId", "phaseId") REFERENCES "Phase"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseMilestone" ADD CONSTRAINT "PhaseMilestone_jgm4ResponsibleUserId_fkey" FOREIGN KEY ("jgm4ResponsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseMilestone" ADD CONSTRAINT "PhaseMilestone_clientResponsibleUserId_fkey" FOREIGN KEY ("clientResponsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneCriterion" ADD CONSTRAINT "MilestoneCriterion_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "PhaseMilestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_taskId_fkey" FOREIGN KEY ("projectId", "taskId") REFERENCES "Task"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_milestoneId_fkey" FOREIGN KEY ("projectId", "milestoneId") REFERENCES "PhaseMilestone"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_requestId_fkey" FOREIGN KEY ("projectId", "requestId") REFERENCES "ProjectRequest"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Comentário pertence a EXATAMENTE uma entidade (atividade, marco ou solicitação).
ALTER TABLE "Comment" ADD CONSTRAINT "comment_one_entity" CHECK (num_nonnulls("taskId", "milestoneId", "requestId") = 1);
ALTER TABLE "Comment" ADD CONSTRAINT "comment_body_not_blank" CHECK (length(btrim("body")) > 0);

-- Comentários são append-only: sem UPDATE, DELETE nem TRUNCATE (mesmo padrão de AuditLog e Approval).
CREATE FUNCTION prevent_comment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Comentários são imutáveis (append-only).';
END;
$$;
CREATE TRIGGER comment_immutable BEFORE UPDATE OR DELETE ON "Comment"
FOR EACH ROW EXECUTE FUNCTION prevent_comment_change();
CREATE TRIGGER comment_no_truncate BEFORE TRUNCATE ON "Comment"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_comment_change();
