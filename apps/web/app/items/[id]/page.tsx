import { Suspense } from "react";
import { BidClient } from "./BidClient";

export default function BidPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-mute">불러오는 중…</div>}>
      <BidClient />
    </Suspense>
  );
}
