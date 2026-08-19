// First import in the module, and the module every other one goes through to
// read configuration: `dotenv` must have populated `process.env` before the
// schema below parses it. It never overwrites a variable that is already set,
// so a real environment variable still wins over a `.env` file, and a missing
// `.env` is simply a no-op.
import 'dotenv/config';
import { z } from 'zod';

/**
 * The only place in the service that reads `process.env`. Everything else takes
 * the parsed `config` object, so a missing or malformed key fails once, at
 * boot, with a readable message - never as an undefined deep inside a query.
 *
 * Every key has a default that matches docker-compose.yml: a fresh clone runs
 * `npm run db:up && npm run db:migrate && npm run dev` with no configuration
 * file at all. Defaults make the happy path zero-config; validation still
 * rejects a value that is present and wrong.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5439),
  DB_USER: z.string().min(1).default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_NAME: z.string().min(1).default('challenge_dev'),
  TEST_DB_NAME: z.string().min(1).default('challenge_test'),
});

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly db: {
    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly password: string;
    readonly name: string;
  };
}

function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console -- boot-time failure, before any transport exists
    console.error(`Invalid environment configuration:\n${details}`);
    process.exit(1);
  }

  const env = parsed.data;

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    db: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      // The test suite must never be able to truncate the development data.
      name: env.NODE_ENV === 'test' ? env.TEST_DB_NAME : env.DB_NAME,
    },
  };
}

export const config: AppConfig = loadConfig();
