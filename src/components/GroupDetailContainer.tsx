import { useParams, useNavigate } from 'react-router-dom';
import { useAppState } from '../context';
import { CATEGORIES } from '../data';
import { GroupDetailView, GroupData, CategoryInfo } from './GroupDetailView';
import { useToast } from './Toast';

// ===== DATOS MOCK (en app real, vendría de API/Firebase) =====

const GROUPS_DATA: Record<string, GroupData> = {
    '1': {
        id: '1',
        categoryId: 'science',
        name: 'Exploradores Cuánticos',
        description: 'Grupo dedicado a discutir los últimos avances en física cuántica, mecánica cuántica y teorías del universo. Compartimos papers, debates y experimentos mentales.',
        members: 2340,
        postsPerWeek: 45,
        icon: '⚛️',
        recentPosts: [
            { id: '1', title: 'Nuevo experimento de entrelazamiento', author: 'María L.', time: '2h' },
            { id: '2', title: 'Discusión: Interpretación de Copenhague vs Many Worlds', author: 'Carlos R.', time: '5h' },
            { id: '3', title: 'Paper: Quantum Computing Advances 2024', author: 'Ana M.', time: '1d' },
        ],
        topMembers: [
            { id: '1', name: 'María L.', role: 'Admin', posts: 234 },
            { id: '2', name: 'Carlos R.', role: 'Mod', posts: 189 },
            { id: '3', name: 'Ana M.', role: 'Miembro', posts: 156 },
        ]
    },
    '2': {
        id: '2',
        categoryId: 'history',
        name: 'Historia Viva',
        description: 'Exploramos el pasado para entender el presente. Desde la antigüedad clásica hasta la historia contemporánea, compartimos descubrimientos, debates y fuentes primarias.',
        members: 1890,
        postsPerWeek: 32,
        icon: '🏛️',
        recentPosts: [
            { id: '1', title: 'Nuevos hallazgos en Pompeya', author: 'Sofía R.', time: '3h' },
            { id: '2', title: 'Debate: La caída de Roma revisitada', author: 'Miguel A.', time: '6h' },
        ],
        topMembers: [
            { id: '1', name: 'Sofía R.', role: 'Admin', posts: 278 },
            { id: '2', name: 'Miguel A.', role: 'Mod', posts: 145 },
        ]
    },
    '3': {
        id: '3',
        categoryId: 'music',
        name: 'Jazz & Vinilos',
        description: 'Para amantes del jazz en todas sus formas. Desde el bebop hasta el jazz fusión contemporáneo. Compartimos vinilos, conciertos y recomendaciones.',
        members: 956,
        postsPerWeek: 28,
        icon: '🎷',
        recentPosts: [
            { id: '1', title: 'La magia de Rubén Blades en vivo', author: 'Pedro S.', time: '1h' },
            { id: '2', title: 'Vinilo del mes: Kind of Blue', author: 'Laura G.', time: '3h' },
        ],
        topMembers: [
            { id: '1', name: 'Pedro S.', role: 'Admin', posts: 312 },
            { id: '2', name: 'Laura G.', role: 'Miembro', posts: 98 },
        ]
    },
    '4': {
        id: '4',
        categoryId: 'literature',
        name: 'Pensadores Libres',
        description: 'Un espacio para reflexionar sobre filosofía, existencialismo y las grandes preguntas de la humanidad. Lecturas, debates y escritura creativa.',
        members: 1234,
        postsPerWeek: 18,
        icon: '📚',
        recentPosts: [
            { id: '1', title: 'Sartre vs Camus: El absurdo revisitado', author: 'Elena V.', time: '2h' },
            { id: '2', title: 'Lectura del mes: El Extranjero', author: 'Pablo M.', time: '4h' },
            { id: '3', title: 'Ensayo: La libertad en tiempos modernos', author: 'Carmen L.', time: '1d' },
        ],
        topMembers: [
            { id: '1', name: 'Elena V.', role: 'Admin', posts: 189 },
            { id: '2', name: 'Pablo M.', role: 'Mod', posts: 134 },
            { id: '3', name: 'Carmen L.', role: 'Miembro', posts: 87 },
        ]
    }
};

// ===== COMPONENTE CONTAINER (SOLO LÓGICA) =====

export const GroupDetailContainer = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const navigate = useNavigate();
    const { isGroupJoined, toggleJoinGroup } = useAppState();
    const { showToast } = useToast();

    // Obtener ID y datos
    const groupIdStr = groupId || '';
    const isValidId = !!groupIdStr && !!GROUPS_DATA[groupIdStr];

    // En una app real, aquí iría un useEffect con fetch/React Query
    // Por ahora usamos datos mock síncronos (isLoading siempre false)
    const isLoading = false;
    const error: string | null = null;
    const group: GroupData | null = isValidId ? GROUPS_DATA[groupIdStr] : null;

    // Obtener categoría del grupo (si existe)
    const categoryData = group?.categoryId
        ? CATEGORIES.find(c => c.id === group.categoryId)
        : null;

    const category: CategoryInfo | null = categoryData
        ? { id: categoryData.id, label: categoryData.label }
        : null;

    // Estado de si está unido
    const isJoined = isValidId ? isGroupJoined(groupIdStr) : false;

    // ===== CALLBACKS =====

    const handleJoinGroup = () => {
        if (isValidId) {
            toggleJoinGroup(groupIdStr);
        }
    };

    const handleGoBack = () => {
        navigate(-1);
    };

    const handleNavigateToCategory = () => {
        if (category) {
            navigate(`/category/${category.id}`);
        }
    };

    const handleOpenPost = (_postId: string) => {
        showToast('Detalle de publicación estará disponible pronto', 'info');
    };

    // ===== RENDER VIEW CON PROPS =====

    return (
        <GroupDetailView
            isLoading={isLoading}
            error={error}
            group={group}
            category={category}
            isJoined={isJoined}
            onJoinGroup={handleJoinGroup}
            onGoBack={handleGoBack}
            onNavigateToCategory={handleNavigateToCategory}
            onOpenPost={handleOpenPost}
        />
    );
};

export default GroupDetailContainer;
