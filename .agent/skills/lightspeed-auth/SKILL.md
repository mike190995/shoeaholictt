---
name: lightspeed-auth
description: Manages the OAuth 2.0 lifecycle for Lightspeed Retail, including automatic token refresh via Axios interceptors.
---

# Lightspeed Auth Scaffolder

Manage the OAuth 2.0 lifecycle for Lightspeed Retail.

## Token Storage

- Persist `access_token` and `refresh_token` in the `credentials` table of Cloud SQL (via Prisma).
- The `platform` field should be set to `"lightspeed"`.
- Store `expires_at` timestamp to proactively refresh before expiry.

## Automating Token Refresh

Implement an **Axios Interceptor** with the following behavior:

1. **Request interceptor**: Attach the current `access_token` from the database to every outgoing request.
2. **Response interceptor**: Catch `401 Unauthorized` errors.
3. **On 401**:
   - Call the Lightspeed refresh endpoint: `POST https://cloud.lightspeedapp.com/oauth/access_token.php`
   - Include: `refresh_token`, `client_id`, `client_secret`, `grant_type: "refresh_token"`
   - Update the `credentials` table with the new tokens.
   - Retry the original failed request with the new `access_token`.
4. **Prevent infinite loops**: Use a `_retry` flag to ensure each request is only retried once.

## Secret Management

- `LS_CLIENT_ID` and `LS_CLIENT_SECRET` must come from **GCP Secret Manager**, not environment variables.
- Use the `getSecret()` helper from `src/lib/secrets.ts`.

## Files to Modify

- `src/services/lightspeed.ts` — Axios client with interceptors
- `src/routes/auth.ts` — OAuth callback route
