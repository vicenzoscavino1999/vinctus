import { useNavigate } from 'react-router-dom';

const NotificationsPage = () => {
    const navigate = useNavigate();

    return (
        <div className="page-profile pt-10 max-w-2xl mx-auto">
            <h1 className="text-3xl font-serif font-light text-white mb-8">Notificaciones</h1>
            <div className="space-y-4">
                <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
                    <p className="text-neutral-400">
                        <button
                            onClick={() => navigate('/user/dr-elena-r')}
                            className="text-white cursor-pointer hover:underline bg-transparent border-none p-0 font-inherit"
                        >Dr. Elena R.</button> comentó en tu publicación
                    </p>
                    <span className="text-neutral-600 text-xs">Hace 2 horas</span>
                </div>
                <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
                    <p className="text-neutral-400">
                        <button
                            onClick={() => navigate('/user/marco-v')}
                            className="text-white cursor-pointer hover:underline bg-transparent border-none p-0 font-inherit"
                        >Marco V.</button> te mencionó en un debate
                    </p>
                    <span className="text-neutral-600 text-xs">Hace 5 horas</span>
                </div>
                <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
                    <p className="text-neutral-400">Tu ensayo recibió <span className="text-white">15 nuevas reacciones</span></p>
                    <span className="text-neutral-600 text-xs">Ayer</span>
                </div>
            </div>
        </div>
    );
};

export default NotificationsPage;
