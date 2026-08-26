import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";

export interface SafeNetworkDiagnostic {
  dnsResolved: boolean;
  tcpConnected: boolean;
  errorCode: string | null;
  durationMs: number;
}

export async function diagnoseDatabaseNetwork(
  hostname: string | null,
  port = 5432,
  timeoutMs = 3_000,
): Promise<SafeNetworkDiagnostic> {
  const startedAt = Date.now();
  if (!hostname) {
    return { dnsResolved: false, tcpConnected: false, errorCode: "hostname_missing", durationMs: 0 };
  }

  try {
    await lookup(hostname);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "dns_failed";
    return {
      dnsResolved: false,
      tcpConnected: false,
      errorCode: code,
      durationMs: Date.now() - startedAt,
    };
  }

  return new Promise((resolve) => {
    const socket = createConnection({ host: hostname, port });
    let settled = false;
    const finish = (tcpConnected: boolean, errorCode: string | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        dnsResolved: true,
        tcpConnected,
        errorCode,
        durationMs: Date.now() - startedAt,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, null));
    socket.once("timeout", () => finish(false, "tcp_timeout"));
    socket.once("error", (error) => {
      const code = "code" in error ? String(error.code) : "tcp_error";
      finish(false, code);
    });
  });
}
