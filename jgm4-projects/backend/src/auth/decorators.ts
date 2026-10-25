import { SetMetadata } from '@nestjs/common';
import type { Role } from '../approvals/authority';

export const IS_PUBLIC = 'auth:public';
export const ROLES_KEY = 'auth:roles';
/** Rota sem autenticação (login, logout, health). Tudo o mais exige usuário autenticado. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Restringe a rota aos perfis informados (além da validação de projeto e da alçada no serviço). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
