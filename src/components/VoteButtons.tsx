"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "@phosphor-icons/react";
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
    return <span className="text-xs font-semibold text-ink-soft">Límite de votos por hoy</span>;
  }

  if (voted) {
    return (
      <span className="stamp stamp--flat stamp-hay text-xs normal-case">
        ✓ Gracias
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Confirmar"
        disabled={busy}
        onClick={() => send("confirm")}
        className="btn btn-ghost rounded-full px-2.5 py-0.5 text-xs font-bold text-hay-ink"
      >
        <Check size={12} weight="bold" aria-hidden />
        Lo vi
      </button>
      <button
        type="button"
        aria-label="Desmentir"
        disabled={busy}
        onClick={() => send("deny")}
        className="btn btn-ghost rounded-full px-2.5 py-0.5 text-xs font-bold text-nohay-ink"
      >
        <X size={12} weight="bold" aria-hidden />
        Ya no hay
      </button>
    </>
  );
}
