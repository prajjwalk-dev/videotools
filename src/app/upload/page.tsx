import { storageMode } from "@/lib/storage";
import UploadForm from "./UploadForm";

// Server component: tells the form whether to upload through the API (local disk)
// or straight to Vercel Blob (serverless, no request-size limit).
export default function UploadPage() {
  return <UploadForm mode={storageMode() === "blob" ? "blob" : "multipart"} />;
}
