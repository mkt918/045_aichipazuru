/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'aichi-blue': '#003060',
        'aichi-gold': '#D4AF37',
      }
    },
  },
  plugins: [],
}
