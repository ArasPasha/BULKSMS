/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary:  { DEFAULT: '#534AB7', light: '#EAE8FA', dark: '#3d368a' },
        teal:     { DEFAULT: '#1D9E75', light: '#D6F2E9' },
        amber:    { DEFAULT: '#BA7517', light: '#FDF0D6' },
        coral:    { DEFAULT: '#D85A30', light: '#FAE3DA' },
        bg:       '#F4F3FC',
        surface:  { DEFAULT: '#FFFFFF', 2: '#F0EFF9' },
        border:   '#E3E1F0',
        muted:    '#6B698A',
        ink:      '#1A1830',
      },
      maxWidth: { app: '430px' },
      height:   { nav: '68px' },
      spacing:  { nav: '68px' },
      borderRadius: {
        sm: '8px',
        DEFAULT: '14px',
        lg: '20px',
      },
      boxShadow: {
        sm: '0 1px 4px rgba(83,74,183,.08)',
        DEFAULT: '0 4px 16px rgba(83,74,183,.12)',
        lg: '0 8px 32px rgba(83,74,183,.18)',
      },
    },
  },
  plugins: [],
};
