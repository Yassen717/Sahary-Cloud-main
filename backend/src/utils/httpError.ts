export type HttpError = Error & { status: number; expose: true };

export function httpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  error.expose = true;
  return error;
}

export default httpError;
