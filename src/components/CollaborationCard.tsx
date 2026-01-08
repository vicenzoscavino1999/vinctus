import { ArrowUpRight } from 'lucide-react';
import type { Collaboration } from '../types';

// CollaborationCard component
type CollaborationCardProps = {
    item: Collaboration;
};

const CollaborationCard = ({ item }: CollaborationCardProps) => (
    <div className="bg-neutral-900/10 border border-neutral-800 p-8 hover:bg-neutral-900/30 transition-all group cursor-pointer">
        <div className="flex justify-between items-start mb-6">
            <span className="text-[10px] tracking-widest uppercase text-neutral-500 border border-neutral-800 px-2 py-1 rounded-sm">
                {item.context}
            </span>
            <span className="text-neutral-600 text-xs">{item.time}</span>
        </div>
        <h3 className="text-2xl text-neutral-200 font-serif font-light mb-4 group-hover:text-white transition-colors">
            {item.title}
        </h3>
        <div className="flex items-center space-x-4 mb-8">
            <span className="text-xs text-neutral-500">Por <span className="text-neutral-300">{item.author}</span></span>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-800 pt-6">
            <div className="flex space-x-2">
                {item.tags.map(tag => (
                    <span key={tag} className="text-xs text-neutral-500 bg-neutral-900 px-2 py-1 rounded-sm">
                        {tag}
                    </span>
                ))}
            </div>
            <button className="text-neutral-400 hover:text-white transition-colors">
                <ArrowUpRight size={18} />
            </button>
        </div>
    </div>
);

export default CollaborationCard;

