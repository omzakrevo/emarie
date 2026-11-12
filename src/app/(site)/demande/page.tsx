import { RealWizard } from "@/features/demande/real-wizard";
import { listServices } from "@/server/applications/catalog";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Page({ searchParams }: PageProps<"/demande">) {
  const sp = await searchParams;
  const services = await listServices((await getCurrentMunicipality()).id);
  const wanted = typeof sp.service === "string" ? sp.service : undefined;
  return <RealWizard services={services} preselect={wanted && services.some((s) => s.code === wanted) ? wanted : undefined} />;
}
