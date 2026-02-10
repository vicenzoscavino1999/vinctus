import { FileText, Image as ImageIcon, X } from 'lucide-react';
import type { MessageAttachmentRead } from '@/features/chat/api';
import { formatBytes } from '@/shared/lib/formatUtils';

export type GroupFileItem = {
  messageId: string;
  attachment: MessageAttachmentRead;
};

type Props = {
  open: boolean;
  items: GroupFileItem[];
  onClose: () => void;
};

const GroupFilesModal = ({ open, items, onClose }: Props) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h3 className="text-lg font-medium text-white">Archivos del chat</h3>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
          {items.length === 0 ? (
            <div className="text-center text-neutral-500 py-8">
              No hay archivos compartidos en este chat.
            </div>
          ) : (
            items.map((item) => {
              const att = item.attachment;
              const isImage = att.kind === 'image';
              const title = isImage ? 'Imagen' : att.fileName || 'Archivo';
              return (
                <button
                  key={`${item.messageId}_${att.path}`}
                  type="button"
                  onClick={() => window.open(att.url, '_blank')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/60 text-left hover:bg-neutral-800/60 transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden">
                    {isImage ? (
                      att.thumbUrl ? (
                        <img
                          src={att.thumbUrl}
                          alt={title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon size={18} className="text-amber-400" />
                      )
                    ) : (
                      <FileText size={18} className="text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{title}</p>
                    <p className="text-xs text-neutral-500">
                      {isImage ? 'Imagen' : att.contentType} Â· {formatBytes(att.size || 0)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupFilesModal;
