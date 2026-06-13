/** @type {import('next').NextConfig} */
const isDesktopStaticBuild = process.env.NEXT_DESKTOP_STATIC === '1'

const nextConfig = {
  output: isDesktopStaticBuild ? 'export' : 'standalone',
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/*': [
      './electron/poems-service.cjs',
      './lib/poem-notebooks.json',
      './public/data/manifest.json',
      './public/data/poems-index.db',
    ],
  },
  outputFileTracingExcludes: {
    '/*': [
      './public/data/index.json',
      './public/data/shards/**/*',
    ],
  },
  distDir: isDesktopStaticBuild ? '.next-static' : '.next',
  images: {
    unoptimized: isDesktopStaticBuild,
  },
  trailingSlash: isDesktopStaticBuild,
}

module.exports = nextConfig
