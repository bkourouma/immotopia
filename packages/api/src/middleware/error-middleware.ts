import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Error response interface
 */
export interface ErrorResponse {
  success: false;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  code?: string;
}

/**
 * Custom error class
 */
export class AppError extends Error {
  statusCode: number;
  code?: string;
  errors?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    errors?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 * Handles all errors consistently
 */
export function errorHandler(err: Error | AppError, req: Request, res: Response, _next: NextFunction): void {
  // Log error with Winston
  logger.error('Error occurred', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    statusCode: err instanceof AppError ? err.statusCode : 500
  });

  // Handle AppError
  if (err instanceof AppError) {
    const errorResponse: ErrorResponse = {
      success: false,
      message: err.message
    };

    if (err.code) {
      errorResponse.code = err.code;
    }

    if (err.errors) {
      errorResponse.errors = err.errors;
    }

    res.status(err.statusCode).json(errorResponse);
    return;
  }

  // Handle validation errors (Zod)
  if (err.name === 'ZodError') {
    res.status(400).json({
      success: false,
      message: 'Les données fournies sont invalides.',
      errors: (err as any).errors?.map((e: any) => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    if (prismaError.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'Cette ressource existe déjà.'
      });
      return;
    }
  }

  // Default error response
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production' ? 'Une erreur est survenue. Veuillez réessayer plus tard.' : err.message
  });
}
