import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';

import { Module } from '@nestjs/common';

import { ConversationMemoryService } from './conversation-memory.service';

@Module({
  exports: [ConversationMemoryService],
  imports: [ConfigurationModule, RedisCacheModule],
  providers: [ConversationMemoryService]
})
export class ConversationMemoryModule {}
