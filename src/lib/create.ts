// Creates the document for a freshly uploaded file (shared by the local and Blob upload routes).

import { extensionOf, mediaKind } from "./formats";
import type { SpokenLanguage } from "./languages";
import { newId, now, store, type TranscriptionDoc } from "./store";

export interface NewUpload {
  fileName: string;
  size: number;
  contentType: string | null;
  storagePath: string;
  language: SpokenLanguage;
}

export async function createTranscription(input: NewUpload): Promise<TranscriptionDoc> {
  const stamp = now();
  const ext = extensionOf(input.fileName);
  const doc: TranscriptionDoc = {
    id: newId(),
    mediaFile: {
      id: newId(),
      fileName: input.fileName,
      fileType: mediaKind(input.fileName, input.contentType),
      fileFormat: ext || input.contentType?.split("/")[1] || "unknown",
      fileSize: input.size,
      storagePath: input.storagePath,
      duration: null,
      uploadedAt: stamp,
    },
    spokenLanguage: input.language,
    detectedLanguage: null,
    status: "pending",
    progress: 0,
    stage: null,
    errorMessage: null,
    processingStartedAt: null,
    processingCompletedAt: null,
    processingDuration: null,
    createdAt: stamp,
    updatedAt: stamp,
    variants: [],
  };
  await store().save(doc);
  return doc;
}
