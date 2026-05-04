export class AppError extends Error {
  code: string;
  status: number;
  expose: boolean;

  constructor(
    message: string,
    options?: { code?: string; status?: number; expose?: boolean },
  ) {
    super(message);
    this.name = "AppError";
    this.code = options?.code ?? "APP_ERROR";
    this.status = options?.status ?? 500;
    this.expose = options?.expose ?? true;
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
      },
    };
  }

  const fallback = error instanceof Error ? error.message : "Unexpected server error";
  return {
    status: 500,
    body: {
      error: fallback,
      code: "INTERNAL_ERROR",
    },
  };
}
