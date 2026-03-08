Technical Architecture: GCP-Native Headless Middleware

This document outlines the structural design of the serverless "Brain" connecting Lightspeed Retail, WooCommerce, and a custom high-performance frontend.

1. High-Level Data Flow

Ingress (Webhooks): WooCommerce or Lightspeed sends a webhook to a Cloud Run endpoint.

Decoupling (Queueing): The endpoint validates the request and immediately pushes a task to Cloud Tasks.

State Management (Deduplication): Before processing, the system checks Memorystore (Redis) to ensure this isn't an infinite loop (e.g., Woo updating Lightspeed, which triggers Lightspeed to update Woo).

Source of Truth (Storage): The Cloud SQL (PostgreSQL) database acts as a high-speed cache for the Custom Site.

Egress (Sync): The worker pulls the latest tokens from the DB, transforms the data using the Universal Mapper, and updates the downstream API.

2. Component Breakdown

A. Compute Layer (Google Cloud Run)

Service Model: Fully managed, autoscaling containers.

The "API" Service: Handles GET requests for the custom frontend (Product feeds, Categories).

The "Worker" Service: Internal-only service that processes the Cloud Tasks queue. It handles the heavy lifting of API transformations and third-party auth.

B. Persistence Layer (Cloud SQL - PostgreSQL)

Role: The "Performance Mirror."

Key Tables:

products: Stores mirrored Lightspeed data (Title, SKU, Price, Qty, Metadata).

credentials: Encrypted storage for OAuth 2.0 Access/Refresh tokens.

sync_logs: Audit trail for every cross-platform update.

ORM: Prisma (recommended for Antigravity's type-safety features).

C. Traffic & Rate Control (Cloud Tasks)

The Problem: Lightspeed and WooCommerce have strict API rate limits (e.g., 2-5 requests/sec). Standard webhooks would overwhelm them.

The Solution: Cloud Tasks acts as a "Buffer."

Configuration: * maxDispatchesPerSecond: 2.0

maxConcurrentDispatches: 5

Automatic retries with exponential backoff (crucial for 503/429 errors).

D. Loop Prevention (Memorystore for Redis)

Logic: When a webhook arrives, we create a key in Redis: sync:{sku}:{quantity} with a 60-second TTL.

Interceptor: If an outgoing update matches a recently seen sku:quantity pair in Redis, the system identifies it as a redundant "echo" and kills the task.

3. The "Universal Data" Strategy

To avoid "Spaghetti Code," we utilize a Canonical Data Model.

| Source Format (JSON) | Middleware (Universal Object) | Destination Format (JSON) |
| Lightspeed: {"itemID": 123, "amount": 10} | { "sku": "ABC", "qty": 10 } | WooCommerce: {"sku": "ABC", "stock_quantity": 10} |
| Custom Site: {"cart": [...]} | { "order_id": "XYZ" } | Lightspeed: {"Sale": {...}} |

4. Security & Authentication

Secret Manager: API Keys and OAuth Secrets are never in the code. They are injected as Environment Variables via GCP Secret Manager.

IAM Roles: * The Cloud Run service account has roles/cloudsql.client and roles/cloudtasks.enqueuer.

No "Owner" roles are used in production.

OAuth Lifecycle: * Middleware detects 401 Unauthorized.

Triggers refresh flow using refresh_token from Cloud SQL.

Retries original request without the user (or the custom site) ever knowing.

5. Deployment Manifest (The "GCloud" Stack)

The following resources must be provisioned for the architecture to function:

Database: gcloud sql instances create middleware-db

Redis: gcloud redis instances create middleware-cache

Queue: gcloud tasks queues create sync-queue --max-dispatches-per-second=2

Secrets: gcloud secrets create LS_CLIENT_SECRET