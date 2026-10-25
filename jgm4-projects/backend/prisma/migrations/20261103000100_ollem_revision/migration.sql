-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('NOT_CREATED', 'DRAFT', 'SENT_FOR_SIGNATURE', 'SIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExternalDependencyStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "commercialControlEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contractReference" TEXT,
ADD COLUMN     "contractStatus" "ContractStatus" NOT NULL DEFAULT 'NOT_CREATED',
ADD COLUMN     "ollemRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startExceptionAt" TIMESTAMP(3),
ADD COLUMN     "startExceptionByUserId" UUID,
ADD COLUMN     "startExceptionReason" TEXT;

-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GateCriterion" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "movementApprovalNote" TEXT,
ADD COLUMN     "movementApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "movementApprovedAt" TIMESTAMP(3),
ADD COLUMN     "movementApprovedByUserId" UUID;

-- CreateTable
CREATE TABLE "PhaseCommercial" (
    "phaseId" UUID NOT NULL,
    "homeOfficeHours" DECIMAL(8,2),
    "inCompanyHours" DECIMAL(8,2),
    "entryPercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "dueDate" DATE,
    "paymentCondition" TEXT NOT NULL DEFAULT 'Entrada na abertura da fase',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "conditionMet" BOOLEAN NOT NULL DEFAULT false,
    "conditionNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseCommercial_pkey" PRIMARY KEY ("phaseId")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "notes" TEXT,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "acceptedText" JSONB,
    "acceptedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalComment" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalDependency" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "taskId" UUID,
    "description" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "supplier" TEXT,
    "dueDate" DATE,
    "impact" TEXT NOT NULL,
    "status" "ExternalDependencyStatus" NOT NULL DEFAULT 'PLANNED',
    "blocksProject" BOOLEAN NOT NULL DEFAULT false,
    "blocksTask" BOOLEAN NOT NULL DEFAULT false,
    "stage" TEXT NOT NULL DEFAULT 'Definição técnica',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proposal_projectId_status_idx" ON "Proposal"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_projectId_version_key" ON "Proposal"("projectId", "version");

-- CreateIndex
CREATE INDEX "ExternalDependency_projectId_status_idx" ON "ExternalDependency"("projectId", "status");

-- AddForeignKey
ALTER TABLE "PhaseCommercial" ADD CONSTRAINT "PhaseCommercial_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDependency" ADD CONSTRAINT "ExternalDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDependency" ADD CONSTRAINT "ExternalDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
