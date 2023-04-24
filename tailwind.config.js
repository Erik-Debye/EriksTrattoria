/** @type {import('tailwindcss').Config} */
export default {
  content: ['./static/index.html', './templates/*.html', './routes/*.js'],
  theme: {
    colors: {
      black: '#001524',
      blue: '#15616D',
      white: '#FFECD1',
      orange: '#FF7D00',
      red: '#6C2815',
    },
    fontFamily: {
      sans: ['Albert Sans', 'sans-serif'],
      serif: ['Bubblegum Sans', 'serif'],
    },
    extend: {
      animation: {
        checked: 'checked .1s linear 0s 4 alternate',
      },
      keyframes: {
        checked: {
          '0%': { 'outline-offset': '0rem' },
          '100%': { 'outline-offset': '-0.2rem' },
        },
      },
    },
  },
  plugins: [],
};
