# StorageFlip - SMS Inventory Management System

## Overview

StorageFlip is a mobile-first inventory management system designed for storage unit resellers. The application enables users to manage items from storage units and create listings for multiple marketplaces (eBay, Facebook Marketplace, Craigslist). The system supports manual item entry and SMS-based workflow where users can text photos and details to automatically generate listings.

**Primary Use Case**: On-site storage unit inventory management with quick photo-to-listing workflow for marketplace sellers.

**Current Status (Nov 14, 2024)**:
- ✅ Manual workflow complete: Upload photo → AI analysis → Accept/Reject suggestions → Create item
- ✅ SearchAPI.io integration working with hash-based deduplication
- ✅ SMS workflow complete and tested: Phone number provisioning, webhook routing, post-creation AI analysis
- ✅ SaaS multi-tenant phone number routing operational
- ✅ Upgrade prompts implemented: Users hitting plan limits see upgrade dialog with suggested plan, pricing, and features
- ✅ Subscription management UI tested: Settings page displays usage stats, plan info, and upgrade options
- ✅ External API integration: `/api/agent` endpoint with OpenAI chat completions (bearer token auth)

**Tech Stack**:
- Frontend: React + TypeScript with Vite
- Backend: Express.js + TypeScript
- Database: PostgreSQL via Neon (serverless)
- ORM: Drizzle
- UI Framework: shadcn/ui (Radix UI primitives)
- Styling: Tailwind CSS
- Real-time: WebSocket
- File Storage: Google Cloud Storage (via Replit Object Storage)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework Choice**: React with TypeScript using Vite as the build tool
- **Rationale**: Fast development experience with HMR, modern tooling, and strong type safety
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack Query (React Query) for server state, React hooks for local state
- **Real-time Updates**: WebSocket client for live inventory updates

**Component Strategy**: 
- Design system based on shadcn/ui (New York style variant)
- Mobile-first responsive design with breakpoints at md: (768px) and lg: (1024px)
- Reusable UI components from Radix UI primitives for accessibility
- Custom components for domain-specific features (PhotoEditor, QuoteGenerator)

**Layout System**:
- Mobile: Bottom navigation bar with single-column layout
- Desktop: Top navigation bar with multi-column grid layouts
- Spacing follows Tailwind scale (2, 4, 6, 8, 12, 16)
- Max-width constraints: forms (max-w-2xl), dashboards (max-w-7xl)

### Backend Architecture

**Framework**: Express.js with session-based authentication
- **Rationale**: Mature, flexible, and well-suited for REST APIs with WebSocket support
- **Session Management**: express-session with cookie-based authentication
- **API Design**: RESTful endpoints under `/api` prefix

**Multi-tenancy Model**:
- Users can belong to multiple Accounts (businesses/inventories)
- Account-based data isolation for security
- Role-based access (owner, member) via AccountMemberships
- Current implementation uses demo account for development

**Authentication Flow**:
- Session-based auth with bcrypt password hashing
- `requireAuth` middleware protects routes
- User ID and Account ID stored in session
- Credentials: httpOnly, secure in production, 1-year max age (mobile-first: users stay logged in)

**File Upload Strategy**:
- Multer middleware for multipart/form-data handling
- 10MB file size limit
- Memory storage (files handled in-memory before cloud upload)
- Images uploaded to Google Cloud Storage via Replit Object Storage sidecar

### Database Schema (PostgreSQL + Drizzle ORM)

**Core Tables**:

1. **users**: Authentication and user profiles
   - Primary key: UUID (auto-generated)
   - Fields: email (unique), passwordHash, name, createdAt

2. **accounts**: Separate businesses/inventories (multi-tenancy)
   - Primary key: UUID
   - Fields: name, plan (basic/team/multi_business), createdAt

3. **accountMemberships**: Many-to-many user-account relationships
   - Links users to accounts with roles
   - Unique constraint on (userId, accountId)
   - Fields: userId, accountId, role (owner/member)

4. **items**: Storage unit inventory items
   - Primary key: UUID
   - Foreign key: accountId (data isolation)
   - Fields: title, description, price (cents), condition, category, images (text array), status (draft/posted/sold), source (sms/manual), phoneNumber, createdAt, postedAt

5. **itemAiInsights**: AI-powered image analysis results
   - Primary key: UUID
   - Foreign keys: accountId (required), itemId (optional - linked after creation)
   - Unique constraint: (accountId, imageHash) - prevents duplicate analyses
   - Workflow tracking: analysisRunId (unique per run), source (manual/sms), triggerStage (pre_item/post_item)
   - Analysis results: labels, webEntities, dominantColors, contentSignature
   - Suggestions: suggestedTitle, suggestedDescription, suggestedCategory
   - Decision tracking: decisions (per-field accept/reject state)
   - State: status (processing/completed/failed/stale), processedAt
   - Deduplication: SHA-256 imageHash computed during upload

6. **smsMessages**: Incoming SMS processing log
   - Primary key: UUID
   - Foreign key: accountId (optional)
   - Fields: from, to, body, mediaUrls, messageId, status, itemId, createdAt

7. **phoneNumbers**: SaaS phone number provisioning and routing
   - Primary key: UUID
   - Foreign key: accountId (nullable - unassigned numbers)
   - Unique constraint: phoneNumber (E.164 format)
   - Fields: phoneNumber, accountId, status, telnyxPhoneNumberId, messagingProfileId, createdAt
   - Purpose: Multi-tenant SMS routing via phone number assignment

