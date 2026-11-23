import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "./lib/attach-supabase-auth";
import { AUTH_MODE } from "./lib/auth-mode";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Keep API-backed server functions unavailable in local mode. This rejects a
// direct request before any protected handler can create a Supabase client.
const blockServerFunctionsInLocalMode = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  if (AUTH_MODE === 'none') throw new Error('Server functions are disabled in local mode.');
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
  functionMiddleware: AUTH_MODE === 'supabase' ? [attachSupabaseAuth] : [blockServerFunctionsInLocalMode],
}));
