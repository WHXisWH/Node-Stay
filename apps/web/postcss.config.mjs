// PostCSS 設定
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind CSS v4 は @tailwindcss/postcss を使用する
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};

export default config;
