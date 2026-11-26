import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  /** Accessible name of the list, e.g. "Publicaciones recientes". */
  label: string;
  children: ReactNode;
};

/**
 * A horizontal row of cards that snaps to each card. Touch and trackpads scroll it; on wider
 * screens arrows appear at the edges that still have cards to show.
 */
export default function Rail({ label, children }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const atStart = node.scrollLeft <= 4;
    const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 4;
    setEdges((previous) =>
      previous.atStart === atStart && previous.atEnd === atEnd ? previous : { atStart, atEnd },
    );
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    measure();
    node.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure, children]);

  const scrollByPage = (direction: -1 | 1) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: 'smooth' });
  };

  const arrowClass =
    'absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-neutral-900/90 text-white shadow-lg backdrop-blur transition-opacity hover:bg-neutral-800 md:flex';

  return (
    <div className="relative">
      <div
        ref={scroller}
        role="list"
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 scrollbar-hide md:mx-0 md:scroll-px-0 md:gap-4 md:px-0"
      >
        {children}
      </div>
      {!edges.atStart && (
        <button
          type="button"
          aria-label="Anteriores"
          onClick={() => scrollByPage(-1)}
          className={`${arrowClass} -left-5`}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {!edges.atEnd && (
        <button
          type="button"
          aria-label="Siguientes"
          onClick={() => scrollByPage(1)}
          className={`${arrowClass} -right-5`}
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

/** One card slot of a Rail. */
export function RailItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="listitem" className={`shrink-0 snap-start ${className}`}>
      {children}
    </div>
  );
}
