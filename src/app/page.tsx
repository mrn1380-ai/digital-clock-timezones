import Dashboard from "@/components/Dashboard";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  try {
    const { report, costs } = await runPipeline({});
    return <Dashboard initial={{ report, costs }} />;
  } catch (e) {
    return <Dashboard initial={null} initialError={(e as Error).message} />;
  }
}
