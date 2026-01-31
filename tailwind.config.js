/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
          },
          '50%': {
            boxShadow: '0 0 30px rgba(168, 85, 247, 0.8)',
          },
        },
      },
    },
  },
  plugins: [],
}