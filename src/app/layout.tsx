import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OfflineSupport } from "@/components/offline-support";

export const metadata: Metadata = {
  title: "Beans&Beats Queue",
  description:
    "Order and pickup system for the Beans&Beats booth at Christmas Together 2026",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <OfflineSupport />
        {children}
      </body>
    </html>
  );
}
