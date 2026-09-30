"use client";

import { type ConnectionStatus, type HostProbe } from "@/lib/types";
import { timeAgo, Card } from "./ui";

const KIND_LABEL: Record<HostProbe["kind"], string> = {
  ok: "سالم",
  "geo-block": "مسدود جغرافیایی",
  "rate-limit": "سقف نرخ درخواست",
  server: "خطای سرور بایننس",
  http: "خطای HTTP",
  dns: "خطای DNS",
  timeout: "اتمام مهلت",
  network: "مسدود شبکه",
  unknown: "نامشخص",
};

const KIND_COLOR: Record<HostProbe["kind"], string> = {
  ok: "#22c55e",
  "geo-block": "#ef4444",
  "rate-limit": "#f59e0b",
  server: "#f97316",
  http: "#fb923c",
  dns: "#f472b6",
  timeout: "#eab308",
  network: "#ef4444",
  unknown: "#6b7c9b",
};

export function ConnectionPanel({
  connection,
  busy,
  onRecheck,
}: {
  connection: ConnectionStatus;
  busy: boolean;
  onRecheck: () => void;
}) {
  const healthy = connection.probes.filter((p) => p.ok);
  const state = healthy.length > 0 ? "ok" : connection.geoBlocked ? "geo" : "down";
  const stateColor = state === "ok" ? "#22c55e" : state === "geo" ? "#ef4444" : "#f59e0b";
  const stateLabel =
    state === "ok" ? "متصل" : state === "geo" ? "مسدود از سمت بایننس" : "بدون دسترسی شبکه";

  return (
    <Card
      title="وضعیت اتصال به بایننس"
      hint="هر میزبان با یک درخواست سبک (‎/fapi/v1/time‎) بررسی می‌شود؛ نتیجه نشان می‌دهد مشکل از کجاست."
      right={
        <button onClick={onRecheck} disabled={busy}>
          {busy ? "در حال بررسی…" : "↻ بررسی مجدد"}
        </button>
      }
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 12px",
          borderRadius: 10,
          background: `color-mix(in srgb, ${stateColor} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${stateColor} 40%, transparent)`,
          marginBottom: 12,
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: stateColor, flex: "0 0 auto" }} />
        <b style={{ color: stateColor, fontSize: 15 }}>{stateLabel}</b>
        <span style={{ color: "var(--txt2)", fontSize: 12.5, flex: "1 1 320px" }}>{connection.message}</span>
      </div>

      <div className="grid g4" style={{ marginTop: 0, marginBottom: 12 }}>
        <div>
          <div className="kpi-label">میزبان فعال</div>
          <div className="kpi-value" style={{ fontSize: 14, marginTop: 2 }}>
            {connection.activeHost ?? "—"}
          </div>
        </div>
        <div>
          <div className="kpi-label">آخرین دریافت موفق</div>
          <div className="kpi-value" style={{ fontSize: 14, marginTop: 2 }}>
            {connection.lastLiveSuccessAt ? timeAgo(connection.lastLiveSuccessAt) : "در این اجرا نبوده"}
          </div>
        </div>
        <div>
          <div className="kpi-label">میزبان‌های سالم</div>
          <div className="kpi-value" style={{ fontSize: 14, marginTop: 2 }}>
            {healthy.length} از {connection.probes.length}
          </div>
        </div>
        <div>
          <div className="kpi-label">زمان بررسی</div>
          <div className="kpi-value" style={{ fontSize: 14, marginTop: 2 }}>
            {timeAgo(connection.checkedAt)}
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ cursor: "default" }}>میزبان</th>
              <th style={{ cursor: "default" }}>وضعیت</th>
              <th style={{ cursor: "default" }}>کد</th>
              <th style={{ cursor: "default" }}>تأخیر</th>
              <th style={{ cursor: "default" }}>علت</th>
            </tr>
          </thead>
          <tbody>
            {connection.probes.map((p) => (
              <tr key={p.host}>
                <td style={{ direction: "ltr", textAlign: "right", color: p.ok ? "#cfe0ff" : "var(--txt2)" }}>{p.host}</td>
                <td>
                  <span
                    className="pill"
                    style={{
                      background: `color-mix(in srgb, ${KIND_COLOR[p.kind]} 20%, transparent)`,
                      color: KIND_COLOR[p.kind],
                    }}
                  >
                    {p.ok ? "✔ " : "✖ "}
                    {KIND_LABEL[p.kind]}
                  </span>
                </td>
                <td>{p.status ?? "—"}</td>
                <td style={{ color: p.latencyMs > 2000 ? "#fcd34d" : undefined }}>{p.latencyMs} ms</td>
                <td className="txt" style={{ whiteSpace: "normal", color: "var(--txt2)", fontFamily: "inherit", minWidth: 220 }}>
                  {p.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!connection.reachable && (
        <p className="chart-note" style={{ marginTop: 10 }}>
          <b>راه‌حل:</b>{" "}
          {connection.geoBlocked
            ? "بایننس به IP این شبکه پاسخ نمی‌دهد چون کشور شما در فهرست محدودیت است — با VPN یا اینترنت دیگری اجرا کنید."
            : "دسترسی شبکه به دامنه‌های بایننس مسدود است — پراکسی/فایروال سازمانی یا فیلتر DNS را بررسی کنید."}{" "}
          پس از رفع مشکل، «بررسی مجدد» را بزنید.
        </p>
      )}
    </Card>
  );
}
