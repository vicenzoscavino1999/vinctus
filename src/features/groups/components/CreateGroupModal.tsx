import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { Loader2, X, Image as ImageIcon } from 'lucide-react';

import { useAuth } from '@/context';
import { useToast } from '@/shared/ui/Toast';
import { CATEGORIES } from '@/shared/constants';
import {
  createGroup,
  updateGroup,
  addGroupMember,
  getFollowing,
  type CreateGroupInput,
  type GroupVisibility,
  type UserProfileRead,
} from '@/features/groups/api';
import { compressToWebp, validateImage } from '@/shared/lib/compression';
import { uploadGroupIcon } from '@/shared/lib/storage';

type SelectedImage = { file: File; url: string };

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (groupId: string) => void;
  preselectedMemberProfiles?: UserProfileRead[]; // Optional: members to add automatically
}

const CreateGroupModal = ({
  isOpen,
  onClose,
  onCreated,
  preselectedMemberProfiles = [],
}: CreateGroupModalProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<GroupVisibility>('public');
  const [icon, setIcon] = useState<SelectedImage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<UserProfileRead[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserProfileRead[]>([]);
  const [showMemberSelector, setShowMemberSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setCategoryId(null);
      setVisibility('public');
      setError(null);
      setIsSubmitting(false);
      setSelectedMembers([]);
      setAvailableUsers([]);
      setShowMemberSelector(false);
      setSearchQuery('');
      setIsLoadingUsers(false);
      setIcon((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !user?.uid) return;

    const loadFollowing = async () => {
      setIsLoadingUsers(true);
      try {
        const following = await getFollowing(user.uid);
        setAvailableUsers(following);
      } catch (err) {
        console.error('Error loading following:', err);
      } finally {
        setIsLoadingUsers(false);
      }
    };

    void loadFollowing();
  }, [isOpen, user?.uid]);

  useEffect(() => {
    if (!isOpen) return;
    if (preselectedMemberProfiles.length === 0) return;
    setSelectedMembers((prev) => (prev.length > 0 ? prev : preselectedMemberProfiles));
  }, [isOpen, preselectedMemberProfiles]);

  const openImagePicker = () => imageInputRef.current?.click();

  const handleIconSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError(null);
    if (!file) return;

    const validation = validateImage(file);
    if (!validation.valid) {
      setError(validation.error || 'Imagen invalida.');
      return;
    }

    try {
      const compressed = await compressToWebp(file);
      setIcon((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { file: compressed, url: URL.createObjectURL(compressed) };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando la imagen.');
    }
  };

  const isPreselectedMember = (uid: string) =>
    preselectedMemberProfiles.some((profile) => profile.uid === uid);

  const handleToggleMember = (profile: UserProfileRead) => {
    if (isPreselectedMember(profile.uid)) return;
    setSelectedMembers((prev) => {
      const exists = prev.some((member) => member.uid === profile.uid);
      if (exists) {
        return prev.filter((member) => member.uid !== profile.uid);
      }
      return [...prev, profile];
    });
  };

  const handleRemoveMember = (uid: string) => {
    if (isPreselectedMember(uid)) return;
    setSelectedMembers((prev) => prev.filter((member) => member.uid !== uid));
  };

  const handleClose = () => {
    setShowMemberSelector(false);
    setSearchQuery('');
    onClose();
  };

  const filteredUsers = availableUsers.filter((profile) => {
    if (profile.uid === user?.uid) return false;
    if (isPreselectedMember(profile.uid)) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const displayName = (profile.displayName || '').toLowerCase();
    const username = (profile.username || '').toLowerCase();
    return displayName.includes(query) || username.includes(query);
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!user) {
      setError('Debes iniciar sesion para crear un grupo.');
      return;
    }

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName || !trimmedDescription) {
      setError('Completa el nombre y la descripcion.');
      return;
    }

    const input: CreateGroupInput = {
      name: trimmedName,
      description: trimmedDescription,
      categoryId,
      visibility,
      iconUrl: null,
    };

    setIsSubmitting(true);

    try {
      const groupId = await createGroup(user.uid, input);
      let iconUrl: string | null = null;

      if (icon) {
        try {
          const uploaded = await uploadGroupIcon(icon.file, user.uid, groupId);
          iconUrl = uploaded.url;
          await updateGroup(groupId, { ...input, iconUrl });
        } catch (uploadError) {
          console.error('Error uploading group icon:', uploadError);
          showToast('Grupo creado, pero no se pudo subir el icono.', 'warning');
        }
      }

      // Add selected members to the group
      if (selectedMembers.length > 0) {
        try {
          // Filter out the creator (already added by createGroup)
          const membersToAdd = selectedMembers.filter((profile) => profile.uid !== user.uid);

          await Promise.all(
            membersToAdd.map((profile) => addGroupMember(groupId, profile.uid, 'member')),
          );
        } catch (memberError) {
          console.error('Error adding selected members:', memberError);
          showToast('Grupo creado, pero algunos miembros no se pudieron agregar.', 'warning');
        }
      }

      showToast('Grupo creado', 'success');
      onCreated(groupId);
    } catch (submitError) {
      console.error('Error creating group:', submitError);
      setError('No se pudo crear el grupo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative w-full max-w-2xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
            <h2 className="text-xl font-serif text-white">Crear grupo</h2>
            <button
              onClick={handleClose}
              className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Nombre del grupo *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  placeholder="Ej: Exploradores Cuanticos"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Visibilidad *
                </label>
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as GroupVisibility)}
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                >
                  <option value="public">Publico (cualquiera puede unirse)</option>
                  <option value="private">Privado (requiere aprobacion)</option>
                </select>
              </div>
            </div>

            {/* Selected Members */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-neutral-500 uppercase tracking-wider">
                  Miembros iniciales ({selectedMembers.length})
                </label>
                <button
                  type="button"
                  onClick={() => setShowMemberSelector(true)}
                  className="text-xs text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                >
                  <span>+</span>
                  <span>Agregar personas</span>
                </button>
              </div>

              {selectedMembers.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {selectedMembers.map((profile) => {
                      const isPreselected = isPreselectedMember(profile.uid);
                      return (
                        <div
                          key={profile.uid}
                          className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg"
                        >
                          <div className="w-6 h-6 rounded-full bg-neutral-700 overflow-hidden flex-shrink-0">
                            {profile.photoURL ? (
                              <img
                                src={profile.photoURL}
                                alt={profile.displayName || 'Usuario'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-xs text-neutral-400">U</span>
                              </div>
                            )}
                          </div>
                          <span className="text-sm text-white">
                            {profile.displayName || profile.username || 'Usuario'}
                          </span>
                          {!isPreselected && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(profile.uid)}
                              className="ml-1 text-neutral-400 hover:text-white transition-colors"
                              aria-label="Quitar miembro"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">
                    Estas personas seran agregadas automaticamente al grupo
                  </p>
                </>
              ) : (
                <p className="text-sm text-neutral-500">
                  Sin miembros iniciales. Click "Agregar personas" para invitar.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Descripcion *
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                maxLength={600}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                placeholder="Cuenta de que trata el grupo..."
              />
              <div className="text-right text-xs text-neutral-500 mt-1">
                {description.length}/600
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Categoria (opcional)
                </label>
                <select
                  value={categoryId ?? ''}
                  onChange={(event) => setCategoryId(event.target.value || null)}
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                >
                  <option value="">Sin categoria</option>
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Icono del grupo
                </label>
                <div className="flex items-center gap-3">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleIconSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={openImagePicker}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                  >
                    <ImageIcon size={18} />
                    Elegir imagen
                  </button>
                  {icon && (
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-neutral-700">
                      <img
                        src={icon.url}
                        alt="Icono del grupo"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Creando...
                  </>
                ) : (
                  'Crear grupo'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
      {/* Member Selector Modal */}
      {showMemberSelector && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <h3 className="text-lg font-medium text-white">Agregar personas</h3>
              <button
                type="button"
                onClick={() => {
                  setShowMemberSelector(false);
                  setSearchQuery('');
                }}
                className="p-1 text-neutral-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-neutral-800">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar por nombre..."
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isLoadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-amber-500" size={24} />
                </div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-neutral-500 py-8">
                  {searchQuery ? 'No se encontraron usuarios' : 'No sigues a nadie aun'}
                </p>
              ) : (
                filteredUsers.map((profile) => {
                  const isSelected = selectedMembers.some((member) => member.uid === profile.uid);

                  return (
                    <button
                      key={profile.uid}
                      type="button"
                      onClick={() => handleToggleMember(profile)}
                      className="w-full flex items-center gap-3 p-3 bg-neutral-800/30 hover:bg-neutral-800/50 border border-neutral-700/50 rounded-lg transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-neutral-700 overflow-hidden flex-shrink-0">
                        {profile.photoURL ? (
                          <img
                            src={profile.photoURL}
                            alt={profile.displayName || 'Usuario'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-neutral-400">U</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">
                          {profile.displayName || 'Usuario'}
                        </p>
                        {profile.username && (
                          <p className="text-xs text-neutral-500 truncate">@{profile.username}</p>
                        )}
                      </div>
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-amber-500 border-amber-500' : 'border-neutral-600'
                        }`}
                      >
                        {isSelected && <span className="text-black text-[10px]">OK</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setShowMemberSelector(false);
                  setSearchQuery('');
                }}
                className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
              >
                Listo ({selectedMembers.length} seleccionados)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CreateGroupModal;
