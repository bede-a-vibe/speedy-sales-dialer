import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/AppLayout";
import DialpadSettingsPage from "@/pages/DialpadSettingsPage";
import { PeopleDirectory } from "@/components/team/PeopleDirectory";
import { TrackerShareLink } from "@/components/team/TrackerShareLink";

/**
 * Team & settings: People (everyone, their access, login links, meeting
 * numbers, Fathom, Dialpad flag, former team members) and Dialpad (numbers,
 * seats and GHL user mapping). The old Logins & roles and Connections tabs
 * live inside People now; their links land there.
 */
export default function TeamPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab = raw === "dialpad" ? "dialpad" : "people";

  return (
    <AppLayout title="Team & settings">
      <div className="mx-auto mb-4 max-w-6xl">
        <TrackerShareLink />
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="mx-auto max-w-6xl space-y-4">
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="dialpad">Dialpad</TabsTrigger>
        </TabsList>
        <TabsContent value="people">
          <PeopleDirectory />
        </TabsContent>
        <TabsContent value="dialpad">
          <DialpadSettingsPage embedded />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
