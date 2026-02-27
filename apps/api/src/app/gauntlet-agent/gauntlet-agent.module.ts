import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { UserModule } from '@ghostfolio/api/app/user/user.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';

import { Module } from '@nestjs/common';

import { GauntletAgentController } from '@ghostfolio/api/app/gauntlet-agent/gauntlet-agent.controller';
import { GauntletAgentService } from '@ghostfolio/api/app/gauntlet-agent/gauntlet-agent.service';

@Module({
  controllers: [GauntletAgentController],
  imports: [ConfigurationModule, PortfolioModule, PropertyModule, UserModule],
  providers: [GauntletAgentService]
})
export class GauntletAgentModule {}
