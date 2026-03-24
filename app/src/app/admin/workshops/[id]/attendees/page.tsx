import AdminShell from "@/components/admin/AdminShell";
import WorkshopAttendeesPanel from "@/components/workshops/WorkshopAttendeesPanel";
import { isMockWorkshopId } from "@/lib/workshop-attendees";

type AdminWorkshopAttendeesPageProps = {
    params: {
        id: string;
    };
};

export default function AdminWorkshopAttendeesPage({ params }: AdminWorkshopAttendeesPageProps) {
    const isMockWorkshop = isMockWorkshopId(params.id);

    return (
        <AdminShell>
            <WorkshopAttendeesPanel
                workshopId={params.id}
                backHref="/admin/workshops"
                backLabel="Back to Workshops"
                scope="admin"
                isMockWorkshop={isMockWorkshop}
            />
        </AdminShell>
    );
}
