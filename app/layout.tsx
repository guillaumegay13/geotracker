import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GEO Tracker",
  description: "Track your website visibility in AI responses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistMono.variable} font-mono`}>
        <div className="min-h-screen flex flex-col">
          <nav className="px-6 py-4">
            <div className="max-w-4xl mx-auto flex items-center gap-8">
              <Link href="/" className="font-bold">GEO Tracker</Link>
              <div className="flex gap-6 text-sm text-[--dim]">
                <Link href="/" className="hover:text-[--green]">dashboard</Link>
                <Link href="/prompts" className="hover:text-[--green]">prompts</Link>
                <Link href="/runs" className="hover:text-[--green]">runs</Link>
                <Link href="/settings" className="hover:text-[--green]">settings</Link>
              </div>
            </div>
          </nav>
          <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
