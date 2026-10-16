/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: {
    paper: '#faf8f3', ink: '#20372f', muted: '#627168',
    primary: { 50: '#edf3eb', 100: '#dfebdf', 200: '#bed4c2', 300: '#96b89f', 400: '#6e9b7b', 500: '#39765b', 600: '#245d48', 700: '#1d4c3b', 800: '#183e31', 900: '#143329' },
    success: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#15803d', 700: '#166534', 800: '#14532d', 900: '#113f26' },
  } } }, plugins: [],
};