**Data Access Pattern**:
- All item queries filtered by accountId for security
- Storage layer (DrizzleStorage) implements IStorage interface
- Prepared statements via Drizzle ORM prevent SQL injection

### Real-time Communication

**WebSocket Implementation**:
- Server: ws library on `/ws` path
- Client: Auto-reconnecting WebSocket client (max 5 attempts)
- Message format: `{ event: string, data: any }`
- Events: item:created, item:updated, item:deleted, sms:received
- Broadcast pattern: Server maintains client set, broadcasts to all open connections
- Query invalidation: Client triggers React Query cache invalidation on events

### External Dependencies

**Google Cloud Storage** (via Replit Object Storage):
- **Purpose**: Image and media file storage
- **Authentication**: External account credentials via Replit sidecar (port 1106)
- **Configuration**: PUBLIC_OBJECT_SEARCH_PATHS environment variable (comma-separated bucket paths)
- **Access Pattern**: Public object serving via `/objects/:objectPath(*)` endpoint
- **Error Handling**: ObjectNotFoundError for missing files

**Neon Database** (PostgreSQL):
- **Purpose**: Primary data store (serverless PostgreSQL)
- **Connection**: WebSocket-based connection pool (@neondatabase/serverless)
- **Configuration**: DATABASE_URL environment variable required
- **Migration**: Drizzle Kit for schema management (`npm run db:push`)

**SMS Integration** (Telnyx - Operational):
- **Purpose**: Receive photos and text to auto-create listings
- **Status**: ✅ Configured and tested (TELNYX_API_KEY set)
- **Webhook**: POST /api/sms/webhook (public endpoint, always returns 200)
- **SaaS Routing**: Phone numbers assigned to accounts via phoneNumbers table
- **Phone Number Normalization**: E.164 format (+[country][number]) enforced consistently
- **Flow**: SMS → normalize toNumber → lookup account → create smsMessage → download media → compute hash → create item → trigger background AI analysis → broadcast WebSocket event
- **Error Handling**: Defensive try-catch blocks ensure 200 response to prevent Telnyx retries
- **Media Download**: Ephemeral Telnyx URLs downloaded immediately to object storage
- **AI Analysis**: Post-creation background analysis with hash-based reuse (new record created per item)

**Session Store**:
- **Current**: In-memory (development)
- **Production Consideration**: Should migrate to persistent store (Redis, database-backed)
- **Secret**: SESSION_SECRET environment variable (defaults to dev secret)

**AI-Powered Image Analysis** (SearchAPI.io):
- **Purpose**: Automatic product identification and listing generation
- **Provider**: SearchAPI.io Google Lens API ($40/month, 10,000 requests)
- **Workflow**: Upload photo → Compute SHA-256 hash → Check cache → Analyze → Generate suggestions → User accepts/rejects
- **Deduplication**: Hash-based caching prevents duplicate API calls for same image
- **Analysis Results**: Product labels, web entities, dominant colors, suggested title/description/category
- **State Tracking**: analysisRunId for audit trail, decisions JSON for accept/reject per field
- **Integration Points**: 
  - Manual workflow: Pre-creation analysis with Accept/Reject UI
  - SMS workflow (planned): Post-creation background analysis requiring user review
- **Cost Optimization**: Unique constraint on (accountId, imageHash) prevents redundant API calls

**Image Processing**:
- **Library**: react-photo-editor (client-side)
- **Features**: Brightness adjustment, zoom, rotation
- **Hash Computation**: SHA-256 on upload for deduplication
- **Flow**: Upload → Compute hash → Store in object storage → Auto-trigger AI analysis (manual) or background analysis (SMS)

### Design System

**Typography**:
- Primary: Inter (Google Fonts) - body and UI
- Monospace: JetBrains Mono - SKUs, prices, codes
- Scale: text-3xl (H1) → text-xl (H2) → text-lg (H3) → text-base (body) → text-sm (metadata) → text-xs (helpers)

**Color System**:
- CSS variables for theme (light/dark mode support)
- HSL color format with alpha channel support
- Semantic tokens: primary, secondary, destructive, muted, accent
- Border colors: --button-outline, --badge-outline, --card-border, --popover-border
- Elevation effects: --elevate-1 (hover), --elevate-2 (active)

**Component Patterns**:
- All buttons use hover-elevate and active-elevate-2 classes
- Cards use shadcn-card class with consistent border-radius (0.5625rem)
- Forms use react-hook-form with zod validation
- Tables/lists optimized for mobile with swipe gestures consideration

### Build and Deployment

**Development**:
- `npm run dev`: Hot-reload development server (tsx + Vite)
- Port configuration: Vite dev server proxies to Express backend
- Source maps enabled via @jridgewell/trace-mapping

**Production Build**:
- `npm run build`: Vite builds client → dist/public, esbuild bundles server → dist
- `npm start`: Runs compiled server from dist/index.js
- Static assets served from dist/public
- Environment: NODE_ENV=production

**Type Checking**:
- `npm run check`: TypeScript compiler validation without emit
- Shared types in /shared for client-server consistency
- Path aliases: @/ (client/src), @shared/ (shared), @assets/ (attached_assets)