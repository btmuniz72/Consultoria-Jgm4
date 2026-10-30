-- Perfil de leitura executiva da Ollem (diretoria). Em arquivo separado: o valor novo não pode ser usado na mesma transação.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLIENT_EXECUTIVE';
