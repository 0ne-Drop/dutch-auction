import { Suspense } from "react";
import { SignupForm } from "./SignupForm";
import { TopBar } from "@/components/TopBar";

export default function SignupPage() {
  return (
    <>
      <TopBar title="회원가입" backHref="/login" />
      <Suspense>
        <SignupForm />
      </Suspense>
    </>
  );
}
