import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "توزیع هزینه معامله — فیوچرز بایننس",
  description:
    "توزیع آماری اسپرد و کارمزد نسبت به قیمت در همه نمادهای USDⓈ-M بایننس، به‌همراه دسته‌بندی و تحلیل عوامل مؤثر",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
