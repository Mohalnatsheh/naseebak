import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "../globals.css";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "نصيب - منصة تيسير الزواج",
  description: "منصة نصيب لتيسير الزواج التقليدي في الأردن",
};

export default function ArabicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${ibmPlexArabic.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
