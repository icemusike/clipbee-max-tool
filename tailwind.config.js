/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'cb-dark': '#1A1A1A',
        'cb-surface': '#2A2A2A',
        'cb-surface-light': '#333333',
        'cb-input': '#1E1E1E',
        'cb-border': '#3A3A3A',
        'cb-timeline': '#111111',
        'cb-yellow': '#F5C518',
        'cb-orange': '#E8920D',
        'cb-red': '#EF4444',
        'cb-green': '#22C55E',
        'cb-text': '#FFFFFF',
        'cb-text-secondary': '#999999',
        'cb-text-muted': '#666666',
      },
      fontFamily: {
        grotesk: ['"Space Grotesk"', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
