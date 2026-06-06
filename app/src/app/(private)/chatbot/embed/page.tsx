import SupportChatbot from "@/components/SupportChatbot";

type ChatbotEmbedPageProps = {
    searchParams?: Promise<{
        client?: string;
    }>;
};

export default async function ChatbotEmbedPage({ searchParams }: ChatbotEmbedPageProps) {
    const resolvedSearchParams = await searchParams;

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dff9ea,transparent_52%),linear-gradient(180deg,#f5fbfa,#efeae2)] p-3">
            <div className="mx-auto w-full max-w-md">
                <SupportChatbot
                    mode="embedded"
                    clientApiKey={resolvedSearchParams?.client || null}
                />
            </div>
        </main>
    );
}
