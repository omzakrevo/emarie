import { notFound } from "next/navigation";
import { paymentMode } from "@/server/payments/providers";
import { SandboxPanel } from "./panel";

export default async function Page({ params }: PageProps<"/paiement/sandbox/[paymentId]">) {
  const { paymentId } = await params;
  if (paymentMode() !== "sandbox" || !/^[0-9a-f-]{36}$/i.test(paymentId)) notFound();
  return <SandboxPanel paymentId={paymentId} />;
}
