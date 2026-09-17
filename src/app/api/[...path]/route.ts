// Any unknown /api path answers with JSON instead of the HTML 404 page.

import { jsonError } from "@/lib/api";

const notFound = () => jsonError(404, "Not found");
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
