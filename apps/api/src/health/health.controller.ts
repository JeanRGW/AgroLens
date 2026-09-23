import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CriticalThrottle } from '../rate-limit/rate-limit.guard';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Minimal public liveness check' })
  @ApiResponse({ status: 200, description: 'API process is alive' })
  getBasicHealth() {
    return this.healthService.getBasicHealth();
  }

  @Get('ready')
  @CriticalThrottle()
  @ApiOperation({ summary: 'Dependency and worker readiness check' })
  @ApiResponse({ status: 200, description: 'Database, storage, and enabled worker are ready' })
  @ApiResponse({ status: 503, description: 'A required component is unavailable' })
  async getReadiness() {
    const result = await this.healthService.getReadiness();
    if (result.status !== 'ok') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('config')
  @SkipThrottle()
  @ApiOperation({ summary: 'Public client runtime configuration' })
  getRuntimeConfig() {
    return this.healthService.getRuntimeConfig();
  }

  @Get('db')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Database connectivity check (admin only)',
    description:
      'Protected diagnostic endpoint. Failure responses use a fixed message and ' +
      'never include raw database error text.',
  })
  @ApiResponse({ status: 200, description: 'Database is reachable' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  @ApiResponse({ status: 503, description: 'Database is unreachable' })
  async getDbHealth() {
    const result = await this.healthService.getDbHealth();
    if (result.status !== 'ok') {
      // Preserve the diagnostic body verbatim while signalling 503 through
      // the standard Nest pipeline (interceptors and filters apply).
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('worker')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Worker queue health (admin only)' })
  async getWorkerHealth() {
    const result = await this.healthService.getWorkerHealth();
    if (result.status !== 'ok') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('storage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Storage (S3/Garage) configuration and connectivity check (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Storage is reachable' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  @ApiResponse({ status: 503, description: 'Storage is unreachable' })
  async getStorageHealth() {
    const result = await this.healthService.getStorageHealth();
    if (result.status !== 'ok') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
