import { useNavigate } from 'react-router-dom';

const MessagesPage = () => {
    const navigate = useNavigate();

    return (
        <div className="page-profile pt-10 max-w-2xl mx-auto">
            <h1 className="text-3xl font-serif font-light text-white mb-8">Mensajes</h1>
            <div className="space-y-2">
                <div className="flex items-center gap-4 p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors cursor-pointer">
                    <button
                        onClick={() => navigate('/user/marco-v')}
                        className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:ring-2 hover:ring-neutral-600 transition-all border-none"
                    >M</button>
                    <div className="flex-1">
                        <button
                            onClick={() => navigate('/user/marco-v')}
                            className="text-white cursor-pointer hover:underline bg-transparent border-none p-0 font-inherit"
                        >Marco V.</button>
                        <p className="text-neutral-500 text-sm truncate">¿Viste el nuevo paper sobre jazz modal?</p>
                    </div>
                    <span className="text-neutral-600 text-xs">2h</span>
                </div>
                <div className="flex items-center gap-4 p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors cursor-pointer">
                    <button
                        onClick={() => navigate('/user/dr-elena-r')}
                        className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:ring-2 hover:ring-neutral-600 transition-all border-none"
                    >E</button>
                    <div className="flex-1">
                        <button
                            onClick={() => navigate('/user/dr-elena-r')}
                            className="text-white cursor-pointer hover:underline bg-transparent border-none p-0 font-inherit"
                        >Dr. Elena R.</button>
                        <p className="text-neutral-500 text-sm truncate">Sobre la colaboración del paper...</p>
                    </div>
                    <span className="text-neutral-600 text-xs">1d</span>
                </div>
            </div>
        </div>
    );
};

export default MessagesPage;

