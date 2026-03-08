GCP-Native Headless Middleware: Skill Specification

Platform: Google Antigravity IDE (Agent-First Mode)
Architecture: Serverless Cloud Run + Cloud SQL + Cloud Tasks + Memorystore

🏗️ 1. The Agent Swarm Personas

To build this efficiently in Antigravity's Agent Manager, you will dispatch three distinct agent sessions.

Agent Alpha: The Data & Auth Architect

Focus: Core data structures, Universal Mapper, and Lightspeed OAuth.

Skills: skill-data-mapper, skill-lightspeed-auth.

Tools: Cloud SQL MCP, PostgreSQL.

Agent Beta: The Commerce API Builder

Focus: Frontend-facing endpoints and checkout business logic.

Skills: skill-api-generator, skill-checkout-handler.

Tools: Express.js, Cloud Run MCP.

Agent Gamma: The Reliability Engineer (SRE)

Focus: Rate limiting, loop prevention, and deployment orchestration.

Skills: skill-tasks-manager, skill-redis-protector.

Tools: Cloud Tasks, Memorystore (Redis), gcloud CLI.

🛠️ 2. Skill Definitions (.agent/skills/)

Each skill below should be saved as a SKILL.md file in its respective folder within your project.

Skill 1: The Cloud Run API Generator

Location: .agent/skills/api-generator/SKILL.md

Instructions: You are an expert GCP backend engineer. Your goal is to create high-performance Express.js endpoints for Cloud Run.

Patterns: Use Prisma for Cloud SQL interactions.

Constraint: All endpoints must support limit/offset pagination and ILIKE text search.

Security: Ensure cors is configured for the custom frontend domain.

Deployment: Provide the gcloud run deploy command using the --add-cloudsql-instances flag.

Skill 2: The Universal Data Mapper

Location: .agent/skills/data-mapper/SKILL.md

Instructions: Implement a strict "Internal Canonical Model" to prevent vendor lock-in.

Logic: Create a UniversalProduct class.

Mapping: Create static methods fromLightspeed(data) and fromWooCommerce(data).

Output: Create instance methods toPostgres(), toWoo(), and toLightspeed().

Validation: Use Zod or Joi to validate the object before any transformation occurs.

Skill 3: The Lightspeed Auth Scaffolder

Location: .agent/skills/lightspeed-auth/SKILL.md

Instructions: Manage the OAuth 2.0 lifecycle for Lightspeed Retail.

Storage: Persist access_token and refresh_token in the credentials table of Cloud SQL.

Automation: Implement an Axios Interceptor that catches 401 errors, calls the refresh endpoint, updates the database, and retries the failed request automatically.

Secret Management: Use GCP Secret Manager for the Client_ID and Client_Secret.

Skill 4: The Cloud Tasks Webhook Manager

Location: .agent/skills/tasks-manager/SKILL.md

Instructions: Decouple incoming webhooks from heavy processing.

Flow: The endpoint /webhooks/woo must respond with 200 OK within 200ms.

Action: Use the @google-cloud/tasks SDK to create a task in the inventory-sync-queue.

Rate Limiting: Provide the script to set maxDispatchesPerSecond: 2 on the queue.

Skill 5: The Redis Infinite Loop Preventer

Location: .agent/skills/redis-protector/SKILL.md

Instructions: Prevent "Ping-Pong" updates between Lightspeed and WooCommerce.

Logic: Before enqueuing any update, generate a hash of {SKU}:{Quantity}.

Check: If the hash exists in Redis (Memorystore), drop the request.

TTL: Set a 60-second expiry on the hash to allow legitimate updates later.

Skill 6: The Custom Site Checkout Handler

Location: .agent/skills/checkout-handler/SKILL.md

Instructions: Transition from "Cart" to "Lightspeed Sale."

Inventory Check: Query Cloud SQL to verify stock availability before initiating the sale.

Atomicity: Ensure the local DB is updated (to reflect the sale on the custom site) before the task is sent to the Lightspeed API.