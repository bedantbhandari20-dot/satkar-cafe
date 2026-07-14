/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cardo', 'serif'],
        serif: ['Cardo', 'serif'],
        mono: ['Cardo', 'serif'],
        display: ['Cardo', 'serif'],
        brand: ['Cardo', 'serif'],
        price: ['Cardo', 'serif'],
        anton: ['Anton', 'sans-serif'],
      },
      colors: {
        espresso: { 50: '#f5f2ef', 100: '#e5dcd3', 200: '#cebcae', 300: '#b19782', 400: '#94755e', 500: '#7e604d', 600: '#644b3c', 700: '#523d32', 800: '#46352c', 900: '#382a24', 950: '#1c1208' },
        gold: { 50: '#fcfaf8', 100: '#e8dcce', 200: '#d8c2b0', 300: '#c1a28a', 400: '#b18f74', 500: '#a0785a', 600: '#8b6347', 700: '#73523a', 800: '#5a402d', 900: '#463021', 950: '#2a1a10' },
        brand: { 50: '#f5f7f2', 100: '#e5ebe0', 200: '#cbdac1', 300: '#a8bfa1', 400: '#89a482', 500: '#647e5b', 600: '#4c6145', 700: '#3e4e37', 800: '#323f2d', 900: '#2b3427' },
        sand: { 50: '#fdfbf7', 100: '#f7f4ea', 200: '#eee8d5', 300: '#e0d5ba' },
      },
      boxShadow: {
        soft: '0 10px 40px -10px rgba(28, 18, 8, 0.12)',
        float: '0 20px 40px -10px rgba(28, 18, 8, 0.2)',
      }
    },
  },
  plugins: [],
}
