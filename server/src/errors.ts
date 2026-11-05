// API errors carry an HTTP status and a stable code. Messages never include internal details.
export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message = code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badRequest = (code: string) => new ApiError(400, code)
export const unauthorized = () => new ApiError(401, 'unauthenticated')
export const forbidden = (code = 'forbidden') => new ApiError(403, code)
export const notFound = (code = 'not_found') => new ApiError(404, code)
export const conflict = (code: string) => new ApiError(409, code)
