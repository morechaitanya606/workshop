import SupportChatbot from "@/components/SupportChatbot";

type ChatbotEmbedPageProps = {
    searchParams?: {
        client?: string;
    };
};

export default function ChatbotEmbedPage({ searchParams }: ChatbotEmbedPageProps) {
    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dff9ea,transparent_52%),linear-gradient(180deg,#f5fbfa,#efeae2)] p-3">
            <div className="mx-auto w-full max-w-md">
                <SupportChatbot mode="embedded" clientApiKey={searchParams?.client || null} />
            </div>
        </main>
    );
}
