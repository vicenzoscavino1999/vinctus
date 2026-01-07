import { User, ArrowRight, Plus } from 'lucide-react';
import { COLLABORATIONS } from '../data';
import { useToast } from '../components/Toast';

const ProjectsPage = () => {
    const { showToast } = useToast();

    // Datos de eventos
    const EVENTS_DATA = [
        { id: 1, day: '12', month: 'ENE', title: 'Noche de Vinilos & Charla', location: 'Ciudad de Mexico, Roma Norte', attendees: 34 },
        { id: 2, day: '15', month: 'FEB', title: 'Simposio de Arqueologia', location: 'Lima, Barranco', attendees: 120 },
        { id: 3, day: '28', month: 'ENE', title: 'Hackathon AI for Good', location: 'Buenos Aires, Palermo', attendees: 85 },
        { id: 4, day: '5', month: 'FEB', title: 'Observacion de Aves', location: 'Bogota, Humedal Cordoba', attendees: 25 }
    ];

    const handlePublishProject = () => {
        showToast('Publicar proyectos estara disponible pronto', 'info');
    };

    return (
        <div className="page-projects pb-32">
            {/* Header */}
            <header className="mb-10 pt-6 md:pt-10 flex flex-col md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="text-display-sm md:text-display-md font-display font-normal text-white mb-3 tracking-tight">
                        Conexiones
                    </h1>
                    <p className="text-neutral-500 font-light text-body-sm">
                        Conecta. Colabora. Encuentra.
                    </p>
                </div>
                <button
                    onClick={handlePublishProject}
                    className="mt-6 md:mt-0 text-xs bg-brand-gold text-black px-6 py-3 rounded-button btn-premium uppercase tracking-widest font-medium flex items-center gap-2"
                >
                    <Plus size={14} />
                    PUBLICAR PROYECTO
                </button>
            </header>

            {/* Colaboraciones */}
            <section className="mb-10">
                <h2 className="text-heading-lg font-display font-normal text-white mb-6">Colaboraciones</h2>

                {COLLABORATIONS.map(item => (
                    <div
                        key={item.id}
                        className="bg-neutral-900/20 border border-neutral-800/50 rounded-lg p-6 mb-4 cursor-pointer hover:bg-neutral-900/40 hover:border-neutral-700 transition-all group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <span className="text-[10px] uppercase tracking-widest text-neutral-500 border border-neutral-700 px-2 py-1 rounded">
                                {item.context}
                            </span>
                            <span className="text-neutral-600 text-xs">{item.time}</span>
                        </div>

                        <h3 className="text-xl md:text-2xl text-white font-serif font-light mb-2 group-hover:text-white/90">
                            {item.title}
                        </h3>

                        <p className="text-neutral-500 text-sm mb-4">
                            Por <span className="text-amber-200/80">{item.author}</span>
                        </p>

                        <div className="flex items-center justify-between">
                            <div className="flex flex-wrap gap-2">
                                {item.tags.map(tag => (
                                    <span key={tag} className="text-[10px] text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            <ArrowRight size={16} className="text-neutral-600 group-hover:text-white transition-colors" />
                        </div>
                    </div>
                ))}
            </section>

            {/* Encuentros */}
            <section>
                <h2 className="text-2xl font-serif font-light text-white mb-6">Encuentros</h2>

                <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
                    {EVENTS_DATA.map(event => (
                        <div
                            key={event.id}
                            className="flex-shrink-0 w-[220px] bg-neutral-900/30 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:bg-neutral-900/50 hover:border-neutral-700 transition-all group"
                        >
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <span className="text-3xl font-serif text-white font-light">{event.day}</span>
                                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mt-1">{event.month}</span>
                                </div>
                                <div className="w-8 h-8 rounded-full border border-neutral-700 flex items-center justify-center group-hover:bg-white group-hover:border-white transition-all">
                                    <ArrowRight size={14} className="text-neutral-500 group-hover:text-black transition-colors" />
                                </div>
                            </div>

                            <h4 className="text-white font-light text-sm mb-3 line-clamp-2 group-hover:text-white/90">{event.title}</h4>

                            <div className="flex items-center gap-1 text-neutral-500 text-xs mb-1">
                                <span>📍 {event.location}</span>
                            </div>
                            <div className="flex items-center gap-1 text-neutral-500 text-xs">
                                <User size={10} />
                                <span>{event.attendees}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default ProjectsPage;
