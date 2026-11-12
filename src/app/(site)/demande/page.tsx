import { RealWizard } from "@/features/demande/real-wizard";
import { listServices } from "@/server/applications/catalog";
import { listPayOptions } from "@/server/payments/service";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Page({ searchParams }: PageProps<"/demande">) {
  const sp = await searchParams;
  const m = await getCurrentMunicipality();
  const [services, payOptions] = await Promise.all([listServices(m.id), listPayOptions(m.id)]);
  const wanted = typeof sp.service === "string" ? sp.service : undefined;
  return <RealWizard services={services} payOptions={payOptions} preselect={wanted && services.some((s) => s.code === wanted) ? wanted : undefined} />;
}
