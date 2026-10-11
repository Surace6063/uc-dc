// Typed errors thrown by the auth/authorization helpers. Messages are safe to
// show to users: they never reveal whether another organisation's data exists.
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "ORGANIZATION_NOT_FOUND"
  | "MEMBERSHIP_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE"

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You need to sign in.") {
    super("UNAUTHENTICATED", message, 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this.") {
    super("FORBIDDEN", message, 403)
  }
}

// No current organisation could be resolved for the signed-in user.
export class OrganizationNotFoundError extends AppError {
  constructor(message = "Select an organisation first.") {
    super("ORGANIZATION_NOT_FOUND", message, 404)
  }
}

// The user isn't a member of the organisation they asked for. 403, not 404,
// and the same message either way, so IDs can't be probed.
export class MembershipNotFoundError extends AppError {
  constructor(message = "You're not a member of that organisation.") {
    super("MEMBERSHIP_NOT_FOUND", message, 403)
  }
}

export class PermissionDeniedError extends AppError {
  constructor(readonly permission: string) {
    super("PERMISSION_DENIED", "You don't have permission to do that.", 403)
  }
}

// A record doesn't exist in the current organisation (it may exist elsewhere;
// we deliberately don't say).
export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super("NOT_FOUND", message, 404)
  }
}

// The request is valid but clashes with the current state (a duplicate
// admission number, a record still in use, an invalid status transition).
export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409)
  }
}

// A dependency such as file storage isn't configured or reachable.
export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super("SERVICE_UNAVAILABLE", message, 503)
  }
}

export class ValidationError extends AppError {
  constructor(
    readonly fieldErrors: Record<string, string[] | undefined>,
    message = "Please check the form and try again."
  ) {
    super("VALIDATION_ERROR", message, 422)
  }
}
