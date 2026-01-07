import { Lock } from 'lucide-react';

const LoginScreen = ({ onLogin }) => {
    return (
        <div className="min-h-screen bg-bg flex flex-col items-center justify-center relative overflow-hidden p-6">
            {/* Efecto de luz ambiental - Optimizado para iOS */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[600px] md:h-[600px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
                    animation: 'pulse 4s ease-in-out infinite',
                    WebkitAnimation: 'pulse 4s ease-in-out infinite'
                }}
            />

            {/* Segunda capa de luz para más profundidad */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] md:w-[400px] md:h-[400px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 60%)',
                    animation: 'pulse 6s ease-in-out infinite',
                    animationDelay: '2s',
                    WebkitAnimation: 'pulse 6s ease-in-out infinite',
                    WebkitAnimationDelay: '2s'
                }}
            />

            {/* Ruido Fílmico - Versión simplificada para mejor compatibilidad */}
            <div
                className="fixed inset-0 opacity-[0.05] pointer-events-none z-0"
                style={{
                    backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4AkZCg8xEBz2LgAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAACM0lEQVRo3u2ZS0sCURTHfzOOjmM+x9dY5qJFLdq0qlX7Fn2CVn2DalXbWkS0qk0PCDKC0HPRA40IM/AV5JSlFbQoWkhg88jTXFdNc2lxz+XC5XLnnv+f/7mXcwVRFEWkVCry+TwAkiSpnmUYhsOhQqGgoih/9K+uri7S6TQAgiD8aRPW1taoVqt6YuVymVqt9qffampqCqPRiCRJqNVq+vr6KC8vt1tcXFxk69at7Nu3L4b0V1NbW1uh0+lgaWkpAPX19WxtbaWsrEz1W+fl5VFbW0sgEGBpaanqmZycZGpqirq6OtavX09OTk68HdHV1RXXr18Pm82G0+mkoaGBTZs2YTQaycjI+CNBq9VKV1cXy5Yto6amhm3btpGZmYlWq/0lzZYtW5g9e/Yf/f8uQf+W2NnZydq1a5k0aRJ1dXVkZWXpHkpJSWHt2rU4HA5yc3M5duwY06ZNIy0tTfVbe3t7WbJkCT09Pbhcrj8cmZ+fz6xZsxg/fjzZ2dna29vbGTduHK2trQwePJiRI0fqfg0KCuLAgQMYjUYKCgro7u5m0KBBul9DQkI4cOAAPp+P8ePH097eTnl5OVu3bsXv92O1WgkLC6O5uZmQkBDa29vJzMykqamJqqoqNm/eTEdHB319fWzcuJGGhgYcDof2cFdXF729vQCkpaXp/3d1dZGamgpAamoqXq9X/06j0WAwGEhLSyM5OZm0tDRSU1NRq9WkpaW)'
                }}
            />

            <div className="relative z-10 w-full max-w-sm flex flex-col items-center">

                {/* Logo */}
                <div
                    className="mb-16 opacity-90 hover:opacity-100 transition-opacity duration-1000"
                    style={{ WebkitTransition: 'opacity 1s' }}
                >
                    <img
                        src="/image_fdd620.png"
                        alt="Vinctus Logo"
                        className="w-auto h-20 md:h-24 object-contain"
                    />
                </div>

                <div className="w-full space-y-10">
                    {/* Campos de entrada */}
                    <div className="space-y-8">
                        <div className="relative group">
                            <input
                                type="email"
                                placeholder="Identidad"
                                autoComplete="email"
                                className="w-full bg-transparent border-b border-white/10 text-white py-3 px-2 focus:outline-none focus:border-white/40 transition-all duration-500 placeholder:text-neutral-700 font-light text-center tracking-widest text-base"
                                style={{
                                    WebkitAppearance: 'none',
                                    borderRadius: 0,
                                    fontSize: '16px' // Previene zoom en iOS
                                }}
                            />
                        </div>
                        <div className="relative group">
                            <input
                                type="password"
                                placeholder="Clave de Acceso"
                                autoComplete="current-password"
                                className="w-full bg-transparent border-b border-white/10 text-white py-3 px-2 focus:outline-none focus:border-white/40 transition-all duration-500 placeholder:text-neutral-700 font-light text-center tracking-widest text-base"
                                style={{
                                    WebkitAppearance: 'none',
                                    borderRadius: 0,
                                    fontSize: '16px' // Previene zoom en iOS
                                }}
                            />
                        </div>
                    </div>

                    {/* Botón Entrar */}
                    <button
                        onClick={onLogin}
                        className="w-full bg-white/90 text-black py-4 hover:bg-white active:bg-white/80 transition-all duration-500 uppercase tracking-[0.25em] text-[10px] font-medium mt-12 active:scale-[0.98]"
                        style={{
                            WebkitTapHighlightColor: 'transparent',
                            WebkitTransition: 'all 0.5s'
                        }}
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

            {/* CSS para animaciones compatibles con Safari */}
            <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.05); }
        }
        @-webkit-keyframes pulse {
          0%, 100% { opacity: 0.3; -webkit-transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.6; -webkit-transform: translate(-50%, -50%) scale(1.05); }
        }
      `}</style>
        </div>
    );
};

export default LoginScreen;
