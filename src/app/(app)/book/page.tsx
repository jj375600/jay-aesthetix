import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getOpenSlots, getTrainerId, todayInStudio } from "@/lib/slots";
import { BookingPicker } from "@/components/BookingPicker";
import { SITE } from "@/lib/site";

export const metadata = { title: `Book a session · ${SITE.name}` };

export default async function BookPage() {
  const user = await requireUser("client");
  const profile = await queryOne("SELECT 1 FROM client_profiles WHERE user_id = $1", [user.id]);
  if (!profile) redirect("/onboarding");

  const trainerId = await getTrainerId();
  const slots = trainerId ? await getOpenSlots(trainerId, todayInStudio(), 14) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Next 14 days · times in {SITE.location} local time</p>
          <h1>Book a session</h1>
        </div>
      </div>
      <section className="card">
        <BookingPicker slots={slots} />
      </section>
    </>
  );
}
