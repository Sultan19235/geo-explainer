import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Geo Explainer
      </h1>
      <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
        Математика мұғалімдеріне арналған интерактивті геометрия сабақтары
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/grades" className={buttonVariants({ size: "lg" })}>
          Сабақтарды қарау
        </Link>
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Кіру
        </Link>
        <Link
          href="/signup"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          Тіркелу
        </Link>
      </div>
    </main>
  );
}
