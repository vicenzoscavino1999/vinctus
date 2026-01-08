import { useState } from 'react';
import { useAuth } from '../context';

const LoginScreen = () => {
    const { signInWithGoogle, error: authError } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setLocalError(null);
        try {
            await signInWithGoogle();
        } catch (err) {
            // Error is already handled in AuthContext
            setLocalError(authError || 'Error al iniciar sesi\u00F3n');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg flex flex-col items-center justify-center relative overflow-hidden p-6">
            {/* Efecto de luz ambiental */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[600px] md:h-[600px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
                    animation: 'pulse 4s ease-in-out infinite',
                }}
            />

            {/* Segunda capa de luz para m\u00E1s profundidad */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] md:w-[400px] md:h-[400px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 60%)',
                    animation: 'pulse 6s ease-in-out infinite',
                    animationDelay: '2s',
                }}
            />

            <div className="relative z-10 w-full max-w-sm flex flex-col items-center">

                {/* Logo */}
                <div className="mb-16 opacity-90 hover:opacity-100 transition-opacity duration-1000">
                    <img
                        src="/image_fdd620.png"
                        alt="Vinctus Logo"
                        className="w-auto h-20 md:h-24 object-contain"
                    />
                </div>

                {/* Titulo */}
                <h1 className="text-white font-serif text-3xl md:text-4xl font-light mb-4 tracking-wide text-center">
                    Vinctus
                </h1>
                <p className="text-neutral-500 text-sm font-light mb-12 text-center">
                    Red social por intereses
                </p>

                {/* Error message */}
                {(localError || authError) && (
                    <div className="w-full mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm text-center">
                        {localError || authError}
                    </div>
                )}

                {/* Bot\u00F3n de Google Sign-In */}
                <button
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 bg-white text-black py-4 px-6 hover:bg-neutral-100 active:bg-neutral-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                        <>
                            {/* Google Icon */}
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path
                                    fill="#4285F4"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                />
                                <path
                                    fill="#EA4335"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                            </svg>
                            <span className="text-sm font-medium tracking-wide">
                                Continuar con Google
                            </span>
                        </>
                    )}
                </button>

                {/* Nota de acceso */}
                <div className="text-center pt-12 flex flex-col items-center space-y-4">
                    <p className="text-neutral-600 text-[10px] font-light uppercase tracking-wider">
                        Conecta con comunidades de tu inter\u00E9s
                    </p>
                </div>
            </div>

            {/* CSS para animaciones */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
                    50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.05); }
                }
            `}</style>
        </div>
    );
};

export default LoginScreen;
