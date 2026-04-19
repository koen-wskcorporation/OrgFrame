import preset from '@orgframe/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
const config = {
  presets: [preset],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};

export default config;
