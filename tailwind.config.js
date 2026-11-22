/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0B0F17',
        panel: '#121826',
        card: '#182032',
        borderSubtle: '#263147'
      }
    }
  },
  plugins: []
};
