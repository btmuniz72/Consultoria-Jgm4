-- Etapa 6 — converte os valores legados e troca o padrão.
UPDATE "Project" SET "status" = 'PLANNING' WHERE "status" = 'PLANNED';
UPDATE "Project" SET "status" = 'IMPLEMENTATION_COMPLETED' WHERE "status" = 'COMPLETED';
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'PLANNING';
