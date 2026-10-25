ALTER TABLE "Task" ADD COLUMN "requiredForGate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PhaseCommercial" ADD CONSTRAINT "commercial_nonnegative" CHECK (("homeOfficeHours" IS NULL OR "homeOfficeHours" >= 0) AND ("inCompanyHours" IS NULL OR "inCompanyHours" >= 0) AND "entryPercent" BETWEEN 0 AND 100);
