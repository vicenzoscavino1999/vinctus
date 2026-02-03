import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { X, User, MapPin, Briefcase, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getUserProfile, updateUserProfile } from '@/features/profile/api';
import { uploadProfilePhoto } from '@/shared/lib/storage';
import { useToast } from '@/shared/ui/Toast';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export default function EditProfileModal({ isOpen, onClose, onSave }: EditProfileModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load current profile data
  useEffect(() => {
    if (!isOpen || !user) return;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const profile = await getUserProfile(user.uid);
        if (profile) {
          setDisplayName(profile.displayName || '');
          setBio(profile.bio || '');
          setRole(profile.role || '');
          setLocation(profile.location || '');
          setPhotoPreview(profile.photoURL || null);
        } else {
          // Use data from auth if no profile exists
          setDisplayName(user.displayName || '');
          setPhotoPreview(user.photoURL || null);
        }
        setPhotoFile(null);
        setPhotoRemoved(false);
        setPhotoError(null);
        setUploadProgress(null);
      } catch (error) {
        console.error('Error loading profile:', error);
        showToast('Error al cargar el perfil', 'error');
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [isOpen, user, showToast]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('Solo se permiten imagenes.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('La imagen supera el limite de 10MB.');
      return;
    }

    if (photoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    const previewUrl = URL.createObjectURL(file);
    setPhotoFile(file);
    setPhotoPreview(previewUrl);
    setPhotoRemoved(false);
    setPhotoError(null);
  };

  const handleRemovePhoto = () => {
    if (photoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoRemoved(true);
    setPhotoError(null);
    setUploadProgress(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      let uploadedPhotoURL: string | null | undefined = undefined;

      if (photoRemoved) {
        uploadedPhotoURL = null;
      }

      if (photoFile) {
        setUploadProgress(0);
        const uploaded = await uploadProfilePhoto(photoFile, user.uid, (progress) => {
          const percent =
            progress.totalBytes > 0
              ? Math.round((progress.bytesTransferred / progress.totalBytes) * 100)
              : 0;
          setUploadProgress(percent);
        });
        uploadedPhotoURL = uploaded.url;
      }

      await updateUserProfile(user.uid, {
        displayName: displayName.trim() || undefined,
        photoURL: uploadedPhotoURL,
        bio: bio.trim() || undefined,
        role: role.trim() || undefined,
        location: location.trim() || undefined,
      });

      showToast('Perfil actualizado correctamente', 'success');
      onSave?.();
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('Error al actualizar el perfil', 'error');
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-xl font-serif text-white">Editar Perfil</h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-amber-500" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Profile Photo */}
            <div>
              <label className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider mb-2">
                <User size={14} />
                Foto de perfil
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center text-neutral-500">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Foto de perfil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={24} />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 text-xs border border-neutral-700 text-neutral-200 rounded-md hover:bg-neutral-800 transition-colors"
                    >
                      Subir foto
                    </button>
                    {photoPreview && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="px-3 py-2 text-xs border border-neutral-700 text-neutral-400 rounded-md hover:bg-neutral-800 transition-colors"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                  {uploadProgress !== null && (
                    <div className="text-xs text-neutral-500">Subiendo {uploadProgress}%</div>
                  )}
                  {photoError && <div className="text-xs text-red-400">{photoError}</div>}
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider mb-2">
                <User size={14} />
                Nombre
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>

            {/* Role */}
            <div>
              <label className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider mb-2">
                <Briefcase size={14} />
                Rol / Ocupación
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ej: Desarrollador, Músico, Estudiante..."
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>

            {/* Location */}
            <div>
              <label className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider mb-2">
                <MapPin size={14} />
                Ubicación
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Lima, Perú"
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider mb-2">
                <FileText size={14} />
                Sobre mí
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Cuéntale al mundo sobre ti..."
                rows={4}
                maxLength={500}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
              />
              <div className="text-right text-xs text-neutral-600 mt-1">{bio.length}/500</div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-5 py-3 border border-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium rounded-lg hover:from-amber-400 hover:to-amber-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Cambios'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
