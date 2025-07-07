import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './error.middleware';

type ValidationSource = 'body' | 'query' | 'params';

export const validateRequest = (schema: Joi.Schema, source: ValidationSource = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    const { error, value } = schema.validate(data, { abortEarly: false });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      throw new AppError(400, 'Validation error', 'VALIDATION_ERROR', details);
    }

    // Replace request data with validated value
    req[source] = value;
    next();
  };
};