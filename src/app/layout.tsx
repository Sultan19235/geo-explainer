import type { Metadata } from "next";
import { IBM_Plex_Sans, Geist_Mono, Literata } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/context";
import { AuthProvider, type AuthUser } from "@/lib/auth/context";
import { parseGender } from "@/lib/auth/gender";
import { PresenceTracker } from "@/components/presence-tracker";
import { createClient } from "@/lib/supabase/server";
import { SpeedInsights } from "@vercel/speed-insights/next";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Textbook voice for headings — covers the Kazakh Cyrillic letters
// (ә, ғ, қ, ң, ө, ұ, ү, і) via cyrillic-ext.
const literata = Literata({
  variable: "--font-display",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "matem.school",
  description:
    "Математика мұғалімдеріне арналған платформа: алгебра мен геометрия бойынша теория, есептер және интерактивті тесттер",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const initialUser: AuthUser | null = user
    ? {
        id: user.id,
        email: user.email ?? null,
        fullName:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        gender: parseGender(user.user_metadata?.gender),
      }
    : null;

  return (
    <html lang="kk">
      <body
        className={`${ibmPlexSans.variable} ${geistMono.variable} ${literata.variable} antialiased`}
      >
        <AuthProvider initialUser={initialUser}>
          <LanguageProvider>{children}</LanguageProvider>
          <PresenceTracker />
        </AuthProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
