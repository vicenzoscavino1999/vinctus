import { ArrowRight } from 'lucide-react';

// CategoryCard component
const CategoryCard = ({ category, onClick }) => (
    <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        className={`group relative overflow-hidden bg-neutral-950/0 border border-neutral-800/60 p-10 cursor-pointer transition-all duration-700 hover:border-neutral-600 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-2 focus:ring-white/30 ${category.bgHover}`}
    >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <div className="relative z-10 flex flex-col h-full justify-between min-h-[280px]">
            <div>
                <div className={`mb-8 opacity-80 group-hover:opacity-100 transition-opacity duration-500 ${category.color}`}>
                    <category.icon size={32} strokeWidth={1} />
                </div>
                <h3 className="text-3xl font-serif font-light text-neutral-200 mb-4 tracking-tight group-hover:text-white transition-colors">
                    {category.label}
                </h3>
                <p className="text-neutral-500 text-sm leading-relaxed font-light max-w-[90%] group-hover:text-neutral-400 transition-colors">
                    {category.description}
                </p>
            </div>
            <div className="border-t border-neutral-800/50 pt-6 mt-6">
                <div className="flex flex-wrap gap-2 opacity-60 group-hover:opacity-100 transition-opacity duration-500">
                    {category.subgroups.map(sub => (
                        <span key={sub.id} className="text-[10px] uppercase tracking-widest text-neutral-500">
                            {sub.name} &nbsp;•&nbsp;
                        </span>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

export default CategoryCard;
