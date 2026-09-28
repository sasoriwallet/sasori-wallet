import type { Result } from '@shared/types'

export class ApiError extends Error {
  code: string
  technicalDetail?: string
  constructor(code: string, message: string, technicalDetail?: string) {
    super(message)
    this.code = code
    this.technicalDetail = technicalDetail
  }
}

/** Unwraps a Result<T> from the preload bridge, throwing an ApiError with the already-translated user message on failure. */
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (result.ok) return result.value
  throw new ApiError(result.error.code, result.error.userMessage, result.error.technicalDetail)
}

export const api = window.wam

/** Turns any caught error into the {message, technicalDetail} shape ErrorBanner expects. */
export function toPageError(err: unknown, fallback: string): { message: string; technicalDetail?: string } {
  if (err instanceof ApiError) {
    return { message: err.message, technicalDetail: err.technicalDetail }
  }
  return { message: fallback, technicalDetail: err instanceof Error ? err.message : undefined }
}
