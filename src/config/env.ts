import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  APP_BASE_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:3001"),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  QUEUE_MODE: z.enum(["bullmq", "inline"]).default("bullmq"),
  QUEUE_PREFIX: z.string().default("orchestra"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().default("./storage"),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  PASSWORD_HASH_COST: z.coerce.number().int().min(8).max(15).default(12),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_REASONING: z.string().default("claude-3-7-sonnet-latest"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_PUBSUB_TOPIC: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  MICROSOFT_TENANT_ID: z.string().default("common"),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_READINESS_MODE: z.enum(["disabled", "webhook_inbound"]).default("disabled"),
  CONNECTOR_CREDENTIAL_VAULT_MODE: z.enum(["memory", "encrypted_file"]).default("encrypted_file"),
  CONNECTOR_OAUTH_STATE_SECRET: z.string().min(16).default("change_me_connector_state_secret"),
  CONNECTOR_SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
  CONNECTOR_SYNC_MAX_BACKFILL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  RETRIEVAL_TOP_K: z.coerce.number().int().positive().default(8),
  RETRIEVAL_MIN_SCORE: z.coerce.number().default(0.2),
  RETRIEVAL_USE_HYBRID: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  RETRIEVAL_DOC_WEIGHT: z.coerce.number().default(1),
  RETRIEVAL_COMM_WEIGHT: z.coerce.number().default(0.8),
  RETRIEVAL_ACCEPTED_TRUTH_BOOST: z.coerce.number().default(1.2),
  METRICS_TOKEN: z.string().optional()
}).superRefine((value, context) => {
  if (value.STORAGE_DRIVER === "s3") {
    for (const field of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!value[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when STORAGE_DRIVER=s3`
        });
      }
    }
  }

  if (value.QUEUE_MODE === "bullmq" && !value.REDIS_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_URL"],
      message: "REDIS_URL is required when QUEUE_MODE=bullmq"
    });
  }

  const providerGroups = [
    {
      name: "Slack",
      fields: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_REDIRECT_URI"] as const
    },
    {
      name: "Google",
      fields: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"] as const
    },
    {
      name: "Microsoft",
      fields: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_REDIRECT_URI"] as const
    }
  ];

  for (const group of providerGroups) {
    const provided = group.fields.filter((field) => Boolean(value[field]));
    if (provided.length > 0 && provided.length !== group.fields.length) {
      for (const field of group.fields) {
        if (!value[field]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required when configuring ${group.name} OAuth`
          });
        }
      }
    }
  }

  if (value.NODE_ENV === "production") {
    if (value.CONNECTOR_CREDENTIAL_VAULT_MODE !== "encrypted_file") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CONNECTOR_CREDENTIAL_VAULT_MODE"],
        message: "Production requires CONNECTOR_CREDENTIAL_VAULT_MODE=encrypted_file"
      });
    }

    if (value.CONNECTOR_OAUTH_STATE_SECRET.includes("change_me")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CONNECTOR_OAUTH_STATE_SECRET"],
        message: "Production requires a non-default CONNECTOR_OAUTH_STATE_SECRET"
      });
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  return envSchema.parse(process.env);
}
