import "./globals.css";
import Nav from "./Nav";

export const metadata = { title: "SireMailer | Email Campaigns Platform" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased lg:flex">
        <Nav />
        <div className="min-w-0 flex-1 px-5 py-8 lg:px-10">{children}</div>
      </body>
    </html>
  );
}
