import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { FAQ } from "../components/faq.tsx";
import { Button } from "../components/button.tsx";

export const Route = createFileRoute("/sign-in")({
    component: RouteComponent,
    beforeLoad: ({ context }) => {
        // redirect if already signed in
        if (context.user) throw redirect({ to: "/" });
    },
});

function RouteComponent() {
    const { auth } = Route.useRouteContext();
    const [loading, setLoading] = useState(false);

    const handleSignIn = async () => {
        setLoading(true);
        const { error } = await auth.signIn.social({
            provider: "github",
        });
        if (error) {
            setLoading(false);
            throw error;
        }
    };

    return (
        <div className="flex flex-col gap-20">
            <div className="flex justify-between gap-4 items-center">
                <img src="/logo_text_black.svg" alt="pollinations.ai" className="h-12 flex-1 object-contain object-left" />
                <Button as="a" href="/api/docs">
                    API Reference
                </Button>
                <Button 
                    as="button" 
                    onClick={handleSignIn} 
                    disabled={loading}
                    weight="light"
                >
                    {loading ? "Signing in..." : "Sign in with Github"}
                </Button>
            </div>
            <FAQ />
        </div>
    );
}
