type EmptyTicketProps = {
  stamp: string;
  children: React.ReactNode;
};

/* Annulled-receipt empty state: torn ticket + dashed "no data" stamp. */
export default function EmptyTicket({ stamp, children }: EmptyTicketProps) {
  return (
    <div className="card-ticket p-6 text-center">
      <p className="stamp stamp-unknown text-lg">{stamp}</p>
      <p className="mt-3 text-sm text-ink-soft">{children}</p>
    </div>
  );
}
