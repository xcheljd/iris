import type { Metadata } from "next";
import { appTitle, getStoreName } from "@/lib/store-name";
import { Inter } from "next/font/google";
import { getSession } from "@/lib/auth";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

// The tab title carries the store's name (Settings → Store), read per request.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: appTitle(getStoreName()),
    description: "Retail clienteling CRM — clients, promo matching, analytics. Self-hosted, single process.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
