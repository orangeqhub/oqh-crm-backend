import { Request, Response, NextFunction } from 'express';

class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export { AppError };

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.code === '23505') {
    statusCode = 409;
    message = 'Duplicate entry. Resource already exists.';
  }

  if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced resource not found.';
  }

  if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid input format.';
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
  }

  if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized access.';
  }

  console.error('Error:', {
    message: err.message,
    statusCode,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};
