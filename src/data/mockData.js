// Mock data and categories for Vinctus app

import { Atom, Music, Globe, Code, BookOpen, Leaf } from 'lucide-react';

export const CATEGORIES = [
    {
        id: 'science',
        label: 'Ciencia & Materia',
        icon: Atom,
        color: 'text-blue-300',
        bgHover: 'group-hover:bg-blue-950/20',
        description: 'La búsqueda de la verdad fundamental.',
        apiSource: 'arxiv',
        features: ['papers', 'debate'],
        subgroups: [
            { id: 'quantum', name: 'Mecánica Cuántica', members: '12k', apiQuery: 'quant-ph' },
            { id: 'cosmology', name: 'Cosmología', members: '8.5k', apiQuery: 'astro-ph.CO' },
            { id: 'physics', name: 'Física General', members: '15k', apiQuery: 'physics.gen-ph' }
        ],
        library: []
    },
    {
        id: 'music',
        label: 'Acústica & Arte',
        icon: Music,
        color: 'text-orange-200',
        bgHover: 'group-hover:bg-orange-950/20',
        description: 'Frecuencias que definen la experiencia humana.',
        apiSource: 'lastfm',
        features: ['audio', 'events'],
        subgroups: [
            { id: 'salsa', name: 'Ritmos Afro-Caribeños', members: '42k' },
            { id: 'jazz', name: 'Jazz Modal', members: '15k' },
            { id: 'classical', name: 'Composición Barroca', members: '22k' }
        ],
        library: [
            { id: 'mu1', title: 'La Evolución del Clave 3-2', author: 'Fania Archives', type: 'Partitura', readTime: 'N/A' },
            { id: 'mu2', title: 'Armonía Negativa en Jazz', author: 'Collier J.', type: 'Teoría', readTime: '20 min' }
        ]
    },
    {
        id: 'history',
        label: 'Legado & Tiempo',
        icon: Globe,
        color: 'text-amber-300',
        bgHover: 'group-hover:bg-amber-950/20',
        description: 'Ecos de civilizaciones pasadas.',
        apiSource: 'wikipedia',
        features: ['archive', 'debate'],
        subgroups: [
            { id: 'rome', name: 'Antigüedad Clásica', members: '18k', apiQuery: 'Ancient_Rome' },
            { id: 'medieval', name: 'Edad Media', members: '12k', apiQuery: 'Middle_Ages' },
            { id: 'modern', name: 'Historia Moderna', members: '9k', apiQuery: 'Modern_history' }
        ],
        library: []
    },
    {
        id: 'technology',
        label: 'Código & Futuro',
        icon: Code,
        color: 'text-green-300',
        bgHover: 'group-hover:bg-green-950/20',
        description: 'Donde la lógica construye el mañana.',
        apiSource: 'hackernews',
        features: ['news', 'projects'],
        subgroups: [
            { id: 'ai', name: 'Inteligencia Artificial', members: '45k', apiQuery: 'top' },
            { id: 'webdev', name: 'Desarrollo Web', members: '32k', apiQuery: 'new' },
            { id: 'startups', name: 'Startups & Tech', members: '28k', apiQuery: 'best' }
        ],
        library: []
    },
    {
        id: 'literature',
        label: 'Palabra & Pluma',
        icon: BookOpen,
        color: 'text-purple-300',
        bgHover: 'group-hover:bg-purple-950/20',
        description: 'El universo contenido en páginas.',
        apiSource: 'openlibrary',
        features: ['books', 'reviews'],
        subgroups: [
            { id: 'fiction', name: 'Ficción Literaria', members: '35k', apiQuery: 'fiction' },
            { id: 'poetry', name: 'Poesía', members: '15k', apiQuery: 'poetry' },
            { id: 'philosophy', name: 'Filosofía', members: '20k', apiQuery: 'philosophy' }
        ],
        library: []
    },
    {
        id: 'nature',
        label: 'Vida & Ecosistema',
        icon: Leaf,
        color: 'text-emerald-300',
        bgHover: 'group-hover:bg-emerald-950/20',
        description: 'La red infinita de lo viviente.',
        apiSource: 'inaturalist',
        features: ['observations', 'species'],
        subgroups: [
            { id: 'plants', name: 'Botánica', members: '22k', apiQuery: 'plants' },
            { id: 'birds', name: 'Ornitología', members: '18k', apiQuery: 'birds' },
            { id: 'insects', name: 'Entomología', members: '12k', apiQuery: 'insects' }
        ],
        library: []
    }
];

