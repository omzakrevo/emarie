import type { MetadataRoute } from "next";

/** Installable sur l'écran d'accueil d'un téléphone Android (application web progressive). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "E-MAIRIE", short_name: "E-MAIRIE", description: "La mairie, plus proche de vous.", lang: "fr",
    start_url: "/", scope: "/", display: "standalone", background_color: "#f4f6f9", theme_color: "#17428a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
