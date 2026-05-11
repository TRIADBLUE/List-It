# Design Guidelines: SMS Inventory Management System

## Design Approach
**Approach**: Design System - Mobile-First Productivity Tool  
**Inspiration**: Linear + Notion (clean data tables, efficient workflows)  
**Rationale**: Utility-focused application requiring fast data entry, clear information hierarchy, and mobile optimization for on-site use in storage units.

## Core Design Principles
1. **Mobile-First**: Primary usage happens on-site in storage units
2. **Speed Over Style**: Minimize friction in photo-to-listing workflow
3. **Information Clarity**: Dense data displays without clutter
4. **Touch-Optimized**: Large tap targets, swipe gestures for mobile actions

## Typography System
- **Primary Font**: Inter (Google Fonts) - clean, highly legible
- **Monospace**: JetBrains Mono - for SKUs, prices, status codes

**Hierarchy**:
- H1: text-3xl font-bold (Dashboard headers)
- H2: text-xl font-semibold (Section headers, Card titles)
- H3: text-lg font-medium (Item names)
- Body: text-base (Descriptions, form labels)
- Small: text-sm (Metadata, timestamps, status indicators)
- Tiny: text-xs (Helper text, badge labels)

## Layout System
**Spacing Scale**: Tailwind units of 2, 4, 6, 8, 12, 16  
- Tight spacing: p-2, gap-2 (compact mobile lists)
- Standard spacing: p-4, gap-4 (cards, form fields)
- Section spacing: py-8, py-12 (major content blocks)
- Page margins: px-4 (mobile), px-6 (tablet), px-8 (desktop)

**Grid Strategy**:
- Mobile: Single column, full-width cards
- Tablet (md:): 2-column item grid
- Desktop (lg:): 3-column item grid, sidebar + main content layout

**Max Widths**:
- Form containers: max-w-2xl
- Dashboard content: max-w-7xl
- Item cards: Full width in grid

## Component Library

### Navigation
**Mobile Bottom Navigation Bar**: Fixed position with 4 primary actions
- Dashboard (home icon)
- Add Item (plus icon)
- Inventory (grid icon)
- Settings (gear icon)
- Height: h-16, always visible, elevated with shadow

**Desktop Sidebar**: w-64, fixed left side
- Logo/brand at top (h-16)
- Same 4 primary navigation items
- SMS status indicator
- Marketplace connection badges

### Dashboard Layout
**Status Cards Row** (3 cards on desktop, stacked on mobile):
- Total Items
- Pending Listings
- Posted Today
- Each card: p-6, large number display, icon, percentage change indicator

**Recent Items Feed**:
- Card-based layout with item photo (square thumbnail), title, price, status badge
- Card structure: p-4, image on left (w-20 h-20), content right
- Swipe actions on mobile: Delete (left), Edit (right)

### Item Entry Flow (Critical)
**Multi-step mobile-optimized form**:

Step 1 - Photo Upload:
- Large photo preview area (aspect-ratio-square, min-h-64)
- Camera/gallery selection buttons (large, touch-friendly, h-14)
- Multiple photo support with thumbnail strip

Step 2 - Details Form:
- Input fields with h-12 (touch-optimized)
- Floating labels for clean look
- Category dropdown with common presets
- Condition selector (radio buttons with visual states)
- Price input with currency symbol prefix
- Description textarea (min-h-32)

Step 3 - Review & Send:
- Preview card showing all entered data
- Marketplace selection checkboxes (eBay, Facebook, Craigslist)
- Large "Send to Marketplaces" CTA button (h-14, w-full)

### Inventory Dashboard
**Filtering Bar**: Sticky top, gap-2 pill-style filter buttons
- All Items
- For Sale
- Sold
- Pending

**Item Cards** (Masonry grid layout):
- Square image top (aspect-ratio-square)
- Item title (font-semibold, line-clamp-2)
- Price (text-lg, font-bold)
- Status badge (text-xs, px-2, py-1, rounded-full)
- Posted date (text-sm, opacity-70)
- Quick actions row (Edit, Delete, Repost icons)

### Marketplace Posting Interface
**Split View** (desktop) / Accordion (mobile):
- Left/Top: Item details preview with all photos
- Right/Bottom: Platform-specific formatted text outputs
- Copy buttons for each marketplace (h-10, w-full on mobile)
- Platform logos/icons prominently displayed

### SMS Status Panel
**Connection Status Card**:
- Phone number display (text-lg, monospace)
- Connection indicator (dot + text: "Connected" / "Disconnected")
- Last message received timestamp
- Message history log (scrollable, max-h-96)

### Form Elements
**Input Fields**: 
- Height: h-12 (mobile), h-10 (desktop)
- Border width: border-2
- Rounded: rounded-lg
- Focus state: ring treatment

**Buttons**:
- Primary CTA: h-12 (mobile), h-10 (desktop), font-semibold, rounded-lg
- Secondary: Same dimensions, outlined variant
- Icon buttons: w-10 h-10 (tap targets)

**Status Badges**:
- px-3, py-1, rounded-full, text-xs, font-medium
- States: Draft, Posted, Sold, Pending

## Image Strategy
**No hero images** - This is a utility application focused on workflow efficiency

**Image Usage**:
- Item photos: User-uploaded, square thumbnails in grids
- Empty states: Simple illustrations for "No items yet" screens
- Icons: Heroicons (outline style for navigation, solid for badges)
- Marketplace logos: Small branded icons for eBay, Facebook, Craigslist

## Responsive Breakpoints
- Mobile: < 768px (primary experience)
- Tablet: 768px - 1024px
- Desktop: > 1024px

**Mobile Priorities**:
- Bottom navigation over sidebar
- Full-width cards
- Touch-optimized spacing (minimum p-4 between tappable elements)
- Larger text inputs (h-12 minimum)
- Sticky headers for context while scrolling

## Animations
**Minimal, purposeful only**:
- Loading spinners for SMS sending
- Success checkmarks after posting
- Smooth transitions between form steps (slide animation)
- No decorative animations - focus on performance

## Accessibility
- Minimum touch target: 44x44px (w-11 h-11)
- Form labels always visible (floating or above)
- Clear focus indicators on all interactive elements
- Status communicated via text + icons (not color alone)
- Alt text required for all item photos