import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { RealWizard } from "@/features/demande/real-wizard";
import { getT } from "@/i18n/server";
import { AccessError, resolveApplication } from "@/server/applications/access";
import { getServiceById } from "@/server/applications/catalog";
import { listFiles, loadData } from "@/server/applications/operations";
import { listPayOptions } from "@/server/payments/service";

export default async function Page({ params }: PageProps<"/demande/[id]">) {
  const { id } = await params;
  const { t } = await getT();
  let app;
  try { app = await resolveApplication(id, { draftOnly: false }); } catch (e) { if (e instanceof AccessError) notFound(); throw e; }
  if (app.status !== "DRAFT") {
    return <div className="rounded-2xl bg-surface p-6"><p className="font-semibold">{t("wizard.done")}</p><p className="mt-2 text-sm">{t(`status.${app.status}` as never)}</p><div className="mt-4"><LinkButton href="/suivi">{t("nav.track")}</LinkButton></div></div>;
  }
  const service = await getServiceById(app.municipality_id, app.service_id);
  if (!service) notFound();
  const [data, files, payOptions] = await Promise.all([loadData(app), listFiles(app), listPayOptions(app.municipality_id)]);
  return <RealWizard services={[]} payOptions={payOptions} initial={{ draftId: app.id, service, data, files }} />;
}
