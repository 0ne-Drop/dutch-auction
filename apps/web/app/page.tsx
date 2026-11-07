import { Suspense } from "react";
import { HomeClient } from "./HomeClient";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-mute">불러오는 중…</div>}>
      <HomeClient />
    </Suspense>
  );
}
