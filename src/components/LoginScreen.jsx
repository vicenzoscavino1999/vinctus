import { Lock } from 'lucide-react';

const LoginScreen = ({ onLogin }) => {
    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden p-6">
            {/* Ambiente Sutil - Luz pulsante */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-[120px] pointer-events-none animate-pulse"
                style={{ animationDuration: '5s' }}
            />

            {/* Ruido Fílmico */}
            <div
                className="fixed inset-0 opacity-[0.07] pointer-events-none z-0"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
            />

            <div className="relative z-10 w-full max-w-sm flex flex-col items-center animate-fade-in">

                {/* Logo */}
                <div className="mb-16 opacity-90 hover:opacity-100 transition-opacity duration-1000">
                    <img
                        src="/image_fdd620.png"
                        alt="Vinctus Logo"
                        className="w-auto h-24 object-contain"
                    />
                </div>

                <div className="w-full space-y-10">
                    {/* Campos de entrada */}
                    <div className="space-y-8">
                        <div className="relative group">
                            <input
                                type="email"
                                placeholder="Identidad"
                                className="w-full bg-transparent border-b border-white/10 text-white py-3 px-2 focus:outline-none focus:border-white/40 transition-all duration-500 placeholder:text-neutral-700 font-light text-center tracking-widest text-base"
                            />
                        </div>
                        <div className="relative group">
                            <input
                                type="password"
                                placeholder="Clave de Acceso"
                                className="w-full bg-transparent border-b border-white/10 text-white py-3 px-2 focus:outline-none focus:border-white/40 transition-all duration-500 placeholder:text-neutral-700 font-light text-center tracking-widest text-base"
                            />
                        </div>
                    </div>

                    {/* Botón Entrar */}
                    <button
                        onClick={onLogin}
                        className="w-full bg-white/90 text-black py-4 hover:bg-white transition-all duration-700 uppercase tracking-[0.25em] text-[10px] font-medium mt-12 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] active:scale-95"
                    >
                        Entrar
                    </button>

                    {/* Nota de acceso restringido */}
                    <div className="text-center pt-12 flex flex-col items-center space-y-4">
                        <Lock size={12} className="text-neutral-700" />
                        <p className="text-neutral-600 text-[10px] font-serif italic">
                            Acceso restringido por invitación.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
