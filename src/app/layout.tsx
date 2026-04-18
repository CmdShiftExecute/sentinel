import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { PageWrapper } from "@/components/page-wrapper";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sentinel — Server Dashboard",
  description: "System monitoring dashboard for headless servers",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a2332",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${bricolage.variable} ${figtree.variable} font-body bg-scanlines`}>
        <div className="flex min-h-screen bg-grid">
          <Sidebar />
          <main className="flex-1 min-w-0 md:ml-[220px] min-h-screen pt-14 pb-16 md:pt-0 md:pb-0">
            <div className="max-w-[1400px] mx-auto px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8">
              <PageWrapper>{children}</PageWrapper>
            </div>
          </main>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var t = localStorage.getItem('sentinel-theme') || 'dark';
                document.documentElement.setAttribute('data-theme', t);
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
