import { ArrowRight } from 'lucide-react';
import type { Category } from '@/shared/types';
import type { TrendPreviewItem, TrendPreviewState } from '@/features/discover/model/trendRanking';

type TrendPreviewPanelProps = {
  category: Category;
  preview: TrendPreviewState;
  onOpenCategory: (category: Category) => void;
  className?: string;
};

const PreviewItemBody = ({ item }: { item: TrendPreviewItem }) => (
  <>
    <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">{item.meta}</p>
    <h4 className="text-sm text-white font-medium line-clamp-2">{item.title}</h4>
    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{item.subtitle}</p>
  </>
);

const TrendPreviewPanel = ({
  category,
  preview,
  onOpenCategory,
  className,
}: TrendPreviewPanelProps) => (
  <div
    className={`rounded-card border border-neutral-800/70 bg-surface-overlay/80 p-5 md:p-6 animate-in fade-in duration-300 ${
      className ?? ''
    }`}
  >
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Preview instantaneo
        </p>
        <h3 className="text-white text-xl font-display mt-1">{category.label}</h3>
        <p className="text-sm text-neutral-400 mt-1">
          Top hallazgos recientes de la categoria, sin salir de Discover.
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpenCategory(category)}
        className="inline-flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-2 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white transition-colors"
      >
        Ver categoria
        <ArrowRight size={12} />
      </button>
    </div>

    <div className="mt-4">
      {preview.loading ? (
        <div className="text-sm text-neutral-500">Cargando vista previa...</div>
      ) : preview.error ? (
        <div className="text-sm text-red-400">{preview.error}</div>
      ) : preview.items.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No hay resultados disponibles para esta categoria ahora.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {preview.items.map((item, index) =>
            item.href ? (
              <a
                key={`${category.id}-${item.id}`}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                style={{ animationDelay: `${index * 90}ms` }}
                className="block rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4 hover:border-neutral-600 transition-colors animate-in fade-in slide-in-from-bottom-1 duration-500"
              >
                <PreviewItemBody item={item} />
              </a>
            ) : (
              <div
                key={`${category.id}-${item.id}`}
                style={{ animationDelay: `${index * 90}ms` }}
                className="block rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4 animate-in fade-in slide-in-from-bottom-1 duration-500"
              >
                <PreviewItemBody item={item} />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  </div>
);

export default TrendPreviewPanel;
