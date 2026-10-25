-- Etapa 6 — novos estados do projeto. Os valores só podem ser usados em uma migration posterior.
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'PLANNING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
