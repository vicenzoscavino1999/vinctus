import type { SidebarItemProps } from '../types';

// SidebarItem component
const SidebarItem = ({ icon: Icon, active, onClick, tooltip }: SidebarItemProps) => (
    <button
        type="button"
        onClick={onClick}
        title={tooltip}
        aria-label={tooltip}
        aria-current={active ? 'page' : undefined}
        className={`p-4 rounded-full transition-all duration-500 group relative my-2 ${active
            ? 'text-white bg-white/5 shadow-[0_0_15px_rgba(255,255,255,0.05)]'
            : 'text-neutral-600 hover:text-neutral-300'
            }`}
    >
        <Icon size={20} strokeWidth={1} />
        {active && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded-r-full" />
        )}
    </button>
);

export default SidebarItem;

