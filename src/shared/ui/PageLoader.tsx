import { Loader } from 'lucide-react';

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="text-center">
      <Loader className="w-8 h-8 text-brand-gold animate-spin mx-auto mb-4" />
      <p className="text-text-2 text-sm">Cargando...</p>
    </div>
  </div>
);

export default PageLoader;
