/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neuro': {
          'black': '#000000',
          'darkpurple': '#090514',
          'border': '#2e1065',
          'accent': '#a855f7',
          'accent-light': '#c084fc',
          'text': '#ffffff',
          'text-muted': '#a1a1aa'
        },
        'panic': {
          '50': '#fef2f2',
          '100': '#fee2e2',
          '200': '#fecaca',
          '300': '#fca5a5',
          '400': '#f87171',
          '500': '#ef4444',
          '600': '#dc2626',
          '700': '#b91c1c',
          '800': '#991b1b',
          '900': '#7f1d1d',
        }
      }
    },
  },
  plugins: [],
}
