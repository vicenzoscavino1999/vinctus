import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { LEGAL_LINKS } from '@/shared/constants';
import { setMetricsFlow } from '@/shared/lib/devMetrics';

type AuthMode = 'login' | 'register' | 'phone' | 'forgot_password';

const LoginScreen = () => {
  const {
    signInWithGoogle,
    signInWithApple,
    isAppleSignInEnabled,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    sendPhoneCode,
    verifyPhoneCode,
    error: authError,
    clearError,
    phoneCodeSent,
    resetPhoneAuth,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMetricsFlow('login');
  }, []);

  const displayedError = localError || authError;

  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    setIsLoading(true);
    clearError();
    setLocalError(null);
    setSuccessMessage(null);
    try {
      await signInWithGoogle();
    } catch {
      // Error handled in AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (isLoading) return;
    setIsLoading(true);
    clearError();
    setLocalError(null);
    setSuccessMessage(null);
    try {
      await signInWithApple();
    } catch {
      // Error handled in AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError('Ingresa un correo electrónico válido.');
      return;
    }
    setIsLoading(true);
    clearError();
    setLocalError(null);
    setSuccessMessage(null);

    try {
      if (mode === 'login') {
        await signInWithEmail(trimmedEmail, password);
      } else if (mode === 'register') {
        await signUpWithEmail(trimmedEmail, password, displayName.trim() || undefined);
        setSuccessMessage('¡Cuenta creada! Revisa tu correo para verificar tu cuenta.');
        // Optional: switch to login mod or auto-login (already handled by context)
      } else if (mode === 'forgot_password') {
        await resetPassword(trimmedEmail);
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
    if (isLoading) return;
    clearError();
    setLocalError(null);
    setSuccessMessage(null);

    if (!phoneCodeSent && phoneNumber.length !== 9) {
      setLocalError('Ingresa un número de celular válido de 9 dígitos.');
      return;
    }
    if (phoneCodeSent && verificationCode.length !== 6) {
      setLocalError('Ingresa el código de verificación de 6 dígitos.');
      return;
    }

    setIsLoading(true);
    try {
      if (!phoneCodeSent) {
        // Format phone number with Peru country code (+51)
        // Input is always digits-only (9 chars max) due to sanitization below
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
    setLocalError(null);
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
        <div className="mb-10 flex flex-col items-center text-center">
          <img
            src="/image_fdd620.png"
            alt="Vinctus Logo"
            className="h-14 w-auto object-contain opacity-90 md:h-16"
          />
          <p className="mt-4 text-sm text-neutral-500">Conecta con comunidades de tu interés</p>
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Volver
            </button>

            {/* Elegant message */}
            <div className="text-center mb-8">
              <h2 className="text-white font-serif text-xl mb-3">Acceso Alternativo</h2>
              <p className="text-neutral-500 text-sm leading-relaxed">
                Si tienes problemas con tu correo o cuenta de Google, puedes acceder con tu número
                de teléfono.
              </p>
            </div>

            <form onSubmit={handlePhoneSubmit} className="w-full space-y-4 mb-6">
              {!phoneCodeSent ? (
                <>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">
                      +51
                    </span>
                    <input
                      type="tel"
                      placeholder="Número de celular"
                      aria-label="Número de celular"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      required
                      maxLength={9}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 pl-14 pr-4 text-white transition-colors placeholder:text-neutral-500 focus:border-white/25 focus:outline-none"
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
                    aria-label="Código de 6 dígitos"
                    inputMode="numeric"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    required
                    maxLength={6}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white transition-colors placeholder:text-neutral-500 focus:border-white/25 focus:outline-none text-center tracking-[0.5em] text-lg"
                  />
                  <div className="text-center">
                    <p className="text-neutral-600 text-xs">Código enviado a +51{phoneNumber}</p>
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
              {displayedError && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm text-center">
                  {displayedError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="h-12 w-full rounded-xl bg-brand-gold px-6 font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 mx-auto animate-spin rounded-full border-2 border-black/30 border-t-black" />
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Volver
            </button>

            <div className="text-center mb-8">
              <h2 className="text-white font-serif text-xl mb-3">Recuperar Contraseña</h2>
              <p className="text-neutral-500 text-sm leading-relaxed">
                Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu
                contraseña.
              </p>
            </div>

            {/* Success message */}
            {successMessage && (
              <div className="w-full mb-6 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm text-center">
                {successMessage}
              </div>
            )}

            {/* Error message */}
            {displayedError && (
              <div className="w-full mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm text-center">
                {displayedError}
              </div>
            )}

            <form onSubmit={handleEmailSubmit} className="w-full space-y-4 mb-6">
              <input
                type="email"
                placeholder="Correo electrónico"
                aria-label="Correo electrónico"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (successMessage) setSuccessMessage(null);
                  if (localError) setLocalError(null);
                }}
                required
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white transition-colors placeholder:text-neutral-500 focus:border-white/25 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || !!successMessage}
                className="h-12 w-full rounded-xl bg-brand-gold px-6 font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 mx-auto animate-spin rounded-full border-2 border-black/30 border-t-black" />
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
            <div className="mb-6 flex w-full rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
              <button
                onClick={() => switchMode('login')}
                aria-pressed={mode === 'login'}
                className={`flex-1 rounded-full py-2 text-sm transition-colors ${
                  mode === 'login'
                    ? 'bg-white font-medium text-black'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Entrar
              </button>
              <button
                onClick={() => switchMode('register')}
                aria-pressed={mode === 'register'}
                className={`flex-1 rounded-full py-2 text-sm transition-colors ${
                  mode === 'register'
                    ? 'bg-white font-medium text-black'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Registro
              </button>
            </div>

            {/* Success message */}
            {successMessage && (
              <div className="w-full mb-4 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm text-center">
                {successMessage}
              </div>
            )}

            {/* Error message */}
            {displayedError && (
              <div className="w-full mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm text-center">
                {displayedError}
              </div>
            )}

            {/* Email/Password Form */}
            <form onSubmit={handleEmailSubmit} className="w-full space-y-4 mb-6">
              {mode === 'register' && (
                <input
                  type="text"
                  placeholder="Nombre (opcional)"
                  aria-label="Nombre (opcional)"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={120}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white transition-colors placeholder:text-neutral-500 focus:border-white/25 focus:outline-none"
                />
              )}
              <input
                type="email"
                placeholder="Correo electrónico"
                aria-label="Correo electrónico"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white transition-colors placeholder:text-neutral-500 focus:border-white/25 focus:outline-none"
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Contraseña"
                  aria-label="Contraseña"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white transition-colors placeholder:text-neutral-500 focus:border-white/25 focus:outline-none pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-white"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

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
                className="h-12 w-full rounded-xl bg-brand-gold px-6 font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 mx-auto animate-spin rounded-full border-2 border-black/30 border-t-black" />
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
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] px-6 text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
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

            {isAppleSignInEnabled && (
              <button
                onClick={handleAppleSignIn}
                disabled={isLoading}
                className="mt-3 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/[0.1] bg-black px-6 text-white transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16.7 12.6c0-2.2 1.8-3.3 1.9-3.3-1-1.6-2.7-1.8-3.2-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.7-1.5 0-2.9.9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9 .8 1 1.7 2 2.9 2 .8 0 1.1-.3 2.2-.3s1.4.3 2.3.3c1.2 0 2-.9 2.8-1.9.9-1.1 1.3-2.2 1.3-2.2-.1 0-2.2-.9-2.2-4.2zM14.7 6.2c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.7 1.3-.6.7-1.1 1.7-.9 2.7 1 0 2-.5 2.7-1.3z" />
                </svg>
                <span className="text-sm">Continuar con Apple</span>
              </button>
            )}

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
        <div className="mt-8 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
          <a
            href={LEGAL_LINKS.privacyPolicyPublicUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-300 transition-colors underline"
          >
            Privacidad
          </a>
          <a
            href={LEGAL_LINKS.termsOfServicePublicUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-300 transition-colors underline"
          >
            Términos
          </a>
          <a
            href={LEGAL_LINKS.communityGuidelinesPublicUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-300 transition-colors underline"
          >
            Normas de la comunidad
          </a>
          <a
            href={LEGAL_LINKS.supportPublicUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-300 transition-colors underline"
          >
            Centro de soporte
          </a>
          <a
            href={`mailto:${LEGAL_LINKS.supportEmail}`}
            className="hover:text-neutral-300 transition-colors underline"
          >
            Soporte por correo
          </a>
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
