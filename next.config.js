/** @type {import('next').NextConfig} */
const isDesktopStaticBuild = process.env.NEXT_DESKTOP_STATIC === '1'

const nextConfig = {
  output: isDesktopStaticBuild ? 'export' : 'standalone',
  distDir: isDesktopStaticBuild ? '.next-static' : '.next',
  images: {
    unoptimized: isDesktopStaticBuild,
  },
  trailingSlash: isDesktopStaticBuild,
}

module.exports = nextConfig
