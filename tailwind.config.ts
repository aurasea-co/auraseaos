import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      sm: '375px',
      md: '768px',
      lg: '1280px',
    },
    extend: {
      fontFamily: {
        sans: [
          'var(--font-primary)',
          'var(--font-fallback)',
          'system-ui',
          'sans-serif',
        ],
        heading: [
          "'Plus Jakarta Sans'",
          'var(--font-primary)',
          'system-ui',
          'sans-serif',
        ],
        body: [
          "'Inter'",
          'var(--font-fallback)',
          'system-ui',
          'sans-serif',
        ],
      },
      lineHeight: {
        body: '1.6',
        heading: '1.3',
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        brand: {
          teal: {
            DEFAULT: '#1D9E75',
            light: '#5DCAA5',
            mist: '#E1F5EE',
          },
          ocean: '#185FA5',
          sky: {
            DEFAULT: '#378ADD',
            light: '#E6F1FB',
          },
          navy: '#042C53',
          deep: '#04342C',
          purple: {
            DEFAULT: '#534AB7',
            light: '#AFA9EC',
            mist: '#EEEDFE',
          },
        },
      },
    },
  },
  plugins: [],
}
export default config
