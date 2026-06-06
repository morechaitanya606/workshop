import AdminShell from "@/components/admin/AdminShell";
import WorkshopAttendeesPanel from "@/components/workshops/WorkshopAttendeesPanel";

type AdminWorkshopAttendeesPageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function AdminWorkshopAttendeesPage({
    params,
}: AdminWorkshopAttendeesPageProps) {
    const { id } = await params;

    return (
        <AdminShell>
            <WorkshopAttendeesPanel
                workshopId={id}
                backHref="/admin/workshops"
                backLabel="Back to Workshops"
                scope="admin"
            />
        </AdminShell>
    );
}
