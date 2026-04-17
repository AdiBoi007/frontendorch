import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function toAppError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  // Use duck-typing in addition to instanceof to handle module duplication.
  if (error instanceof ZodError || (error instanceof Error && (error as { issues?: unknown }).issues !== undefined)) {
    const zodErr = error as ZodError;
    return new AppError(400, "Validation error", "validation_error", typeof zodErr.flatten === "function" ? zodErr.flatten() : undefined);
  }

  return new AppError(500, "Internal server error", "internal_error");
}