export const FEED_POSTS = [
    {
        id: 1,
        author: "Dr. Elena R.",
        role: "Investigadora",
        isExpert: true,
        group: "Mecánica Cuántica",
        categoryId: "science",
        time: "2h",
        title: "Paradojas del Horizonte",
        content: "Revisitando los textos de 2024 sobre radiación suave. La elegancia matemática no siempre garantiza la verdad física, pero es un buen punto de partida.",
        likes: 342,
        comments: 56
    },
    {
        id: 2,
        author: "Marco V.",
        role: "Melómano",
        isExpert: false,
        group: "Ritmos Afro-Caribeños",
        categoryId: "music",
        time: "4h",
        title: "Piano y Clave: Una disección",
        content: "La tensión armónica en las composiciones de los 70 en NY no fue un accidente. Fue una conversación directa con el Bebop.",
        likes: 890,
        comments: 124
    },
    {
        id: 3,
        author: "Ada L.",
        role: "Desarrolladora",
        isExpert: true,
        group: "Inteligencia Artificial",
        categoryId: "technology",
        time: "1h",
        title: "El dilema de los LLMs",
        content: "¿Realmente entendemos qué optimizamos cuando entrenamos estos modelos? La carrera por los benchmarks oscurece preguntas fundamentales.",
        likes: 567,
        comments: 89
    },
    {
        id: 4,
        author: "Gabriel M.",
        role: "Naturalista",
        isExpert: true,
        group: "Ornitología",
        categoryId: "nature",
        time: "3h",
        title: "Migración temprana detectada",
        content: "Las golondrinas están adelantando su migración 2 semanas. Los datos de iNaturalist confirman un patrón preocupante conectado al cambio climático.",
        likes: 234,
        comments: 45
    }
];

export const COLLABORATIONS = [
    {
        id: 1,
        title: "Busco Bajista (Contrabajo)",
        context: "Proyecto Jazz Experimental",
        author: "Trio Solar",
        tags: ["Madrid", "Presencial", "Nivel Experto"],
        time: "Hace 3h"
    },
    {
        id: 2,
        title: "Co-Autor para Paper en Arxiv",
        context: "Investigación Materia Oscura",
        author: "Lab 404",
        tags: ["Remoto", "Publicación", "Académico"],
        time: "Hace 5h"
    },
    {
        id: 3,
        title: "Desarrollador React para Open Source",
        context: "Herramienta de Visualización",
        author: "DataViz Collective",
        tags: ["Remoto", "Open Source", "Frontend"],
        time: "Hace 1h"
    }
];

export const GLOBAL_LIBRARY_HIGHLIGHTS = [
    {
        id: 1,
        title: "El Futuro de las Redes de Afinidad",
        author: "Editorial Central",
        readTime: "5 min",
        category: "Meta"
    },
    {
        id: 2,
        title: "Reporte Mensual: Descubrimientos",
        author: "Curaduría",
        readTime: "10 min",
        category: "General"
    }
];

export const EVENTS = [
    {
        id: 1,
        title: "Noche de Vinilos & Charla",
        date: "12 ENE",
        location: "Ciudad de México, Roma Norte",
        attendees: 34
    },
    {
        id: 2,
        title: "Simposio de Arqueología",
        date: "15 FEB",
        location: "Lima, Barranco",
        attendees: 120
    },
    {
        id: 3,
        title: "Hackathon AI for Good",
        date: "28 ENE",
        location: "Buenos Aires, Palermo",
        attendees: 85
    },
    {
        id: 4,
        title: "Observación de Aves",
        date: "5 FEB",
        location: "Bogotá, Humedal Córdoba",
        attendees: 25
    }
];
