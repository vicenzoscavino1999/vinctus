import { BookOpen } from 'lucide-react';

// LibraryItem component
const LibraryItem = ({ item }) => (
    <div className="flex items-start py-6 border-b border-neutral-900 group cursor-pointer hover:bg-neutral-900/30 transition-colors -mx-4 px-4">
        <div className="mr-6 pt-1 text-neutral-700 group-hover:text-neutral-500 transition-colors">
            <BookOpen size={20} strokeWidth={1} />
        </div>
        <div className="flex-1">
            <div className="flex justify-between mb-1">
                <span className="text-[10px] uppercase tracking-widest text-neutral-600">{item.type || item.category}</span>
                <span className="text-[10px] text-neutral-600">{item.readTime}</span>
            </div>
            <h3 className="text-lg text-neutral-300 font-serif font-light mb-1 group-hover:text-white transition-colors">{item.title}</h3>
            <p className="text-neutral-500 text-xs">Por {item.author}</p>
        </div>
    </div>
);

export default LibraryItem;
