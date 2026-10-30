import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, IsEnum } from 'class-validator';
import { ActionClassification, ResponsibilityType, TaskPriority } from '../generated/prisma/client';

export class TaskTransitionDto {
  @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @IsOptional() @IsString() @MaxLength(10000) comment?: string;
  @IsOptional() @IsString() @MaxLength(10000) guidance?: string;
}

export class TaskRequirementDto {
  @IsBoolean() completed!: boolean;
  @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}

export class TimeEntryDto {
  @IsDateString() date!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1000) hours!: number;
  @IsString() @MinLength(2) @MaxLength(5000) description!: string;
}

export class TaskPlanDto {
  @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
  @IsOptional() @IsEnum(ResponsibilityType) responsibilityType?: ResponsibilityType;
  @IsOptional() @IsDateString() plannedStartDate?: string | null;
  @IsOptional() @IsDateString() plannedEndDate?: string | null;
  @IsOptional() @IsDateString() nextActionDueDate?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) nextAction?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10000) plannedJgm4Hours?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10000) plannedClientHours?: number | null;
  @IsOptional() @IsString() @MaxLength(120) category?: string | null;
  @IsOptional() @IsEnum(ActionClassification) classification?: ActionClassification | null;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority | null;
  @IsOptional() @IsUUID() milestoneId?: string | null;
}

export class TaskEvidenceDto {
  @IsString() @MinLength(2) @MaxLength(5000) description!: string;
  @IsOptional() @IsString() @MaxLength(2000) referenceUrl?: string;
}
