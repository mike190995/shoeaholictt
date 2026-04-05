# Codebase Audit: 3-Dead Code & Orphaned Files

This document identifies files, modules, and dependencies that are no longer active following the transition to the React frontend.

## 1. Staged Deprecation: EJS View System

Per your safety requirements, the following server-rendered EJS components are marked for **staged deprecation**. They should be monitored for usage and maintained behind a feature flag until the React frontend is fully verified.

- **[EJS Layouts](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/views/)**: All 5 views (`dashboard.ejs`, `layout.ejs`, `logs.ejs`, `products.ejs`, `sync.ejs`) have been superseded by the React components in `frontend/src/components/`.
- **[EJS Rendering Engine](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/index.ts#L26-L27)**: Lines 26-27 in `index.ts` initialize the EJS view engine and directory.
- **[EJS Route Handlers](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/routes/admin.ts#L438-L496)**: Lines 438-496 in `admin.ts` handle legacy page rendering. 

> [!TIP]
> **Remediation**: Add a `X-Deprecation-Warning` header to the response of these routes and a console log in the backend to monitor for unintended hits before final removal.

## 2. Orphaned Root-Level Scripts (DELETE candidate)

The following scripts are one-off development artifacts, some of which contain **hardcoded credentials**. These should be moved to a `scripts/archive` folder or deleted entirely.

- **[fetch-raw-product.ts](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/fetch-raw-product.ts)**: Contains hardcoded DB connection strings and Lightspeed IDs.
- **[migrate-manual.ts](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/migrate-manual.ts)**: Legacy SQL migration script (now handled by Prisma migrations).
- **`parse_pdf.*`**: `parse_pdf.cjs`, `parse_pdf.js`, `pdf_to_json.js`, and `pdf_extracted.txt`. These appear to be one-off utility scripts for parsing the API guide.
- **`package.json` scripts**: `seed` (line 14) points to [prisma/seed.ts](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/prisma/seed.ts) which uses hardcoded dummy data and should be updated or deleted.

## 3. Redundant Configuration & Schemas

- **[prisma/schema.push.prisma](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/prisma/schema.push.prisma)**: Contains **hardcoded database password**. This file is redundant to [schema.prisma](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/prisma/schema.prisma) and should be deleted immediately to remove clear-text sensitive data from the repo.
- **[Skill Spec.md](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/Skill%20Spec.md)**: A legacy strategy document superseded by actual `.agent/skills/` implementations.
- **`tools.json`**: A 448KB data dump in the root directory that is not referenced by any source code.
- **`live_root.html`**: An empty, orphaned file in the root.

## 4. Heavy-Weight Binaries & JSON Dumps

- **[cloud-sql-proxy.exe](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/cloud-sql-proxy.exe)**: A 32MB binary committed to the repository root.
- **Issue**: Binaries slow down `git clone` times and should be stored in system PATH or downloaded via dev script, not committed to version control.
- **Debug JSONs**: `debug-11886.json`, `raw-data-10152.json`, `variant-debug.json`. These are temporary data snapshots that should be moved to `.gitignore`.

## 5. Metadata & Documentation Debt

- **[Architecture.md](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/Architecture.md)**: While useful, some sections (like §5 deployment manifest) are manual and may become stale as we move to CI/CD pipelines.
- **[LSWOO Frontend & Data Improvement Proposal.md](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/LSWOO%20Frontend%20&%20Data%20Improvement%20Proposal.md)**: A discussion document that has now been implemented/surpassed by this audit report.
