import { z } from 'zod';
import {
  profileSchema,
  providerSchema,
  questionTypeSchema,
  savedAnswerSchema,
  settingsSchema,
} from './schema';
import { providerIds } from './types';
const bytes = z.array(z.number().int().min(0).max(255));
export const vaultSchema = z
  .object({ salt: bytes.length(16), iv: bytes.length(12), data: bytes.min(16).max(200000) })
  .strict();
const question = z.object({
  id: z.string().max(200),
  frameId: z.number().int(),
  text: z.string().max(4000),
  type: questionTypeSchema,
  options: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).max(10000),
  required: z.boolean(),
  context: z.string(),
  name: z.string(),
  autocomplete: z.string(),
  currentValue: z.string(),
  sensitive: z.boolean(),
  constraints: z
    .object({
      min: z.string().optional(),
      max: z.string().optional(),
      pattern: z.string().optional(),
      maxLength: z.number().optional(),
    })
    .optional(),
});
const answer = z.object({
  questionId: z.string(),
  questionType: questionTypeSchema,
  answer: z.union([z.string(), z.array(z.string())]),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  source: z.enum(['Profile', 'Saved answer', 'AI', 'Manual']),
});
const report = z.object({
  id: z.string(),
  tabId: z.number().int(),
  site: z.string(),
  date: z.string(),
  duration: z.number(),
  provider: z.string().optional(),
  results: z
    .array(
      z.object({
        question,
        answer: answer.optional(),
        status: z.enum(['filled', 'review', 'skipped', 'failed']),
        reason: z.string(),
      }),
    )
    .max(200),
});
export const backupSchema = z
  .object({
    format: z.literal('formpilot-backup'),
    version: z.literal(2),
    exportedAt: z.string(),
    profiles: z.array(profileSchema).max(10),
    providers: z.array(providerSchema).length(7),
    settings: settingsSchema,
    answers: z.array(savedAnswerSchema).max(100000),
    history: z.array(report).max(20),
    failures: z
      .array(z.object({ date: z.string(), provider: z.string(), message: z.string() }))
      .max(50),
    vault: vaultSchema.nullable(),
    apiKeys: z.partialRecord(z.enum(providerIds), z.string().max(2000)).optional(),
  })
  .strict();
export type CompleteBackup = z.infer<typeof backupSchema>;
