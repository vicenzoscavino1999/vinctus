import {
  ArrowLeft,
  Bell,
  BellOff,
  ExternalLink,
  Flag,
  LogOut,
  Paperclip,
  Pencil,
  Search,
  Share2,
  X,
} from 'lucide-react';

type Props = {
  open: boolean;
  groupName: string;
  groupIconUrl: string | null | undefined;
  loading: boolean;
  muted: boolean;
  muteStatusText: string | null;
  isTogglingMute: boolean;
  isOwner: boolean;
  onClose: () => void;
  onUnmute: () => void;
  onOpenMuteModal: () => void;
  onShare: () => void;
  onOpenFiles: () => void;
  onSearch: () => void;
  onOpenReportModal: () => void;
  onClearChatLocal: () => void;
  onViewGroup: () => void;
  onEditGroup: () => void;
  onLeaveGroup: () => void;
};

const GroupOptionsOverlay = ({
  open,
  groupName,
  groupIconUrl,
  loading,
  muted,
  muteStatusText,
  isTogglingMute,
  isOwner,
  onClose,
  onUnmute,
  onOpenMuteModal,
  onShare,
  onOpenFiles,
  onSearch,
  onOpenReportModal,
  onClearChatLocal,
  onViewGroup,
  onEditGroup,
  onLeaveGroup,
}: Props) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm overflow-y-auto">
      <div className="page-feed pt-6 max-w-3xl mx-auto pb-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            type="button"
            onClick={onClose}
            aria-label="Volver al chat"
            className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-serif font-light text-white">Detalles del Grupo</h1>
        </div>

        {/* Group Info */}
        <div className="flex flex-col items-center py-8 border-b border-neutral-800/50">
          <div className="w-24 h-24 rounded-full bg-neutral-800 border-2 border-neutral-700 overflow-hidden flex items-center justify-center mb-4">
            {groupIconUrl ? (
              <img
                src={groupIconUrl}
                alt={groupName || 'Grupo'}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl text-neutral-400">
                {(groupName || 'G').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <h2 className="text-xl font-medium text-white mb-1">{groupName}</h2>
          <p className="text-sm text-neutral-500">Grupo</p>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-2">
          {loading && <div className="text-sm text-neutral-500">Cargando...</div>}

          {muted ? (
            <button
              type="button"
              onClick={onUnmute}
              disabled={isTogglingMute}
              className="w-full flex items-center gap-4 p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 rounded-xl transition-all text-left cursor-pointer disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <BellOff size={18} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-amber-400 font-medium">Quitar silencio</p>
                <p className="text-xs text-amber-300">{muteStatusText}</p>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenMuteModal}
              disabled={isTogglingMute}
              className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Bell size={18} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">Silenciar</p>
                <p className="text-xs text-neutral-500">No recibir notificaciones</p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={onShare}
            className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Share2 size={18} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Compartir enlace</p>
              <p className="text-xs text-neutral-500">Copia el enlace del grupo</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenFiles}
            className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Paperclip size={18} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Ver archivos</p>
              <p className="text-xs text-neutral-500">Adjuntos del chat</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onSearch}
            className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Search size={18} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Buscar en la conversacion</p>
              <p className="text-xs text-neutral-500">Encuentra mensajes</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenReportModal}
            className="w-full flex items-center gap-4 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <Flag size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-red-200 font-medium">Reportar grupo</p>
              <p className="text-xs text-red-300">Denunciar comportamiento</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onClearChatLocal}
            className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
              <X size={18} className="text-neutral-400" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Limpiar chat local</p>
              <p className="text-xs text-neutral-500">No borra mensajes del servidor</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onViewGroup}
            className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <ExternalLink size={18} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Ver grupo</p>
              <p className="text-xs text-neutral-500">Ir a la pagina del grupo</p>
            </div>
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={onEditGroup}
              className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Pencil size={18} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">Editar grupo</p>
                <p className="text-xs text-neutral-500">Cambiar nombre o detalles</p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={onLeaveGroup}
            className="w-full flex items-center gap-4 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <LogOut size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-red-200 font-medium">Salir del grupo</p>
              <p className="text-xs text-red-300">Dejaras de ver el chat</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupOptionsOverlay;
