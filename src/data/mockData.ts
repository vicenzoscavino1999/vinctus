// Mock data and categories for Vinctus app

import { Atom, Music, Globe, Code, BookOpen, Leaf } from 'lucide-react';
import type { Category, FeedPost, Collaboration, GlobalLibraryHighlight, EventItem } from '../types';

export const CATEGORIES: Category[] = [
    {
        id: 'science',
        label: 'Ciencia & Materia',
        icon: Atom,
        color: 'text-blue-300',
        bgHover: 'group-hover:bg-blue-950/20',
        description: 'La busqueda de la verdad fundamental.',
        apiSource: 'arxiv',
        features: ['papers', 'debate'],
        subgroups: [
            { id: 'quantum', name: 'Mecanica Cuantica', members: '12k', apiQuery: 'quant-ph' },
            { id: 'cosmology', name: 'Cosmologia', members: '8.5k', apiQuery: 'astro-ph.CO' },
            { id: 'physics', name: 'Fisica General', members: '15k', apiQuery: 'physics.gen-ph' }
        ],
        library: []
    },
    {
        id: 'music',
        label: 'Acustica & Arte',
        icon: Music,
        color: 'text-orange-200',
        bgHover: 'group-hover:bg-orange-950/20',
        description: 'Frecuencias que definen la experiencia humana.',
        apiSource: 'lastfm',
        features: ['audio', 'events'],
        subgroups: [
            { id: 'salsa', name: 'Ritmos Afro-Caribenos', members: '42k' },
            { id: 'jazz', name: 'Jazz Modal', members: '15k' },
            { id: 'classical', name: 'Composicion Barroca', members: '22k' }
        ],
        library: [
            { id: 'mu1', title: 'La Evolucion del Clave 3-2', author: 'Fania Archives', type: 'Partitura', readTime: 'N/A' },
            { id: 'mu2', title: 'Armonia Negativa en Jazz', author: 'Collier J.', type: 'Teoria', readTime: '20 min' }
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
            { id: 'rome', name: 'Antiguedad Clasica', members: '18k', apiQuery: 'Ancient_Rome' },
            { id: 'medieval', name: 'Edad Media', members: '12k', apiQuery: 'Middle_Ages' },
            { id: 'modern', name: 'Historia Moderna', members: '9k', apiQuery: 'Modern_history' }
        ],
        library: []
    },
    {
        id: 'technology',
        label: 'Codigo & Futuro',
        icon: Code,
        color: 'text-green-300',
        bgHover: 'group-hover:bg-green-950/20',
        description: 'Donde la logica construye el manana.',
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
        description: 'El universo contenido en paginas.',
        apiSource: 'openlibrary',
        features: ['books', 'reviews'],
        subgroups: [
            { id: 'fiction', name: 'Ficcion Literaria', members: '35k', apiQuery: 'fiction' },
            { id: 'poetry', name: 'Poesia', members: '15k', apiQuery: 'poetry' },
            { id: 'philosophy', name: 'Filosofia', members: '20k', apiQuery: 'philosophy' }
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
            { id: 'plants', name: 'Botanica', members: '22k', apiQuery: 'plants' },
            { id: 'birds', name: 'Ornitologia', members: '18k', apiQuery: 'birds' },
            { id: 'insects', name: 'Entomologia', members: '12k', apiQuery: 'insects' }
        ],
        library: []
    }
];

export const FEED_POSTS: FeedPost[] = [
    {
        id: 1,
        author: "Dr. Elena R.",
        role: "Investigadora",
        isExpert: true,
        group: "Mecanica Cuantica",
        categoryId: "science",
        time: "2h",
        title: "Paradojas del Horizonte",
        content: "Revisitando los textos de 2024 sobre radiacion suave. La elegancia matematica no siempre garantiza la verdad fisica, pero es un buen punto de partida.",
        likes: 342,
        comments: 56
    },
    {
        id: 2,
        author: "Marco V.",
        role: "Melomano",
        isExpert: false,
        group: "Ritmos Afro-Caribenos",
        categoryId: "music",
        time: "4h",
        title: "Piano y Clave: Una diseccion",
        content: "La tension armonica en las composiciones de los 70 en NY no fue un accidente. Fue una conversacion directa con el Bebop.",
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
        content: "Realmente entendemos que optimizamos cuando entrenamos estos modelos? La carrera por los benchmarks oscurece preguntas fundamentales.",
        likes: 567,
        comments: 89
    },
    {
        id: 4,
        author: "Gabriel M.",
        role: "Naturalista",
        isExpert: true,
        group: "Ornitologia",
        categoryId: "nature",
        time: "3h",
        title: "Migracion temprana detectada",
        content: "Las golondrinas estan adelantando su migracion 2 semanas. Los datos de iNaturalist confirman un patron preocupante conectado al cambio climatico.",
        likes: 234,
        comments: 45
    }
];

export const COLLABORATIONS: Collaboration[] = [
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
        context: "Investigacion Materia Oscura",
        author: "Lab 404",
        tags: ["Remoto", "Publicacion", "Academico"],
        time: "Hace 5h"
    },
    {
        id: 3,
        title: "Desarrollador React para Open Source",
        context: "Herramienta de Visualizacion",
        author: "DataViz Collective",
        tags: ["Remoto", "Open Source", "Frontend"],
        time: "Hace 1h"
    }
];

export const GLOBAL_LIBRARY_HIGHLIGHTS: GlobalLibraryHighlight[] = [
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
        author: "Curaduria",
        readTime: "10 min",
        category: "General"
    }
];

export const EVENTS: EventItem[] = [
    {
        id: 1,
        title: "Noche de Vinilos & Charla",
        date: "12 ENE",
        location: "Ciudad de Mexico, Roma Norte",
        attendees: 34
    },
    {
        id: 2,
        title: "Simposio de Arqueologia",
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
        title: "Observacion de Aves",
        date: "5 FEB",
        location: "Bogota, Humedal Cordoba",
        attendees: 25
    }
];
