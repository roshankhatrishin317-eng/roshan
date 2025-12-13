import { z } from 'zod';

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function', 'tool', 'model']),
  content: z.union([z.string(), z.array(z.any())]).nullable().optional(),
  name: z.string().optional(),
  function_call: z.any().optional(),
  tool_calls: z.array(z.any()).optional(),
  tool_call_id: z.string().optional(),
}).passthrough();

export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  temperature: z.number().optional().default(1.0),
  top_p: z.number().optional().default(1.0),
  n: z.number().optional().default(1),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  max_tokens: z.number().optional(),
  presence_penalty: z.number().optional().default(0),
  frequency_penalty: z.number().optional().default(0),
  logit_bias: z.record(z.number()).optional(),
  user: z.string().optional(),
  
  // Custom/Extended fields
  stream_options: z.object({
    include_usage: z.boolean().optional()
  }).optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.union([z.string(), z.object({})]).optional(),
  response_format: z.object({
    type: z.enum(['text', 'json_object']).optional()
  }).optional(),
}).passthrough(); // Allow unknown fields for forward compatibility

export const ModelListResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(z.object({
    id: z.string(),
    object: z.literal('model'),
    created: z.number(),
    owned_by: z.string()
  }))
});
