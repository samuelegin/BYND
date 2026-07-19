/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#121212',
        surface: { 1: '#1C1C1E', 2: '#242426' },
        gold: { DEFAULT: '#E5B567', bright: '#F0C983', deep: '#B78A3F', ink: '#2A1E08' },

        /* legacy tokens kept so existing (not-yet-redesigned) pages keep
           working — remapped to the new dark/gold palette */
        acid: '#E5B567',
        'acid-dim': '#B78A3F',
        void: '#121212',
        'void-soft': '#1C1C1E',
        'void-mid': '#242426',
        'void-border': 'rgba(255,255,255,.08)',
        'void-muted': 'rgba(255,255,255,.38)',
        silver: 'rgba(255,255,255,.87)',
        'silver-dim': 'rgba(255,255,255,.60)',
      },
      borderRadius: {
        control: '12px',
        card: '18px',
        panel: '20px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan': 'scan 3s linear infinite',
        'flicker': 'flicker 4s linear infinite',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        flicker: {
          '0%, 95%, 100%': { opacity: 1 },
          '96%': { opacity: 0.8 },
          '97%': { opacity: 1 },
          '98%': { opacity: 0.6 },
          '99%': { opacity: 1 },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(229, 181, 103, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(229, 181, 103, 0.6)' },
        },
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(rgba(229,181,103,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(229,181,103,0.03) 1px, transparent 1px)",
        'scanlines': "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)",
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
    },
  },
  plugins: [],
};
