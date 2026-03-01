import { Injectable } from '@nestjs/common';

import { verifyResponse } from './verifier';
import { VerificationContext, VerificationResult } from './types';

@Injectable()
export class VerificationLayerService {
  public async verify(context: VerificationContext): Promise<VerificationResult> {
    return verifyResponse({ context });
  }
}
