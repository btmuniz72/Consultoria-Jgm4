-- Etapa 5 — Central de Aprovações, alçadas e próxima ação.
CREATE TYPE "ApprovalType" AS ENUM ('REQUEST_REVIEW', 'TASK_VALIDATION', 'GATE_TECHNICAL_OPINION', 'GATE_CLIENT_DECISION', 'DUE_DATE_CHANGE', 'RESPONSIBLE_CHANGE', 'TASK_REOPEN', 'REQUEST_CANCEL', 'OTHER');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'ADJUSTMENT_REQUESTED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'ADJUSTMENT_REQUESTED', 'REJECTED');
CREATE TYPE "ApprovalPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

CREATE TABLE "Approval" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "type" "ApprovalType" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "entityCode" TEXT,
  "requestedByUserId" UUID,
  "requestedByRole" "UserRole",
  "assignedToUserId" UUID,
  "assignedRole" "UserRole",
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "payload" JSONB,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" DATE,
  "decidedAt" TIMESTAMP(3),
  "decidedByUserId" UUID,
  "decidedByRole" "UserRole",
  "decision" "ApprovalDecision",
  "decisionComment" TEXT,
  "priority" "ApprovalPriority" NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Approval_projectId_status_idx" ON "Approval"("projectId", "status");
CREATE INDEX "Approval_status_assignedRole_idx" ON "Approval"("status", "assignedRole");
CREATE INDEX "Approval_entityType_entityId_type_idx" ON "Approval"("entityType", "entityId", "type");
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Idempotência garantida pelo banco: no máximo uma aprovação aberta por entidade e tipo.
CREATE UNIQUE INDEX "Approval_one_open_per_entity_type" ON "Approval"("entityType", "entityId", "type") WHERE "status" IN ('PENDING', 'IN_REVIEW');

-- Decisões nunca são apagadas; uma aprovação já decidida também não pode ser reescrita.
CREATE FUNCTION prevent_approval_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('PENDING', 'IN_REVIEW') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Decisões de aprovação são imutáveis e não podem ser apagadas.';
END $$;
CREATE TRIGGER approval_history_immutable BEFORE UPDATE OR DELETE ON "Approval"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_history_change();
CREATE TRIGGER approval_no_truncate BEFORE TRUNCATE ON "Approval"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_approval_history_change();
