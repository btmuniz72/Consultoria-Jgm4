-- Etapa 10A — administração operacional. Somente colunas novas e opcionais; nenhum dado existente é alterado.
ALTER TABLE "Company" ADD COLUMN "displayName" TEXT, ADD COLUMN "internalCode" TEXT, ADD COLUMN "notes" TEXT;
CREATE UNIQUE INDEX "Company_internalCode_key" ON "Company"("internalCode");
ALTER TABLE "Project" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");
ALTER TABLE "User" ADD COLUMN "statusReason" TEXT;
-- Eventos administrativos de empresa/usuário não pertencem a um projeto.
ALTER TABLE "AuditLog" ALTER COLUMN "projectId" DROP NOT NULL;
