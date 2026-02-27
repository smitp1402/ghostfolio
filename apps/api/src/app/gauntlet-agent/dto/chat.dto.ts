import { IsOptional, IsString } from 'class-validator';

export class ChatDto {
  @IsOptional()
  @IsString()
  public conversationId?: string;

  @IsString()
  public message: string;
}
