import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

/** The connection log moved under Settings → Diagnostics. */
export const load: PageLoad = () => {
  throw redirect(307, "/settings/diagnostics/logs");
};
