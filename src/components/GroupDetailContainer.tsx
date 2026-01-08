import { useParams, useNavigate } from 'react-router-dom';
import { useAppState } from '../context';
import { CATEGORIES } from '../data';
import { GroupDetailView, GroupData, CategoryInfo } from './GroupDetailView';

// ===== DATOS MOCK (en app real, vendría de API/Firebase) =====

const GROUPS_DATA: Record<number, GroupData> = {
    1: {
        id: 1,
        name: 'Exploradores Cuanticos',
        description: 'Grupo dedicado a discutir los ultimos avances en fisica cuantica, mecanica cuantica y teorias del universo. Compartimos papers, debates y experimentos mentales.',
        members: 2340,
        postsPerWeek: 45,
        icon: '⚛️',
        recentPosts: [
            { id: 1, title: 'Nuevo experimento de entrelazamiento', author: 'Maria L.', time: '2h' },
            { id: 2, title: 'Discusion: Interpretacion de Copenhague vs Many Worlds', author: 'Carlos R.', time: '5h' },
            { id: 3, title: 'Paper: Quantum Computing Advances 2024', author: 'Ana M.', time: '1d' },
        ],
        topMembers: [
            { id: 1, name: 'Maria L.', role: 'Admin', posts: 234 },
            { id: 2, name: 'Carlos R.', role: 'Mod', posts: 189 },
            { id: 3, name: 'Ana M.', role: 'Miembro', posts: 156 },
        ]
    },
    2: {
        id: 2,
        name: 'Jazz & Vinilos',
        description: 'Para amantes del jazz en todas sus formas. Desde el bebop hasta el jazz fusion contemporaneo. Compartimos vinilos, conciertos y recomendaciones.',
        members: 956,
        postsPerWeek: 28,
        icon: '🎷',
        recentPosts: [
            { id: 1, title: 'La magia de Ruben Blades en vivo', author: 'Pedro S.', time: '1h' },
            { id: 2, title: 'Vinilo del mes: Kind of Blue', author: 'Laura G.', time: '3h' },
        ],
        topMembers: [
            { id: 1, name: 'Pedro S.', role: 'Admin', posts: 312 },
            { id: 2, name: 'Laura G.', role: 'Miembro', posts: 98 },
        ]
    }
};

// ===== COMPONENTE CONTAINER (SOLO LOGICA) =====

export const GroupDetailContainer = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const navigate = useNavigate();
    const { isGroupJoined, toggleJoinGroup } = useAppState();

    // Parsear ID y obtener datos
    const groupIdNum = parseInt(groupId || '', 10);
    const isValidId = !isNaN(groupIdNum) && GROUPS_DATA[groupIdNum];

    // En una app real, aquí iría un useEffect con fetch/React Query
    // Por ahora usamos datos mock sincronos (isLoading siempre false)
    const isLoading = false;
    const error: string | null = null;
    const group: GroupData | null = isValidId ? GROUPS_DATA[groupIdNum] : null;

    // Obtener categoria del grupo (si existe)
    const categoryData = group
        ? CATEGORIES.find(c => c.id === (group as any).categoryId)
        : null;

    const category: CategoryInfo | null = categoryData
        ? { id: categoryData.id, label: categoryData.label }
        : null;

    // Estado de si esta unido
    const isJoined = isValidId ? isGroupJoined(groupIdNum) : false;

    // ===== CALLBACKS =====

    const handleJoinGroup = () => {
        if (isValidId) {
            toggleJoinGroup(groupIdNum);
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
        />
    );
};

export default GroupDetailContainer;
