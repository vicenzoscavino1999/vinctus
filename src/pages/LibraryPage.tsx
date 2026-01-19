import CollectionsPanel from '../components/CollectionsPanel';

const LibraryPage = () => {
    return (
        <div className="page-library pb-32">
            <header className="mb-10 pt-6 md:pt-10 text-center">
                <h1 className="text-4xl md:text-5xl font-serif font-light text-white mb-4 tracking-tight">
                    Colecciones
                </h1>
            </header>
            <CollectionsPanel />
        </div>
    );
};

export default LibraryPage;