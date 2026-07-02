import React, { useEffect, useState } from "react";
import { useAppStore } from "../stores/app-store";
import { useBackendURL } from "@/contexts/BackendURLContext";
import { WorkspaceCreateDialog } from "./workspace/WorkspaceCreateDialog";
import { ActivationFlow } from "./ActivationFlow";
import { type LicenseStatus } from "@/lib/api/auth-api";

interface GlobalStateProviderProps {
    children: React.ReactNode;
}

export function GlobalStateProvider({ children }: GlobalStateProviderProps) {
    const { isReady, backendURL, startupLicenseState, startupLicenseCode } = useBackendURL();
    const { isInitialized, fetchInitialState, isLoading, error, workspaces } = useAppStore();
    const [localLicenseState, setLocalLicenseState] = useState<string | null>(null);

    // null = not yet received from backend; treat as "active" to avoid blocking in dev
    const effectiveLicenseState = localLicenseState || startupLicenseState || "active";

    useEffect(() => {
        if (!isInitialized && isReady && (effectiveLicenseState === "active" || effectiveLicenseState === "grace")) {
            fetchInitialState();
        }
    }, [isInitialized, isReady, fetchInitialState, effectiveLicenseState]);

    const handleActivated = (status: LicenseStatus) => {
        setLocalLicenseState(status.state);
    };

    if (effectiveLicenseState === "blocked" || effectiveLicenseState === "restricted") {
        return (
            <div
                data-testid="startup-license-blocked"
                className="flex items-center justify-center h-screen w-screen bg-background"
            >
                <ActivationFlow
                    onActivated={handleActivated}
                    initialLicenseCode={startupLicenseCode}
                />
            </div>
        );
    }

    // Show loading while waiting for backend
    if (!isReady) {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-background text-foreground">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Connecting to backend...</p>
                    <p className="text-xs text-muted-foreground/70">{backendURL || "Waiting for port..."}</p>
                </div>
            </div>
        );
    }

    if (isLoading && !isInitialized) {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-background text-foreground">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Loading OneMind...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-background text-destructive">
                <div className="flex flex-col items-center gap-4 max-w-md text-center p-6">
                    <h2 className="text-xl font-bold">Failed to load application</h2>
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            {children}
            {isInitialized && workspaces.length === 0 && (
                <WorkspaceCreateDialog
                    open={true}
                    onOpenChange={() => {}}
                    mandatory={true}
                />
            )}
        </>
    );
}
