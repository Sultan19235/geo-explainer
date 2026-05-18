import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Сәлеметсіз бе, {user.email}
      </h1>
      <div className="flex flex-col items-center gap-3">
        {isAdmin && (
          <Link href="/admin/topics" className={buttonVariants()}>
            Әкімші панелі
          </Link>
        )}
        <form action={logout}>
          <Button type="submit" variant="outline">
            Шығу
          </Button>
        </form>
      </div>
    </main>
  );
}
