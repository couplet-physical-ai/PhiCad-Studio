import { useState, type ReactElement } from "react";
import { getBackendURL } from "../../../src-ts/shared/sdk/mutator";

// Get dynamic backend URL (set by BackendURLContext)
const getApiBase = () => `${getBackendURL()}/api/modules/hello`;

interface GreetResponse {
    message: string;
    timestamp: string;
}

interface StatusResponse {
    module: string;
    status: string;
    timestamp: string;
}

export function HelloSpace(): ReactElement {
    const [name, setName] = useState("World");
    const [greeting, setGreeting] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGreet = async () => {
        setLoading(true);
        setError(null);
        try {
            const apiBase = getApiBase();
            const response = await fetch(`${apiBase}/greet?name=${encodeURIComponent(name)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data: GreetResponse = await response.json();
            setGreeting(data.message);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch");
        } finally {
            setLoading(false);
        }
    };

    const handleStatus = async () => {
        setLoading(true);
        setError(null);
        try {
            const apiBase = getApiBase();
            const response = await fetch(`${apiBase}/status`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data: StatusResponse = await response.json();
            setStatus(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 rounded-lg border border-dashed p-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h2 className="text-xl font-semibold">Hello Space</h2>
                    <p className="text-sm text-muted-foreground">Phase 3 Module Test</p>
                </div>
                <span className="rounded bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
                    space.hello
                </span>
            </div>

            {/* Greet Form */}
            <div className="space-y-3">
                <label className="block">
                    <span className="text-sm font-medium">Your Name</span>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Enter your name"
                    />
                </label>

                <div className="flex gap-2">
                    <button
                        onClick={handleGreet}
                        disabled={loading}
                        className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {loading ? "Loading..." : "Greet Me"}
                    </button>

                    <button
                        onClick={handleStatus}
                        disabled={loading}
                        className="rounded border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                    >
                        Check Status
                    </button>
                </div>
            </div>

            {/* Results */}
            {error && (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">Error: {error}</p>
                </div>
            )}

            {greeting && (
                <div className="rounded border border-green-500/50 bg-green-500/10 p-3">
                    <p className="text-sm font-medium">{greeting}</p>
                </div>
            )}

            {status && (
                <div className="rounded border bg-muted p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Module Status</p>
                    <pre className="text-xs">{JSON.stringify(status, null, 2)}</pre>
                </div>
            )}

            {/* Info */}
            <div className="rounded bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium mb-1">Module Endpoints:</p>
                <ul className="list-disc list-inside space-y-1">
                    <li>GET /api/modules/hello/greet?name=&lt;name&gt;</li>
                    <li>GET /api/modules/hello/status</li>
                    <li>WS /ws/modules/hello (echo, subscribe, ping)</li>
                </ul>
            </div>
        </div>
    );
}

export function Space(): ReactElement {
    return <HelloSpace />;
}
