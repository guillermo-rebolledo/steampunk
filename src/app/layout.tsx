import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";

import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Departure Mono by Helena Zhang, SIL Open Font License 1.1.
// Licence ships alongside the file at src/fonts/DepartureMono-LICENSE.txt.
// Ships a single Regular weight — no bold, no italic. See globals.css, which
// disables weight synthesis so nothing renders a smeared faux-bold.
const departureMono = localFont({
  src: "../fonts/DepartureMono-Regular.woff2",
  variable: "--font-departure-mono",
  weight: "400",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Steampunk",
  description: "Browse well-reviewed games currently discounted on Steam.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // next-themes writes the appearance class onto <html> before hydration,
    // so the server and client markup differ here by design.
    <html
      lang="en"
      className={`${geistSans.variable} ${departureMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
