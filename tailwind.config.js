/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#4f46e5', // Indigo 600
          DEFAULT: '#4338ca', // Indigo 700
          dark: '#3730a3', // Indigo 800
        },
        secondary: {
          light: '#10b981', // Emerald 500
          DEFAULT: '#059669', // Emerald 600
          dark: '#047857', // Emerald 700
        },
        accent: {
          light: '#f59e0b', // Amber 500
          DEFAULT: '#d97706', // Amber 600
        },
        background: '#f8fafc', // Slate 50
        surface: '#ffffff',
        text: {
          primary: '#1e293b', // Slate 800
          secondary: '#64748b', // Slate 500
        }
      },
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans JP"', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'float': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
