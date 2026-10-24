import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export enum RequestFilter {
  ALL = 'all', AVAILABLE = 'available', CLIENT = 'client', JGM4 = 'jgm4', BLOCKED = 'blocked', ACCEPTED = 'accepted',
}
export class RequestsQuery {
  @IsOptional() @IsEnum(RequestFilter) filter?: RequestFilter;
}
export class TransitionDto {
  @IsOptional() @IsString() @MaxLength(10000) note?: string;
  @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}
export class RequirementDto {
  @IsBoolean() completed!: boolean;
  @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}
