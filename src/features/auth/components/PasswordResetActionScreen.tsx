import { useEffect, useMemo, useState } from 'react';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';

type PasswordResetActionScreenProps = {
  oobCode: string;
  continueUrl: string | null;
};

const getSafeContinueUrl = (rawContinueUrl: string | null): string | null => {
  if (!rawContinueUrl || typeof window === 'undefined') return null;

  try {
    const parsed = new URL(rawContinueUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
};

const mapResetError = (resetError: unknown): string => {
  const code = (resetError as { code?: string })?.code;
  if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
    return 'El enlace es inválido o ya expiró. Solicita uno nuevo.';
  }
  if (code === 'auth/user-disabled') {
    return 'Esta cuenta ha sido deshabilitada.';
  }
  if (code === 'auth/weak-password') {
    return 'La contraseña es demasiado débil.';
  }
  return 'No se pudo restablecer la contraseña.';
};

const PasswordResetActionScreen = ({ oobCode, continueUrl }: PasswordResetActionScreenProps) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [codeInvalidError, setCodeInvalidError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const redirectPath = useMemo(() => getSafeContinueUrl(continueUrl), [continueUrl]);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      setIsVerifying(true);
      setCodeInvalidError(null);
      try {
        const resolvedEmail = await verifyPasswordResetCode(auth, oobCode);
        if (!active) return;
        setEmail(resolvedEmail);
      } catch (verifyError) {
        if (!active) return;
        setCodeInvalidError(mapResetError(verifyError));
      } finally {
        if (active) {
          setIsVerifying(false);
        }
      }
    };
    void verify();
    return () => {
      active = false;
    };
  }, [oobCode]);

  const openLogin = () => {
    if (typeof window === 'undefined') return;
    window.location.assign(redirectPath ?? '/');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || isVerifying || codeInvalidError) return;
    setError(null);

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedEmail = email ?? (await verifyPasswordResetCode(auth, oobCode));
      await confirmPasswordReset(auth, oobCode, password);
      setEmail(resolvedEmail);
      setIsSuccess(true);
    } catch (resetError) {
      setError(mapResetError(resetError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center relative overflow-hidden p-6">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[600px] md:h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src="/image_fdd620.png"
            alt="Vinctus Logo"
            className="w-auto h-14 md:h-16 object-contain mx-auto mb-6"
          />
          <h1 className="text-white font-serif text-2xl mb-2">Restablecer contraseña</h1>
          <p className="text-neutral-500 text-sm">
            {email
              ? `Ingresa una nueva contraseña para ${email}.`
              : 'Ingresa una nueva contraseña para continuar.'}
          </p>
        </div>

        {isVerifying ? (
          <div className="py-10 text-center space-y-3">
            <div className="w-6 h-6 mx-auto border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-neutral-400 text-sm">Verificando enlace...</p>
          </div>
        ) : codeInvalidError ? (
          <div className="w-full space-y-4">
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm text-center">
              {codeInvalidError}
            </div>
            <button
              type="button"
              onClick={openLogin}
              className="w-full bg-white text-black py-3 px-6 font-medium hover:bg-neutral-100 active:bg-neutral-200 transition-all duration-300 rounded"
            >
              Ir a iniciar sesión
            </button>
          </div>
        ) : isSuccess ? (
          <div className="w-full">
            <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm text-center">
              Contraseña actualizada correctamente{email ? ` para ${email}.` : '.'}
            </div>
            <button
              onClick={openLogin}
              className="w-full bg-white text-black py-3 px-6 font-medium hover:bg-neutral-100 active:bg-neutral-200 transition-all duration-300 rounded"
            >
              Ir a iniciar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <input
              type="password"
              placeholder="Nueva contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="w-full bg-neutral-900/50 border border-neutral-800 text-white py-3 px-4 rounded focus:outline-none focus:border-neutral-600 transition-colors placeholder:text-neutral-600"
            />
            <input
              type="password"
              placeholder="Confirmar nueva contraseña"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={6}
              className="w-full bg-neutral-900/50 border border-neutral-800 text-white py-3 px-4 rounded focus:outline-none focus:border-neutral-600 transition-colors placeholder:text-neutral-600"
            />

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-white text-black py-3 px-6 font-medium hover:bg-neutral-100 active:bg-neutral-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 mx-auto border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                'Guardar nueva contraseña'
              )}
            </button>

            <button
              type="button"
              onClick={openLogin}
              className="w-full text-neutral-500 text-sm hover:text-neutral-300 transition-colors"
            >
              Volver
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default PasswordResetActionScreen;
