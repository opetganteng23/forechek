/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: '#F7F6F3', // broken white
          soft: '#FBFAF8',
          muted: '#EFEDE8',
          border: '#E3E0D8'
        },
        ink: {
          DEFAULT: '#1C1B18',
          soft: '#4B4943',
          faint: '#83807A'
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
