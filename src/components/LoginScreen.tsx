import { useState, type FormEvent } from 'react';
import { useAuth } from '../context';

type AuthMode = 'login' | 'register' | 'phone' | 'forgot_password';

const LoginScreen = () => {
    const {
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        sendPhoneCode,
        verifyPhoneCode,
        error: authError,
        clearError,
        phoneCodeSent,
        resetPhoneAuth
    } = useAuth();
    const [mode, setMode] = useState<AuthMode>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Form state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        clearError();
        setSuccessMessage(null);
        try {
            await signInWithGoogle();
        } catch {
            // Error handled in AuthContext
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        clearError();
        setSuccessMessage(null);

        try {
            if (mode === 'login') {
                await signInWithEmail(email, password);
            } else if (mode === 'register') {
                await signUpWithEmail(email, password, displayName || undefined);
                setSuccessMessage('¡Cuenta creada! Revisa tu correo para verificar tu cuenta.');
                // Optional: switch to login mod or auto-login (already handled by context)
            } else if (mode === 'forgot_password') {
                await resetPassword(email);
                setSuccessMessage('Si el correo existe, recibirás un enlace para recuperar tu contraseña.');
                // Keep them on this screen or switch to login logic
            }
        } catch {
            // Error handled in AuthContext
        } finally {
            setIsLoading(false);
        }
    };

    const handlePhoneSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        clearError();
        setSuccessMessage(null);

        try {
            if (!phoneCodeSent) {
                // Format phone number with Peru country code (+51)
                // Input is always digits-only (9 chars max) due to sanitization on line 157
                const formattedPhone = `+51${phoneNumber}`;
                await sendPhoneCode(formattedPhone, 'recaptcha-container');
            } else {
                await verifyPhoneCode(verificationCode);
            }
        } catch {
            // Error handled in AuthContext
        } finally {
            setIsLoading(false);
        }
    };

    const switchMode = (newMode: AuthMode) => {
        setMode(newMode);
        clearError();
        setSuccessMessage(null);
        setPassword('');
        // Don't clear email when switching to forgot password as it might be useful
        if (newMode === 'login' && mode === 'register') {
            setEmail('');
            setDisplayName('');
        }
        if (newMode !== 'phone' && newMode !== 'forgot_password') {
            // Reset phone auth only when leaving phone mode completely not just sub-states if any
        }

        if (newMode !== 'phone') {
            resetPhoneAuth();
            setPhoneNumber('');
            setVerificationCode('');
        }
    };

    const showPhoneOption = () => {
        switchMode('phone');
    };

    const backToMainAuth = () => {
        switchMode('login');
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

            <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
                {/* Logo */}
                <div className="mb-10 opacity-90 hover:opacity-100 transition-opacity duration-1000">
                    <img
                        src="/image_fdd620.png"
                        alt="Vinctus Logo"
                        className="w-auto h-14 md:h-16 object-contain"
                    />
                </div>

                {/* reCAPTCHA container (invisible) */}
                <div id="recaptcha-container"></div>

                {/* Phone Auth View (Alternative Access) */}
                {mode === 'phone' ? (
                    <div className="w-full">
                        {/* Back button */}
                        <button
                            onClick={backToMainAuth}
                            className="mb-6 text-neutral-500 text-sm hover:text-white transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Volver
                        </button>

                        {/* Elegant message */}
                        <div className="text-center mb-8">
                            <h2 className="text-white font-serif text-xl mb-3">Acceso Alternativo</h2>
                            <p className="text-neutral-500 text-sm leading-relaxed">
                                Si tienes problemas con tu correo o cuenta de Google,
                                puedes acceder con tu número de teléfono.
                            </p>
                        </div>

                        <form onSubmit={handlePhoneSubmit} className="w-full space-y-4 mb-6">
                            {!phoneCodeSent ? (
                                <>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">+51</span>
                                        <input
                                            type="tel"
                                            placeholder="Número de celular"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                                            required
                                            maxLength={9}
                                            className="w-full bg-neutral-900/50 border border-neutral-800 text-white py-3 pl-14 pr-4 rounded focus:outline-none focus:border-neutral-600 transition-colors placeholder:text-neutral-600"
                                        />
                                    </div>
                                    <p className="text-neutral-600 text-xs text-center italic">
                                        Recibirás un código SMS para verificar tu identidad
                                    </p>
                                </>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        placeholder="Código de 6 dígitos"
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                        required
                                        maxLength={6}
                                        className="w-full bg-neutral-900/50 border border-neutral-800 text-white py-3 px-4 rounded focus:outline-none focus:border-neutral-600 transition-colors placeholder:text-neutral-600 text-center tracking-[0.5em] text-lg"
                                    />
                                    <div className="text-center">
                                        <p className="text-neutral-600 text-xs">
                                            Código enviado a +51{phoneNumber}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => resetPhoneAuth()}
                                            className="text-neutral-400 text-xs underline hover:text-white mt-2"
                                        >
                                            Cambiar número
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Error message */}
                            {authError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm text-center">
                                    {authError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-neutral-800 text-white py-3 px-6 font-medium hover:bg-neutral-700 active:bg-neutral-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded border border-neutral-700"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 mx-auto border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : !phoneCodeSent ? (
                                    'Enviar Código SMS'
                                ) : (
                                    'Verificar y Entrar'
                                )}
                            </button>
                        </form>
                    </div>
                ) : mode === 'forgot_password' ? (
                    <div className="w-full">
                        {/* Back button */}
                        <button
                            onClick={backToMainAuth}
                            className="mb-6 text-neutral-500 text-sm hover:text-white transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Volver
                        </button>

                        <div className="text-center mb-8">
                            <h2 className="text-white font-serif text-xl mb-3">Recuperar Contraseña</h2>
                            <p className="text-neutral-500 text-sm leading-relaxed">
                                Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
                            </p>
                        </div>

                        {/* Success message */}
                        {successMessage && (
                            <div className="w-full mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm text-center">
                                {successMessage}
                            </div>
                        )}

                        {/* Error message */}
                        {authError && (
                            <div className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm text-center">
                                {authError}
                            </div>
                        )}

                        <form onSubmit={handleEmailSubmit} className="w-full space-y-4 mb-6">
                            <input
                                type="email"
                                placeholder="Correo electrónico"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full bg-neutral-900/50 border border-neutral-800 text-white py-3 px-4 rounded focus:outline-none focus:border-neutral-600 transition-colors placeholder:text-neutral-600"
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !!successMessage}
                                className="w-full bg-white text-black py-3 px-6 font-medium hover:bg-neutral-100 active:bg-neutral-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 mx-auto border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                ) : (
                                    'Enviar Correo'
                                )}
                            </button>
                        </form>
                    </div>
                ) : (
                    <>
                        {/* Main Auth View */}
                        {/* Tabs */}
                        <div className="flex w-full mb-6 border-b border-neutral-800">
                            <button
                                onClick={() => switchMode('login')}
                                className={`flex-1 pb-3 text-sm tracking-wider uppercase transition-colors ${mode === 'login'
                                    ? 'text-white border-b-2 border-white'
                                    : 'text-neutral-500 hover:text-neutral-300'
                                    }`}
                            >
                                Entrar
                            </button>
                            <button
                                onClick={() => switchMode('register')}
                                className={`flex-1 pb-3 text-sm tracking-wider uppercase transition-colors ${mode === 'register'
                                    ? 'text-white border-b-2 border-white'
                                    : 'text-neutral-500 hover:text-neutral-300'
                                    }`}
                            >
                                Registro
                            </button>
                        </div>

                        {/* Success message */}
                        {successMessage && (
                            <div className="w-full mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm text-center">
                                {successMessage}
                            </div>
                        )}

                        {/* Error message */}
                        {authError && (
                            <div className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm text-center">
                                {authError}
                            </div>
                        )}

                        {/* Email/Password Form */}
                        <form onSubmit={handleEmailSubmit} className="w-full space-y-4 mb-6">
                            {mode === 'register' && (
                                <input
                                    type="text"
                                    placeholder="Nombre (opcional)"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="w-full bg-neutral-900/50 border border-neutral-800 text-white py-3 px-4 rounded focus:outline-none focus:border-neutral-600 transition-colors placeholder:text-neutral-600"
                                />
                            )}
                            <input
                                type="email"
                                placeholder="Correo electrónico"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full bg-neutral-900/50 border border-neutral-800 text-white py-3 px-4 rounded focus:outline-none focus:border-neutral-600 transition-colors placeholder:text-neutral-600"
                            />
                            <input
                                type="password"
                                placeholder="Contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full bg-neutral-900/50 border border-neutral-800 text-white py-3 px-4 rounded focus:outline-none focus:border-neutral-600 transition-colors placeholder:text-neutral-600"
                            />

                            {mode === 'login' && (
                                <div className="w-full flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => switchMode('forgot_password')}
                                        className="text-neutral-500 text-xs hover:text-neutral-300 transition-colors"
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-white text-black py-3 px-6 font-medium hover:bg-neutral-100 active:bg-neutral-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 mx-auto border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                ) : mode === 'login' ? (
                                    'Entrar'
                                ) : (
                                    'Crear Cuenta'
                                )}
                            </button>
                        </form>

                        {/* Divider */}
                        <div className="w-full flex items-center gap-4 mb-6">
                            <div className="flex-1 h-px bg-neutral-800" />
                            <span className="text-neutral-600 text-xs uppercase tracking-wider">o</span>
                            <div className="flex-1 h-px bg-neutral-800" />
                        </div>

                        {/* Google Sign-In */}
                        <button
                            onClick={handleGoogleSignIn}
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-3 bg-neutral-900 text-white py-3 px-6 border border-neutral-800 hover:bg-neutral-800 active:bg-neutral-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                        >
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
                            <span className="text-sm">Continuar con Google</span>
                        </button>

                        {/* Subtle phone option link */}
                        <button
                            onClick={showPhoneOption}
                            className="mt-8 text-neutral-600 text-xs hover:text-neutral-400 transition-colors"
                        >
                            ¿Problemas para acceder? <span className="underline">Usar teléfono</span>
                        </button>
                    </>
                )}

                {/* Footer note */}
                <p className="text-center pt-6 text-neutral-700 text-[10px] font-light uppercase tracking-wider">
                    Conecta con comunidades de tu interés
                </p>
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
