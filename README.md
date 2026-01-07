# Vinctus

Red social basada en intereses. Conecta con comunidades de ciencia, música, historia y más.

## Objetivo

Vinctus es una plataforma que permite a los usuarios unirse a grupos según sus intereses específicos. A diferencia de las redes sociales tradicionales, aquí las conexiones se forman alrededor de pasiones compartidas.

## Stack Tecnológico

- **Frontend**: React 19 + Vite 5
- **Estilos**: Tailwind CSS 3
- **Iconos**: Lucide React
- **Animaciones**: tailwindcss-animate
- **Routing**: React Router DOM

## Instalación

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd vinctus

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

## Uso

Abre `http://localhost:5173` en tu navegador.

### Navegación

- **Descubrir**: Explora categorías de intereses
- **Conversación**: Feed de publicaciones recientes
- **Colaboraciones**: Encuentra proyectos y colaboradores
- **Archivo**: Biblioteca de conocimiento
- **Eventos**: Encuentros presenciales y virtuales

## Estructura del Proyecto

```
vinctus/
├── src/
│   ├── components/     # Componentes UI reutilizables
│   ├── pages/          # Páginas de la aplicación
│   ├── context/        # Estado global (AppState)
│   ├── data/           # Datos mock y constantes
│   ├── hooks/          # Custom hooks
│   ├── App.jsx         # Componente principal
│   ├── main.jsx        # Punto de entrada
│   └── index.css       # Estilos globales
├── public/             # Assets estáticos
└── index.html          # HTML principal
```

## Licencia

MIT
