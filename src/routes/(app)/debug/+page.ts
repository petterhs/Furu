import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

/** Debug tools moved under Settings → Diagnostics. */
export const load: PageLoad = () => {
  throw redirect(307, "/settings/diagnostics/ble");
};
