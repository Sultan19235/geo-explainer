import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ConsoleClient } from "./console-client";

// Teacher console for the graph-quadratic live quiz — the native React
// replacement for the uploaded teacher.html iframe. Login-gated (Gate 1);
// room creation is additionally token-gated on the live server once
// QUIZ_TOKEN_SECRET is set (Gate 2).

export const metadata: Metadata = {
  title: "Квадраттық функция — мұғалім консолі",
  robots: { index: false },
};

export default async function TeacherConsolePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ConsoleClient />;
}
