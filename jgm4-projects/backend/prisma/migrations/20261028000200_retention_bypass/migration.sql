-- Etapa 8 — SecurityEvent continua imutável para a aplicação; apenas a rotina de retenção (que define jgm4.retention=on na transação)
-- pode anonimizar IP/agente de eventos antigos.
CREATE OR REPLACE FUNCTION prevent_security_record_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('jgm4.retention', true) = 'on' AND NEW."type" = OLD."type" AND NEW."createdAt" = OLD."createdAt" AND NEW."metadata" IS NOT DISTINCT FROM OLD."metadata" THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Registro de segurança não pode ser alterado.';
END $fn$;
