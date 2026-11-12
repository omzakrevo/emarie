import type { UploadedFile } from "./types";

/** Réduit les photos de téléphone (souvent 4–10 Mo) avant envoi : max 1800 px, JPEG qualité 0,82. */
export async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { /* on envoie l'original */ }
  return file;
}

export type UploadResult = { ok: true; file: UploadedFile } | { ok: false; error: string };

export async function httpUpload(draftId: string, documentKey: string, file: File): Promise<UploadResult> {
  const body = new FormData();
  body.set("file", file); body.set("documentKey", documentKey);
  try {
    const r = await fetch(`/api/applications/${draftId}/files`, { method: "POST", body });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, file: j.file } : { ok: false, error: j.error ?? "failed" };
  } catch { return { ok: false, error: "failed" }; }
}
export async function httpRemove(draftId: string, fileId: string): Promise<boolean> {
  try { return (await fetch(`/api/applications/${draftId}/files/${fileId}`, { method: "DELETE" })).ok; } catch { return false; }
}
