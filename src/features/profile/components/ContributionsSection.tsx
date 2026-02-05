import { useCallback, useEffect, useState } from 'react';
import { BookOpen, FileText, Link as LinkIcon, Loader2, Plus, UploadCloud, X } from 'lucide-react';
import { useToast } from '@/shared/ui/Toast';
import {
  createContribution,
  getUserContributions,
  updateContributionFile,
  type ContributionRead,
  type ContributionType,
} from '@/features/profile/api';
import { uploadContributionFile } from '@/shared/lib/storage';
import { CATEGORIES } from '@/shared/constants';

const CONTRIBUTION_TYPES: Array<{ value: ContributionType; label: string }> = [
  { value: 'project', label: 'Proyecto' },
  { value: 'paper', label: 'Paper' },
  { value: 'cv', label: 'CV' },
  { value: 'certificate', label: 'Certificación' },
  { value: 'other', label: 'Otro' },
];

const formatDate = (date: Date) =>
  date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export default function ContributionsSection({
  userId,
  canEdit,
}: {
  userId: string | null | undefined;
  canEdit: boolean;
}) {
  const { showToast } = useToast();
  const [items, setItems] = useState<ContributionRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [type, setType] = useState<ContributionType>('project');
  const [categoryId, setCategoryId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const loadContributions = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserContributions(userId);
      setItems(data);
    } catch (err) {
      console.error('Error loading contributions:', err);
      setError('No se pudieron cargar las contribuciones.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadContributions();
  }, [loadContributions]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLink('');
    setType('project');
    setCategoryId('');
    setFile(null);
    setFormError(null);
    setUploadProgress(null);
  };

  const handleSubmit = async () => {
    if (!userId) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    let trimmedLink = link.trim();

    if (!trimmedTitle) {
      setFormError('El título es obligatorio.');
      return;
    }

    if (!trimmedLink && !file) {
      setFormError('Agrega un enlace o sube un PDF.');
      return;
    }

    if (trimmedLink && !trimmedLink.startsWith('http://') && !trimmedLink.startsWith('https://')) {
      trimmedLink = `https://${trimmedLink}`;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      const contributionId = await createContribution({
        userId,
        type,
        title: trimmedTitle,
        description: trimmedDescription ? trimmedDescription : null,
        link: trimmedLink ? trimmedLink : null,
        categoryId: categoryId ? categoryId : null,
      });

      if (file) {
        const uploaded = await uploadContributionFile(file, userId, contributionId, (progress) => {
          if (progress.totalBytes > 0) {
            setUploadProgress(Math.round((progress.bytesTransferred / progress.totalBytes) * 100));
          }
        });
        await updateContributionFile(contributionId, {
          fileUrl: uploaded.url,
          filePath: uploaded.path,
          fileName: uploaded.fileName,
          fileSize: uploaded.size,
          fileType: uploaded.contentType,
        });
      }

      showToast('Contribución publicada', 'success');
      setIsModalOpen(false);
      resetForm();
      await loadContributions();
    } catch (err) {
      console.error('Error creating contribution:', err);
      setFormError('No se pudo publicar la contribución.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase">
          Portafolio & Contribuciones
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="text-amber-500 text-xs hover:text-amber-400 transition-colors flex items-center gap-1"
          >
            <Plus size={14} />
            Nueva
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
          <Loader2 size={28} className="mx-auto mb-4 text-neutral-600 animate-spin" />
          <p className="text-neutral-500 font-light italic">Cargando contribuciones...</p>
        </div>
      ) : error ? (
        <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
          <p className="text-red-400">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
          <BookOpen size={32} strokeWidth={0.5} className="mx-auto mb-4 text-neutral-600" />
          <p className="text-neutral-500 font-light italic mb-4">
            Sin contribuciones publicadas aún.
          </p>
          {canEdit && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-amber-500 text-sm hover:text-amber-400 transition-colors"
            >
              + Publicar tu primera contribución
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-5 border border-neutral-800/80 rounded-2xl bg-neutral-900/20"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-500 uppercase tracking-wider">
                  {CONTRIBUTION_TYPES.find((t) => t.value === item.type)?.label || 'Otro'}
                </span>
                <span className="text-xs text-neutral-600">{formatDate(item.createdAt)}</span>
              </div>
              <h3 className="text-lg text-white font-medium mb-2">{item.title}</h3>
              {item.description && (
                <p className="text-sm text-neutral-400 mb-3">{item.description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800/80 text-neutral-200 text-xs hover:bg-neutral-700 transition-colors"
                  >
                    <LinkIcon size={14} />
                    Ver enlace
                  </a>
                )}
                {item.fileUrl && (
                  <a
                    href={item.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800/80 text-neutral-200 text-xs hover:bg-neutral-700 transition-colors"
                  >
                    <FileText size={14} />
                    {item.fileName || 'Ver PDF'}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setIsModalOpen(false);
              resetForm();
            }}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
              <h3 className="text-lg font-medium text-white">Nueva contribución</h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Título
                </label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/60 transition-colors"
                  placeholder="Ej: Proyecto de investigación"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Tipo
                </label>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as ContributionType)}
                  className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/60 transition-colors"
                >
                  {CONTRIBUTION_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Categoria (opcional)
                </label>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/60 transition-colors"
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
                  Descripción (opcional)
                </label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors resize-none"
                  placeholder="Breve resumen"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Enlace (opcional)
                </label>
                <input
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/60 transition-colors"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  PDF (opcional)
                </label>
                <label className="flex items-center gap-3 px-4 py-3 bg-neutral-800/60 border border-dashed border-neutral-700 rounded-lg cursor-pointer hover:border-amber-500/60 transition-colors">
                  <UploadCloud size={18} className="text-neutral-400" />
                  <span className="text-sm text-neutral-300">
                    {file ? file.name : 'Sube tu PDF'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      const selected = event.target.files?.[0] || null;
                      setFile(selected);
                    }}
                  />
                </label>
                {uploadProgress !== null && (
                  <p className="text-xs text-neutral-500 mt-2">Subiendo: {uploadProgress}%</p>
                )}
              </div>
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {formError}
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Publicando...' : 'Publicar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
