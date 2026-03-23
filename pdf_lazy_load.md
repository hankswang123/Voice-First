# PDF Lazy Loading Implementation Plan

## Context

Large PDF files (10MB+) cause performance issues:
- Initial load blocks the UI
- All pages load sequentially on first render
- No visual feedback during loading
- Memory usage grows as pages accumulate

The README lists these improvement areas:
1. Lazy loading / pagination (this plan)
2. Loading progress indicator
3. Caching headers
4. PDF compression / CDN (infrastructure - out of scope)

## Current Implementation Analysis

**Files:** `DesktopLayout.tsx` (lines 162-906), `TabletLayout.tsx` (lines 162-800)

**Current behavior:**
- `renderedPages` state starts with `[1]`
- `onPageLoadSuccess` triggers loading of next 2-3 pages (cascade loading)
- Pages keep accumulating in DOM - never unloaded
- No visibility-based loading - loads sequentially regardless of viewport

**Problem:** For a 50-page PDF, all 50 pages eventually render and stay in DOM.

## Proposed Solution: Viewport-Based Lazy Loading

### Architecture

1. **Intersection Observer** - Track which pages are visible/near viewport
2. **Render Window** - Only keep N pages before/after current view in DOM
3. **Loading Skeleton** - Show placeholder for unloaded pages
4. **Progress Indicator** - Show document loading progress

### Implementation Steps

#### Step 1: Create PDF Viewer Hook
**New file:** `src/hooks/usePdfLazyLoading.ts`

```typescript
interface UsePdfLazyLoadingOptions {
  numPages: number;
  bufferSize?: number;  // Pages to keep before/after viewport (default: 3)
}

interface UsePdfLazyLoadingResult {
  visiblePages: Set<number>;
  pageRefs: Map<number, RefObject<HTMLDivElement>>;
  observerCallback: IntersectionObserverCallback;
}
```

- Use `IntersectionObserver` to detect page visibility
- Maintain `visiblePages` set based on viewport intersection
- Calculate render window: `[minVisible - buffer, maxVisible + buffer]`

#### Step 2: Create Loading Progress Component
**New file:** `src/components/pdf/LoadingProgress.tsx`

- Show loading bar during PDF fetch
- Use `Document`'s `loading` prop or track via `onLoadProgress`

#### Step 3: Create Page Skeleton Component
**New file:** `src/components/pdf/PageSkeleton.tsx`

- Placeholder div matching page dimensions
- Animated loading state
- Maintains scroll position when pages load/unload

#### Step 4: Update DesktopLayout.tsx

**Changes at lines 162-167:**
```typescript
// Before
const [renderedPages, setRenderedPages] = useState([1]);

// After
const { visiblePages, shouldRenderPage, registerPageRef } = usePdfLazyLoading({
  numPages,
  bufferSize: 3,
});
```

**Changes at page rendering (lines 3952-4050):**
- Replace `renderedPages` mapping with visibility-based rendering
- Add `PageSkeleton` for non-visible pages
- Register refs with observer

#### Step 5: Update TabletLayout.tsx
- Mirror changes from DesktopLayout

### Key Files to Modify

| File | Changes |
|------|---------|
| `src/pages/DesktopLayout.tsx` | Replace page loading logic |
| `src/pages/TabletLayout.tsx` | Same changes |
| `src/hooks/usePdfLazyLoading.ts` | New - core lazy loading hook |
| `src/components/pdf/PageSkeleton.tsx` | New - loading placeholder |
| `src/components/pdf/LoadingProgress.tsx` | New - document load progress |

### Behavior Summary

| Scenario | Current | After |
|----------|---------|-------|
| Initial load | Page 1, then cascades to all | Pages 1-4 (viewport + buffer) |
| Scroll to page 20 | Already loaded | Load pages 17-23, unload 1-13 |
| Memory usage | Grows unbounded | Constant (~7 pages) |
| Jump to page | Instant (if loaded) | Brief skeleton, then render |

## Verification

1. **Manual Testing:**
   - Load a large PDF (30+ pages)
   - Check console: only buffer pages should render
   - Scroll to middle - verify old pages unmount
   - Use `goToPage()` - verify skeleton shows then page loads

2. **Performance Check:**
   - React DevTools: count DOM nodes before/after
   - Memory tab: compare memory with current vs new

3. **Existing Features:**
   - Keyword navigation (`goToPage`) still works
   - Screenshot selection works on visible pages
   - Two-page view mode works correctly

## User Decisions

- **Buffer size:** 3 pages before/after viewport
- **Progress bar:** Yes, include loading progress indicator
