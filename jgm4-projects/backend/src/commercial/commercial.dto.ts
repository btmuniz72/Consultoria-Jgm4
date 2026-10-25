import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CommercialPhaseDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999) homeOfficeHours!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999) inCompanyHours!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) entryPercent!: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsString() @MinLength(3) @MaxLength(2000) paymentCondition!: string;
  @IsBoolean() blocking!: boolean;
  @IsBoolean() conditionMet!: boolean;
  @IsOptional() @IsString() @MaxLength(2000) conditionNote?: string;
}
export class ProposalDraftDto {
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
}
export class ProposalAcceptDto {
  @IsInt() @Min(1) version!: number;
  @IsString() @MaxLength(64) contentHash!: string;
  @IsArray() @IsBoolean({ each: true }) acknowledgements!: boolean[];
}
export class NoteDto { @IsString() @MinLength(5) @MaxLength(5000) text!: string; }
export class ContractDto {
  @IsIn(['NOT_CREATED', 'DRAFT', 'SENT_FOR_SIGNATURE', 'SIGNED', 'CANCELLED']) status!: 'NOT_CREATED' | 'DRAFT' | 'SENT_FOR_SIGNATURE' | 'SIGNED' | 'CANCELLED';
  @IsString() @MinLength(5) @MaxLength(2000) reference!: string;
}
export class ScheduleDto {
  @IsOptional() @IsDateString() plannedStartDate?: string;
  @IsOptional() @IsDateString() plannedEndDate?: string;
}
export class DependencyDto {
  @IsString() @MinLength(3) @MaxLength(1000) description!: string;
  @IsString() @MinLength(2) @MaxLength(200) responsible!: string;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsString() @MinLength(3) @MaxLength(2000) impact!: string;
  @IsIn(['PLANNED', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED']) status!: 'PLANNED' | 'IN_PROGRESS' | 'WAITING_EXTERNAL' | 'COMPLETED' | 'CANCELLED';
  @IsBoolean() blocksProject!: boolean;
  @IsBoolean() blocksTask!: boolean;
  @IsOptional() @IsUUID() taskId?: string;
  @IsIn(['Definição técnica', 'Orçamento', 'Aprovação Ollem', 'Compra/contratação', 'Prazo fornecedor', 'Recebimento', 'Instalação', 'Validação']) stage!: string;
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
}
