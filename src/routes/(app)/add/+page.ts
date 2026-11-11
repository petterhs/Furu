import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

/** Kept so old `/add` links and any saved Android shortcut still work. */
export const load: PageLoad = () => {
  throw redirect(307, "/devices/add");
};
