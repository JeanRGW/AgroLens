import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InferenceEnabledGuard implements CanActivate {
  constructor(@Optional() private readonly config?: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.config?.get<boolean>('INFERENCE_ENABLED', false) ?? false) return true;
    throw new ServiceUnavailableException('Inference is disabled in this deployment');
  }
}
