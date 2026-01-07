import { MapPin, User, ArrowRight } from 'lucide-react';

// EventCard component
const EventCard = ({ event }) => (
    <div className="flex flex-col bg-neutral-900/20 border border-neutral-800 p-6 hover:bg-neutral-900/40 transition-colors cursor-pointer group">
        <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col">
                <span className="text-2xl font-serif text-white">{event.date.split(' ')[0]}</span>
                <span className="text-[10px] uppercase tracking-widest text-neutral-500">{event.date.split(' ')[1]}</span>
            </div>
            <div className="p-2 border border-neutral-800 rounded-full group-hover:bg-white group-hover:text-black transition-all text-neutral-500">
                <ArrowRight size={16} />
            </div>
        </div>
        <h3 className="text-lg text-neutral-300 font-light mb-2 group-hover:text-white transition-colors">{event.title}</h3>
        <div className="flex items-center text-neutral-600 text-xs mt-auto space-x-4">
            <span className="flex items-center"><MapPin size={12} className="mr-1" /> {event.location}</span>
            <span className="flex items-center"><User size={12} className="mr-1" /> {event.attendees}</span>
        </div>
    </div>
);

export default EventCard;
