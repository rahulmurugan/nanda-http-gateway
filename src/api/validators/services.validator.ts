import Joi from 'joi';

export const searchServicesSchema = Joi.object({
  q: Joi.string().max(100).allow('').optional(),
  category: Joi.string().optional(), // Allow any category value
  tags: Joi.string().optional(), // comma-separated
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  sort: Joi.string().valid('popularity', 'name', 'created', 'updated').default('popularity')
});

export const connectServiceSchema = Joi.object({
  evmAuth: Joi.object({
    walletAddress: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{40}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid Radius wallet address (must be 0x followed by 40 hex characters)'
      }),
    contractAddress: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{40}$/)
      .optional()
      .messages({
        'string.pattern.base': 'Invalid contract address on Radius blockchain'
      }),
    tokenId: Joi.string().optional(),
    signature: Joi.string().optional(),
    message: Joi.string().optional()
  }).optional(),
  timeout: Joi.number().integer().min(5000).max(60000).default(30000),
  verifyHealth: Joi.boolean().default(true)
});