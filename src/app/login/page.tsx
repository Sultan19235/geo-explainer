"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Кіру</CardTitle>
          <CardDescription>
            Аккаунтыңызға кіру үшін электрондық поштаңыз бен құпиясөзіңізді
            енгізіңіз.
          </CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Электрондық пошта</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Құпиясөз</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {state?.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </CardContent>
          <CardFooter className="mt-4 flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Кіруде..." : "Кіру"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Аккаунтыңыз жоқ па?{" "}
              <Link href="/signup" className="underline">
                Тіркелу
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
