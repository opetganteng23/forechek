/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // Tema "cloud white": putih langit dengan nuansa biru lembut.
        base: {
          DEFAULT: '#F3F8FE',
          soft: '#FFFFFF',
          muted: '#E8F1FB',
          border: '#D6E3F3'
        },
        ink: {
          DEFAULT: '#14213A',
          soft: '#42506B',
          faint: '#6E7B94'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"SF Pro Icons"',
          '"system-ui"',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
}
