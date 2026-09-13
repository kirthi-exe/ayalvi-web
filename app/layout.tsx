import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/dm-serif-display/400-italic.css";
import "./globals.css";
import { Header, Footer } from "@/components/layout/site";
import { Analytics } from "@/lib/analytics/events";
import { siteUrl, description } from "@/lib/constants/site";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ayalvi – Dating for Tamil Singles",
    template: "%s | Ayalvi",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "Ayalvi",
    title: "Ayalvi – Dating for Tamil Singles",
    description,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ayalvi – Dating for Tamil Singles",
    description,
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
