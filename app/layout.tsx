import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Safe Bike Seoul",
  description: "Safe Bike Seoul",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
