import { AccountModule } from '@ghostfolio/api/app/account/account.module';
import { OrderModule } from '@ghostfolio/api/app/order/order.module';
import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { UserModule } from '@ghostfolio/api/app/user/user.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';

import { Module } from '@nestjs/common';

import { GauntletAgentController } from '@ghostfolio/api/app/gauntlet-agent/gauntlet-agent.controller';
import { GauntletAgentService } from '@ghostfolio/api/app/gauntlet-agent/gauntlet-agent.service';
import { ConversationMemoryModule } from '@ghostfolio/api/app/gauntlet-agent/memory-system/conversation-memory.module';

@Module({
  controllers: [GauntletAgentController],
  imports: [
    AccountModule,
    ConfigurationModule,
    ConversationMemoryModule,
    DataProviderModule,
    OrderModule,
    PortfolioModule,
    PropertyModule,
    UserModule
  ],
  providers: [GauntletAgentService]
})
export class GauntletAgentModule {}
