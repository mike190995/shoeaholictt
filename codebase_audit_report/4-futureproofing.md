# Codebase Audit: 4-Futureproofing & Strategic Roadmap

This document provides a strategic blueprint for evolving the middleware into a core module of your future custom CRM, with a focus on security, scalability, and long-term maintainability.

## 1. Critical Security Remediation

Following the discovery of exposed credentials in the git repository, these steps are mandatory to restore system integrity.

### Phase A: Migration to GCP Secret Manager
1. **Move Database URL**: Transition the `DATABASE_URL` from the `.env` file to a GCP Secret named `LSWOO_DATABASE_URL`.
2. **Move API Keys**: Centralize `LS_CLIENT_SECRET`, `WOO_CONSUMER_KEY`, and `WOO_CONSUMER_SECRET` in Secret Manager.
3. **Automate Injection**: Update the [Secrets Lib](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/lib/secrets.ts) to automatically pull these values on application startup or within the service constructors.

### Phase B: Git History Purge
To ensure these vulnerabilities are completely removed from all past versions, follow these steps:

> [!CAUTION]
> **Git History Rewrite**: These actions rewrite the commit history of your repository. Ensure all team members have pushed their changes before proceeding.

1. **Install `git-filter-repo`**: This is the modern, faster replacement for `filter-branch`.
   ```bash
   pip install git-filter-repo
   ```
2. **Remove specific files**: Remove any files containing hardcoded credentials (e.g., `prisma/schema.push.prisma`, `fetch-raw-product.ts`) from all past commits.
   ```bash
   git filter-repo --path prisma/schema.push.prisma --invert-paths
   git filter-repo --path fetch-raw-product.ts --invert-paths
   ```
3. **Replace specific strings**: If you need to keep a file but remove a specific password/token:
   ```bash
   git filter-repo --replace-text <(echo "PASSWORD_STRING_HERE==>X-REDACTED-X")
   ```
4. **Force Push**: After rewriting history, you must force push to your remote repository.
   ```bash
   git push origin --force --all
   ```

## 2. Shared Multi-Platform Sync Engine

To support the future CRM, the sync engine should evolve from a 1:1 bridge into a 1:N event bus.

- **Centralized Normalization**: Use the [Universal Mapper](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/mappers/universal.ts) as the backbone for an "Ingress Normalizer." This allows you to add platforms (e.g., Shopify, Amazon, Square) by adding a single mapper method rather than rewriting the sync logic.
- **Micro-Frontend for CRM**: Structure the React frontend as an independent module. When the CRM is built, the LSWOO frontend can be embedded as a micro-frontend via an `<iframe>` or Module Federation.

## 3. Database & Schema Evolution

The current [Prisma Model](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/prisma/schema.prisma) handles inventory well, but requires evolution for a full CRM:

- **Orders & History**: Add an `Order` model to track customer purchases across platforms. This will provide the data for the CRM's customer lifetime value (CLV) metrics.
- **Linking Status Enum**: Instead of just `woocommerceId`, add a status enum: `UNLINKED | STAGED | PUBLISHED | ARCHIVED`.
- **Customer Directory**: Mirror customer data from Lightspeed and WooCommerce into a unified `Customer` table to allow for cross-platform marketing automation.

## 4. Advanced Queue Orchestration (Pub/Sub)

As the system grows, Cloud Tasks (Point-to-Point) may become limiting.

- **Pub/Sub Integration**: Move to a "Fan-Out" architecture. A single "Product Updated" event is published to a topic, and multiple subscribers (WooCommerce Sync, Marketing Email Trigger, Search Indexer) process it independently.
- **Dead Letter Handling**: Implement a formalized "Error Triage" UI to handle rejected tasks, allowing for manual correction before re-publishing the event.

## 5. Deployment & Observability

- **CI/CD Promotion**: Use GitHub Actions to build the Docker image once and promote it through `Staging` -> `Production` environments. Currently, the [Dockerfile](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/Dockerfile) is robust but lacks environment-specific build args.
- **Structured Error Dashboards**: Leverage the [Pino Logger's GCP severity levels](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/lib/logger.ts#L20-L24) to build automated alerts in Cloud Operations for 5xx errors or chronic 429 rate-limiting.
- **Configuration-as-Code**: Move outlet mappings and sync rules from hardcoded values into a dynamic configuration table in Cloud SQL or a ConfigMap.
