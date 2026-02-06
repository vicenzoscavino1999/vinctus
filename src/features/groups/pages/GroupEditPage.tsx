import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, Loader2 } from 'lucide-react';

import { useAuth } from '@/context';
import { useToast } from '@/shared/ui/Toast';
import { CATEGORIES } from '@/shared/constants';
import { getGroup, updateGroup, type GroupVisibility } from '@/features/groups/api';
import { compressToWebp, validateImage } from '@/shared/lib/compression';
import { uploadGroupIcon } from '@/shared/lib/storage';

type SelectedImage = { file: File; url: string };

const GroupEditPage = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const imageInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<GroupVisibility>('public');
  const [icon, setIcon] = useState<SelectedImage | null>(null);
  const [currentIconUrl, setCurrentIconUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (icon) {
        URL.revokeObjectURL(icon.url);
      }
    };
  }, [icon]);

  useEffect(() => {
    let isActive = true;
    const loadGroup = async () => {
      if (!groupId) {
        setError('Grupo no encontrado.');
        setLoading(false);
        return;
      }
      if (!user?.uid) {
        showToast('Inicia sesion para editar el grupo.', 'info');
        navigate(`/group/${groupId}`, { replace: true });
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const group = await getGroup(groupId);
        if (!group) {
          setError('Grupo no encontrado.');
          setLoading(false);
          return;
        }

        if (!group.ownerId || group.ownerId !== user.uid) {
          showToast('No tienes permisos para editar este grupo.', 'info');
          navigate(`/group/${groupId}`, { replace: true });
          return;
        }

        if (!isActive) return;

        setName(group.name ?? '');
        setDescription(group.description ?? '');
        setCategoryId(group.categoryId ?? null);
        setVisibility(group.visibility ?? 'public');
        setCurrentIconUrl(group.iconUrl ?? null);
        setLoading(false);
      } catch (err) {
        console.error('Error loading group:', err);
        if (!isActive) return;
        setError('No se pudo cargar el grupo.');
        setLoading(false);
      }
    };

    void loadGroup();

    return () => {
      isActive = false;
    };
  }, [groupId, user, navigate, showToast]);

  const openImagePicker = () => imageInputRef.current?.click();

  const handleIconSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validation = validateImage(file);
    if (!validation.valid) {
      showToast(validation.error || 'Imagen invalida.', 'error');
      return;
    }

    try {
      const compressed = await compressToWebp(file);
      setIcon((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { file: compressed, url: URL.createObjectURL(compressed) };
      });
    } catch (err) {
      showToast('Error procesando la imagen.', 'error');
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!groupId || !user?.uid) return;

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || !trimmedDescription) {
      showToast('Completa el nombre y la descripcion.', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      let iconUrl = currentIconUrl ?? null;
      if (icon) {
        try {
          const uploaded = await uploadGroupIcon(icon.file, user.uid, groupId);
          iconUrl = uploaded.url;
        } catch (uploadError) {
          console.error('Error uploading group icon:', uploadError);
          showToast('No se pudo actualizar el icono. Se guardaron los demas cambios.', 'warning');
        }
      }

      await updateGroup(groupId, {
        name: trimmedName,
        description: trimmedDescription,
        categoryId,
        visibility,
        iconUrl,
      });

      showToast('Grupo actualizado', 'success');
      navigate(`/group/${groupId}`);
    } catch (err) {
      console.error('Error updating group:', err);
      showToast('No se pudo actualizar el grupo.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-feed pt-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-amber-500" size={32} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-feed pt-6 max-w-3xl mx-auto">
        <div className="text-center text-red-400 py-20">{error}</div>
      </div>
    );
  }

  const iconPreview = icon?.url ?? currentIconUrl;

  return (
    <div className="page-feed pt-6 max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">Volver</span>
      </button>

      <h1 className="text-2xl font-serif font-light text-white mb-6">Editar grupo</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center">
            {iconPreview ? (
              <img src={iconPreview} alt="Icono del grupo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl text-neutral-400">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleIconSelect}
            />
            <button
              type="button"
              onClick={openImagePicker}
              className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors flex items-center gap-2"
            >
              <ImageIcon size={16} />
              Cambiar icono
            </button>
            <p className="text-xs text-neutral-500 mt-2">Formato recomendado: cuadrado, max 2MB.</p>
          </div>
        </div>

        <div>
          <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
            Nombre del grupo
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full bg-neutral-900/40 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors"
            maxLength={80}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
            Descripcion
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full bg-neutral-900/40 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors resize-none"
            rows={5}
            maxLength={600}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Categoria
            </label>
            <select
              value={categoryId ?? ''}
              onChange={(event) => setCategoryId(event.target.value || null)}
              className="w-full bg-neutral-900/40 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/60 transition-colors"
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
              Visibilidad
            </label>
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as GroupVisibility)}
              className="w-full bg-neutral-900/40 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/60 transition-colors"
            >
              <option value="public">Publico</option>
              <option value="private">Privado</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/group/${groupId}`)}
            className="px-5 py-2.5 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GroupEditPage;
