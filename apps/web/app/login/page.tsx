import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { TopBar } from "@/components/TopBar";

export default function LoginPage() {
  return (
    <>
      <TopBar title="로그인" backHref="/" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
