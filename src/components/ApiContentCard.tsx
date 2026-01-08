import { ExternalLink, User, Heart, MessageSquare, MapPin } from 'lucide-react';

interface ApiContentItem {
    id: string | number;
    title?: string;
    type?: string;
    link?: string;
    url?: string;
    summary?: string;
    authors?: string;
    published?: string;
    time?: string;
    score?: number;
    comments?: number;
    cover?: string | null;
    firstPublished?: number | string;
    thumbnail?: string | null;
    species?: string;
    scientificName?: string;
    location?: string;
    photo?: string | null;
    observer?: string;
    artist?: string;
}

type ApiContentCardProps = {
    item: ApiContentItem;
    type: string;
};

// Generic card for API content - clicking opens the source link
const ApiContentCard = ({ item, type }: ApiContentCardProps) => {
    // Get the appropriate link based on type
    const getLink = () => {
        switch (type) {
            case 'arxiv':
                return item.link;
            case 'hackernews':
                return item.url;
            case 'openlibrary':
                return item.link;
            case 'wikipedia':
                return item.link;
            case 'inaturalist':
                return item.link;
            case 'lastfm':
                return item.link;
            default:
                return item.link || item.url || '#';
        }
    };

    const handleClick = () => {
        const link = getLink();
        if (link && link !== '#') {
            window.open(link, '_blank', 'noopener,noreferrer');
        }
    };

    const renderContent = () => {
        switch (type) {
            case 'arxiv':
                return (
                    <>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] uppercase tracking-widest text-blue-400/80">{item.type}</span>
                            <span className="text-[10px] text-neutral-600">{item.published}</span>
                        </div>
                        <h3 className="text-lg text-neutral-200 font-serif font-light mb-2 group-hover:text-white transition-colors line-clamp-2">
                            {item.title}
                        </h3>
                        <p className="text-neutral-500 text-xs mb-3 line-clamp-2">{item.summary}</p>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-neutral-600">{item.authors}</span>
                            <ExternalLink size={14} className="text-neutral-600 group-hover:text-white transition-colors" />
                        </div>
                    </>
                );

            case 'hackernews':
                return (
                    <>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] uppercase tracking-widest text-green-400/80">{item.type}</span>
                            <span className="text-[10px] text-neutral-600">{item.time}</span>
                        </div>
                        <h3 className="text-lg text-neutral-200 font-serif font-light mb-3 group-hover:text-white transition-colors line-clamp-2">
                            {item.title}
                        </h3>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4 text-neutral-500 text-xs">
                                <span className="flex items-center"><Heart size={12} className="mr-1" /> {item.score}</span>
                                <span className="flex items-center"><MessageSquare size={12} className="mr-1" /> {item.comments}</span>
                            </div>
                            <ExternalLink size={14} className="text-neutral-600 group-hover:text-white transition-colors" />
                        </div>
                    </>
                );

            case 'openlibrary':
                return (
                    <>
                        <div className="flex gap-4">
                            {item.cover && (
                                <img src={item.cover} alt={item.title} className="w-16 h-24 object-cover rounded" />
                            )}
                            <div className="flex-1">
                                <span className="text-[10px] uppercase tracking-widest text-purple-400/80 block mb-1">{item.type}</span>
                                <h3 className="text-lg text-neutral-200 font-serif font-light mb-1 group-hover:text-white transition-colors line-clamp-2">
                                    {item.title}
                                </h3>
                                <p className="text-neutral-500 text-xs mb-2">{item.authors}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-neutral-600">{item.firstPublished}</span>
                                    <ExternalLink size={14} className="text-neutral-600 group-hover:text-white transition-colors" />
                                </div>
                            </div>
                        </div>
                    </>
                );

            case 'wikipedia':
                return (
                    <>
                        <div className="flex gap-4">
                            {item.thumbnail && (
                                <img src={item.thumbnail} alt={item.title} className="w-20 h-20 object-cover rounded" />
                            )}
                            <div className="flex-1">
                                <span className="text-[10px] uppercase tracking-widest text-amber-400/80 block mb-1">{item.type}</span>
                                <h3 className="text-lg text-neutral-200 font-serif font-light mb-2 group-hover:text-white transition-colors line-clamp-2">
                                    {item.title}
                                </h3>
                                <p className="text-neutral-500 text-xs line-clamp-2">{item.summary}</p>
                            </div>
                        </div>
                        <div className="flex justify-end mt-2">
                            <ExternalLink size={14} className="text-neutral-600 group-hover:text-white transition-colors" />
                        </div>
                    </>
                );

            case 'inaturalist':
                return (
                    <>
                        {item.photo && (
                            <img src={item.photo} alt={item.species} className="w-full h-32 object-cover rounded mb-3" />
                        )}
                        <span className="text-[10px] uppercase tracking-widest text-emerald-400/80 block mb-1">{item.type}</span>
                        <h3 className="text-lg text-neutral-200 font-serif font-light mb-1 group-hover:text-white transition-colors">
                            {item.species}
                        </h3>
                        <p className="text-neutral-600 text-xs italic mb-2">{item.scientificName}</p>
                        <div className="flex items-center justify-between text-neutral-500 text-xs">
                            <span className="flex items-center"><MapPin size={12} className="mr-1" /> {item.location}</span>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center"><User size={12} className="mr-1" /> {item.observer}</span>
                                <ExternalLink size={14} className="text-neutral-600 group-hover:text-white transition-colors" />
                            </div>
                        </div>
                    </>
                );

            case 'lastfm':
                return (
                    <>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] uppercase tracking-widest text-purple-400/80">{item.type}</span>
                        </div>
                        <h3 className="text-lg text-neutral-200 font-serif font-light mb-1 group-hover:text-white transition-colors">
                            {item.title}
                        </h3>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-neutral-500">{item.artist}</span>
                            <ExternalLink size={14} className="text-neutral-600 group-hover:text-white transition-colors" />
                        </div>
                    </>
                );

            default:
                return (
                    <h3 className="text-lg text-neutral-200">{item.title}</h3>
                );
        }
    };

    return (
        <div
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
            className="bg-neutral-900/20 border border-neutral-800 p-5 hover:bg-neutral-900/40 transition-all cursor-pointer group hover-lift hover:border-neutral-600"
        >
            {renderContent()}
        </div>
    );
};

export default ApiContentCard;

