/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'benz-dark': '#0a0a0a',
        'benz-surface': '#1c1c1e',
        'benz-surface-2': '#2c2c2e',
        'benz-accent': '#0a84ff',
      }
    },
  },
  plugins: [],
}
