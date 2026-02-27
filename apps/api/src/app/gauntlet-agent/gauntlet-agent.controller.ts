import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import { Body, Controller, HttpException, Inject, Post, UseGuards } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { StatusCodes } from 'http-status-codes';

import { GauntletAgentService } from '@ghostfolio/api/app/gauntlet-agent/gauntlet-agent.service';
import { ChatDto } from '@ghostfolio/api/app/gauntlet-agent/dto/chat.dto';

@Controller('gauntlet-agent')
export class GauntletAgentController {
  public constructor(
    private readonly gauntletAgentService: GauntletAgentService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Post('chat')
  @HasPermission(permissions.readAiPrompt)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async chat(@Body() body: ChatDto): Promise<{ text: string }> {
    const userId = this.request.user.id;
    const userCurrency =
      this.request.user.settings?.settings?.baseCurrency ?? 'USD';
    try {
      const text = await this.gauntletAgentService.chat({
        message: body.message,
        userId,
        userCurrency
      });
      return { text };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Agent request failed';
      const isConfigError =
        /not configured|API key|model/i.test(message);
      throw new HttpException(
        { error: message },
        isConfigError ? StatusCodes.BAD_REQUEST : StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  }
}
