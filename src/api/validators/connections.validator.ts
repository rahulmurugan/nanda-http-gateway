import Joi from 'joi';

export const executeToolSchema = Joi.object({
  parameters: Joi.object().optional().default({}),
  timeout: Joi.number().integer().min(1000).max(60000).optional(),
  stream: Joi.boolean().optional().default(false)
});