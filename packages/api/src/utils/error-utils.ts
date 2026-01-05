/**
 * Error utility functions
 * Provides consistent error response format
 */

export interface ErrorResponse {
  success: false;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  code?: string;
}

/**
 * Create error response
 * @param message - Error message
 * @param errors - Optional field-specific errors
 * @param code - Optional error code
 * @returns Error response object
 */
export function createErrorResponse(
  message: string,
  errors?: Array<{ field: string; message: string }>,
  code?: string
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    message
  };

  if (errors) {
    response.errors = errors;
  }

  if (code) {
    response.code = code;
  }

  return response;
}

/**
 * Create success response
 * @param message - Success message
 * @param data - Optional data to include
 * @returns Success response object
 */
export function createSuccessResponse<T>(message: string, data?: T) {
  return {
    success: true,
    message,
    ...(data && { data })
  };
}
