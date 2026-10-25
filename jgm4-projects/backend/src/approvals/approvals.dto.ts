import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const APPROVAL_CATEGORIES = ['ALL', 'REQUESTS', 'TASKS', 'GATES', 'CHANGES'] as const;
export class ApprovalsQuery {
  @IsOptional() @IsIn(APPROVAL_CATEGORIES) category?: typeof APPROVAL_CATEGORIES[number];
  @IsOptional() @IsIn(['today', 'overdue']) due?: 'today' | 'overdue';
  @IsOptional() @IsIn(['high']) priority?: 'high';
  @IsOptional() @IsUUID() projectId?: string;
  // `open` (padrão) = PENDING + IN_REVIEW; `all` inclui o histórico de decisões.
  @IsOptional() @IsIn(['open', 'all']) status?: 'open' | 'all';
  // `mine` (padrão) = o que a alçada do perfil atual permite decidir; `all` = tudo que está aberto.
  @IsOptional() @IsIn(['mine', 'all']) scope?: 'mine' | 'all';
}
export class SummaryQuery {
  @IsOptional() @IsUUID() projectId?: string;
}
export class DecisionDto {
  @IsOptional() @IsString() @MaxLength(10000) comment?: string;
  @IsOptional() @IsString() @MaxLength(10000) instructions?: string;
  @IsOptional() @IsDateString() suggestedDueDate?: string;
  @IsOptional() @IsString() @MaxLength(10000) technicalOpinion?: string;
}
export class DueDateChangeDto {
  @IsDateString() requestedDate!: string;
  @IsString() @MinLength(5) @MaxLength(5000) justification!: string;
  @IsOptional() @IsString() @MaxLength(5000) expectedImpact?: string;
}
export class ResponsibleChangeDto {
  @IsIn(['CLIENT', 'JGM4']) field!: 'CLIENT' | 'JGM4';
  @IsUUID() newUserId!: string;
  @IsString() @MinLength(5) @MaxLength(5000) justification!: string;
}
export class ReasonDto {
  @IsString() @MinLength(5) @MaxLength(5000) reason!: string;
}
