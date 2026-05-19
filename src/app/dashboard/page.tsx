import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";

async function logout() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export default async function DashboardPage() {
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

  const isAdmin = !!teacher?.is_admin;

  return (
    <DashboardClient
      email={user.email ?? ""}
      isAdmin={isAdmin}
      logoutAction={logout}
    />
  );
}
