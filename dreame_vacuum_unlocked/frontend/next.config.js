/**
 * Static export config for the Dreame Companion add-on UI.
 *
 * The add-on serves this app by hosting the build output from Flask. There is
 * no Node runtime in the Docker image - Next only compiles here at build time
 * (`output: "export"` emits plain HTML/CSS/JS into `out/`), and Flask serves
 * it like any static site while staying the JSON API backend.
 *
 * - trailingSlash: clean multiplexed URLs that also work when HA ingress
 *   proxies us under a generated path prefix with its own trailing slash.
 * - distDir "out": conventional Next export dir; the Dockerfile multi-stage
 *   build copies this into the runtime image.
 * - generateStaticParams/service calls all run at build; runtime data flows
 *   purely over fetch() to the Flask API (the index page ports "server-render
 *   with live HA state" into "client-side fetch of an enriched endpoint").
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

module.exports = nextConfig;