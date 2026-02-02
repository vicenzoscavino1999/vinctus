// Mock data and categories for Vinctus app

import { Atom, Music, Globe, Code, BookOpen, Leaf } from 'lucide-react';
import type {
  Category,
  FeedPost,
  Collaboration,
  GlobalLibraryHighlight,
  EventItem,
} from '../types';

export const CATEGORIES: Category[] = [
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
      { id: 'quantum', name: 'Mec\u00E1nica Cu\u00E1ntica', members: '12k', apiQuery: 'quant-ph' },
      { id: 'cosmology', name: 'Cosmolog\u00EDa', members: '8.5k', apiQuery: 'astro-ph.CO' },
      { id: 'physics', name: 'F\u00EDsica General', members: '15k', apiQuery: 'physics.gen-ph' },
    ],
    library: [],
  },
  {
    id: 'music',
    label: 'Ac\u00FAstica & Arte',
    icon: Music,
    color: 'text-orange-200',
    bgHover: 'group-hover:bg-orange-950/20',
    description: 'Frecuencias que definen la experiencia humana.',
    apiSource: 'lastfm',
    features: ['audio', 'events'],
    subgroups: [
      { id: 'salsa', name: 'Ritmos Afro-Caribe\u00F1os', members: '42k' },
      { id: 'jazz', name: 'Jazz Modal', members: '15k' },
      { id: 'classical', name: 'Composici\u00F3n Barroca', members: '22k' },
    ],
    library: [
      {
        id: 'mu1',
        title: 'La Evoluci\u00F3n del Clave 3-2',
        author: 'Fania Archives',
        type: 'Partitura',
        readTime: 'N/A',
      },
      {
        id: 'mu2',
        title: 'Armon\u00EDa Negativa en Jazz',
        author: 'Collier J.',
        type: 'Teor\u00EDa',
        readTime: '20 min',
      },
    ],
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
      {
        id: 'rome',
        name: 'Antig\u00FCedad Cl\u00E1sica',
        members: '18k',
        apiQuery: 'Ancient_Rome',
      },
      { id: 'medieval', name: 'Edad Media', members: '12k', apiQuery: 'Middle_Ages' },
      { id: 'modern', name: 'Historia Moderna', members: '9k', apiQuery: 'Modern_history' },
    ],
    library: [],
  },
  {
    id: 'technology',
    label: 'C\u00F3digo & Futuro',
    icon: Code,
    color: 'text-green-300',
    bgHover: 'group-hover:bg-green-950/20',
    description: 'Donde la l\u00F3gica construye el ma\u00F1ana.',
    apiSource: 'hackernews',
    features: ['news', 'projects'],
    subgroups: [
      { id: 'ai', name: 'Inteligencia Artificial', members: '45k', apiQuery: 'top' },
      { id: 'webdev', name: 'Desarrollo Web', members: '32k', apiQuery: 'new' },
      { id: 'startups', name: 'Startups & Tech', members: '28k', apiQuery: 'best' },
    ],
    library: [],
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
      { id: 'fiction', name: 'Ficci\u00F3n Literaria', members: '35k', apiQuery: 'fiction' },
      { id: 'poetry', name: 'Poes\u00EDa', members: '15k', apiQuery: 'poetry' },
      { id: 'philosophy', name: 'Filosof\u00EDa', members: '20k', apiQuery: 'philosophy' },
    ],
    library: [],
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
      { id: 'plants', name: 'Bot\u00E1nica', members: '22k', apiQuery: 'plants' },
      { id: 'birds', name: 'Ornitolog\u00EDa', members: '18k', apiQuery: 'birds' },
      { id: 'insects', name: 'Entomolog\u00EDa', members: '12k', apiQuery: 'insects' },
    ],
    library: [],
  },
];

