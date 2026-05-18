import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: teacher } = await supabase
    .from("teachers")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!teacher?.is_admin) {
    redirect("/dashboard");
  }

  return user;
}
