import { IsString } from 'class-validator';

export class ChatDto {
  @IsString()
  public message: string;
}
