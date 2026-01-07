import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // COLORES - Sincronizados con CSS vars en :root
            colors: {
                // Tokens base (desde CSS vars)
                bg: "hsl(var(--bg) / <alpha-value>)",
                surface: {
                    1: "hsl(var(--surface-1) / <alpha-value>)",
                    2: "hsl(var(--surface-2) / <alpha-value>)",
                    3: "hsl(var(--surface-3) / <alpha-value>)",
                },
                text: {
                    1: "hsl(var(--text-1) / <alpha-value>)",
                    2: "hsl(var(--text-2) / <alpha-value>)",
                    3: "hsl(var(--text-3) / <alpha-value>)",
                },
                accent: "hsl(var(--accent) / <alpha-value>)",
                "accent-2": "hsl(var(--accent-2) / <alpha-value>)",
                border: "hsl(var(--border) / <alpha-value>)",
                ring: "hsl(var(--ring) / <alpha-value>)",
                // Tokens legacy (para compatibilidad)
                brand: {
                    gold: '#d4af37',
                    'gold-light': '#e8c547',
                    'gold-dark': '#b8962f',
                    cream: '#f5f0e6',
                    ivory: '#faf8f5',
                },
                "surface-base": '#0a0a0a',
                "surface-elevated": '#121212',
                "surface-overlay": '#1a1a1a',
            },

            // TIPOGRAFIA - Sincronizada con CSS vars
            fontFamily: {
                'display': 'var(--font-serif)',
                'serif': 'var(--font-serif)',
                'body': 'var(--font-sans)',
                'sans': 'var(--font-sans)',
                'mono': ['JetBrains Mono', 'Menlo', 'monospace'],
            },

            // TAMANOS DE FUENTE - Escala armonica
            fontSize: {
                'display-xl': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
                'display-lg': ['3.5rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
                'display-md': ['2.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
                'display-sm': ['2rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
                'heading-lg': ['1.5rem', { lineHeight: '1.3', letterSpacing: '0' }],
                'heading-md': ['1.25rem', { lineHeight: '1.4', letterSpacing: '0' }],
                'body-lg': ['1.125rem', { lineHeight: '1.6', letterSpacing: '0' }],
                'body-md': ['1rem', { lineHeight: '1.6', letterSpacing: '0' }],
                'body-sm': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0' }],
                'caption': ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.02em' }],
            },

            // ESPACIADO - Escala consistente (4px base)
            spacing: {
                '4.5': '1.125rem',
                '13': '3.25rem',
                '15': '3.75rem',
                '18': '4.5rem',
                '22': '5.5rem',
                '26': '6.5rem',
                '30': '7.5rem',
            },

            // RADIOS DE BORDE - Sincronizados con CSS vars
            borderRadius: {
                'none': '0',
                'sm': 'var(--radius-sm)',
                'base': 'var(--radius-sm)',
                'md': 'var(--radius-md)',
                'lg': 'var(--radius-lg)',
                'xl': 'var(--radius-xl)',
                '2xl': '20px',
                '3xl': '24px',
                'card': 'var(--radius-lg)',
                'button': 'var(--radius-sm)',
                'input': 'var(--radius-sm)',
                'badge': '6px',
                'full': '9999px',
            },

            // SOMBRAS - Sincronizadas con CSS vars
            boxShadow: {
                'soft': 'var(--shadow-soft)',
                'lift': 'var(--shadow-lift)',
                'glow': 'var(--shadow-glow)',
                'card': '0 4px 24px -4px rgba(0,0,0,0.25)',
                'card-hover': '0 12px 40px -8px rgba(0,0,0,0.4)',
                'elevated': '0 8px 32px -8px rgba(0,0,0,0.3)',
                'floating': '0 16px 48px -12px rgba(0,0,0,0.35)',
                'glow-gold': '0 0 20px rgba(212, 175, 55, 0.15)',
                'glow-soft': '0 0 30px rgba(255,255,255,0.05)',
                'inner-soft': 'inset 0 2px 4px rgba(0,0,0,0.2)',
            },

            // ANIMACIONES - Sincronizadas con CSS vars
            transitionDuration: {
                'fast': 'var(--dur-fast)',
                'base': '200ms',
                'med': 'var(--dur-med)',
                'slow': 'var(--dur-slow)',
                'slower': '400ms',
                'slowest': '500ms',
            },
            transitionTimingFunction: {
                'premium': 'var(--ease-out)',
                'bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
                'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
            },

            // BACKDROP BLUR
            backdropBlur: {
                xs: '2px',
                sm: '4px',
                base: '8px',
                md: '12px',
                lg: '16px',
                xl: '24px',
            },

            // Z-INDEX - Sistema ordenado
            zIndex: {
                'dropdown': '1000',
                'sticky': '1100',
                'fixed': '1200',
                'modal-backdrop': '1300',
                'modal': '1400',
                'popover': '1500',
                'tooltip': '1600',
            },

            // KEYFRAMES - Animaciones custom
            keyframes: {
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'fade-up': {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'slide-in-right': {
                    '0%': { opacity: '0', transform: 'translateX(20px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                'pulse-soft': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
            },
            animation: {
                'fade-in': 'fade-in 0.3s ease-out',
                'fade-up': 'fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                'scale-in': 'scale-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
            },
        },
    },
    plugins: [
        tailwindcssAnimate,
    ],
};
