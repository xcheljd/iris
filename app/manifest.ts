import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand-mark";

/** Web app manifest: lets a browser install Iris like an app. Icons come from `pnpm icons`. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Iris",
    short_name: "Iris",
    description: "Client follow-up for retail stores",
    start_url: "/",
    display: "standalone",
    background_color: BRAND.navy,
    theme_color: BRAND.navy,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon-monochrome.svg", sizes: "any", type: "image/svg+xml", purpose: "monochrome" },
    ],
  };
}
