import HostShell from "@/components/host/HostShell";
import WorkshopAttendeesPanel from "@/components/workshops/WorkshopAttendeesPanel";
import { isMockWorkshopId } from "@/lib/workshop-attendees";

type HostWorkshopAttendeesPageProps = {
    params: {
        id: string;
    };
};

export default function HostWorkshopAttendeesPage({ params }: HostWorkshopAttendeesPageProps) {
    const isMockWorkshop = isMockWorkshopId(params.id);

    return (
        <HostShell>
            <WorkshopAttendeesPanel
                workshopId={params.id}
                backHref="/host/workshops"
                backLabel="Back to My Workshops"
                scope="host"
                isMockWorkshop={isMockWorkshop}
            />
        </HostShell>
    );
}
