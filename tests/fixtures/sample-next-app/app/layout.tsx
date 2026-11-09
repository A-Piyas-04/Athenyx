import type { ReactNode } from "react";

export const metadata = { title: "Splitwise Lite" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
