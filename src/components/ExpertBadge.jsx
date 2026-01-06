import { Award } from 'lucide-react';

// ExpertBadge component
const ExpertBadge = () => (
    <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full border border-orange-200/20 bg-orange-900/10 text-orange-200/80 ml-2" title="Experto Verificado">
        <Award size={10} />
        <span className="text-[9px] tracking-wider uppercase font-medium">Experto</span>
    </div>
);

export default ExpertBadge;