export const FEED_POSTS: FeedPost[] = [
  {
    id: '1',
    author: 'Dr. Elena R.',
    role: 'Investigadora',
    isExpert: true,
    group: 'Mec\u00E1nica Cu\u00E1ntica',
    categoryId: 'science',
    time: '2h',
    title: 'Paradojas del Horizonte',
    content:
      'Revisitando los textos de 2024 sobre radiaci\u00F3n suave. La elegancia matem\u00E1tica no siempre garantiza la verdad f\u00EDsica, pero es un buen punto de partida.',
    likes: 342,
    comments: 56,
  },
  {
    id: '2',
    author: 'Marco V.',
    role: 'Mel\u00F3mano',
    isExpert: false,
    group: 'Ritmos Afro-Caribe\u00F1os',
    categoryId: 'music',
    time: '4h',
    title: 'Piano y Clave: Una disecci\u00F3n',
    content:
      'La tensi\u00F3n arm\u00F3nica en las composiciones de los 70 en NY no fue un accidente. Fue una conversaci\u00F3n directa con el Bebop.',
    likes: 890,
    comments: 124,
  },
  {
    id: '3',
    author: 'Ada L.',
    role: 'Desarrolladora',
    isExpert: true,
    group: 'Inteligencia Artificial',
    categoryId: 'technology',
    time: '1h',
    title: 'El dilema de los LLMs',
    content:
      '¿Realmente entendemos que optimizamos cuando entrenamos estos modelos? La carrera por los benchmarks oscurece preguntas fundamentales.',
    likes: 567,
    comments: 89,
  },
  {
    id: '4',
    author: 'Gabriel M.',
    role: 'Naturalista',
    isExpert: true,
    group: 'Ornitolog\u00EDa',
    categoryId: 'nature',
    time: '3h',
    title: 'Migraci\u00F3n temprana detectada',
    content:
      'Las golondrinas est\u00E1n adelantando su migraci\u00F3n 2 semanas. Los datos de iNaturalist confirman un patr\u00F3n preocupante conectado al cambio clim\u00E1tico.',
    likes: 234,
    comments: 45,
  },
];

export const COLLABORATIONS: Collaboration[] = [
  {
    id: '1',
    title: 'Busco Bajista (Contrabajo)',
    context: 'Proyecto Jazz Experimental',
    author: 'Trío Solar',
    tags: ['Madrid', 'Presencial', 'Nivel Experto'],
    time: 'Hace 3h',
  },
  {
    id: '2',
    title: 'Co-Autor para Paper en Arxiv',
    context: 'Investigaci\u00F3n Materia Oscura',
    author: 'Lab 404',
    tags: ['Remoto', 'Publicaci\u00F3n', 'Acad\u00E9mico'],
    time: 'Hace 5h',
  },
  {
    id: '3',
    title: 'Desarrollador React para Open Source',
    context: 'Herramienta de Visualizaci\u00F3n',
    author: 'DataViz Collective',
    tags: ['Remoto', 'Open Source', 'Frontend'],
    time: 'Hace 1h',
  },
];

export const GLOBAL_LIBRARY_HIGHLIGHTS: GlobalLibraryHighlight[] = [
  {
    id: '1',
    title: 'El Futuro de las Redes de Afinidad',
    author: 'Editorial Central',
    readTime: '5 min',
    category: 'Meta',
  },
  {
    id: '2',
    title: 'Reporte Mensual: Descubrimientos',
    author: 'Curadur\u00EDa',
    readTime: '10 min',
    category: 'General',
  },
];

export const EVENTS: EventItem[] = [
  {
    id: '1',
    title: 'Noche de Vinilos & Charla',
    date: '12 ENE',
    location: 'Ciudad de M\u00E9xico, Roma Norte',
    attendees: 34,
  },
  {
    id: '2',
    title: 'Simposio de Arqueolog\u00EDa',
    date: '15 FEB',
    location: 'Lima, Barranco',
    attendees: 120,
  },
  {
    id: '3',
    title: 'Hackathon AI for Good',
    date: '28 ENE',
    location: 'Buenos Aires, Palermo',
    attendees: 85,
  },
  {
    id: '4',
    title: 'Observaci\u00F3n de Aves',
    date: '5 FEB',
    location: 'Bogot\u00E1, Humedal C\u00F3rdoba',
    attendees: 25,
  },
];
