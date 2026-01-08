import { Feather } from 'lucide-react';

const ProfilePage = () => (
    <div className="page-profile pt-10 max-w-4xl mx-auto">
        <header className="flex items-start justify-between mb-12 pb-8 border-b border-neutral-900">
            <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center text-3xl font-serif text-neutral-400">V</div>
                <div>
                    <h1 className="text-4xl font-serif font-light text-white mb-2">Vicenzo S.</h1>
                    <p className="text-neutral-400 mb-1">Desarrollador & Curioso</p>
                    <p className="text-neutral-600 text-sm">Lima, Perú</p>
                </div>
            </div>
            <button className="px-5 py-2.5 border border-neutral-700 text-white hover:bg-neutral-900 transition-colors text-sm">
                Editar Perfil
            </button>
        </header>
        <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
            <Feather size={32} strokeWidth={0.5} className="mx-auto mb-4 text-neutral-600" />
            <p className="text-neutral-500 font-light italic">Personaliza tu perfil para comenzar</p>
        </div>
    </div>
);

export default ProfilePage;

