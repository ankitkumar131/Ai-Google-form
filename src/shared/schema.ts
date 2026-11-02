import { z } from 'zod';
export const questionTypeSchema = z.enum([
  'text',
  'textarea',
  'email',
  'tel',
  'number',
  'date',
  'url',
  'radio',
  'checkbox',
  'select',
  'contenteditable',
  'unknown',
]);
export const answerEnvelope = z
  .object({
    answers: z
      .array(
        z
          .object({
            questionId: z.string().max(200),
            questionType: questionTypeSchema,
            answer: z.union([z.string().max(12000), z.array(z.string().max(2000)).max(100)]),
            confidence: z.number().min(0).max(1),
            reason: z.string().max(1000).optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const providerSchema = z.object({
  id: z.enum(['openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'deepseek', 'custom']),
  name: z.string().min(1).max(100),
  model: z.string().max(200),
  endpoint: z.string().max(500),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(100),
  timeout: z.number().int().min(3000).max(25000),
  retries: z.number().int().min(0).max(2),
  hasKey: z.boolean().optional(),
});
export const settingsSchema = z.object({
  onboardingComplete: z.boolean(),
  activeProfileId: z.string().max(100),
  autoReuse: z.boolean(),
  preserveExisting: z.boolean(),
  confidence: z.number().min(0.5).max(1),
  aiEnabled: z.boolean(),
});
export const profileSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    mandatory: z.array(z.string()).max(40),
  })
  .catchall(z.union([z.string().max(100000), z.array(z.string())]));
export const savedAnswerSchema = z.object({
  id: z.string().max(100),
  question: z.string().min(1).max(4000),
  answer: z.union([z.string().min(1).max(12000), z.array(z.string()).min(1)]),
  type: questionTypeSchema,
  updatedAt: z.string(),
  profileId: z.string().max(100),
});
