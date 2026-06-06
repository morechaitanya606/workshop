import HostShell from "@/components/host/HostShell";
import WorkshopAttendeesPanel from "@/components/workshops/WorkshopAttendeesPanel";

type HostWorkshopAttendeesPageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function HostWorkshopAttendeesPage({
    params,
}: HostWorkshopAttendeesPageProps) {
    const { id } = await params;

    return (
        <HostShell>
            <WorkshopAttendeesPanel
                workshopId={id}
                backHref="/host/workshops"
                backLabel="Back to My Workshops"
                scope="host"
            />
        </HostShell>
    );
}
