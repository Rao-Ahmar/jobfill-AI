/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{html,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        card: '#1e293b',
        primary: '#6366f1',
        success: '#22c55e',
        warning: '#f59e0b',
        textPrimary: '#f1f5f9',
        textSecondary: '#94a3b8',
        border: '#334155'
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
