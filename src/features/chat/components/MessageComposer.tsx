import { Send } from 'lucide-react';
import type { FormEvent } from 'react';

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

const MessageComposer = ({ value, onValueChange, onSubmit }: Props) => {
  return (
    <form onSubmit={onSubmit} className="py-4 border-t border-neutral-800/50">
      <div className="flex gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 px-5 py-3 bg-neutral-900/50 border border-neutral-800 rounded-full text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-black rounded-full hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
        >
          <Send size={18} />
        </button>
      </div>
    </form>
  );
};

export default MessageComposer;
