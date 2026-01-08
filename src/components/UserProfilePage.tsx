import { ChevronLeft, Mail, MoreHorizontal, MapPin, Music, BookOpen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

type UserCredential = {
    icon: LucideIcon;
    label: string;
    color: string;
};

type UserContribution = {
    id: number;
    title: string;
    category: string;
    year: string;
};

type UserProfile = {
    id: string;
    name: string;
    role: string;
    location: string;
    avatar: string | null;
    initial: string;
    bio: string;
    reputation: number;
    credentials: UserCredential[];
    contributions: UserContribution[];
};

// Mock user data - in a real app this would come from an API
const USERS: Record<string, UserProfile> = {
    'marco-v': {
        id: 'marco-v',
        name: 'Marco V.',
        role: 'Mel\u00F3mano & Pianista',
        location: 'Cali, Colombia',
        avatar: null,
        initial: 'M',
        bio: 'Investigando las ra\u00EDces africanas en la m\u00FAsica caribe\u00F1a. Coleccionista de vinilos y pianista de sesi\u00F3n.',
        reputation: 85,
        credentials: [
            { icon: Music, label: 'M\u00FAsico Verificado', color: 'text-purple-400' }
        ],
        contributions: [
            { id: 1, title: 'Entrop\u00EDa y Jazz: Un ensayo', category: 'BIBLIOTECA: M\u00DASICA', year: '2023' }
        ]
    },
    'dr-elena-r': {
        id: 'dr-elena-r',
        name: 'Dr. Elena R.',
        role: 'Investigadora',
        location: 'Madrid, Espa\u00F1a',
        avatar: null,
        initial: 'E',
        bio: 'F\u00EDsica te\u00F3rica especializada en gravedad cu\u00E1ntica. Profesora asociada y divulgadora cient\u00EDfica.',
        reputation: 92,
        credentials: [
            { icon: BookOpen, label: 'Experta Verificada', color: 'text-blue-400' }
        ],
        contributions: [
            { id: 1, title: 'Paradojas del Horizonte de Eventos', category: 'BIBLIOTECA: CIENCIA', year: '2024' }
        ]
    },
    'ada-l': {
        id: 'ada-l',
        name: 'Ada L.',
        role: 'Desarrolladora',
        location: 'Buenos Aires, Argentina',
        avatar: null,
        initial: 'A',
        bio: 'Ingeniera de ML en startups de IA. Open source contributor. Apasionada por la \u00E9tica en tecnolog\u00EDa.',
        reputation: 78,
        credentials: [
            { icon: BookOpen, label: 'Desarrolladora Verificada', color: 'text-green-400' }
        ],
        contributions: []
    },
    'gabriel-m': {
        id: 'gabriel-m',
        name: 'Gabriel M.',
        role: 'Naturalista',
        location: 'Bogotá, Colombia',
        avatar: null,
        initial: 'G',
        bio: 'Bi\u00F3logo de campo y fot\u00F3grafo de naturaleza. Especializado en ornitolog\u00EDa neotropical.',
        reputation: 81,
        credentials: [
            { icon: BookOpen, label: 'Naturalista Verificado', color: 'text-emerald-400' }
        ],
        contributions: [
            { id: 1, title: 'Gu\u00EDa de Aves del Humedal C\u00F3rdoba', category: 'BIBLIOTECA: NATURALEZA', year: '2023' }
        ]
    }
};

const UserProfilePage = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();

    const user = userId ? USERS[userId] : undefined;

    if (!user) {
        return (
            <div className="page-profile flex flex-col items-center justify-center h-[60vh] text-neutral-600">
                <p className="font-serif italic text-lg mb-4">Usuario no encontrado</p>
                <button onClick={() => navigate(-1)} className="text-white underline text-sm">Volver</button>
            </div>
        );
    }

    return (
        <div className="page-profile pt-8 max-w-4xl mx-auto">
            {/* Back button */}
            <button
                onClick={() => navigate(-1)}
                className="group flex items-center text-neutral-500 hover:text-neutral-300 mb-8 transition-colors text-xs tracking-widest uppercase"
            >
                <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" />
                Volver al Feed
            </button>

            {/* Profile header */}
            <header className="flex items-start justify-between mb-12 pb-8 border-b border-neutral-900">
                <div className="flex items-center gap-6">
                    {/* Avatar */}
                    <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center text-3xl font-serif text-neutral-400">
                        {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            user.initial
                        )}
                    </div>

                    {/* Name and info */}
                    <div>
                        <h1 className="text-4xl font-serif font-light text-white mb-2">{user.name}</h1>
                        <p className="text-neutral-400 mb-1">{user.role}</p>
                        <p className="text-neutral-600 text-sm flex items-center">
                            <MapPin size={12} className="mr-1" />
                            {user.location}
                        </p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-5 py-2.5 border border-neutral-700 text-white hover:bg-neutral-900 transition-colors text-sm">
                        <Mail size={16} />
                        Contactar
                    </button>
                    <button className="p-2.5 border border-neutral-700 text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors">
                        <MoreHorizontal size={16} />
                    </button>
                </div>
            </header>

            {/* Content grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                {/* Left column - About */}
                <div className="md:col-span-1 space-y-8">
                    {/* About me */}
                    <section>
                        <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Sobre Mí</h2>
                        <p className="text-neutral-400 font-light leading-relaxed">{user.bio}</p>
                    </section>

                    {/* Credentials */}
                    <section>
                        <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Credenciales</h2>
                        <div className="space-y-2">
                            {user.credentials.map((cred, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm">
                                    <cred.icon size={16} className={cred.color} />
                                    <span className="text-neutral-300">{cred.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Reputation */}
                    <section>
                        <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Reputación</h2>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-neutral-600 to-white rounded-full transition-all duration-500"
                                    style={{ width: `${user.reputation}%` }}
                                />
                            </div>
                            <span className="text-neutral-400 text-lg font-light">{user.reputation}</span>
                        </div>
                    </section>
                </div>

                {/* Right column - Portfolio */}
                <div className="md:col-span-2">
                    <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-6">Portafolio & Contribuciones</h2>

                    {user.contributions.length > 0 ? (
                        <div className="space-y-3">
                            {user.contributions.map(item => (
                                <div
                                    key={item.id}
                                    className="flex items-center gap-4 p-5 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/30 transition-all cursor-pointer group"
                                >
                                    <BookOpen size={20} className="text-neutral-600 group-hover:text-neutral-400" />
                                    <div className="flex-1">
                                        <span className="text-[10px] tracking-widest text-neutral-600 uppercase">{item.category}</span>
                                        <h3 className="text-lg text-neutral-200 font-serif font-light group-hover:text-white transition-colors">
                                            {item.title}
                                        </h3>
                                    </div>
                                    <span className="text-neutral-600 text-sm">{item.year}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
                            <p className="text-neutral-600 font-light italic">Sin contribuciones publicadas aún.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserProfilePage;

