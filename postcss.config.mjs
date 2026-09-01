// Tailwind 4 handles vendor prefixing itself (Lightning CSS), so autoprefixer
// is no longer part of the pipeline.
const config = { plugins: { '@tailwindcss/postcss': {} } };

export default config;
