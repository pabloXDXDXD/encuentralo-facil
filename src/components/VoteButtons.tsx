"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/client-device";

const KEY = "dh_voted_reports";

function readVoted(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberVote(id: string) {
  const list = readVoted().filter((x) => x !== id);
  list.push(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-500)));
  } catch {
    /* storage full or blocked -> vote still counted server-side */
  }
}

type Props = { reportId: string };

export default function VoteButtons({ reportId }: Props) {
  const router = useRouter();
  const [voted, setVoted] = useState(true); // true until effect runs -> avoids flash of buttons
  const [busy, setBusy] = useState(false);
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    setVoted(readVoted().includes(reportId));
  }, [reportId]);

  async function send(vote: "confirm" | "deny") {
    if (voted || busy) return;
    setBusy(true);
    setLimitHit(false);
    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": getDeviceId() },
        body: JSON.stringify({ reportId, vote }),
      });
      if (!res.ok) return; // ephemeral signal -> fail silent
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        rememberVote(reportId);
        setVoted(true);
        router.refresh(); // re-fetch SSR snapshot with updated counts
      } else if (data.error === "rate_limit_daily") {
        setLimitHit(true);
      } else if (data.error === "unknown_or_expired_report" || data.error === "own_report") {
        rememberVote(reportId);
        setVoted(true);
      }
    } catch {
      /* offline -> votes are not queued by design */
    } finally {
      setBusy(false);
    }
  }

  if (limitHit) {
    return <span className="text-xs text-stone-400">Límite de votos por hoy</span>;
  }

  if (voted) {
    return <span className="text-xs text-emerald-700">✓ Gracias</span>;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Confirmar"
        disabled={busy}
        onClick={() => send("confirm")}
        className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 active:bg-emerald-200"
      >
        ✓ Yo también lo vi
      </button>
      <button
        type="button"
        aria-label="Desmentir"
        disabled={busy}
        onClick={() => send("deny")}
        className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 active:bg-red-200"
      >
        ✗ Ya no hay
      </button>
    </>
  );
}
