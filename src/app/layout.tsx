import "./globals.css";

export const metadata = {
  title: "Fresh Fold",
  description: "Your local dry-cleaning service, simplified.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
