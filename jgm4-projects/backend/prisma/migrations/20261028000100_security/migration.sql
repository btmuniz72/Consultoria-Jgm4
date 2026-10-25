-- Etapa 8 — segurança: estado do usuário, MFA, sessões revogáveis, reset de senha, eventos de segurança,
-- rate limit persistente, anexos privados e incidentes.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR', 'SKIPPED');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED');

ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE', ADD COLUMN "lastLoginAt" TIMESTAMP(3), ADD COLUMN "lastActivityAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3), ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "mfaSecretEnc" TEXT,
  ADD COLUMN "mfaPendingSecretEnc" TEXT, ADD COLUMN "anonymizedAt" TIMESTAMP(3);
UPDATE "User" SET "status" = 'INACTIVE' WHERE "active" = false;

CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "refreshHash" TEXT NOT NULL, "previousRefreshHash" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "idleExpiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "revokedReason" TEXT,
  "ip" TEXT, "userAgent" TEXT, "mfaPending" BOOLEAN NOT NULL DEFAULT false, CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AuthSession_refreshHash_key" ON "AuthSession"("refreshHash");
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "tokenHash" TEXT NOT NULL, "purpose" TEXT NOT NULL DEFAULT 'RESET', "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "requestedIp" TEXT, CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SecurityEvent" (
  "id" UUID NOT NULL, "type" TEXT NOT NULL, "userId" UUID, "projectId" UUID, "ip" TEXT, "userAgent" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");
CREATE INDEX "SecurityEvent_projectId_createdAt_idx" ON "SecurityEvent"("projectId", "createdAt");
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RateLimitBucket" ("key" TEXT NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL, CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key"));

CREATE TABLE "Attachment" (
  "id" UUID NOT NULL, "projectId" UUID NOT NULL, "entityType" TEXT NOT NULL, "entityId" UUID NOT NULL, "originalName" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL, "sha256" TEXT NOT NULL, "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING', "scanDetail" TEXT, "uploadedByUserId" UUID, "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_projectId_entityType_entityId_idx" ON "Attachment"("projectId", "entityType", "entityId");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SecurityIncident" (
  "id" UUID NOT NULL, "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN', "title" TEXT NOT NULL, "description" TEXT NOT NULL, "impact" TEXT, "affectedData" TEXT, "affectedCompanyIds" JSONB,
  "actionsTaken" TEXT, "responsibleUserId" UUID, "occurredAt" TIMESTAMP(3), "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3),
  "createdByUserId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SecurityIncident_status_createdAt_idx" ON "SecurityIncident"("status", "createdAt");

CREATE TABLE "IncidentEvent" (
  "id" UUID NOT NULL, "incidentId" UUID NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "userId" UUID, "note" TEXT NOT NULL, "fromStatus" "IncidentStatus", "toStatus" "IncidentStatus",
  CONSTRAINT "IncidentEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "IncidentEvent_incidentId_at_idx" ON "IncidentEvent"("incidentId", "at");
ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Eventos de segurança não são editáveis (a retenção apaga por política, nunca altera); a linha do tempo de incidente é só de acréscimo.
CREATE FUNCTION prevent_security_record_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro de segurança não pode ser alterado.';
END $$;
CREATE TRIGGER security_event_no_update BEFORE UPDATE ON "SecurityEvent" FOR EACH ROW EXECUTE FUNCTION prevent_security_record_update();
CREATE TRIGGER incident_event_append_only BEFORE UPDATE OR DELETE ON "IncidentEvent" FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
