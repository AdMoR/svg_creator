// basePath is injected at build time by actions/configure-pages (static_site_generator: next).
/** @type {import('next').NextConfig} */
export default {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};
