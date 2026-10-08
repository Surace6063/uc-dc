import "server-only"

import { NextResponse } from "next/server"
import { z } from "zod"

import { AppError, ValidationError } from "@/lib/authorization/errors"

// Turns thrown errors into consistent JSON responses for Route Handlers:
//   { "error": { "code": "PERMISSION_DENIED", "message": "..." } }
// Unknown errors become a generic 500 so internals never leak.
export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    error = new ValidationError(z.flattenError(error).fieldErrors)
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error instanceof ValidationError && { fieldErrors: error.fieldErrors }),
        },
      },
      { status: error.status }
    )
  }

  console.error(error)
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } },
    { status: 500 }
  )
}

type Handler<Args extends unknown[]> = (...args: Args) => Promise<Response>

export function withErrorHandling<Args extends unknown[]>(handler: Handler<Args>): Handler<Args> {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      return errorResponse(error)
    }
  }
}
