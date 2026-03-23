/**
 * Custom React hook for PDF lazy loading with IntersectionObserver.
 * Only renders pages within a buffer window around the visible viewport.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

export interface UsePdfLazyLoadingOptions {
  numPages: number | undefined;
  bufferSize?: number;  // default: 3
  isTwoPageView: boolean;
  scrollContainerRef: React.RefObject<HTMLElement>;
}

export interface UsePdfLazyLoadingReturn {
  pagesToRender: number[];
  visiblePages: Set<number>;
  shouldRenderPage: (pageNumber: number) => boolean;
  ensurePageLoaded: (pageNumber: number) => Promise<void>;
  onPageRenderSuccess: (pageNumber: number) => void;
  registerPageRef: (pageNumber: number, ref: HTMLDivElement | null) => void;
  getPagePairsToRender: () => number[][];
}

export function usePdfLazyLoading(options: UsePdfLazyLoadingOptions): UsePdfLazyLoadingReturn {
  const { numPages, bufferSize = 3, isTwoPageView, scrollContainerRef } = options;

  // Track visible pages detected by IntersectionObserver
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));

  // Track pages forced to render (e.g., via goToPage navigation)
  const [forcedPages, setForcedPages] = useState<Set<number>>(new Set());

  // Page element refs for IntersectionObserver
  const pageElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // IntersectionObserver instance
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Promise resolvers for ensurePageLoaded
  const pendingLoads = useRef<Map<number, { resolve: () => void; reject: (err: Error) => void }>>(new Map());

  // Calculate pages to render based on visible pages + buffer
  const pagesToRender = useMemo(() => {
    if (!numPages) return [1];

    const visibleArray = Array.from(visiblePages);
    const forcedArray = Array.from(forcedPages);

    if (visibleArray.length === 0 && forcedArray.length === 0) {
      return [1];
    }

    const allRelevantPages = [...visibleArray, ...forcedArray];
    const minVisible = Math.min(...allRelevantPages);
    const maxVisible = Math.max(...allRelevantPages);

    // Calculate buffer range
    const rangeStart = Math.max(1, minVisible - bufferSize);
    const rangeEnd = Math.min(numPages, maxVisible + bufferSize);

    // Generate array of pages in range
    const pages: number[] = [];
    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i);
    }

    return pages;
  }, [numPages, visiblePages, forcedPages, bufferSize]);

  // Check if a page should be rendered
  const shouldRenderPage = useCallback((pageNumber: number): boolean => {
    return pagesToRender.includes(pageNumber);
  }, [pagesToRender]);

  // Ensure a specific page is loaded (for goToPage navigation)
  const ensurePageLoaded = useCallback((pageNumber: number): Promise<void> => {
    // If already in render list, resolve immediately
    if (pagesToRender.includes(pageNumber)) {
      return Promise.resolve();
    }

    // Add to forced pages to trigger render
    setForcedPages(prev => new Set([...prev, pageNumber]));

    // Return a promise that resolves when the page renders
    return new Promise((resolve, reject) => {
      pendingLoads.current.set(pageNumber, { resolve, reject });

      // Timeout after 5 seconds
      setTimeout(() => {
        const pending = pendingLoads.current.get(pageNumber);
        if (pending) {
          pendingLoads.current.delete(pageNumber);
          pending.reject(new Error(`Page ${pageNumber} failed to load in time`));
        }
      }, 5000);
    });
  }, [pagesToRender]);

  // Called when a page successfully renders
  const onPageRenderSuccess = useCallback((pageNumber: number) => {
    // Resolve any pending load promise
    const pending = pendingLoads.current.get(pageNumber);
    if (pending) {
      pendingLoads.current.delete(pageNumber);
      pending.resolve();
    }

    // Clean up forced pages after a delay (let IntersectionObserver take over)
    setTimeout(() => {
      setForcedPages(prev => {
        const next = new Set(prev);
        next.delete(pageNumber);
        return next;
      });
    }, 100);
  }, []);

  // Register a page element ref for observation
  const registerPageRef = useCallback((pageNumber: number, ref: HTMLDivElement | null) => {
    if (ref) {
      pageElementRefs.current.set(pageNumber, ref);
      // Start observing if observer exists
      if (observerRef.current) {
        observerRef.current.observe(ref);
      }
    } else {
      const existing = pageElementRefs.current.get(pageNumber);
      if (existing && observerRef.current) {
        observerRef.current.unobserve(existing);
      }
      pageElementRefs.current.delete(pageNumber);
    }
  }, []);

  // Set up IntersectionObserver
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      setVisiblePages(prev => {
        const next = new Set(prev);

        entries.forEach(entry => {
          const pageNumber = parseInt(entry.target.getAttribute('data-page-number') || '0', 10);
          if (pageNumber > 0) {
            if (entry.isIntersecting) {
              next.add(pageNumber);
            } else {
              next.delete(pageNumber);
            }
          }
        });

        // Ensure at least page 1 is always tracked if set becomes empty
        if (next.size === 0) {
          next.add(1);
        }

        return next;
      });
    };

    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: scrollContainerRef.current,
      rootMargin: '200px 0px', // Preload slightly before visible
      threshold: 0.01 // Trigger when even 1% is visible
    });

    // Observe all currently registered page elements
    pageElementRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [scrollContainerRef]);

  // Get page pairs for two-page view rendering (generates pairs for ALL pages)
  const getPagePairsToRender = useCallback((): number[][] => {
    if (!numPages) return [];

    // Generate all page numbers
    const allPages: number[] = [];
    for (let i = 1; i <= numPages; i++) {
      allPages.push(i);
    }

    if (!isTwoPageView) {
      return allPages.map(page => [page]);
    }

    const pairs: number[][] = [];

    // Page 1 is always shown alone in two-page view
    pairs.push([1]);

    // Pair remaining pages: 2-3, 4-5, etc.
    for (let i = 2; i <= numPages; i += 2) {
      if (i + 1 <= numPages) {
        pairs.push([i, i + 1]);
      } else {
        pairs.push([i]);
      }
    }

    return pairs;
  }, [numPages, isTwoPageView]);

  return {
    pagesToRender,
    visiblePages,
    shouldRenderPage,
    ensurePageLoaded,
    onPageRenderSuccess,
    registerPageRef,
    getPagePairsToRender
  };
}
