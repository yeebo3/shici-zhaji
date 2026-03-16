/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        parchment: '#F5F0E8',
        ink: '#2C2C2C',
        ash: '#8A8A8A',
        stone: '#B8B0A2',
        bark: '#A0937D',
        cream: '#FAF7F2',
        night: '#1A1A1A',
        'night-card': '#242424',
        'night-text': '#D4D0C8',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', '"STSong"', '"SimSun"', 'serif'],
        sans: ['"Noto Sans SC"', '"Source Han Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      lineHeight: {
        'relaxed-poem': '2.2',
      },
    },
  },
  plugins: [],
}
