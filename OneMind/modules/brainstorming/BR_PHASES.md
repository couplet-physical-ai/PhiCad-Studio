# Brainstorming Space - Implementation Phases

## Phase 1: Foundation (COMPLETED)

### Module Structure

- [x] Created module directory at `modules/brainstorming/`
- [x] `manifest.json` with `registerAsSpaceInTopBar: true`
- [x] TypeScript backend (`ts/module.ts`)
- [x] React frontend (`react/Space.tsx`)
- [x] Shared types (`shared/types.ts`)

### Database Schema

- [x] `brainstorm_board` - Workspace-scoped brainstorming boards
- [x] `brainstorm_node` - Ideas with position, hierarchy, version tracking
- [x] `brainstorm_edge` - Relationships between nodes (follows_from, supports, conflicts, relates, source)
- [x] `brainstorm_comment` - Comments on nodes

### Backend API Endpoints

- [x] Boards: CREATE, LIST, GET, DELETE
- [x] Nodes: CREATE, LIST, UPDATE, DELETE, BULK_POSITIONS, MARK_REVIEWED
- [x] Edges: CREATE, LIST, UPDATE, DELETE, REVERSE

### Data Model Implementation

- [x] Drizzle ORM schema with proper types
- [x] Repository pattern for DB access
- [x] UUID v7 for all IDs
- [x] Version tracking for trust loop (stale propagation)

## Phase 2: Canvas View (COMPLETED)

### ReactFlow Integration

- [x] ReactFlow v12 canvas with pan/zoom
- [x] Custom `BrainstormNodeType` component
- [x] Node types: root, idea, chat_reference, project_portal
- [x] Edge types with visual styling per relationship
- [x] Background grid (dots)
- [x] MiniMap for navigation
- [x] Controls panel (zoom in/out, fit)

### Node Component Features

- [x] Compact card display with title (2-line clamp)
- [x] Type indicator (R/I/C/P icons with gradients)
- [x] Color coding (7 colors)
- [x] Footer badges: child count, comment count, validation status
- [x] Star and pin indicators
- [x] Stale state visual (amber border + warning)
- [x] Handles on all 4 sides for connections

### Context Menus

- [x] Canvas context menu: Add New Idea, Paste, Tidy Up
- [x] Node context menu: Edit, AI Actions, State, Delete
- [x] Edge context menu: Reverse, Change Type, Delete
- [x] Selection context menu: Move to Project, Validate Cluster, Delete

## Phase 3: List View (COMPLETED)

- [x] Toggle between Canvas and List views
- [x] Hierarchical table with indentation
- [x] Columns: Title, Star, Status, Validation, Comments
- [x] Recursive row rendering for nested nodes

## Phase 4: UI Polish (COMPLETED)

### Explorer Panel (Left Sidebar) - COMPLETED

- [x] Tree outline of nodes with expand/collapse
- [x] Search/filter functionality
- [x] Click to select, double-click to focus node in canvas
- [x] Visual indicators (type, star, stale)
- [x] Toggle visibility button in header
- [x] Expand all / Collapse all controls

### Expanded Node Modal - COMPLETED

- [x] Full-width in-place expansion (double-click to open)
- [x] Rich text editor (TipTap) with debounced save
- [x] Tabs: Chat, Summary, Validation, Metadata, Comments
- [x] Generate Sub-ideas button (placeholder for AI integration)
- [x] Escape key to close

### Keyboard Shortcuts - COMPLETED

- [x] Cmd+0: Fit to screen
- [x] Cmd+F: Focus search
- [x] Esc: Close expanded modal
- [x] Delete/Backspace: Delete selected nodes
- [x] Enter: Rename selected (inline editing)
- [x] Cmd+Z / Cmd+Shift+Z: Undo/Redo

## Phase 4.5: Core UX Polish (COMPLETED)

### Comments System - COMPLETED

- [x] Comment CRUD backend endpoints
- [x] Comment repository methods
- [x] Comment API hooks
- [x] Comments tab UI in ExpandedNodeModal
- [x] Add/delete comments with real-time updates

### Undo/Redo - COMPLETED

- [x] History stack in Zustand store (max 50 entries)
- [x] Cmd+Z / Cmd+Shift+Z keyboard shortcuts
- [x] History for node/edge add/remove operations

### User Feedback - COMPLETED

- [x] Toast notifications for success/error states
- [x] Loading states during API operations
- [x] Inline rename (Enter key on selected node)

## Phase 5: AI Integration (FUTURE)

### AI Actions

- [ ] Validate Idea (detect weak points)
- [ ] Generate Feedback / Critique
- [ ] Ask Additional Questions
- [ ] Suggest Improvements
- [ ] Generate Sub-ideas
- [ ] Validate Cluster

### AI Job System

- [ ] AIJob entity with status tracking
- [ ] Loading states during AI operations
- [ ] ValidationReport storage and display

## Phase 6: Export & Projects (FUTURE)

### Generate Document Modal

- [ ] Scope selection (sub-ideas, comments, validation)
- [ ] Preview outline
- [ ] Stale node warnings
- [ ] Markdown export

### Project Extraction

- [ ] Move to New Project workflow
- [ ] Project Portal Node creation
- [ ] Edge handling for extracted clusters

## Phase 7: Advanced Features (FUTURE)

### Collaboration (v2)

- [ ] Real-time multiplayer
- [ ] Comments threading
- [ ] Share functionality

### Audio Entry (v1.5)

- [ ] Voice recording
- [ ] Transcription
- [ ] Audio attachments

### Tidy Up Layout

- [ ] Auto-layout algorithm
- [ ] Respect pinned/root nodes
- [ ] Undoable as single action

---

## Architecture Summary

```
modules/brainstorming/
├── manifest.json           # Module registration
├── shared/
│   └── types.ts           # Shared TypeScript types
├── ts/
│   ├── module.ts          # Backend module definition
│   └── db/
│       ├── schema.ts      # Drizzle schema
│       └── repositories/
│           └── brainstorm-repository.ts
└── react/
    ├── Space.tsx          # Main Space component
    ├── components/
    │   ├── BrainstormNode.tsx       # Custom node
    │   ├── ContextMenus.tsx         # All context menus
    │   ├── ExplorerPanel.tsx        # Left sidebar tree
    │   └── ExpandedNodeModal.tsx    # In-place node expansion
    ├── hooks/
    │   └── useBrainstormApi.ts   # API hooks
    └── stores/
        └── brainstorm-store.ts   # Zustand store
```

## Key Patterns

1. **Trust Loop**: Nodes track `version` and `reviewedParentVersion` for stale detection
2. **Edge Types**: Visual differentiation via stroke color/style
3. **Bulk Operations**: Position updates batched for performance
4. **State Management**: Zustand store + ReactFlow state synchronization
5. **API Design**: RESTful with proper error handling
