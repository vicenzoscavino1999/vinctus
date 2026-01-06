/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // 🎨 COLORES - Sistema de tokens semánticos
            colors: {
                brand: {
                    gold: '#d4af37',
                    'gold-light': '#e8c547',
                    'gold-dark': '#b8962f',
                    cream: '#f5f0e6',
                    ivory: '#faf8f5',
                },
                surface: {
                    base: '#0a0a0a',
                    elevated: '#121212',
                    overlay: '#1a1a1a',
                    muted: '#0f0f0f',
                },
                accent: {
                    warm: '#fbbf24',
                    cool: '#60a5fa',
                    success: '#34d399',
                    error: '#f87171',
                },
            },

            // 📐 TIPOGRAFÍA - Pareja editorial serif + sans
            fontFamily: {
                'display': ['Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
                'body': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                'mono': ['JetBrains Mono', 'Menlo', 'monospace'],
            },

            // 📏 TAMAÑOS DE FUENTE - Escala armónica
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

            // 📏 ESPACIADO - Escala consistente (4px base)
            spacing: {
                '4.5': '1.125rem',  // 18px
                '13': '3.25rem',    // 52px
                '15': '3.75rem',    // 60px
                '18': '4.5rem',     // 72px
                '22': '5.5rem',     // 88px
                '26': '6.5rem',     // 104px
                '30': '7.5rem',     // 120px
            },

            // 🔲 RADIOS DE BORDE - Consistencia
            borderRadius: {
                'none': '0',
                'sm': '4px',
                'base': '8px',
                'md': '10px',
                'lg': '12px',
                'xl': '16px',
                '2xl': '20px',
                '3xl': '24px',
                'card': '12px',
                'button': '8px',
                'input': '8px',
                'badge': '6px',
                'full': '9999px',
            },

            // 🌫️ SOMBRAS - Premium depth system
            boxShadow: {
                'soft': '0 2px 8px -2px rgba(0,0,0,0.2)',
                'card': '0 4px 24px -4px rgba(0,0,0,0.25)',
                'card-hover': '0 12px 40px -8px rgba(0,0,0,0.4)',
                'elevated': '0 8px 32px -8px rgba(0,0,0,0.3)',
                'floating': '0 16px 48px -12px rgba(0,0,0,0.35)',
                'glow-gold': '0 0 20px rgba(212, 175, 55, 0.15)',
                'glow-soft': '0 0 30px rgba(255,255,255,0.05)',
                'inner-soft': 'inset 0 2px 4px rgba(0,0,0,0.2)',
            },

            // ✨ ANIMACIONES - Duraciones y easings
            transitionDuration: {
                'fast': '150ms',
                'base': '200ms',
                'slow': '300ms',
                'slower': '400ms',
                'slowest': '500ms',
            },
            transitionTimingFunction: {
                'premium': 'cubic-bezier(0.22, 1, 0.36, 1)',
                'bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
                'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
            },

            // 🖼️ BACKDROP BLUR
            backdropBlur: {
                xs: '2px',
                sm: '4px',
                base: '8px',
                md: '12px',
                lg: '16px',
                xl: '24px',
            },

            // 📐 Z-INDEX - Sistema ordenado
            zIndex: {
                'dropdown': '1000',
                'sticky': '1100',
                'fixed': '1200',
                'modal-backdrop': '1300',
                'modal': '1400',
                'popover': '1500',
                'tooltip': '1600',
            },

            // 🎭 KEYFRAMES - Animaciones custom
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
        require("tailwindcss-animate"),
    ],
}
