import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        const result = envSchema.safeParse(config);
        if (!result.success) {
          const formatted = result.error.format();
          const messages = Object.entries(formatted)
            .filter(([, v]) => v && typeof v === 'object' && '_errors' in v)
            .map(([key, v]) => `${key}: ${(v as { _errors: string[] })._errors.join(', ')}`)
            .join('\n');
          throw new Error(`Environment validation failed:\n${messages}`);
        }
        return result.data;
      },
    }),
  ],
})
export class AppConfigModule {}
