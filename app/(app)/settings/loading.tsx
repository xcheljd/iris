import { Topbar } from "@/components/topbar";
import { SettingsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Settings" />
      <SettingsSkeleton />
    </>
  );
}
