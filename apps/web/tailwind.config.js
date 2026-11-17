/** @type {import('tailwindcss').Config} */
// Tema "cloud white" polos: latar abu-putih lembut, kartu putih, garis halus, satu aksen gelap (slate tua).
// Palet `sky` dan `indigo` sengaja DIPETAKAN ke aksen tunggal ini agar seluruh komponen memakai satu warna aksen.
const brand = {
  50: '#F4F6F9',
  100: '#E8ECF2',
  200: '#CED5E0',
  300: '#AEB8C8',
  400: '#8392A8',
  500: '#5A6A84',
  600: '#2B364D',
  700: '#212B3E',
  800: '#182030',
  900: '#0F1623'
}

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: { DEFAULT: '#F4F5F7', soft: '#FFFFFF', muted: '#EEF0F3', border: '#E2E5EA' },
        ink: { DEFAULT: '#1D2330', soft: '#454D5E', faint: '#5F6779' },
        logo: { teal: '#00809D', orange: '#E8671B' },
        sky: brand,
        indigo: brand
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.05)',
        pop: '0 12px 32px -8px rgba(16,24,40,.18)'
      }
    }
  },
  plugins: []
}
