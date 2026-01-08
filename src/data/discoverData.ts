// Datos para publicaciones en la pagina de descubrimiento
import type { Publication, RecommendedGroup } from '../types';

// Extended types for discover page specific data
interface DiscoverPublication extends Omit<Publication, 'likes' | 'comments'> {
    title: string;
    likes: number;
    comments: number;
}

interface DiscoverRecommendedGroup {
    id: number;
    name: string;
    members: number;
    postsPerWeek: number;
    categoryId: string;
    subgroup: {
        name: string;
        members: string;
    };
}

export const PUBLICATIONS: DiscoverPublication[] = [
    {
        id: 1,
        title: "Un agujero negro revela secretos del universo temprano",
        group: "Exploradores Cuanticos",
        category: "Ciencia & Cosmos",
        categoryId: "science",
        image: "/blackhole.png",
        likes: 318,
        comments: 21
    },
    {
        id: 2,
        title: "Descubrimiento arqueologico en las ruinas de Angkor",
        group: "Historia Viva",
        category: "Historia & Cultura",
        categoryId: "history",
        image: "/history.png",
        likes: 245,
        comments: 18
    },
    {
        id: 3,
        title: "La evolucion del jazz modal en Nueva York",
        group: "Melomanos Unidos",
        category: "Musica & Arte",
        categoryId: "music",
        image: "/jazz.png",
        likes: 189,
        comments: 34
    },
    {
        id: 4,
        title: "Reflexiones sobre el existencialismo moderno",
        group: "Pensadores Libres",
        category: "Filosofia",
        categoryId: "literature",
        image: "/philosophy.png",
        likes: 156,
        comments: 42
    },
    {
        id: 5,
        title: "El futuro de la inteligencia artificial generativa",
        group: "IA & Futuro",
        category: "Tecnologia",
        categoryId: "technology",
        image: "/technology.png",
        likes: 421,
        comments: 67
    },
    {
        id: 6,
        title: "Rutas de senderismo en los Andes peruanos",
        group: "Aventureros",
        category: "Naturaleza",
        categoryId: "nature",
        image: "/nature.png",
        likes: 287,
        comments: 29
    }
];

// Grupos recomendados
export const RECOMMENDED_GROUPS: DiscoverRecommendedGroup[] = [
    {
        id: 1,
        name: "Exploradores Cuanticos",
        members: 2340,
        postsPerWeek: 12,
        categoryId: "science",
        subgroup: { name: "Fisica Cuantica", members: "834" }
    },
    {
        id: 2,
        name: "Historia Viva",
        members: 1890,
        postsPerWeek: 8,
        categoryId: "history",
        subgroup: { name: "Arqueologia", members: "567" }
    },
    {
        id: 3,
        name: "Jazz & Vinilos",
        members: 956,
        postsPerWeek: 15,
        categoryId: "music",
        subgroup: { name: "Jazz Modal", members: "423" }
    },
    {
        id: 4,
        name: "Pensadores Libres",
        members: 1234,
        postsPerWeek: 6,
        categoryId: "literature",
        subgroup: { name: "Existencialismo", members: "312" }
    }
];

